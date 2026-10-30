// Run from the project folder: node --test tests/set-relations.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const { isSubset, isSuperset, complement, union, intersection, powerSet, cardinality } = require('../modules/set-operations');
const { inspectMemberships } = require('../modules/membership-cleanup');

test('subset and superset handle containment, overlap, equality, and empty sets', () => {
  const cases = [
    [[1, 2], [1, 2, 3], true, false],
    [[1, 2, 3], [1, 2], false, true],
    [[1, 2], [2, 3], false, false],
    [[1], [4], false, false],
    [[1, 2], [2, 1], true, true],
    [[], [1], true, false],
    [[1], [], false, true],
    [[], [], true, true]
  ];
  for (const [a, b, subset, superset] of cases) {
    const setA = new Set(a);
    const setB = new Set(b);
    assert.equal(isSubset(setA, setB), subset);
    assert.equal(isSuperset(setA, setB), superset);
    assert.deepEqual([...setA], a, 'A must remain unchanged');
    assert.deepEqual([...setB], b, 'B must remain unchanged');
  }
});

function loadMainWithSampleData() {
  const handlers = new Map();
  const memberships = new Map([[1, [1, 2]], [2, [1, 2, 3]], [3, [4]], [4, []]]);
  const frame = { url: pathToFileURL(path.join(root, 'index.html')).href };
  const sender = { mainFrame: frame };
  const event = { sender, senderFrame: frame };
  class WindowStub {
    constructor() { this.webContents = { setWindowOpenHandler() {}, on() {} }; }
    loadFile() { return Promise.resolve(); }
    static fromWebContents(value) { return value === sender ? {} : null; }
  }
  const fakeDatabase = {
    initializeDatabase() {},
    closeDatabase() {},
    findSavedMembershipDuplicates: () => [],
    getStudents: () => [1, 2, 3, 4, 5].map(student_id => ({ student_id })),
    getOrganizations: () => [...memberships.keys()].map(organization_id => ({ organization_id })),
    getOrganizationMembers: id => memberships.get(id).map(student_id => ({ student_id }))
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'main.js'), 'utf8'), {
    __dirname: root,
    console,
    process,
    require(name) {
      if (name === 'electron') return {
        app: { whenReady: () => ({ then: callback => callback() }), getPath: () => 'unused', on() {}, quit() {} },
        BrowserWindow: WindowStub,
        session: { defaultSession: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} } },
        ipcMain: { handle(channel, callback) {
          assert.ok(!handlers.has(channel), `Duplicate handler: ${channel}`);
          handlers.set(channel, callback);
        } }
      };
      if (name === './database/db') return fakeDatabase;
      if (name.startsWith('./')) return require(path.join(root, name));
      return require(name);
    }
  });
  return { handlers, handler: handlers.get('sets:relations'), complementHandler: handlers.get('sets:complement'), event };
}

test('main handler registers at startup and returns correct relation results', () => {
  const { handler, event } = loadMainWithSampleData();
  assert.equal(typeof handler, 'function');
  // JSON conversion makes objects from the separate VM comparable.
  const result = (a, b) => JSON.parse(JSON.stringify(handler(event, a, b)));
  assert.deepEqual(result(1, 2), {
    subset: true, superset: false, equal: false, cardinalityA: 2, cardinalityB: 3
  });
  assert.equal(result(2, 1).superset, true);
  assert.equal(result(1, 1).equal, true);
  assert.equal(result(1, 3).subset, false);
  assert.equal(result(1, 3).superset, false);
  assert.equal(result(4, 1).subset, true);
  assert.equal(result(1, 4).superset, true);
  assert.equal(result(4, 4).equal, true);
});

test('main handler rejects invalid IDs and untrusted senders', () => {
  const { handler, event } = loadMainWithSampleData();
  for (const id of [0, -1, 1.5, '1', null, NaN, Infinity]) {
    assert.throws(() => handler(event, id, 2), /Invalid organization IDs/);
    assert.throws(() => handler(event, 1, id), /Invalid organization IDs/);
  }
  assert.throws(() => handler(event, 999, 2), /Could not verify/);
  assert.throws(() => handler({ sender: {}, senderFrame: event.senderFrame }, 1, 2), /not allowed/);
  assert.throws(() => handler({ ...event, senderFrame: null }, 1, 2), /not allowed/);
  assert.throws(() => handler({ ...event, senderFrame: { url: 'https://example.com' } }, 1, 2), /not allowed/);
});

