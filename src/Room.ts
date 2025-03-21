import { EventEmitter } from 'ee-typed';
import Peer, { DataConnection } from 'peerjs';
import EcdhKeyPair, { PublicKey } from './EcdhKeyPair';
import { Cipher, Key, RtcPairSocket } from 'rtc-pair-socket';
import bufferCmp from './bufferCmp';
import { z } from 'zod';

type RoomEvents = {
  error(error: Error): void;
  message(from: PublicKey, data: unknown): void;
  membersChanged(members: PublicKey[]): void;
};

type IRoom = {
  getMembers(): PublicKey[];
  send(to: PublicKey, data: unknown): void;
} & InstanceType<typeof EventEmitter<RoomEvents>>;

const rtcConfig = undefined; // TODO

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
    this.socketSet = new SocketSet(roomCode, this.id, this.pk);

    this.peer = new Peer(this.hostPeerId, { config: rtcConfig });

    this.peer.on('connection', conn => {
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

        this.addMember(connEntry, parsed.data);
      });

      conn.once('close', () => {
        const len = this.connections.length;
        this.connections = this.connections.filter(ce => ce !== connEntry);

        if (this.connections.length !== len) {
          this.broadcastMembers();
        }
      });
    });
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

    for (const { conn } of this.connections) {
      conn.send(this.roomCipher.encrypt(members));
    }
  }

  close() {
    this.peer.destroy();
  }
}

export class JoinedRoom extends EventEmitter<RoomEvents> implements IRoom {
  roomKey: Key;
  roomCipher: Cipher;

  members: PublicKey[] = [];
  socketSet: SocketSet;

  constructor(
    public roomCode: string,
    public id: EcdhKeyPair,
    public pk: PublicKey,
  ) {
    super();

    this.roomKey = Key.fromSeed(roomCode);
    const roomCipher = new Cipher(this.roomKey);
    this.roomCipher = roomCipher;
    this.socketSet = new SocketSet(roomCode, id, pk);
    const hostPeerId = `room-host-${Key.fromSeed(this.roomKey.data).base58()}`;

    const peer = new Peer({ config: rtcConfig });
    const conn = peer.connect(hostPeerId, { reliable: true });

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

    (async () => {
      try {
        await new Promise<void>((resolve, reject) => {
          conn.on('open', resolve);
          conn.on('close', reject);
        });

        conn.send(roomCipher.encrypt(this.pk));
      } catch (e) {
        this.emit('error', ensureError(e));
      }
    })();
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
  ) {}

  async get(externalPk: PublicKey) {
    const recordKey = Key.fromSeed(externalPk).base58();

    let socketPromise = this.socketPromises[recordKey];

    if (!socketPromise) {
      socketPromise = this.connect(externalPk); // *Not* awaited
      this.socketPromises[recordKey] = socketPromise;
    }

    return await socketPromise;
  }

  private async connect(externalPk: PublicKey) {
    const sharedKey = await this.id.deriveSharedKey(externalPk);
    const ctxSharedKey = Key.fromSeed([this.context, sharedKey.data]);

    const pkCmp = bufferCmp(this.pk.publicKey, externalPk.publicKey);

    if (pkCmp === 0) {
      throw new Error('Refusing to provide self-socket');
    }

    const side = pkCmp === -1 ? 'alice' : 'bob';

    const socket = new RtcPairSocket(
      `socket-set-${ctxSharedKey.base58()}`,
      side,
      rtcConfig,
    );

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
