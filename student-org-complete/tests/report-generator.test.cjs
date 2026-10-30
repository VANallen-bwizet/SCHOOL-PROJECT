const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Requiring the generator should expose helpers, not regenerate project files.
const root = path.resolve(__dirname, '..');
const watchedFiles = ['dataset/baseline.json', 'docs/TEST-CASES.md'];
const before = watchedFiles.map(name => fs.readFileSync(path.join(root, name), 'utf8'));
const { csv, parseTestResults } = require('../scripts/generate-deliverables.cjs');

test('importing report helpers leaves generated documents and data unchanged', () => {
  watchedFiles.forEach((name, index) => {
    assert.equal(fs.readFileSync(path.join(root, name), 'utf8'), before[index]);
  });
});

test('CSV export preserves commas, quotes, empty values, and line breaks', () => {
  const result = csv([{ name: 'A, "B"', detail: 'first\nsecond' }, { name: null }], ['name', 'detail']);
  assert.equal(result, 'name,detail\n"A, ""B""","first\nsecond"\n"",""\n');
});

test('test-report parsing preserves failed, skipped, and todo case statuses', () => {
  const tap = [
    'TAP version 13',
    '# Subtest: passing example',
    'ok 1 - passing example',
    'not ok 2 - failing example',
    'ok 3 - skipped example # SKIP platform unavailable',
    'not ok 4 - pending example # TODO future feature',
    '# tests 4', '# pass 1', '# fail 1', '# cancelled 0', '# skipped 1', '# todo 1'
  ].join('\n');
  const result = parseTestResults(tap);
  assert.equal(result.tests, 4);
  assert.equal(result.pass, 1);
  assert.equal(result.fail, 1);
  assert.deepEqual(result.cases, [
    { name: 'passing example', status: 'PASS' },
    { name: 'failing example', status: 'FAIL' },
    { name: 'skipped example', status: 'SKIP' },
    { name: 'pending example', status: 'TODO' }
  ]);
});

test('report generation refuses absent totals and an empty test discovery result', () => {
  assert.throws(() => parseTestResults('not real test output'), /missing/);
  assert.throws(() => parseTestResults('# tests 0\n# pass 0\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0'), /No automated tests/);
});
