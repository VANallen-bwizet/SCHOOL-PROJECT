// A duplicate is the same student AND organization, not a student in two clubs.
function inspectMemberships(rows) {
  if (!Array.isArray(rows) || rows.length > 1000) {
    throw new Error('Provide at most 1000 membership rows.');
  }
  const counts = new Map();
  for (const row of rows) {
    if (!row || !Number.isSafeInteger(row.studentId) || row.studentId < 1 ||
        !Number.isSafeInteger(row.organizationId) || row.organizationId < 1) {
      throw new Error('Each row needs positive whole-number student and organization IDs.');
    }
    const key = `${row.studentId}:${row.organizationId}`;
    if (counts.has(key)) counts.get(key).copies++;
    else counts.set(key, { studentId: row.studentId, organizationId: row.organizationId, copies: 1 });
  }
  const groups = [...counts.values()];
  // Keep first-appearance order while separating total copies from extra copies.
  // For example, three occurrences of one pair mean two removable duplicates.
  return {
    inputCount: rows.length,
    uniqueCount: counts.size,
    duplicateCount: rows.length - counts.size,
    duplicates: groups.filter(row => row.copies > 1),
    cleanedRows: groups.map(({ studentId, organizationId }) => ({ studentId, organizationId }))
  };
}

module.exports = { inspectMemberships };
