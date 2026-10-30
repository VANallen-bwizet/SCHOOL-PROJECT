const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const { getOrganizationProfiles } = require('../modules/organization-interests');
const { median } = require('../modules/performance');
const { seedDatabase } = require('../database/seed');
const root = path.resolve(__dirname, '..');

test('organization tags ignore inherited object names and return independent arrays', () => {
  const profiles = getOrganizationProfiles([
    { organization_id: 1, name: 'constructor' },
    { organization_id: 2, name: '__proto__' },
    { organization_id: 3, name: 'Computer Science Club' }
  ]);
  assert.deepEqual(profiles[0].interests, []);
  assert.deepEqual(profiles[1].interests, []);
  profiles[2].interests.push('unexpected-edit');
  const next = getOrganizationProfiles([{ organization_id: 3, name: 'Computer Science Club' }]);
  assert.deepEqual(next[0].interests, ['technology', 'mathematics']);
});

test('median supports odd and even trial counts without reordering raw measurements', () => {
  const trials = [9, 1, 4];
  assert.equal(median(trials), 4);
  assert.deepEqual(trials, [9, 1, 4]);
  assert.equal(median([9, 1, 5, 3]), 4);
  assert.equal(median([2]), 2);
  assert.throws(() => median([]), /empty list/);
});

function loadDatabaseWithFakeConnection() {
  const opened = [];
  const failure = { readSchema: false, seed: false };
  class FakeConnection {
    constructor() { this.closed = false; opened.push(this); }
    exec() {}
    prepare() { return { get: () => ({ version: 'test' }), all: () => [] }; }
    close() { this.closed = true; }
  }
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'database/db.js'), 'utf8'), {
    module,
    __dirname: path.join(root, 'database'),
    console: { log() {} },
    require(name) {
      if (name === 'node:sqlite') return { DatabaseSync: FakeConnection };
      if (name === 'node:fs') return {
        mkdirSync() {},
        readFileSync() {
          if (failure.readSchema) throw new Error('Schema read failed');
          return 'schema';
        }
      };
      if (name === './seed') return { seedDatabase() { if (failure.seed) throw new Error('Seed failed'); } };
      return require(name);
    }
  });
  return { api: module.exports, opened, failure };
}

test('database setup closes failed connections and keeps a single active connection', () => {
  const { api, opened, failure } = loadDatabaseWithFakeConnection();
  failure.readSchema = true;
  assert.throws(() => api.initializeDatabase('unused'), /Schema read failed/);
  assert.equal(opened[0].closed, true);
  assert.throws(() => api.getStudents(), /not open/);

  failure.readSchema = false;
  failure.seed = true;
  assert.throws(() => api.initializeDatabase('unused'), /Seed failed/);
  assert.equal(opened[1].closed, true);

  failure.seed = false;
  api.initializeDatabase('unused');
  assert.equal(opened[2].closed, false);
  assert.throws(() => api.initializeDatabase('unused'), /already open/);
  assert.equal(opened.length, 3, 'Repeated initialization must not create another connection');
  api.closeDatabase();
  assert.equal(opened[2].closed, true);
  api.initializeDatabase('unused');
  assert.equal(opened.length, 4);
  api.closeDatabase();
});

test('seed failure rolls back every inserted student and organization', () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec(fs.readFileSync(path.join(root, 'database/schema.sql'), 'utf8'));
    const interrupted = {
      exec: sql => database.exec(sql),
      prepare(sql) {
        if (/INSERT INTO memberships/.test(sql)) {
          return { run() { throw new Error('Simulated membership write failure'); } };
        }
        return database.prepare(sql);
      }
    };
    assert.throws(() => seedDatabase(interrupted), /Simulated membership write failure/);
    assert.equal(database.prepare('SELECT COUNT(*) AS total FROM students').get().total, 0);
    assert.equal(database.prepare('SELECT COUNT(*) AS total FROM organizations').get().total, 0);
    assert.equal(database.prepare('SELECT COUNT(*) AS total FROM memberships').get().total, 0);
  } finally {
    database.close();
  }
});
