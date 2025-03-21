import z from 'zod';
import { createContext, useContext } from 'react';
import UsableField from './UsableField';
import Emitter from './Emitter';
import AsyncQueue from './AsyncQueue';
import runProtocol from './runProtocol';
import { makeZodChannel } from './ZodChannel';
import { MessageReady } from './MessageTypes';
import { Key, RtcPairSocket } from 'rtc-pair-socket';
import Room, { IRoom } from './Room';
import EcdhKeyPair from './EcdhKeyPair';
import PartyTracker from './PartyTracker';

type PageKind =
  | 'Home'
  | 'Share'
  | 'Invite'
  | 'Join'
  | 'Connecting'
  | 'Lobby'
  | 'Waiting'
  | 'Calculating'
  | 'Result'
  | 'Error';

export type GameOption = 'rock' | 'paper' | 'scissors' | 'lizard' | 'spock';

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

export default class Ctx extends Emitter<{ ready(choice: GameOption): void }> {
  page = new UsableField<PageKind>('Home');
  mode = new UsableField<'Host' | 'Join'>('Host');
  roomCode = new UsableField(Key.random().base58());
  socket = new UsableField<RtcPairSocket | undefined>(undefined);
  friendReady = false;
  result = new UsableField<'win' | 'lose' | 'draw' | undefined>(undefined);
  errorMsg = new UsableField<string>('');
  choice = new UsableField<GameOption | undefined>(undefined);
  mpcProgress = new UsableField<number>(0);
  partyTracker?: PartyTracker;
  parties = new UsableField<Party[]>([{ name: '', item: '', ready: false }]);
  room?: IRoom;

  constructor() {
    super();
  }

  async host() {
    this.mode.set('Host');

    const id = await EcdhKeyPair.get('jumboswap');
    const pk = await id.encodePublicKey();
    this.room = await Room.host(this.roomCode.value, id);

    const partyTracker = new PartyTracker(pk, this.room);
    partyTracker.setMembers([pk]);
    partyTracker.on('partiesUpdated', parties => this.parties.set(parties));
    this.partyTracker = partyTracker;
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

    this.page.set('Connecting');

    await new Promise(resolve => {
      room.once('membersChanged', resolve);
    });

    this.page.set('Lobby');
  }

  setName(name: string) {
    if (!this.partyTracker) {
      return;
    }

    const selfParty = this.partyTracker.getSelf();
    selfParty.name = name;
    this.partyTracker.emitPartiesUpdated();

    // TODO: Broadcast
  }

  setItem(item: string) {
    if (!this.partyTracker) {
      return;
    }

    const selfParty = this.partyTracker.getSelf();
    selfParty.item = item;
    this.partyTracker.emitPartiesUpdated();

    // TODO: Broadcast
  }

  async runProtocol(socket: RtcPairSocket) {
    this.page.set('Lobby');

    const msgQueue = new AsyncQueue<unknown>();

    const FriendMsg = z.object({
      from: z.literal(this.mode.value === 'Host' ? 'joiner' : 'host'),
    });

    const msgListener = (msg: unknown) => {
      if (!FriendMsg.safeParse(msg).error) {
        msgQueue.push(msg);
      }
    };

    socket.on('message', msgListener);

    const channel = makeZodChannel(
      (msg: unknown) => socket.send(msg),
      () => msgQueue.shift(),
    );

    const [choice, _readyMsg] = await Promise.all([
      new Promise<GameOption>(resolve => {
        this.once('ready', resolve);
      }),
      channel.recv(MessageReady).then(msg => {
        this.friendReady = true;
        return msg;
      }),
    ]);

    this.page.set('Calculating');
    socket.off('message', msgListener);

    const result = await runProtocol(
      this.mode.value,
      socket,
      choice,
      percentage => {
        this.mpcProgress.set(percentage);
      },
    );

    this.result.set(result);

    socket.close();

    this.page.set('Result');
  }

  handleProtocolError = (error: unknown) => {
    console.error('Protocol error:', error);
    this.errorMsg.set(`Protocol error: ${JSON.stringify(error)}`);
    this.page.set('Error');
  };

  async send(choice: GameOption) {
    this.emit('ready', choice);
    this.choice.set(choice);

    if (!this.friendReady) {
      this.page.set('Waiting');
    }

    this.socket.value!.send({
      from: this.mode.value === 'Host' ? 'host' : 'joiner',
      type: 'ready',
    });
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
