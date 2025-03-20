export default function genCircuit(nParties: number, seed: number): Record<string, string> {
  const args = [...new Array(nParties)].map((_, i) => `party${i}Prefs`).join(', ');

  const mainTs = `
    export default function main(${args}) {
      let allPrefBits = [${args}].map(asBits);
      const perms = makePermutations(${nParties}, ${seed});

      let bestPerm = perms[0];

      for (const perm of perms.slice(1)) {
        let everyoneOk = true;

        for (let i = 0; i < ${nParties}; i++) {
          const prefBits = allPrefBits[i];
          const alternativeItem = perm[i];

          everyoneOk &&= prefBits[alternativeItem];
        }

        if (everyoneOk) {
          bestPerm = perm;
        }
      }

      return bestPerm;
    }

    ${asBits.toString()}
    ${makePermutations.toString()}
  `;

  return {
    'circuit/main.ts': mainTs,
  };
}

function asBits(nParties: number, partyIndex: number, prefs: number): boolean[] {
  const prefBits = [];

  for (let i = 0; i < nParties; i++) {
    if (i === partyIndex) {
      // Enforce that sticking with your current item is preferred
      prefBits.push(true);
    } else {
      prefBits.push((prefs & (1 << i)) !== 0);
    }
  }

  return prefBits;
}

function makePermutations(n: number, seed: number): number[][] {
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

    const perms: number[][] = [];

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

  const values = [...range(0, n)];
  const perms = getPermutations(values);
  return sortPermutations(perms, seed);
}
