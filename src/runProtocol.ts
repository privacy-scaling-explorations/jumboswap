import z from 'zod';
import * as mpcf from 'mpc-framework';
import { EmpWasmBackend } from 'emp-wasm-backend';
import * as summon from 'summon-ts';
import assert from './assert';
import { PublicInputRow } from './Ctx';
import genCircuit, { makePermutations } from './genCircuit';
import { IRoom } from './Room';
import AsyncQueue from './AsyncQueue';
import { PublicKey } from './EcdhKeyPair';
import bufferCmp from './bufferCmp';

// eslint-disable-next-line max-params
export default async function runProtocol(
  partyIndex: number,
  prefs: boolean[],
  publicInputs: PublicInputRow[],
  room: IRoom,
  protocolMsgQueue: AsyncQueue<{ from: PublicKey, data: Uint8Array }>,
  _randMsgQueue: AsyncQueue<{ from: PublicKey, msg: unknown }>,
  onProgress: (progress: number) => void = () => {},
): Promise<number[]> {
  let bytesTransferred = 0;
  const rand = 1.1; // TODO: Use randMsgQueue to get a fair random number

  await summon.init();

  const circuitFiles = genCircuit(publicInputs.length, rand);
  const circuit = summon.compileBoolean('circuit/main.ts', 8, circuitFiles);

  const mpcSettings = publicInputs.map((_, i) => ({
    name: `party${i}`,
    inputs: [`party${i}Prefs`],
    outputs: ['main'],
  }));

  const protocol = new mpcf.Protocol(
    circuit,
    mpcSettings,
    new EmpWasmBackend(),
  );

  const session = protocol.join(
    `party${partyIndex}`,
    {
      [`party${partyIndex}Prefs`]: encodePrefs(prefs),
    },
    (to, msg) => {
      assert(/^party\d$/.test(to), 'Invalid recipient');
      const i = parseInt(to.slice(5), 10);

      room.send(publicInputs[i].pk, {
        type: 'protocol',
        data: msg,
      });

      bytesTransferred += msg.length;
      onProgress(bytesTransferred);
    },
  );

  protocolMsgQueue.stream(({ from, data }) => {
    for (let i = 0; i < publicInputs.length; i++) {
      if (bufferCmp(publicInputs[i].pk.publicKey, from.publicKey) === 0) {
        session.handleMessage(`party${i}`, data);
        bytesTransferred += data.length;
        onProgress(bytesTransferred);
        return;
      }
    }

    console.error('Unexpected from:', from);
  });

  const Output = z.object({
    main: z.number(),
  });

  const output = Output.parse(await session.output());

  const perms = makePermutations(publicInputs.length, rand);

  return perms[output.main];
}

function encodePrefs(prefs: boolean[]) {
  return prefs.reduce((acc, pref, i) => acc | (pref ? 1 << i : 0), 0);
}
