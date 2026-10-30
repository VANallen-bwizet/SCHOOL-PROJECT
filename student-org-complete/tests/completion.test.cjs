const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { combinations, calculateCommittee } = require('../modules/combinatorics');
const { equalSets, verifyDeMorgan, exhaustiveVerification } = require('../modules/verification');
const root = path.resolve(__dirname, '..');

test('exact committee combinations include edge cases and integers above Number precision', () => {
  assert.equal(combinations(10, 3), 120n);
  assert.equal(combinations(10, 7), 120n);
  assert.equal(combinations(0, 0), 1n);
  assert.equal(combinations(5, 0), 1n);
  assert.equal(combinations(5, 5), 1n);
  assert.equal(combinations(4, 5), 0n);
  assert.equal(combinations(100, 50), 100891344545564193334812497256n);
  assert.throws(() => combinations(5, -1));
  assert.throws(() => combinations(5, 1.5));
});

const students = [1, 2, 3, 4, 5].map(student_id => ({ student_id, full_name: `Student ${student_id}` }));
const organizations = [1, 2, 3].map(organization_id => ({ organization_id, name: `Club ${organization_id}` }));
const memberships = [[1, 1], [2, 1], [3, 1], [3, 2], [4, 2], [5, 3]]
  .map(([student_id, organization_id]) => ({ student_id, organization_id }));

test('committee eligibility uses union pools and excludes any prohibited membership', () => {
  let result = calculateCommittee(students, memberships, { size: 2, poolOrganizationIds: [], excludedOrganizationIds: [2] });
  assert.deepEqual(result.eligible.map(student => student.student_id), [1, 2, 5]);
  assert.equal(result.ways, '3');
  result = calculateCommittee(students, [...memberships, memberships[0]], { size: 2, poolOrganizationIds: [1, 2], excludedOrganizationIds: [2] });
  assert.deepEqual(result.eligible.map(student => student.student_id), [1, 2]);
  assert.equal(result.poolCount, 4);
  assert.equal(result.excludedCount, 2);
  assert.equal(result.ways, '1');
  result = calculateCommittee(students, memberships, { size: 1, poolOrganizationIds: [1], excludedOrganizationIds: [1] });
  assert.equal(result.ways, '0');
  assert.equal(result.feasible, false);
  assert.equal(calculateCommittee([], [], { size: 0, poolOrganizationIds: [], excludedOrganizationIds: [] }).ways, '1');
});

test('De Morgan laws compare actual IDs, direct predicates, and all 256 sample set pairs', () => {
  assert.equal(equalSets(new Set([1]), new Set([2])), false);
  const universe = new Set([1, 2, 3, 4]);
  const result = verifyDeMorgan(universe, new Set([1, 2]), new Set([2, 3]));
  assert.deepEqual(result[0].left, [4]);
  assert.deepEqual(result[1].left, [1, 3, 4]);
  assert.ok(result.every(law => law.passed && law.mismatch.length === 0));
  assert.ok(verifyDeMorgan(new Set(), new Set(), new Set()).every(law => law.passed));
  assert.throws(() => verifyDeMorgan(universe, new Set([99]), new Set()), /subsets/);
  assert.deepEqual(exhaustiveVerification(), { universe: [1, 2, 3, 4], pairs: 256, lawsChecked: 512, failures: 0, passed: true });
});

function completedMain() {
  const handlers = new Map();
  const frame = { url: pathToFileURL(path.join(root, 'index.html')).href };
  const sender = { mainFrame: frame };
  class WindowStub {
    constructor() { this.webContents = { setWindowOpenHandler() {}, on() {} }; }
    loadFile() { return Promise.resolve(); }
    static fromWebContents(value) { return value === sender ? {} : null; }
  }
  const database = { initializeDatabase() {}, closeDatabase() {}, getStudents: () => students,
    getOrganizations: () => organizations, getMemberships: () => memberships,
    getOrganizationMembers: id => memberships.filter(row => row.organization_id === id).map(row => students.find(student => student.student_id === row.student_id)) };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'main.js'), 'utf8'), {
    __dirname: root, console, process, setTimeout, clearTimeout,
    require(name) {
      if (name === 'electron') return {
        app: { whenReady: () => ({ then: callback => callback() }), getPath: () => 'unused', on() {} },
        BrowserWindow: WindowStub, dialog: { showSaveDialog: async () => ({ canceled: true }) },
        session: { defaultSession: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} } },
        ipcMain: { handle(channel, handler) { assert.ok(!handlers.has(channel)); handlers.set(channel, handler); } }
      };
      if (name === './database/db') return database;
      return require(name.startsWith('./') ? path.join(root, name) : name);
    }
  });
  return { handlers, event: { sender, senderFrame: frame } };
}

test('final handlers register independently, validate inputs, and preserve cancelable export', async () => {
  const { handlers, event } = completedMain();
  assert.equal(handlers.get('project:overview')(event).membershipCount, 6);
  const committee = handlers.get('project:committee');
  assert.equal(committee(event, { size: 2, poolOrganizationIds: [], excludedOrganizationIds: [2] }).ways, '3');
  assert.throws(() => committee(event, { size: -1, poolOrganizationIds: [], excludedOrganizationIds: [] }));
  assert.throws(() => committee(event, { size: 1, poolOrganizationIds: [99], excludedOrganizationIds: [] }));
  assert.throws(() => committee(event, { size: 1, poolOrganizationIds: 'all', excludedOrganizationIds: [] }));
  assert.ok(handlers.get('project:verification')(event, 1, 2).laws.every(law => law.passed));
  assert.throws(() => handlers.get('project:verification')(event, '1', 2));
  assert.throws(() => handlers.get('project:report')(event, '../main.js'), /Unknown report/);
  assert.equal((await handlers.get('project:export')(event)).canceled, true);
  const bad = { sender: {}, senderFrame: event.senderFrame };
  for (const channel of ['project:overview', 'project:committee', 'project:verification', 'project:benchmark', 'project:report']) {
    assert.throws(() => handlers.get(channel)(bad), /not allowed/);
  }
  await assert.rejects(handlers.get('project:export')(bad), /not allowed/);
});

test('benchmark worker measures growing populations with equal hit results', async () => {
  const { handlers, event } = completedMain();
  const result = await handlers.get('project:benchmark')(event);
  assert.deepEqual(Array.from(result.results, row => row.size), [100, 1000, 10000, 50000]);
  assert.equal(result.trials, 5);
  for (const row of result.results) {
    assert.equal(row.hits, 2000);
    assert.equal(row.correct, true);
    assert.ok(row.listMs >= 0 && row.hashMs >= 0 && row.buildMs >= 0);
    assert.equal(row.rawTrials.list.length, 5);
  }
});

test('new page contains every renderer ID exactly once and honors reduced motion', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const name of ['renderer.js', 'workspace.js']) {
    const source = fs.readFileSync(path.join(root, name), 'utf8');
    new vm.Script(source);
    for (const match of source.matchAll(/(?:getElementById|get)\(\s*'([^']+)'/g)) {
      assert.ok(ids.includes(match[1]), `${name} references missing ID ${match[1]}`);
    }
  }
  assert.match(fs.readFileSync(path.join(root, 'styles.css'), 'utf8'), /prefers-reduced-motion/);
  assert.equal([...html.matchAll(/data-page="/g)].length, 8);
});
