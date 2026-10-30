// Regenerate reproducible baseline data and measured reports without touching user data.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { seedDatabase } = require('../database/seed');
const sets = require('../modules/set-operations');
const { verifyDeMorgan, exhaustiveVerification } = require('../modules/verification');
const { calculateCommittee } = require('../modules/combinatorics');
const { runBenchmark } = require('../modules/performance');
const root = path.resolve(__dirname, '..');

// Quoting every field preserves commas, quotes and line breaks in exported text.
const csv = (rows, columns) => columns.join(',') + '\n' + rows.map(row => columns.map(column =>
  '"' + String(row[column] ?? '').replaceAll('"', '""') + '"').join(',')).join('\n') + '\n';

// Read the runner's actual totals instead of assuming every printed case passed.
function parseTestResults(output) {
  const totals = {};
  for (const name of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
    const match = output.match(new RegExp(`^# ${name} (\\d+)\\s*$`, 'm'));
    if (!match) throw new Error(`Test output is missing its ${name} total.`);
    totals[name] = Number(match[1]);
  }
  if (totals.tests === 0) throw new Error('No automated tests were discovered.');

  const cases = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^(ok|not ok) \d+ - (.+)$/);
    if (!match) continue;
    const directive = match[2].match(/\s+# (SKIP|TODO)\b/i);
    cases.push({
      name: directive ? match[2].slice(0, directive.index) : match[2],
      status: directive ? directive[1].toUpperCase() : match[1] === 'ok' ? 'PASS' : 'FAIL'
    });
  }
  return { ...totals, cases };
}

