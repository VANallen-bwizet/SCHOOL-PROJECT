// Combine any number of sets without duplicate student IDs.
function union(...sets) {
  const result = new Set();

  for (const currentSet of sets) {
    for (const studentId of currentSet) {
      result.add(studentId);
    }
  }

  return result;
}

// Find student IDs present in every supplied set.
function intersection(...sets) {
  const result = new Set();

  // This helper uses an empty result for no supplied sets. The interface requires
  // at least two organizations, so no unknown universal set is assumed here.
  if (sets.length === 0) {
    return result;
  }

  // Use the first set as the starting list of candidates.
  for (const studentId of sets[0]) {
    let belongsToAll = true;

    for (let index = 1; index < sets.length; index++) {
      if (!sets[index].has(studentId)) {
        belongsToAll = false;
        break;
      }
    }

    if (belongsToAll) {
      result.add(studentId);
    }
  }

  return result;
}

// Find IDs in setA that are absent from setB.
function difference(setA, setB) {
  const result = new Set();

  for (const studentId of setA) {
    if (!setB.has(studentId)) {
      result.add(studentId);
    }
  }

  return result;
}

// Find members belonging to A or B, excluding shared members.
function symmetricDifference(setA, setB) {
  const onlyA = difference(setA, setB);
  const onlyB = difference(setB, setA);

  return union(onlyA, onlyB);
}
// Check whether every member of A also belongs to B.
function isSubset(setA, setB) {
  for (const studentId of setA) {
    if (!setB.has(studentId)) {
      return false;
    }
  }

  return true;
}

// A contains B when B is a subset of A.
function isSuperset(setA, setB) {
  return isSubset(setB, setA);
}
// Complement is relative to a universe: U minus the selected set.
function complement(selectedSet, universe) {
  return difference(universe, selectedSet);
}

// Cardinality counts distinct elements, even when the input repeats values.
function cardinality(values) {
  return new Set(values).size;
}

// Each new element doubles the subsets: without it, then with it.
function powerSet(values, maximumSize = 8) {
  if (!Number.isSafeInteger(maximumSize) || maximumSize < 0 || maximumSize > 10) {
    throw new Error('Maximum size must be a whole number from 0 to 10.');
  }
  const elements = [...new Set(values)];
  if (elements.length > maximumSize) {
    throw new Error(`Choose at most ${maximumSize} unique student IDs.`);
  }
  const subsets = [[]];
  for (const element of elements) {
    // Freeze the old length: iterating the newly appended subsets too would
    // keep adding the same element and grow the loop without a stopping point.
    const previousCount = subsets.length;
    for (let index = 0; index < previousCount; index++) {
      subsets.push([...subsets[index], element]);
    }
  }
  return subsets;
}

module.exports = { union, intersection, difference, symmetricDifference, isSubset, isSuperset, complement, cardinality, powerSet };
