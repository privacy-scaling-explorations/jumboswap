import { EventEmitter } from 'ee-typed';
import Peer, { DataConnection } from 'peerjs';
import EcdhKeyPair, { PublicKey } from './EcdhKeyPair';
import { Cipher, Key, RtcPairSocket } from 'rtc-pair-socket';
import bufferCmp from './bufferCmp';
import { z } from 'zod';
import { rtcConfig } from './Ctx';

type RoomEvents = {
  error(error: Error): void;
  message(from: PublicKey, data: unknown): void;
  membersChanged(members: PublicKey[]): void;
};

export type IRoom = {
  getMembers(): PublicKey[];
  getSocket(to: PublicKey): Promise<RtcPairSocket>;
  send(to: PublicKey, data: unknown): void;
  broadcast(data: unknown): void;
} & InstanceType<typeof EventEmitter<RoomEvents>>;

export default class Room {
  private constructor() {}

  static async host(roomCode: string, id: EcdhKeyPair): Promise<IRoom> {
    return new HostedRoom(roomCode, id, await id.encodePublicKey());
  }

  static async join(roomCode: string, id: EcdhKeyPair): Promise<IRoom> {
    return new JoinedRoom(roomCode, id, await id.encodePublicKey());
  }
}

function decodeMessage(
  cipher: Cipher,
  data: unknown,
  onError: (error: Error) => void,
): { message: unknown } | undefined {
  let buf: Uint8Array;

  if (data instanceof ArrayBuffer) {
    buf = new Uint8Array(data);
  } else if (data instanceof Uint8Array) {
    buf = data;
  } else {
    onError(new Error('Received unrecognized data type'));
    return undefined;
  }

  return { message: cipher.decrypt(buf) };
}

function notNil<T>(value: T): value is Exclude<T, undefined> {
  return value !== undefined;
}

type ConnEntry = {
  pk?: PublicKey;
  conn: DataConnection;
};

export class HostedRoom extends EventEmitter<RoomEvents> implements IRoom {
  public roomKey: Key;
  public roomCipher: Cipher;
  public hostPeerId: string;
  public peer: Peer;
  public id: EcdhKeyPair;
  public pk: PublicKey;

  public connections: ConnEntry[] = [];
  public socketSet: SocketSet;

  constructor(roomCode: string, id: EcdhKeyPair, pk: PublicKey) {
    super();

    this.roomKey = Key.fromSeed(roomCode);
    this.roomCipher = new Cipher(this.roomKey);
    this.hostPeerId = `room-host-${Key.fromSeed(this.roomKey.data).base58()}`;
    this.id = id;
    this.pk = pk;

    this.socketSet = new SocketSet(
      roomCode,
      this.id,
      this.pk,
      (from, data) => this.emit('message', from, data),
    );

    this.peer = new Peer(this.hostPeerId, { config: rtcConfig });

    this.peer.on('open', () => {
      console.log('listening for connections', this.hostPeerId);

      this.peer.on('connection', conn => {
        console.log('new connection');
        const connEntry: ConnEntry = { conn };
        this.connections.push(connEntry);

        conn.once('data', data => {
          const m = decodeMessage(
            this.roomCipher,
            data,
            e => this.emit('error', e),
          );

          if (!m) {
            return;
          }

          const parsed = PublicKey.safeParse(m.message);

          if (!parsed.data) {
            this.emit('error', new Error('Unexpected message'));
            return;
          }

          if (bufferCmp(parsed.data.publicKey, this.pk.publicKey) === 0) {
            alert('Refusing to add self as member');
            conn.close();
          }

          this.addMember(connEntry, parsed.data);
        });

        console.log('joiner conn state', conn.peerConnection.connectionState);
        conn.peerConnection.addEventListener('connectionstatechange', () => {
          console.log('joiner conn state', conn.peerConnection.connectionState);

          if (conn.peerConnection.connectionState === 'failed') {
            conn.close();
          }
        });

        conn.once('close', () => {
          console.log('joiner closed');
          const len = this.connections.length;
          this.connections = this.connections.filter(ce => ce !== connEntry);

          if (this.connections.length !== len) {
            this.broadcastMembers();
          }
        });
      });
    });

    detectDroppedMembers(this, droppedMember => {
      this.socketSet.drop(droppedMember);
    });
  }

  broadcast(data: unknown): void {
    for (const member of this.getMembers().slice(1)) {
      this.send(member, data);
    }
  }

  getSocket(to: PublicKey): Promise<RtcPairSocket> {
    return this.socketSet.get(to);
  }

  getMembers(): PublicKey[] {
    return [
      this.pk,
      ...this.connections
        .map(c => c.pk)
        .filter(notNil),
    ];
  }

  send(to: PublicKey, data: unknown) {
    (async () => {
      try {
        const socket = await this.socketSet.get(to);
        socket.send(data);
      } catch (e) {
        this.emit('error', ensureError(e));
      }
    })();
  }

  addMember(connEntry: ConnEntry, pk: PublicKey) {
    const retainedConnections = [];

    for (const connEntry of this.connections) {
      if (
        connEntry.pk
        && bufferCmp(connEntry.pk.publicKey, pk.publicKey) === 0
      ) {
        connEntry.conn.close();
      } else {
        retainedConnections.push(connEntry);
      }
    }

    this.connections = retainedConnections;
    connEntry.pk = pk;

    this.broadcastMembers();
  }

