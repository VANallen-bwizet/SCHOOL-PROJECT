const { union, intersection, complement, difference } = require('./set-operations');

function equalSets(a, b) {
  // Equal lengths alone are not enough: {1, 2} and {3, 4} have the same size.
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

function verifyDeMorgan(universe, setA, setB) {
  for (const value of union(setA, setB)) {
    if (!universe.has(value)) throw new Error('Selected sets must be subsets of the population.');
  }
  const firstLeft = complement(union(setA, setB), universe);
  const firstRight = intersection(complement(setA, universe), complement(setB, universe));
  const secondLeft = complement(intersection(setA, setB), universe);
  const secondRight = union(complement(setA, universe), complement(setB, universe));
  const result = (expression, left, right, direct) => ({
    expression, left: [...left], right: [...right], direct: [...direct],
    passed: equalSets(left, right) && equalSets(left, direct),
    mismatch: [...union(difference(left, right), difference(right, left))]
  });
  // Independent predicate computations make an additional cross-check.
  return [
    result('(A ∪ B)ᶜ = Aᶜ ∩ Bᶜ', firstLeft, firstRight,
      new Set([...universe].filter(id => !setA.has(id) && !setB.has(id)))),
    result('(A ∩ B)ᶜ = Aᶜ ∪ Bᶜ', secondLeft, secondRight,
      new Set([...universe].filter(id => !setA.has(id) || !setB.has(id))))
  ];
}

// Exhaustively verify every A,B subset pair of a four-element universe.
function exhaustiveVerification() {
  const universe = new Set([1, 2, 3, 4]);
  const subsets = [];
  for (let mask = 0; mask < 16; mask++) {
    // Four binary positions encode included/excluded choices for four IDs.
    subsets.push(new Set([...universe].filter((_, index) => mask & (1 << index))));
  }
  let lawsChecked = 0;
  let failures = 0;
  for (const a of subsets) for (const b of subsets) {
    for (const law of verifyDeMorgan(universe, a, b)) {
      lawsChecked++;
      if (!law.passed) failures++;
    }
  }
  return { universe: [...universe], pairs: 256, lawsChecked, failures, passed: failures === 0 };
}

module.exports = { equalSets, verifyDeMorgan, exhaustiveVerification };
