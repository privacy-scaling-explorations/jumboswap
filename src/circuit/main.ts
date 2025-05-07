import makePermutations from './makePermutations.ts';
import range from './range.ts';

export default (io: Summon.IO) => {
  const nParties = io.inputPublic('nParties', summon.number());
  const seed = io.inputPublic('seed', summon.number());

  const allPrefBits = [...range(0, nParties)].map(i => {
    let prefs = [];

    for (let j = 0; j < nParties; j++) {
      if (i === j) {
        // Enforce that sticking with your current item is acceptable
        prefs.push(true);
      } else {
        prefs.push(io.input(
          `party${i}`,
          `party${i}PrefersItem${j}`,
          summon.bool(),
        ));
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
