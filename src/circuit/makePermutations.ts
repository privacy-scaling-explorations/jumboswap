import range from './range.ts';

export default function makePermutations(n: number, seed: number): number[][] {
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