test('preload exposes the specific relation request and preserves other set methods', async () => {
  const exposed = {};
  const calls = [];
  vm.runInNewContext(fs.readFileSync(path.join(root, 'preload.js'), 'utf8'), {
    require: () => ({
      contextBridge: { exposeInMainWorld(name, value) { exposed[name] = value; } },
      ipcRenderer: { invoke: (...args) => { calls.push(args); return Promise.resolve({ subset: true }); } }
    })
  });
  const result = await exposed.setAPI.checkRelations(1, 2);
  assert.deepEqual(calls, [['sets:relations', 1, 2]]);
  assert.equal(result.subset, true);
  await exposed.setAPI.complement(3);
  assert.deepEqual(calls[1], ['sets:complement', 3]);
  await exposed.setAPI.powerSet([1, 2], 3);
  assert.deepEqual(calls[2], ['sets:power-set', [1, 2], 3]);
  await exposed.membershipAPI.inspect([]);
  await exposed.membershipAPI.audit();
  assert.deepEqual(calls[3], ['memberships:inspect', []]);
  assert.deepEqual(calls[4], ['memberships:audit']);
  for (const name of ['union', 'intersection', 'difference', 'symmetricDifference']) {
    assert.equal(typeof exposed.setAPI[name], 'function');
  }
});

test('power set has unique subsets, includes the empty/full sets, and satisfies 2^n', () => {
  assert.deepEqual(powerSet([]), [[]]);
  assert.equal(cardinality([]), 0);
  assert.equal(cardinality([1, 1, 2]), 2);
  assert.deepEqual(powerSet([1, 1, 2]), [[], [1], [2], [1, 2]]);
  for (let size = 0; size <= 10; size++) {
    const values = Array.from({ length: size }, (_, index) => index + 1);
    const subsets = powerSet(values, 10);
    assert.equal(subsets.length, 2 ** size);
    assert.equal(new Set(subsets.map(row => row.join(','))).size, subsets.length);
    assert.deepEqual(subsets[0], []);
    assert.deepEqual(subsets.at(-1), values);
    assert.ok(subsets.every(row => row.every(value => values.includes(value))));
  }
  assert.throws(() => powerSet([1, 2, 3], 2), /at most 2/);
  assert.throws(() => powerSet([1], 11), /0 to 10/);
  assert.throws(() => powerSet([1], 1.5), /0 to 10/);
});

test('membership cleanup detects repeated pairs and preserves multiple organizations', () => {
  const rows = [
    { studentId: 1, organizationId: 1 },
    { studentId: 1, organizationId: 1 },
    { studentId: 1, organizationId: 2 },
    { studentId: 1, organizationId: 1 }
  ];
  const snapshot = JSON.stringify(rows);
  const result = inspectMemberships(rows);
  assert.equal(result.inputCount, 4);
  assert.equal(result.uniqueCount, 2);
  assert.equal(result.duplicateCount, 2);
  assert.deepEqual(result.duplicates, [{ studentId: 1, organizationId: 1, copies: 3 }]);
  assert.deepEqual(result.cleanedRows, [rows[0], rows[2]]);
  assert.equal(inspectMemberships(result.cleanedRows).duplicateCount, 0);
  assert.equal(JSON.stringify(rows), snapshot, 'Inspection must not modify its input');
  assert.equal(inspectMemberships([]).uniqueCount, 0);
  for (const input of [null, {}, [{ studentId: '1', organizationId: 1 }], [null], Array(1001).fill(rows[0])]) {
    assert.throws(() => inspectMemberships(input));
  }
});

