import { EventEmitter } from 'ee-typed';
import { IRoom } from './Room';
import { Party } from './Ctx';
import { PublicKey } from './EcdhKeyPair';
import { Key } from 'rtc-pair-socket';
import { z } from 'zod';
import bufferCmp from './bufferCmp';

type Events = {
  partiesUpdated(parties: Party[]): void;
  allReady(): void;
};

const PartyUpdateField = z.object({
  name: z.string(),
  item: z.string(),
  ready: z.boolean(),
}).partial();

const Ping = z.object({
  type: z.literal('ping'),
  pingId: z.number(),
  partyUpdate: PartyUpdateField,
});

const Pong = z.object({
  type: z.literal('pong'),
  pingId: z.number(),
});

const PartyUpdate = z.object({
  type: z.literal('partyUpdate'),
  partyUpdate: PartyUpdateField,
});

function defaultParty(): Party {
  return {
    name: '',
    item: '',
    ready: false,
    ping: undefined,
  };
}

export default class PartyTracker extends EventEmitter<Events> {
  partiesById: Record<string, Party> = {};
  memberIds: string[] = [];
  stopped = false;

  constructor(
    public pk: PublicKey,
    public room: IRoom,
  ) {
    super();

    room.on('membersChanged', this.onMembersChanged);
    room.on('message', this.onRoomMessage);
  }

  onMembersChanged = (members: PublicKey[]) => {
    this.setMembers(members);
  };

  onRoomMessage = (from: PublicKey, data: unknown) => {
    const parsed = PartyUpdate.safeParse(data);

    if (!parsed.success) {
      return;
    }

    this.applyPartyUpdate(from, parsed.data.partyUpdate);
  };

  applyPartyUpdate(from: PublicKey, partyUpdate: Partial<Party>) {
    const memberId = toPartyId(from);

    const party = {
      ...(this.partiesById[memberId] ?? defaultParty()),
      ...partyUpdate,
    };

    const oldParty = this.partiesById[memberId];

    if (JSON.stringify(party) === JSON.stringify(oldParty)) {
      return;
    }

    this.partiesById[memberId] = party;
    this.emitPartiesUpdated();
  }

  setMembers(members: PublicKey[]) {
    this.memberIds = members.map(toPartyId);

    for (const [i, memberId] of this.memberIds.entries()) {
      if (!(memberId in this.partiesById)) {
        this.partiesById[memberId] = defaultParty();
        this.pingLoop(memberId, members[i]);
      }
    }

    for (const key of Object.keys(this.partiesById)) {
      if (!this.memberIds.includes(key)) {
        delete this.partiesById[key];
      }
    }

    this.emitPartiesUpdated();
  }

  getSelf() {
    const selfId = toPartyId(this.pk);
    let self = this.partiesById[selfId];

    if (!self) {
      self = defaultParty();
      this.partiesById[selfId] = self;
    }

    return self;
  }

  updateSelf(partyUpdate: Partial<Exclude<Party, 'ping'>>) {
    const selfParty = { ...this.getSelf(), ...partyUpdate };
    this.partiesById[toPartyId(this.pk)] = selfParty;
    this.emitPartiesUpdated();

    this.room.broadcast({
      type: 'partyUpdate',
      partyUpdate,
    });
  }

  async pingLoop(memberId: string, otherPk: PublicKey) {
    if (bufferCmp(this.pk.publicKey, otherPk.publicKey) === 0) {
      // Don't ping self
      return;
    }

    let lastPing = 0;
    const socket = await this.room.getSocket(otherPk);

    {
      const recentPingIds: number[] = [];

      socket.on('message', data => {
        const parsed = Ping.safeParse(data);

        if (parsed.data) {
          const { pingId, partyUpdate } = parsed.data;

          // Note: This is not ideal - we're processing party updates as part of
          // pings to make sure we never miss them. Instead, it would be great
          // to have a better Room abstraction that can deliver messages more
          // reliably.
          this.applyPartyUpdate(otherPk, partyUpdate);

          if (recentPingIds.includes(pingId)) {
            return;
          }

          socket.send({
            type: 'pong',
            pingId,
          });

          recentPingIds.push(pingId);

          while (recentPingIds.length > 10) {
            recentPingIds.shift();
          }
        }
      });
    }

    while (!socket.isClosed()) {
      const pingStart = Date.now();
      const pingId = Math.random();
      let gotReply = false;

      (async () => {
        while (true) {
          socket.send({ type: 'ping', pingId, partyUpdate: this.getSelf() });

          await new Promise(resolve => {
            setTimeout(resolve, 1000);
          });

          if (gotReply || socket.isClosed()) {
            break;
          }

          const cumulPing = Date.now() - pingStart;

          if (cumulPing > lastPing) {
            lastPing = cumulPing;
            this.partiesById[memberId].ping = cumulPing;
            this.emitPartiesUpdated();
          }
        }
      })();

      await new Promise<void>((resolve, reject) => {
        socket.on('close', reject);

        function checkPong(msg: unknown) {
          const parsed = Pong.safeParse(msg);

          if (!parsed.data) {
            return;
          }

          if (parsed.data.pingId !== pingId) {
            console.error('Received pong with unexpected pingId');
            return;
          }

          gotReply = true;
          socket.off('message', checkPong);
          socket.off('close', reject);
          resolve();
        }

        socket.on('message', checkPong);
      });

      const pingEnd = Date.now();

      this.partiesById[memberId].ping = pingEnd - pingStart;
      this.emitPartiesUpdated();
      lastPing = pingEnd - pingStart;

      await new Promise(resolve => {
        setTimeout(resolve, 1000);
      });
    }
  }

  emitPartiesUpdated() {
    const parties = this.memberIds.map(mId => this.partiesById[mId]);
    this.emit('partiesUpdated', parties);

    if (
      this.memberIds.length >= 2
      && this.memberIds.every(mId => this.partiesById[mId].ready)
    ) {
      this.emit('allReady');
    }
  }

  stop() {
    this.stopped = true;

    this.room.off('membersChanged', this.onMembersChanged);
    this.room.off('message', this.onRoomMessage);

    // We still keep pinging though
    // (Maybe ping should be separate)
  }
}

export function toPartyId(pk: PublicKey) {
  return Key.fromSeed(pk).base58();
}