  broadcastMembers() {
    const members = this.getMembers();
    console.log('broadcasting members', members);

    for (const { conn } of this.connections) {
      conn.send(this.roomCipher.encrypt(members));
    }

    this.emit('membersChanged', members);
  }

  close() {
    this.peer.destroy();
  }
}

export class JoinedRoom extends EventEmitter<RoomEvents> implements IRoom {
  roomKey: Key;
  roomCipher: Cipher;
  hostPeerId: string;
  peer: Peer;

  members: PublicKey[] = [];
  socketSet: SocketSet;

  constructor(
    public roomCode: string,
    public id: EcdhKeyPair,
    public pk: PublicKey,
  ) {
    super();

    this.roomKey = Key.fromSeed(roomCode);
    this.roomCipher = new Cipher(this.roomKey);

    this.socketSet = new SocketSet(
      roomCode,
      id,
      pk,
      (from, data) => this.emit('message', from, data),
    );

    this.hostPeerId = `room-host-${Key.fromSeed(this.roomKey.data).base58()}`;

    const peer = new Peer({ config: rtcConfig });
    this.peer = peer;

    this.setup();
  }

  broadcast(data: unknown): void {
    for (const member of this.getMembers()) {
      if (bufferCmp(member.publicKey, this.pk.publicKey) !== 0) {
        this.send(member, data);
      }
    }
  }

  async setup() {
    await new Promise<void>((resolve, reject) => {
      this.peer.on('open', () => resolve());
      this.peer.on('close', reject);
    });

    console.log('connecting', this.hostPeerId);
    const conn = this.peer.connect(this.hostPeerId, { reliable: true });

    window.addEventListener('close', () => {
      conn.close();
    });

    conn.on('data', data => {
      const m = decodeMessage(
        this.roomCipher,
        data,
        e => this.emit('error', e),
      );

      if (!m) {
        return;
      }

      const parsed = z.array(PublicKey).safeParse(m.message);

      if (!parsed.data) {
        this.emit('error', new Error('Unexpected message'));
        return;
      }

      this.members = parsed.data;
      this.emit('membersChanged', this.members);
    });

    await new Promise<void>((resolve, reject) => {
      conn.on('open', resolve);
      conn.on('close', reject);
    });

    conn.send(this.roomCipher.encrypt(this.pk));

    detectDroppedMembers(this, droppedMember => {
      this.socketSet.drop(droppedMember);
    });
  }

  getSocket(to: PublicKey): Promise<RtcPairSocket> {
    return this.socketSet.get(to);
  }

  getMembers(): PublicKey[] {
    return this.members;
  }

  send(to: PublicKey, data: unknown): void {
    (async () => {
      try {
        const socket = await this.socketSet.get(to);
        socket.send(data);
      } catch (e) {
        this.emit('error', ensureError(e));
      }
    })();
  }
}

class SocketSet {
  socketPromises: Record<string, Promise<RtcPairSocket> | undefined> = {};

  constructor(
    public context: unknown,
    public id: EcdhKeyPair,
    public pk: PublicKey,
    public onMessage: (from: PublicKey, data: unknown) => void,
  ) {}

  async get(externalPk: PublicKey) {
    const recordKey = Key.fromSeed(externalPk).base58();

    let socketPromise = this.socketPromises[recordKey];

    if (!socketPromise) {
      console.log('connecting new socket', externalPk);
      socketPromise = this.connect(externalPk); // *Not* awaited
      this.socketPromises[recordKey] = socketPromise;
    }

    return await socketPromise;
  }

  drop(externalPk: PublicKey) {
    const recordKey = Key.fromSeed(externalPk).base58();
    const socketPromise = this.socketPromises[recordKey];

    if (!socketPromise) {
      return;
    }

    socketPromise.then(socket => {
      socket.close();
    });

    delete this.socketPromises[recordKey];
  }

  private async connect(externalPk: PublicKey) {
    const sharedKey = await this.id.deriveSharedKey(externalPk);
    const ctxSharedKey = Key.fromSeed([this.context, sharedKey.data]);

    const pkCmp = bufferCmp(this.pk.publicKey, externalPk.publicKey);

    if (pkCmp === 0) {
      throw new Error('Refusing to provide self-socket');
    }

    const side = pkCmp === -1 ? 'alice' : 'bob';

    if (side === 'bob') {
      // It's important to let alice connect first.
      // This is a bug in RtcPairSocket.
      // FIXME
      await new Promise<void>(resolve => {
        setTimeout(resolve, 3000);
      });
    }

    const socket = new RtcPairSocket(
      `socket-set-${ctxSharedKey.base58()}`,
      side,
      rtcConfig,
    );

    socket.on('message', data => this.onMessage(externalPk, data));

    await new Promise<void>((resolve, reject) => {
      socket.on('open', resolve);
      socket.on('error', reject);
    });

    return socket;
  }
}

function ensureError(err: unknown): Error {
  return err instanceof Error ? err : new Error(JSON.stringify(err));
}

function detectDroppedMembers(
  room: IRoom,
  onDrop: (member: PublicKey) => void,
) {
  let lastMembers = room.getMembers();

  room.on('membersChanged', () => {
    const newMembers = room.getMembers();

    for (const member of lastMembers) {
      const match = newMembers.find(
        nm => bufferCmp(nm.publicKey, member.publicKey) === 0,
      );

      if (!match) {
        console.log('drop detected', member);
        onDrop(member);
      }
    }

    lastMembers = newMembers;
  });
}
