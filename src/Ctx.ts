import z from 'zod';
import { createContext, useContext } from 'react';
import UsableField from './UsableField';
import { Key } from 'rtc-pair-socket';
import Room, { IRoom } from './Room';
import EcdhKeyPair, { PublicKey } from './EcdhKeyPair';
import PartyTracker, { toPartyId } from './PartyTracker';
import bufferCmp from './bufferCmp';

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
type PublicInputRow = z.infer<typeof PublicInputRow>;

const PublicInputs = z.object({
  type: z.literal('publicInputs'),
  publicInputs: z.array(PublicInputRow),
});

const dummyPk: PublicKey = {
  publicKey: new Uint8Array(32),
};

export default class Ctx {
  page = new UsableField<PageKind>('ChooseItems');
  mode = new UsableField<'Host' | 'Join'>('Host');
  roomCode = new UsableField(Key.random().base58());
  errorMsg = new UsableField<string>('');
  mpcProgress = new UsableField<number>(0);
  partyTracker?: PartyTracker;
  name = new UsableField('');
  item = new UsableField('');
  parties = new UsableField<Party[]>([{ name: '', item: '', ready: false }]);
  pk = new UsableField<PublicKey | undefined>(undefined);

  publicInputs = new UsableField<PublicInputRow[]>([
    { pk: dummyPk, name: 'Alice', item: 'Orange' },
    { pk: dummyPk, name: 'Bob', item: 'Apple' },
    { pk: dummyPk, name: 'Charlie', item: 'Peach' },
    { pk: dummyPk, name: 'David', item: 'Mango' },
  ]);

  room?: IRoom;

  constructor() {
    (async () => {
      const id = await EcdhKeyPair.get('jumboswap');
      const pk = await id.encodePublicKey();
      this.pk.set(pk);

      const publicInputs = structuredClone(this.publicInputs.value);
      publicInputs[1].pk = pk;
      this.publicInputs.set(publicInputs);
    })();
  }

  async host() {
    this.mode.set('Host');

    const id = await EcdhKeyPair.get('jumboswap');
    const pk = await id.encodePublicKey();
    const room = await Room.host(this.roomCode.value, id);
    this.room = room;

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

  async chooseItems(publicInputs: PublicInputRow[]) {
    this.partyTracker!.stop();
    this.publicInputs.set(publicInputs);
    this.page.set('ChooseItems');
  }

  handleProtocolError = (error: unknown) => {
    console.error('Protocol error:', error);
    this.errorMsg.set(`Protocol error: ${JSON.stringify(error)}`);
    this.page.set('Error');
  };

  private static context = createContext<Ctx>(
    {} as Ctx,
  );

  static Provider = Ctx.context.Provider;

  static use() {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useContext(Ctx.context);
  }
}
