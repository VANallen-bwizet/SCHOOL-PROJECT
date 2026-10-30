const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const analytics = require('../modules/analytics');
const { getOrganizationProfiles } = require('../modules/organization-interests');
const root = path.resolve(__dirname, '..');
const organizations = [
  { organization_id: 1, name: 'Computer Science Club', interests: ['technology'] },
  { organization_id: 2, name: 'Arts Guild', interests: ['music'] },
  { organization_id: 3, name: 'Music Club', interests: ['sports'] },
  { organization_id: 4, name: 'Sports Club', interests: ['music'] }
];
const students = [1, 2, 3, 4, 5].map(student_id => ({ student_id, full_name: `Student ${student_id}` }));
const memberships = [[1, 1], [2, 1], [5, 1], [1, 2], [2, 2], [3, 2], [1, 3], [3, 3]]
  .map(([student_id, organization_id]) => ({ student_id, organization_id }));

test('participation includes zero memberships and counts unique organizations', () => {
  const result = analytics.getParticipation(students, [...memberships, memberships[0]]);
  assert.deepEqual(result.map(row => row.membershipCount), [3, 2, 2, 0, 1]);
  assert.deepEqual(analytics.getExactlyOne(result).map(row => row.student_id), [5]);
  assert.deepEqual(analytics.getAtLeastThree(result).map(row => row.student_id), [1]);
  assert.throws(() => analytics.getParticipation(students, [{ student_id: 99, organization_id: 1 }]));
});

test('Jaccard handles partial overlap, disjoint, equal, and empty sets', () => {
  assert.deepEqual(analytics.jaccardSimilarity(new Set([1, 2, 3]), new Set([3, 4])), {
    sharedCount: 1, uniqueCount: 4, similarity: 0.25
  });
  assert.equal(analytics.jaccardSimilarity(new Set([1]), new Set([2])).similarity, 0);
  assert.equal(analytics.jaccardSimilarity(new Set([1]), new Set([1])).similarity, 1);
  assert.equal(analytics.jaccardSimilarity(new Set(), new Set()).similarity, 1);
  assert.equal(analytics.jaccardSimilarity(new Set([1]), new Set()).similarity, 0);
});

test('pair comparisons are distinct, sorted, and total n(n-1)/2', () => {
  const result = analytics.rankOrganizationPairs(organizations, memberships);
  assert.equal(result.length, 6);
  assert.equal(new Set(result.map(row => [row.organizationAId, row.organizationBId].sort().join(':'))).size, 6);
  assert.ok(result.every(row => row.organizationAId !== row.organizationBId));
  assert.ok(result.every((row, index) => index === 0 || result[index - 1].similarity >= row.similarity));
  assert.deepEqual(analytics.rankOrganizationPairs([], []), []);
});

test('organization ranking counts each overlapping person once per organization', () => {
  const result = analytics.rankOrganizations(organizations, [...memberships, memberships[0]]);
  assert.deepEqual(result.map(row => row.organizationId), [2, 3, 1, 4]);
  assert.equal(result.find(row => row.organizationId === 1).sharedMemberCount, 2);
  assert.equal(result.find(row => row.organizationId === 1).memberCount, 3);
  assert.equal(result[0].overlapRate, 1);
  assert.equal(result.at(-1).overlapRate, 0);
  assert.deepEqual(analytics.rankOrganizations([], []), []);
});

test('recommendations combine signals, exclude joined clubs, and explain matches', () => {
  const snapshot = JSON.stringify({ organizations, memberships });
  const result = analytics.recommendOrganizations(5, ['music'], organizations, memberships);
  assert.deepEqual(result.map(row => row.organizationId), [2, 4, 3]);
  assert.ok(Math.abs(result[0].score - 0.8) < 1e-12);
  assert.equal(result[0].interestScore, 1);
  assert.equal(result[0].membershipScore, 0.5);
  assert.deepEqual(result[0].matchedInterests, ['music']);
  assert.ok(result.every(row => row.organizationId !== 1));
  assert.equal(JSON.stringify({ organizations, memberships }), snapshot);
});

test('recommendations support no memberships, no interests, no matches, and all clubs joined', () => {
  assert.deepEqual(analytics.recommendOrganizations(4, ['sports'], organizations, memberships).map(row => row.organizationId), [3]);
  assert.equal(analytics.recommendOrganizations(4, ['sports'], organizations, memberships)[0].score, 1);
  assert.deepEqual(analytics.recommendOrganizations(4, [], organizations, memberships), []);
  assert.deepEqual(analytics.recommendOrganizations(5, [], organizations, memberships).map(row => row.organizationId), [2, 3]);
  const allJoined = organizations.map(org => ({ student_id: 99, organization_id: org.organization_id }));
  assert.deepEqual(analytics.recommendOrganizations(99, ['music'], organizations, allJoined), []);
  const profiles = getOrganizationProfiles([{ organization_id: 9, name: 'Unknown Club' }]);
  assert.deepEqual(profiles[0].interests, []);
});

