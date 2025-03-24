import z from 'zod';
import { createContext, useContext } from 'react';
import UsableField from './UsableField';
import { Key } from 'rtc-pair-socket';
import Room, { IRoom } from './Room';
import EcdhKeyPair from './EcdhKeyPair';
import PartyTracker from './PartyTracker';
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

const FinalizeNamesAndItems = z.object({
  type: z.literal('finalizeNamesAndItems'),
  namesAndItems: z.array(
    z.object({
      name: z.string(),
      item: z.string(),
    }),
  ),
});

export default class Ctx {
  page = new UsableField<PageKind>('Home');
  mode = new UsableField<'Host' | 'Join'>('Host');
  roomCode = new UsableField(Key.random().base58());
  errorMsg = new UsableField<string>('');
  mpcProgress = new UsableField<number>(0);
  partyTracker?: PartyTracker;
  name = new UsableField('');
  item = new UsableField('');
  parties = new UsableField<Party[]>([{ name: '', item: '', ready: false }]);
  room?: IRoom;

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

    partyTracker.on('allReady', () => {
      room.broadcast({
        type: 'finalizeNamesAndItems',
        namesAndItems: this.parties.value.map(
          p => ({ name: p.name, item: p.item }),
        ),
      });

      this.chooseItems();
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
      const parsed = FinalizeNamesAndItems.safeParse(data);

      if (bufferCmp(from.publicKey, room.getMembers()[0].publicKey) !== 0) {
        return;
      }

      if (!parsed.success) {
        return;
      }

      this.parties.set(parsed.data.namesAndItems.map(
        ({ name, item }) => ({ name, item, ready: true }),
      ));

      this.chooseItems();
    });
  }

  async chooseItems() {
    this.partyTracker!.stop();
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
