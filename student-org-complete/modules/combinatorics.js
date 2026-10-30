// Exact integer arithmetic avoids rounding for large committee counts.
function combinations(n, k) {
  if (!Number.isSafeInteger(n) || n < 0 || !Number.isSafeInteger(k) || k < 0) {
    throw new Error('Population and committee size must be non-negative whole numbers.');
  }
  if (k > n) return 0n;
  // Choosing k people is equivalent to choosing the n-k people left out.
  // The smaller loop is faster. The n suffix (1n) makes an exact BigInt value.
  k = Math.min(k, n - k);
  let result = 1n;
  for (let index = 1; index <= k; index++) {
    result = result * BigInt(n - k + index) / BigInt(index);
  }
  return result;
}

function calculateCommittee(students, memberships, options) {
  const { size, poolOrganizationIds, excludedOrganizationIds } = options;
  if (!Number.isSafeInteger(size) || size < 0) throw new Error('Use a non-negative whole-number committee size.');
  const pool = new Set(poolOrganizationIds);
  const exclusions = new Set(excludedOrganizationIds);
  const poolMembers = new Set();
  const excluded = new Set();
  for (const row of memberships) {
    if (pool.has(row.organization_id)) poolMembers.add(row.student_id);
    if (exclusions.has(row.organization_id)) excluded.add(row.student_id);
  }
  // Set membership removes repeats from overlapping clubs. Filter the complete
  // student list once, so a person can occupy only one committee position.
  // No pool choices means the full student population; exclusion always wins.
  const initial = students.filter(student => pool.size === 0 || poolMembers.has(student.student_id));
  const eligible = initial.filter(student => !excluded.has(student.student_id));
  return {
    eligible, poolCount: initial.length, excludedCount: initial.length - eligible.length,
    eligibleCount: eligible.length, size, ways: combinations(eligible.length, size).toString(),
    formula: `C(${eligible.length}, ${size})`,
    feasible: size <= eligible.length
  };
}

module.exports = { combinations, calculateCommittee };