function loadMain() {
  const handlers = new Map();
  const frame = { url: pathToFileURL(path.join(root, 'index.html')).href };
  const sender = { mainFrame: frame };
  class WindowStub {
    constructor() { this.webContents = { setWindowOpenHandler() {}, on() {} }; }
    loadFile() { return Promise.resolve(); }
    static fromWebContents(value) { return value === sender ? {} : null; }
  }
  const database = { initializeDatabase() {}, closeDatabase() {},
    getStudents: () => students, getOrganizations: () => organizations, getMemberships: () => memberships };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'main.js'), 'utf8'), {
    __dirname: root, console, process,
    require(name) {
      if (name === 'electron') return {
        app: { whenReady: () => ({ then: callback => callback() }), getPath: () => 'unused', on() {} },
        BrowserWindow: WindowStub,
        session: { defaultSession: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} } },
        ipcMain: { handle(channel, handler) {
          assert.ok(!handlers.has(channel), `Duplicate handler: ${channel}`);
          handlers.set(channel, handler);
        } }
      };
      if (name === './database/db') return database;
      return require(name.startsWith('./') ? path.join(root, name) : name);
    }
  });
  return { handlers, event: { sender, senderFrame: frame } };
}

test('all analytics handlers run with validated senders and actual imported functions', () => {
  const { handlers, event } = loadMain();
  const participation = handlers.get('analytics:participation');
  assert.equal(participation(event, 'all').totalStudents, 5);
  assert.equal(participation(event, 'exactly-one').cardinality, 1);
  assert.equal(participation(event, 'at-least-three').cardinality, 1);
  const similarity = handlers.get('analytics:similarity')(event);
  assert.equal(similarity.pairCount, 6);
  assert.equal(similarity.rankings.length, 4);
  assert.equal(handlers.get('analytics:recommendation-options')(event).students.length, 5);
  const recommend = handlers.get('analytics:recommendations');
  const suggestions = recommend(event, 5, ['arts']);
  assert.ok(suggestions.recommendations.length > 0);
  assert.ok(suggestions.recommendations.every(row => row.organizationId !== 1));
  assert.throws(() => recommend(event, 99, []), /does not exist/);
  assert.throws(() => recommend(event, '5', []), /valid student/);
  assert.throws(() => recommend(event, 5, ['invalid']), /valid student/);
  assert.throws(() => participation(event, 'invalid'), /Invalid/);
  const bad = { sender: {}, senderFrame: event.senderFrame };
  for (const channel of ['analytics:participation', 'analytics:similarity', 'analytics:recommendation-options', 'analytics:recommendations']) {
    assert.throws(() => handlers.get(channel)(bad, 5, []), /not allowed/);
  }
});

test('preload routes analytics methods through specific channels', async () => {
  const exposed = {};
  const calls = [];
  vm.runInNewContext(fs.readFileSync(path.join(root, 'preload.js'), 'utf8'), {
    require: () => ({
      contextBridge: { exposeInMainWorld(name, value) { exposed[name] = value; } },
      ipcRenderer: { invoke: (...args) => { calls.push(args); return Promise.resolve(); } }
    })
  });
  await exposed.analyticsAPI.getParticipation('all');
  await exposed.analyticsAPI.getSimilarity();
  await exposed.analyticsAPI.getRecommendationOptions();
  await exposed.analyticsAPI.getRecommendations(5, ['music']);
  assert.deepEqual(calls, [
    ['analytics:participation', 'all'], ['analytics:similarity'],
    ['analytics:recommendation-options'], ['analytics:recommendations', 5, ['music']]
  ]);
});

