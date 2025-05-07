import z from 'zod';
import * as mpcf from 'mpc-framework';
import { EmpWasmEngine } from 'emp-wasm-engine';
import * as summon from 'summon-ts';
import assert from './assert';
import { PublicInputRow } from './Ctx';
import { IRoom } from './Room';
import AsyncQueue from './AsyncQueue';
import { PublicKey } from './EcdhKeyPair';
import bufferCmp from './bufferCmp';
import getCircuitFiles from './getCircuitFiles';
import makePermutations from './circuit/makePermutations';

const partySizeToHostTotalBytes = [
  0,
  0,
  240749,
  156058,
  596649,
  4717452,
  44155915,
  1000000000,
  10000000000,
];

const partySizeToJoinerTotalBytes = [
  0,
  0,
  240749,
  152967,
  526919,
  3678969,
  30110735,
  1000000000,
  10000000000,
];

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
  const totalBytes = partyIndex === 0
    ? partySizeToHostTotalBytes[publicInputs.length] ?? Infinity
    : partySizeToJoinerTotalBytes[publicInputs.length] ?? Infinity;

  const rand = 1.1; // TODO: Use randMsgQueue to get a fair random number

  await summon.init();

  const perms = makePermutations(publicInputs.length, rand);

  // We use 2 as a minimum because 1-bit numbers get turned into booleans.
  // (FIXME: This is a bug in Summon.)
  let boolifyWidth = 2;

  // Find the smallest power of 2 that is greater than or equal to perms.length.
  // This number of bits is required because we need to encode the index of the
  // permutation.
  while (2 ** boolifyWidth < perms.length) {
    boolifyWidth++;
  }

  const { circuit } = summon.compile({
    path: 'circuit/main.ts',
    boolifyWidth,
    publicInputs: {
      nParties: publicInputs.length,
      seed: rand,
    },
    files: await getCircuitFiles(),
  });

  const inputs: Record<string, unknown> = {};

  for (const [j, pref] of prefs.entries()) {
    if (partyIndex === j) {
      // The circuit hardcodes that keeping your item is acceptable.
      continue;
    }

    inputs[`party${partyIndex}PrefersItem${j}`] = pref;
  }

  const protocol = new mpcf.Protocol(circuit, new EmpWasmEngine());

  const session = protocol.join(
    `party${partyIndex}`,
    inputs,
    (to, msg) => {
      assert(/^party\d+$/.test(to), 'Invalid recipient');
      const i = parseInt(to.slice(5), 10);

      room.send(publicInputs[i].pk, {
        type: 'protocol',
        data: msg,
      });

      bytesTransferred += msg.length;
      onProgress(bytesTransferred / totalBytes);
    },
  );

  protocolMsgQueue.stream(({ from, data }) => {
    for (let i = 0; i < publicInputs.length; i++) {
      if (bufferCmp(publicInputs[i].pk.publicKey, from.publicKey) === 0) {
        session.handleMessage(`party${i}`, data);
        bytesTransferred += data.length;
        onProgress(bytesTransferred / totalBytes);
        return;
      }
    }

    console.error('Unexpected from:', from);
  });

  const Output = z.object({
    bestPermIndex: z.number(),
  });

  const output = Output.parse(await session.output());

  if (bytesTransferred !== totalBytes) {
    console.error(
      [
        'Bytes sent & received was not equal to totalBytes.',
        ' This causes incorrect progress calculations.',
        ` To fix, update totalBytes from ${totalBytes} to ${bytesTransferred}.`,
      ].join(''),
    );
  }

  return perms[output.bestPermIndex];
}