test('new handlers register before use, validate inputs, and reject untrusted requests', () => {
  const { handlers, event } = loadMainWithSampleData();
  const powerHandler = handlers.get('sets:power-set');
  const inspectHandler = handlers.get('memberships:inspect');
  const auditHandler = handlers.get('memberships:audit');
  const power = powerHandler(event, [1, 1, 2], 2);
  assert.equal(power.cardinality, 2);
  assert.equal(power.duplicatesRemoved, 1);
  assert.equal(power.subsetCount, 4);
  assert.equal(power.subsetCount, power.expectedSubsetCount);
  assert.equal(powerHandler(event, [], 1).subsetCount, 1);
  assert.throws(() => powerHandler(event, [99], 2), /must exist/);
  assert.throws(() => powerHandler(event, [1, 2, 3], 2), /at most 2/);
  assert.throws(() => powerHandler(event, ['1'], 2), /whole-number/);
  assert.throws(() => powerHandler(event, Array(1001).fill(1), 2), /list/);
  assert.equal(inspectHandler(event, [{ studentId: 1, organizationId: 2 }]).uniqueCount, 1);
  assert.throws(() => inspectHandler(event, [{ studentId: 99, organizationId: 1 }]), /must exist/);
  assert.throws(() => inspectHandler(event, [{ studentId: 1, organizationId: 99 }]), /must exist/);
  assert.deepEqual(auditHandler(event), []);
  const untrusted = { sender: {}, senderFrame: event.senderFrame };
  assert.throws(() => powerHandler(untrusted, [1], 2), /not allowed/);
  assert.throws(() => inspectHandler(untrusted, []), /not allowed/);
  assert.throws(() => auditHandler(untrusted), /not allowed/);
});

test('actual SQLite schema blocks duplicate membership pairs but allows other organizations', () => {
  const { DatabaseSync } = require('node:sqlite');
  const database = new DatabaseSync(':memory:');
  try {
    database.exec(fs.readFileSync(path.join(root, 'database/schema.sql'), 'utf8'));
    database.exec("INSERT INTO students VALUES (1, 'Sample Student', 'Test Course');");
    database.exec("INSERT INTO organizations (organization_id, name) VALUES (1, 'A'), (2, 'B');");
    database.exec('INSERT INTO memberships (student_id, organization_id) VALUES (1, 1);');
    assert.throws(() => database.exec('INSERT INTO memberships (student_id, organization_id) VALUES (1, 1);'), /UNIQUE/);
    database.exec('INSERT INTO memberships (student_id, organization_id) VALUES (1, 2);');
    assert.equal(database.prepare('SELECT COUNT(*) AS total FROM memberships').get().total, 2);
  } finally {
    database.close();
  }
});

test('complement handles empty, complete, and partial sets without mutating inputs', () => {
  const universe = new Set([1, 2, 3]);
  assert.deepEqual([...complement(new Set(), universe)], [1, 2, 3]);
  assert.equal(complement(universe, universe).size, 0);
  const selected = new Set([2]);
  const outside = complement(selected, universe);
  assert.deepEqual([...outside], [1, 3]);
  assert.equal(intersection(selected, outside).size, 0);
  assert.equal(union(selected, outside).size, universe.size);
  assert.deepEqual([...selected], [2]);
  assert.deepEqual([...universe], [1, 2, 3]);
  assert.equal(complement(new Set(), new Set()).size, 0);
});

test('complement handler uses all students, including those in no organizations', () => {
  const { complementHandler: handler, event } = loadMainWithSampleData();
  assert.equal(typeof handler, 'function');
  const result = handler(event, 1);
  assert.deepEqual(Array.from(result.members, student => student.student_id), [3, 4, 5]);
  assert.equal(result.population, 5);
  assert.equal(result.organizationCardinality, 2);
  assert.equal(result.cardinality, 3);
  assert.equal(result.population - result.organizationCardinality, result.cardinality);
  assert.equal(handler(event, 4).cardinality, 5, 'Empty organization has the entire population as complement');
  for (const id of [0, -1, 1.5, '1', null]) {
    assert.throws(() => handler(event, id), /Invalid organization ID/);
  }
  assert.throws(() => handler(event, 999), /Could not calculate/);
  assert.throws(() => handler({ sender: {}, senderFrame: event.senderFrame }, 1), /not allowed/);
});