test('renderer fills analytics tables, excludes joined clubs, and restores controls after failure', async () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'Page IDs must be unique');
  class Element {
    constructor(tag = 'div') { this.tagName = tag; this.children = []; this.value = ''; this.attributes = {}; this.disabled = false; }
    set textContent(value) { this.text = String(value); this.children = []; }
    get textContent() { return (this.text || '') + this.children.map(child => child.textContent).join(''); }
    appendChild(child) { this.children.push(child); return child; }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    replaceChildren(...children) { this.text = ''; this.children = children; }
    addEventListener() {}
    setAttribute(name, value) { this.attributes[name] = value; }
    closest() { return new Element('fieldset'); }
    get selectedOptions() { return this.children.filter(child => String(child.value) === String(this.value)); }
    querySelectorAll() {
      const found = [];
      const visit = element => { if (element.tagName === 'input' && element.checked) found.push(element); element.children.forEach(visit); };
      visit(this);
      return found;
    }
  }
  const elements = new Map(ids.map(id => [id, new Element()]));
  const membershipEvents = [];
  const profiles = getOrganizationProfiles(organizations);
  const api = {
    getRecommendationOptions: async () => ({ students, organizations: profiles, interests: { arts: 'Arts', music: 'Music' } }),
    getSimilarity: async () => ({ pairs: analytics.rankOrganizationPairs(organizations, memberships),
      rankings: analytics.rankOrganizations(organizations, memberships), organizationCount: 4, pairCount: 6 }),
    getParticipation: async () => ({ students: [], totalStudents: 5, cardinality: 0 }),
    getRecommendations: async (studentId, interests) => ({ studentName: 'Student 5', currentOrganizations: ['Computer Science Club'],
      recommendations: analytics.recommendOrganizations(studentId, interests, profiles, memberships) })
  };
  const context = vm.createContext({
    Event: class { constructor(type) { this.type = type; } },
    console: { error() {} },
    document: {
      getElementById(id) { assert.ok(elements.has(id), `Missing HTML element: ${id}`); return elements.get(id); },
      createElement: tag => new Element(tag), createDocumentFragment: () => new Element('fragment'),
      createTextNode: text => { const element = new Element('text'); element.textContent = text; return element; }
    },
    window: { analyticsAPI: api, appInfo: { platformLabel: 'Test' },
      dispatchEvent: event => { membershipEvents.push(event.type); },
      studentAPI: { getStudents: async () => [] }, organizationAPI: { getOrganizations: async () => [] } }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'renderer.js'), 'utf8'), context);
  // Let startup choice-loading promises complete before exercising controls.
  await Promise.resolve();
  await Promise.resolve();
  await vm.runInContext('loadSimilarityAnalytics()', context);
  assert.equal(elements.get('similarity-body').children.length, 6);
  assert.equal(elements.get('overlap-body').children.length, 4);
  assert.match(elements.get('similarity-status').textContent, /6 pairs/);
  elements.get('recommendation-student').value = '5';
  const label = elements.get('recommendation-interest-choices').children[0];
  label.children[0].checked = true;
  await vm.runInContext('loadRecommendations()', context);
  assert.ok(elements.get('recommendation-body').children.length > 0);
  assert.ok(elements.get('recommendation-body').children.every(row => row.children[1].textContent !== 'Computer Science Club'));
  api.getSimilarity = async () => { throw new Error('Simulated failure'); };
  await vm.runInContext('loadSimilarityAnalytics()', context);
  assert.equal(elements.get('load-similarity').disabled, false);
  assert.match(elements.get('similarity-status').textContent, /Could not/);
  api.getRecommendations = async () => { throw new Error('Simulated failure'); };
  await vm.runInContext('loadRecommendations()', context);
  assert.equal(elements.get('load-recommendations').disabled, false);
  assert.equal(elements.get('recommendation-student').disabled, false);
  assert.match(elements.get('recommendation-status').textContent, /Could not/);

  // Repeating an existing membership must preserve already calculated answers.
  context.window.membershipAPI = { addMembership: async () => ({ added: false }) };
  context.window.organizationAPI.getMembers = async () => { throw new Error('Simulated refresh failure'); };
  elements.get('organization-select').value = '1';
  elements.get('organization-select').disabled = false;
  elements.get('membership-student-select').value = '1';
  elements.get('membership-student-select').disabled = false;
  elements.get('union-body').appendChild(new Element('tr'));
  elements.get('power-input').value = '1, 2';
  elements.get('power-body').appendChild(new Element('tr'));
  elements.get('duplicate-input').value = '1,1\n1,1';
  await vm.runInContext("changeMembership('join')", context);
  assert.equal(elements.get('union-body').children.length, 1);
  assert.equal(membershipEvents.length, 0);

  // A successful write invalidates older results, including requests still in
  // flight. It is not rolled back when the member-list refresh then fails.
  let finishSimilarity;
  api.getSimilarity = () => new Promise(resolve => { finishSimilarity = resolve; });
  const olderSimilarity = vm.runInContext('loadSimilarityAnalytics()', context);
  context.window.membershipAPI.addMembership = async () => ({ added: true });
  await vm.runInContext("changeMembership('join')", context);
  assert.deepEqual(membershipEvents, ['memberships-changed']);
  assert.equal(elements.get('union-body').children.length, 0);
  assert.match(elements.get('union-status').textContent, /Memberships changed/);
  assert.equal(elements.get('power-input').value, '1, 2');
  assert.equal(elements.get('power-body').children.length, 1);
  assert.equal(elements.get('duplicate-input').value, '1,1\n1,1');
  finishSimilarity({ pairs: analytics.rankOrganizationPairs(organizations, memberships),
    rankings: analytics.rankOrganizations(organizations, memberships), organizationCount: 4, pairCount: 6 });
  await olderSimilarity;
  assert.equal(elements.get('similarity-body').children.length, 0);
  assert.equal(elements.get('overlap-body').children.length, 0);
  assert.match(elements.get('similarity-status').textContent, /Memberships changed/);
  assert.equal(elements.get('load-similarity').disabled, false);
  assert.match(elements.get('membership-status').textContent, /successfully joined/);
  assert.match(elements.get('membership-status').textContent, /member list could not refresh/);
  assert.equal(elements.get('join-organization').disabled, false);
  assert.equal(vm.runInContext('requestErrorMessage(null)', context), 'The request failed.');

  // Removal also invalidates, while removing an absent pair leaves answers alone.
  context.window.membershipAPI.removeMembership = async () => ({ removed: false });
  await vm.runInContext("changeMembership('remove')", context);
  assert.equal(membershipEvents.length, 1);
  context.window.membershipAPI.removeMembership = async () => ({ removed: true });
  await vm.runInContext("changeMembership('remove')", context);
  assert.equal(membershipEvents.length, 2);
});