// Importing this script for tests must not overwrite existing reports or datasets.
function generateDeliverables() {
  for (const folder of ['docs', 'dataset']) fs.mkdirSync(path.join(root, folder), { recursive: true });
  const write = (name, content) => fs.writeFileSync(path.join(root, name), content, 'utf8');
  const database = new DatabaseSync(':memory:');
  let students;
  let organizations;
  let memberships;
  try {
    database.exec(fs.readFileSync(path.join(root, 'database/schema.sql'), 'utf8'));
    seedDatabase(database);
    students = database.prepare('SELECT * FROM students ORDER BY student_id').all();
    organizations = database.prepare('SELECT * FROM organizations ORDER BY organization_id').all();
    // Exclude timestamps so baseline membership exports are reproducible.
    memberships = database.prepare('SELECT student_id, organization_id FROM memberships ORDER BY student_id, organization_id').all();
  } finally {
    // Release the temporary database even if schema creation or seeding fails.
    database.close();
  }
  const baseline = { kind: 'Simulated baseline dataset', students, organizations, memberships };
  write('dataset/students.csv', csv(students, ['student_id', 'full_name', 'course']));
  write('dataset/organizations.csv', csv(organizations, ['organization_id', 'name', 'description']));
  write('dataset/memberships.csv', csv(memberships, ['student_id', 'organization_id']));
  write('dataset/baseline.json', JSON.stringify(baseline, null, 2));
  write('dataset/duplicate-sample.csv', 'student_id,organization_id\n1,1\n1,1\n1,2\n2,1\n2,1\n');

  const universe = new Set(students.map(student => student.student_id));
  const memberSet = id => new Set(memberships.filter(row => row.organization_id === id).map(row => row.student_id));
  const a = memberSet(1);
  const b = memberSet(4);
  const laws = verifyDeMorgan(universe, a, b);
  const exhaustive = exhaustiveVerification();
  const committee = calculateCommittee(students, memberships, { size: 3, poolOrganizationIds: [], excludedOrganizationIds: [1] });
  const proof = { population: universe.size, organizationA: organizations.find(org => org.organization_id === 1).name,
    organizationB: organizations.find(org => org.organization_id === 4).name,
    countA: a.size, countB: b.size, union: sets.union(a, b).size, intersection: sets.intersection(a, b).size,
    differenceAB: sets.difference(a, b).size, differenceBA: sets.difference(b, a).size,
    symmetricDifference: sets.symmetricDifference(a, b).size, complementA: sets.complement(a, universe).size,
    laws, exhaustive, committee };
  write('docs/verification-results.json', JSON.stringify(proof, null, 2));
  write('docs/MATHEMATICAL-VERIFICATION.md', `# Mathematical verification report

## Dataset
Simulated baseline: ${students.length} students, ${organizations.length} organizations, ${memberships.length} unique memberships. Live edits may give different results; this report does not change the saved database.

U = all students; A = ${proof.organizationA}; B = ${proof.organizationB}. |U| = ${universe.size}, |A| = ${a.size}, |B| = ${b.size}.

## Set results
| Operation | Rule | Cardinality |
| --- | --- | ---: |
| Union | In A or B; count once | ${proof.union} |
| Intersection | In every selected set | ${proof.intersection} |
| A − B | In A, outside B | ${proof.differenceAB} |
| B − A | In B, outside A | ${proof.differenceBA} |
| Symmetric difference | In A or B, excluding both | ${proof.symmetricDifference} |
| Complement of A | U − A | ${proof.complementA} |

Check: |A ∪ B| = ${a.size} + ${b.size} − ${proof.intersection} = ${proof.union}. Subset checks every ID; superset reverses the check. Equal sets satisfy both. Matching counts alone do not prove equality.

## Power sets and duplicates
Each new element doubles the subsets: |P(S)| = 2^|S|. For {1,2,3}, there are 8 subsets; the empty set has one. Limit: 10 unique IDs, or 1,024 subsets.

Duplicate cleanup keeps one copy of each student–organization pair. Different organizations remain valid memberships. SQLite prevents saved duplicate pairs.

## De Morgan verification
| Law | Left count | Right count | Direct count | Same IDs |
| --- | ---: | ---: | ---: | --- |
| (A ∪ B)ᶜ = Aᶜ ∩ Bᶜ | ${laws[0].left.length} | ${laws[0].right.length} | ${laws[0].direct.length} | ${laws[0].passed ? 'PASS' : 'FAIL'} |
| (A ∩ B)ᶜ = Aᶜ ∪ Bᶜ | ${laws[1].left.length} | ${laws[1].right.length} | ${laws[1].direct.length} | ${laws[1].passed ? 'PASS' : 'FAIL'} |

For any student x: outside the union means outside A AND outside B; outside the intersection means outside A OR outside B. This proves the identities. Independent direct loops and equivalent expressions compare actual IDs.

Sample verification: ${exhaustive.pairs} subset pairs, ${exhaustive.lawsChecked} checks, ${exhaustive.failures} failures. This sample supports the general proof above. Full IDs: verification-results.json.

## Committees
C(n,k) = n! / (k!(n−k)!), for unordered groups without replacement. BigInt keeps counts exact. Included pools use union; exclusions remove students before counting.

Exclude ${proof.organizationA}: n = ${committee.eligibleCount}; C(${committee.eligibleCount},3) = ${committee.ways}. C(n,0) = 1; k > n gives 0.

## Sets and relations
- Set: unique values, such as S = {1,2}.
- Cartesian product: every ordered pair in S × O. Two students and two organizations give four pairs.
- Relation: actual memberships R ⊆ S × O.

## Analytics
Jaccard = |A ∩ B| / |A ∪ B|; two empty sets score 1. Participation counts unique clubs; overlap rankings count shared students once per club. Recommendations exclude joined clubs and combine interest match (60%) with membership similarity (40%). One available signal gets full weight. Scores are matches, not probabilities.
  `);

  console.log('Measuring membership lookup performance…');
  const performance = runBenchmark();
  performance.cpu = os.cpus()[0]?.model || 'Unavailable';
  write('docs/performance-results.json', JSON.stringify(performance, null, 2));
  write('docs/performance-results.csv', csv(performance.results, ['size', 'queryCount', 'listMs', 'hashMs', 'buildMs', 'hashTotalMs', 'lookupSpeedup', 'hits', 'correct']));
  write('docs/PERFORMANCE.md', `# Performance comparison report

Measured: ${performance.measuredAt} (UTC). Runtime: ${performance.runtime}; ${performance.platform}. CPU: ${performance.cpu.trim()}.

## Method
Compare Array.includes with Set.has across four simulated populations. Each uses ${performance.queryCount} fixed queries: half present, half absent. After warmup, ${performance.trials} trials alternate lookup order. Values are medians in milliseconds; set construction is timed separately. Both methods must find ${performance.queryCount / 2} matches.

| Population | List lookup ms | Set lookup ms | Set build ms | Build + lookup ms | Lookup speedup | Correct |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
${performance.results.map(row => `| ${row.size} | ${row.listMs.toFixed(4)} | ${row.hashMs.toFixed(4)} | ${row.buildMs.toFixed(4)} | ${row.hashTotalMs.toFixed(4)} | ${row.lookupSpeedup?.toFixed(2)}× | ${row.correct ? 'Yes' : 'No'} |`).join('\n')}

## What the results mean
- List lookup checks values in sequence: O(n) per query.
- Hash-set lookup averages O(1), but building the set takes O(n) time and extra memory.
- Lookup speedup excludes construction. Build + lookup adds the two medians; it is not a median of paired totals.

Timings depend on the computer, runtime, and background activity. Small measurements are noisy; memory use was not measured. This compares JavaScript membership checking, not SQLite speed. Benchmark IDs are not added to the database.

Run a fresh comparison on Performance or regenerate with npm.cmd run reports. Raw trials: performance-results.json; spreadsheet results: performance-results.csv.
  `);

  write('docs/USER-GUIDE.md', `# User guide

## Start
Open student-org-complete in VS Code and run npm.cmd start. If dependencies are missing, run npm.cmd install first. SQLite needs no separate server. The first launch creates ${students.length} simulated students and ${organizations.length} organizations in a separate database from the original backup.

## Main pages
- Overview: student, organization, and membership totals.
- Members: choose a student and organization, then join or remove membership. Changes are saved. Recalculate earlier results after edits.
- Set laboratory: union, intersection, differences, subset, superset, complement, and power sets. Cardinality means the number of unique elements. Power sets accept up to 10 unique student IDs.
- Analytics: participation counts, Jaccard similarity, overlap rankings, and recommendations. Selected interests are temporary; suggestions do not join clubs automatically.
- Committees: choose eligible organizations, exclusions, and committee size. No include choices means all students. Exclusions take priority.
- Verification: select A and B to check both De Morgan laws and inspect their IDs.
- Performance: compare list and hash-set lookup times.

## Duplicate cleanup
Paste studentId,organizationId pairs, one per line. Cleanup changes the pasted text only; saved memberships already prevent duplicates. Joining different organizations is valid.

## Reports and data
Export current dataset saves the live records as JSON. Bundled CSV/JSON files are the starting dataset, not current edits.

Run npm.cmd test for checks or npm.cmd run reports to refresh baseline reports. Neither command changes the live database. Use Tab and Enter/Space for keyboard controls.
  `);

  write('docs/TEST-CASES.md', '# Test cases\n\nRunning automated checks…\n');
  // Node discovers all test files, including future review/regression tests.
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap'], {
    cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024
  });
  write('docs/test-results.tap', (run.stdout || '') + (run.stderr || ''));
  if (run.error) throw new Error(`Could not run tests: ${run.error.message}`);
  const results = parseTestResults(run.stdout || '');
  write('docs/TEST-CASES.md', `# Test cases and execution report

Run: ${new Date().toISOString()} (UTC), ${process.version}.

| Total | Passed | Failed | Cancelled | Skipped | Todo |
| ---: | ---: | ---: | ---: | ---: | ---: |
| ${results.tests} | ${results.pass} | ${results.fail} | ${results.cancelled} | ${results.skipped} | ${results.todo} |

## Coverage
| Area | Checks |
| --- | --- |
| Sets | Containment, complement, empty/equal sets, unique power subsets |
| Memberships | Duplicate pairs rejected; multiple clubs allowed; setup failures roll back |
| Analytics | Counts, Jaccard, rankings, recommendations, and empty cases |
| Committees | Exclusions, exact counts, k = 0 and k > n |
| Verification | Actual-ID comparisons and ${exhaustive.lawsChecked} De Morgan sample checks |
| App and reports | Request validation, button actions, error recovery, exports, worker failures |

Tests use fixtures or temporary databases; live student data is unchanged. Full case names and output: test-results.tap.
${results.cases.some(item => item.status !== 'PASS') ? '\n## Cases to review\n' + results.cases.filter(item => item.status !== 'PASS').map(item => '- ' + item.status + ': ' + item.name).join('\n') + '\n' : ''}
## Check manually on Windows
- Visit all pages; check narrow layouts, keyboard focus, and reduced motion.
- Join/remove a membership, repeat the action, and restart to check persistence.
- Check power-set limits, duplicate cleanup, and committee exclusions.
- Run a benchmark while changing pages; inspect De Morgan IDs.
- Export JSON, cancel another export, and open every report.

Automated results do not confirm native-window appearance, Save dialog behavior, or installer readiness.
  `);
  if (run.status !== 0 || results.fail > 0 || results.cancelled > 0 || results.pass === 0) {
    throw new Error('Automated checks did not pass; inspect docs/TEST-CASES.md and docs/test-results.tap.');
  }
  console.log(`Deliverables generated: ${students.length} students, ${organizations.length} organizations, ${memberships.length} memberships; ${results.pass}/${results.tests} tests passed.`);
}

module.exports = { csv, parseTestResults, generateDeliverables };

// Run only when launched directly: node scripts/generate-deliverables.cjs.
if (require.main === module) {
  try { generateDeliverables(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
