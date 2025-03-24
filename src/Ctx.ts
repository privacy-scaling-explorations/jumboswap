import z from 'zod';
import { createContext, useContext } from 'react';
import UsableField from './UsableField';
import { Key } from 'rtc-pair-socket';
import Room, { IRoom } from './Room';
import EcdhKeyPair, { PublicKey } from './EcdhKeyPair';
import PartyTracker, { toPartyId } from './PartyTracker';
import bufferCmp from './bufferCmp';
import { EventEmitter } from 'ee-typed';
import runProtocol from './runProtocol';
import AsyncQueue from './AsyncQueue';

type PageKind =
  | 'Home'
  | 'Share'
  | 'Invite'
  | 'Join'
  | 'Connecting'
  | 'Lobby'
  | 'Waiting'
  | 'ChooseItems'
  | 'Calculating'
  | 'Result'
  | 'Error';

export const rtcConfig = (() => {
  const envVar = import.meta.env.VITE_RTC_CONFIGURATION;

  if (!envVar) {
    return undefined;
  }

  return JSON.parse(envVar);
})();

export type Party = {
  name: string;
  item: string;
  ready: boolean;
  ping?: number;
};

const PublicInputRow = z.object({
  pk: PublicKey,
  name: z.string(),
  item: z.string(),
});

// eslint-disable-next-line no-redeclare
export type PublicInputRow = z.infer<typeof PublicInputRow>;

const PublicInputs = z.object({
  type: z.literal('publicInputs'),
  publicInputs: z.array(PublicInputRow),
});

const ReadyMsg = z.object({
  type: z.literal('ready'),
});

const ProtocolMsg = z.object({
  type: z.literal('protocol'),
  data: z.instanceof(Uint8Array),
});

const RandMsg = z.object({
  type: z.literal('rand'),
  msg: z.unknown(),
});

export default class Ctx extends EventEmitter<{ everyoneReady(): void }> {
  page = new UsableField<PageKind>('Home');
  mode = new UsableField<'Host' | 'Join'>('Host');
  roomCode = new UsableField(Key.random().base58());
  errorMsg = new UsableField<string>('');
  mpcProgress = new UsableField<number>(0);
  partyTracker?: PartyTracker;
  name = new UsableField('');
  item = new UsableField('');
  parties = new UsableField<Party[]>([{ name: '', item: '', ready: false }]);
  pk = new UsableField<PublicKey | undefined>(undefined);
  readyFlags = new UsableField<boolean[] | undefined>(undefined);
  protocolMsgQueue = new AsyncQueue<{ from: PublicKey, data: Uint8Array }>();
  randMsgQueue = new AsyncQueue<{ from: PublicKey, msg: unknown }>();
  result = new UsableField<number[]>([]);

  publicInputs = new UsableField<PublicInputRow[]>([]);

  room?: IRoom;

  constructor() {
    super();

    (async () => {
      const id = await EcdhKeyPair.get('jumboswap');
      const pk = await id.encodePublicKey();
      this.pk.set(pk);
    })();
  }

  async host() {
    this.mode.set('Host');

    const id = await EcdhKeyPair.get('jumboswap');
    const pk = await id.encodePublicKey();
    const room = await Room.host(this.roomCode.value, id);
    this.room = room;
    this.setupMsgQueues();

    const partyTracker = new PartyTracker(pk, this.room);
    partyTracker.setMembers([pk]);
    partyTracker.on('partiesUpdated', parties => this.parties.set(parties));
    this.partyTracker = partyTracker;

    partyTracker.once('allReady', () => {
      const members = room.getMembers();

      const publicInputs = members.map(
        pk => {
          const partyId = toPartyId(pk);
          const party = partyTracker.partiesById[partyId];

          return {
            pk,
            name: party.name,
            item: party.item,
          };
        },
      );

      room.broadcast({
        type: 'publicInputs',
        publicInputs,
      });

      this.chooseItems(publicInputs);
    });
  }

  async join(roomCode: string) {
    this.mode.set('Join');
    this.roomCode.set(roomCode);

    const id = await EcdhKeyPair.get('jumboswap');
    const pk = await id.encodePublicKey();
    const room = await Room.join(roomCode, id);
    this.room = room;
    this.setupMsgQueues();

    const partyTracker = new PartyTracker(pk, this.room);
    partyTracker.on('partiesUpdated', parties => this.parties.set(parties));
    this.partyTracker = partyTracker;

    this.page.set('Connecting');

    await new Promise(resolve => {
      room.once('membersChanged', resolve);
    });

    this.page.set('Lobby');

    room.on('message', (from, data) => {
      const parsed = PublicInputs.safeParse(data);

      if (bufferCmp(from.publicKey, room.getMembers()[0].publicKey) !== 0) {
        return;
      }

      if (!parsed.success) {
        return;
      }

      this.chooseItems(parsed.data.publicInputs);
    });
  }

  setupMsgQueues() {
    this.room!.on('message', (from, data) => {
      const protoParsed = ProtocolMsg.safeParse(data);

      if (protoParsed.success) {
        this.protocolMsgQueue.push({ from, data: protoParsed.data.data });
        return;
      }

      const randParsed = RandMsg.safeParse(data);

      if (randParsed.success) {
        this.randMsgQueue.push({ from, msg: randParsed.data.msg });
        // return;
      }
    });
  }

  async chooseItems(publicInputs: PublicInputRow[]) {
    this.readyFlags.set(new Array(publicInputs.length).fill(false));
    this.partyTracker!.stop();
    this.publicInputs.set(publicInputs);
    this.page.set('ChooseItems');

    this.room!.on('message', (from, data) => {
      if (!ReadyMsg.safeParse(data).success) {
        return;
      }

      const partyIndex = publicInputs.findIndex(
        p => bufferCmp(p.pk.publicKey, from.publicKey) === 0,
      );

      if (partyIndex === -1) {
        alert('Received ready message from unknown party');
        return;
      }

      const readyFlags = structuredClone(this.readyFlags.value!);
      readyFlags[partyIndex] = true;
      this.readyFlags.set(readyFlags);

      if (readyFlags.every(Boolean)) {
        this.emit('everyoneReady');
      }
    });
  }

  handleProtocolError = (error: unknown) => {
    console.error('Protocol error:', error);
    this.errorMsg.set(`Protocol error: ${JSON.stringify(error)}`);
    this.page.set('Error');
  };

  async runProtocol(partyIndex: number, prefs: boolean[]) {
    this.room!.broadcast({ type: 'ready' });
    const readyFlags = this.readyFlags.value!;
    readyFlags![partyIndex] = true;
    this.readyFlags.set(readyFlags);

    if (!this.readyFlags.value!.every(Boolean)) {
      this.page.set('Waiting');

      await new Promise<void>(resolve => {
        this.once('everyoneReady', resolve);
      });
    }

    this.page.set('Calculating');

    const result = await runProtocol(
      partyIndex,
      prefs,
      this.publicInputs.value,
      this.room!,
      this.protocolMsgQueue,
      this.randMsgQueue,
      progress => this.mpcProgress.set(progress),
    );

    this.result.set(result);
    this.page.set('Result');
  }

  private static context = createContext<Ctx>(
    {} as Ctx,
  );

  static Provider = Ctx.context.Provider;

  static use() {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useContext(Ctx.context);
  }
}
