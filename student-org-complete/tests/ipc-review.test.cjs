// Fake Electron and worker objects exercise failure paths without opening a UI.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');

function loadMain(scenario = 'success') {
  const handlers = new Map();
  const lifecycle = new Map();
  const timers = new Set();
  const workers = [];
  const frame = { url: pathToFileURL(path.join(root, 'index.html')).href };
  const sender = { mainFrame: frame };
  const state = { scenario, closed: false };
  class WorkerStub extends EventEmitter {
    constructor() {
      super();
      workers.push(this);
      queueMicrotask(() => {
        if (state.scenario === 'success') this.emit('message', { result: { results: [] } });
        if (state.scenario === 'malformed') this.emit('message', { result: {} });
        if (state.scenario === 'error') this.emit('error', new Error('Simulated worker error'));
        if (state.scenario !== 'waiting') this.emit('exit', 0);
      });
    }
    terminate() {
      this.terminated = true;
      queueMicrotask(() => this.emit('exit', 1));
      return Promise.resolve(1);
    }
  }
  class WindowStub {
    constructor() { this.webContents = { setWindowOpenHandler() {}, on() {} }; }
    loadFile() { return Promise.resolve(); }
    static fromWebContents(value) { return value === sender ? {} : null; }
  }
  const database = {
    initializeDatabase() {}, closeDatabase() { state.closed = true; },
    getStudents: () => [{ student_id: 1 }, { student_id: 2 }],
    getOrganizations: () => [{ organization_id: 1 }, { organization_id: 2 }],
    getMemberships: () => [], getOrganizationMembers: () => []
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'main.js'), 'utf8'), {
    __dirname: root, process, console: { error() {} },
    setTimeout(callback) { timers.add(callback); return callback; },
    clearTimeout(callback) { timers.delete(callback); },
    require(name) {
      if (name === 'electron') return {
        app: { whenReady: () => ({ then: callback => callback() }), getPath: () => 'unused',
          on(event, callback) { lifecycle.set(event, callback); } },
        BrowserWindow: WindowStub,
        session: { defaultSession: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} } },
        ipcMain: { handle(channel, handler) { handlers.set(channel, handler); } }
      };
      if (name === 'node:worker_threads') return { Worker: WorkerStub };
      if (name === './database/db') return database;
      return require(name.startsWith('./') ? path.join(root, name) : name);
    }
  });
  return { handlers, lifecycle, timers, workers, state, event: { sender, senderFrame: frame } };
}

test('IPC rejects missing frames, sparse ID arrays, and oversized set requests', () => {
  const { handlers, event } = loadMain();
  const students = handlers.get('students:list');
  assert.throws(() => students({ ...event, senderFrame: null }), /not allowed/);
  assert.throws(() => students(undefined), /not allowed/);
  const sparse = Array(2);
  sparse[0] = 1;
  for (const channel of ['sets:union', 'sets:intersection']) {
    assert.throws(() => handlers.get(channel)(event, sparse), /different organizations/);
    assert.throws(() => handlers.get(channel)(event, Array(1001).fill(1)), /different organizations/);
  }
  assert.throws(() => handlers.get('sets:power-set')(event, sparse, 2), /whole-number/);
  assert.throws(() => handlers.get('project:committee')(event, {
    size: 1, poolOrganizationIds: sparse, excludedOrganizationIds: []
  }), /valid organizations/);
  assert.throws(() => handlers.get('analytics:recommendations')(event, 1, Array(1)), /valid student/);
  assert.throws(() => handlers.get('project:report')(event, ['guide']), /Unknown report/);
});

test('benchmark normal exit without a result rejects immediately and permits retry', async () => {
  const { handlers, event, timers, workers, state } = loadMain('empty-exit');
  const handler = handlers.get('project:benchmark');
  await assert.rejects(handler(event), /before returning a result/);
  assert.equal(timers.size, 0);
  state.scenario = 'success';
  assert.deepEqual(await handler(event), { results: [] });
  assert.equal(workers.length, 2);
});

test('benchmark coalesces concurrent requests and handles error/malformed messages', async () => {
  const { handlers, event, workers } = loadMain();
  const handler = handlers.get('project:benchmark');
  const first = handler(event);
  const second = handler(event);
  assert.equal(first, second);
  await first;
  assert.equal(workers.length, 1);
  for (const scenario of ['malformed', 'error']) {
    const fixture = loadMain(scenario);
    await assert.rejects(fixture.handlers.get('project:benchmark')(fixture.event), /invalid result|Simulated worker error/);
    assert.equal(fixture.timers.size, 0);
  }
});

test('benchmark timeout and app shutdown terminate the active worker', async () => {
  const timeout = loadMain('waiting');
  const pending = timeout.handlers.get('project:benchmark')(timeout.event);
  const expectedFailure = assert.rejects(pending, /timed out/);
  for (const callback of timeout.timers) callback();
  await expectedFailure;
  assert.equal(timeout.workers[0].terminated, true);
  const shutdown = loadMain('waiting');
  const shutdownFailure = assert.rejects(shutdown.handlers.get('project:benchmark')(shutdown.event), /stopped/);
  shutdown.lifecycle.get('will-quit')();
  await shutdownFailure;
  assert.equal(shutdown.workers[0].terminated, true);
  assert.equal(shutdown.state.closed, true);
  assert.equal(shutdown.timers.size, 0);
});
