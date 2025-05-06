/* eslint-disable prefer-const */

export default (io: Summon.IO) => {
  const nParties = io.inputPublic('nParties', summon.number());
  const seed = io.inputPublic('seed', summon.number());

  const allPrefBits = [...range(0, nParties)].map(i => {
    const prefs = [];

    for (let j = 0; j < nParties; j++) {
      if (i === j) {
        // Enforce that sticking with your current item is acceptable
        prefs.push(true);
      } else {
        prefs.push(io.inputPublic(`party${i}PrefersItem${j}`, summon.bool()));
      }
    }

    return prefs;
  });

  const perms = makePermutations(nParties, seed);

  let bestPermIndex = 0;

  for (let permIndex = 0; permIndex < perms.length; permIndex++) {
    const perm = perms[permIndex];
    let everyoneOk = true;

    for (let i = 0; i < nParties; i++) {
      const prefBits = allPrefBits[i];
      const alternativeItem = perm[i];

      everyoneOk &&= prefBits[alternativeItem];
    }

    if (everyoneOk) {
      bestPermIndex = permIndex;
    }
  }

  io.outputPublic('bestPermIndex', bestPermIndex);
};

export function makePermutations(n: number, seed: number): number[][] {
  const values = [...range(0, n)];
  const perms = getPermutations(values);
  return sortPermutations(perms, seed);
}

function sortPermutations(permutations: number[][], seed: number): number[][] {
  return permutations.sort((permA, permB) => {
    const swapsA = numberOfSwaps(permA);
    const swapsB = numberOfSwaps(permB);

    if (swapsA !== swapsB) {
      return swapsA - swapsB;
    }

    return randish([seed, ...permA]) - randish([seed, ...permB]);
  });
}

function numberOfSwaps(permutation: number[]): number {
  return permutation.filter((v, i) => v !== i).length;
}

function randish(seeds: number[]) {
  let x = 0;

  for (const seed of seeds) {
    x += seed;
    x -= (x * x + 1) / (2 * x + 0.1);
    x -= (x * x + 1) / (2 * x + 0.1);
    x -= (x * x + 1) / (2 * x + 0.1);
  }

  const y = 1000 * x;
  return y - Math.floor(y);
}

function getPermutations(values: number[]): number[][] {
  if (values.length === 1) {
    return [values];
  }

  let perms: number[][] = [];

  for (const value of values) {
    const otherValues = values.filter(v => v !== value);

    for (const perm of getPermutations(otherValues)) {
      perms.push([value, ...perm]);
    }
  }

  return perms;
}

function* range(start: number, end: number) {
  for (let i = start; i < end; i++) {
    yield i;
  }
}
