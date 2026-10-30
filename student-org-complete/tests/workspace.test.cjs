const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { calculateCommittee } = require('../modules/combinatorics');
const { verifyDeMorgan, exhaustiveVerification } = require('../modules/verification');
const root = path.resolve(__dirname, '..');

test('workspace navigation, committee, proof, and benchmark views render and recover from errors', async () => {
  class Element {
    constructor(tagName = 'div') { this.tagName = tagName.toUpperCase(); this.children = []; this.value = ''; this.attributes = {}; this.dataset = {}; this.events = {}; }
    set textContent(value) { this.text = String(value); this.children = []; }
    get textContent() { return (this.text || '') + this.children.map(child => child.textContent).join(''); }
    appendChild(child) { this.children.push(child); return child; }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    replaceChildren(...children) { this.text = ''; this.children = children; }
    addEventListener(event, callback) { this.events[event] = callback; }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    focus() { this.focused = true; }
    closest() { return this.parent || (this.parent = new Element()); }
    querySelectorAll() {
      const inputs = [];
      const visit = element => { if (element.type === 'checkbox' && element.checked) inputs.push(element); element.children.forEach(visit); };
      visit(this);
      return inputs;
    }
  }
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(match => [match[1], new Element()]));
  const names = ['overview', 'members', 'sets', 'analytics', 'committees', 'verification', 'performance', 'reports'];
  const pages = names.map(name => Object.assign(new Element(), { dataset: { page: name } }));
  const nav = names.map(name => Object.assign(new Element(), { dataset: { view: name } }));
  const skipLink = new Element('a');
  const reportButtons = ['guide', 'mathematics'].map(name => Object.assign(new Element(), {
    dataset: { report: name }, text: name
  }));
  const pendingReports = new Map();
  const windowEvents = new Map();
  const students = [1, 2, 3].map(student_id => ({ student_id, full_name: `Student ${student_id}`, course: 'Test' }));
  const organizations = [{ organization_id: 1, name: 'Club A' }, { organization_id: 2, name: 'Club B' }];
  const memberships = [{ student_id: 1, organization_id: 1 }, { student_id: 2, organization_id: 2 }];
  let failOverview = true;
  const api = {
    overview: async () => {
      if (failOverview) throw new Error('Simulated initial overview failure');
      return { students, organizations, membershipCount: 2, activeStudents: 2, exactlyOne: 2, atLeastThree: 0,
        organizationCounts: organizations.map(org => ({ ...org, count: 1 })) };
    },
    committee: async options => calculateCommittee(students, memberships, options),
    verify: async () => ({ population: 3, countA: 1, countB: 1,
      laws: verifyDeMorgan(new Set([1, 2, 3]), new Set([1]), new Set([2])), exhaustive: exhaustiveVerification() }),
    benchmark: async () => ({ trials: 5, queryCount: 4000, runtime: 'test', platform: 'test', measuredAt: new Date().toISOString(),
      results: [{ size: 100, listMs: 1, hashMs: .1, buildMs: .1, hashTotalMs: .2, lookupSpeedup: 10, correct: true }] }),
    exportDataset: async () => ({ canceled: true }),
    report: name => new Promise(resolve => pendingReports.set(name, resolve))
  };
  const context = vm.createContext({
    document: {
      getElementById(id) { assert.ok(elements.has(id), `Missing ID ${id}`); return elements.get(id); },
      querySelectorAll(selector) { return selector === '[data-page]' ? pages : selector === '[data-view]' ? nav : selector === '[data-report]' ? reportButtons : selector === '.skip-link' ? [skipLink] : []; },
      createElement: name => new Element(name),
      createTextNode: value => { const element = new Element(); element.textContent = value; return element; }
    },
    window: { projectAPI: api, scrollTo() {},
      addEventListener: (name, handler) => windowEvents.set(name, handler) }
  });
  elements.get('calculate-committee').disabled = true;
  vm.runInContext(fs.readFileSync(path.join(root, 'workspace.js'), 'utf8'), context);
  await new Promise(setImmediate);
  assert.equal(elements.get('calculate-committee').disabled, true);
  assert.match(elements.get('committee-status').textContent, /Refresh to retry/);
  failOverview = false;
  await vm.runInContext('refreshCampusOverview()', context);
  assert.equal(elements.get('stat-students').textContent, '3');
  assert.equal(elements.get('overview-bars').children.length, 2);
  assert.equal(elements.get('calculate-committee').disabled, false);
  vm.runInContext('showWorkspacePage("sets")', context);
  assert.equal(pages.find(page => page.dataset.page === 'sets').hidden, false);
  assert.ok(pages.filter(page => page.dataset.page !== 'sets').every(page => page.hidden));
  assert.equal(elements.get('workspace').focused, true);
  // Native anchor navigation would add #workspace to the URL and fail the
  // main process's exact sender check. Focus the content without navigating.
  elements.get('workspace').focused = false;
  let skipNavigationPrevented = false;
  skipLink.events.click({ preventDefault() { skipNavigationPrevented = true; } });
  assert.equal(skipNavigationPrevented, true);
  assert.equal(elements.get('workspace').focused, true);
  elements.get('committee-size').value = '2';
  await vm.runInContext('calculateCampusCommittee()', context);
  assert.match(elements.get('committee-status').textContent, /C\(3, 2\) = 3/);
  assert.equal(elements.get('committee-body').children.length, 3);
  elements.get('committee-size').value = '-1';
  await vm.runInContext('calculateCampusCommittee()', context);
  assert.match(elements.get('committee-status').textContent, /non-negative/);
  assert.equal(elements.get('calculate-committee').disabled, false);
  elements.get('verification-a').value = '1';
  elements.get('verification-b').value = '2';
  await vm.runInContext('verifyCampusLaws()', context);
  assert.equal(elements.get('verification-results').children.length, 2);
  assert.match(elements.get('verification-status').textContent, /512 law checks/);
  await vm.runInContext('runCampusBenchmark()', context);
  assert.equal(elements.get('benchmark-body').children.length, 1);
  api.benchmark = async () => { throw new Error('Simulated benchmark failure'); };
  await vm.runInContext('runCampusBenchmark()', context);
  assert.match(elements.get('benchmark-status').textContent, /Simulated benchmark failure/);
  assert.equal(elements.get('run-benchmark').disabled, false);

  // Resolve report requests backwards to simulate a slower first response.
  const olderRequest = reportButtons[0].events.click();
  const newerRequest = reportButtons[1].events.click();
  pendingReports.get('mathematics')('Newer mathematical report');
  await newerRequest;
  pendingReports.get('guide')('Older user guide');
  await olderRequest;
  assert.equal(elements.get('report-content').textContent, 'Newer mathematical report');
  assert.equal(elements.get('report-status').textContent, 'mathematics');
  assert.equal(reportButtons[0].disabled, false);
  assert.equal(reportButtons[1].disabled, false);
  assert.equal(vm.runInContext('textError(null)', context), 'Request failed.');

  // Report markup becomes semantic reading blocks. HTML-looking cell values
  // stay literal text, and selecting a new report replaces the previous one.
  context.sampleReport = [
    '# Short report', '', 'Line one', 'line two', '', '## Checks', '',
    '- First check', '- Second check', '', '1. Include', '2. Exclude', '',
    '| Name | Result |', '| --- | --- |',
    '| <img src=x onerror=alert(1)> | Passed |'
  ].join('\r\n');
  vm.runInContext('renderProjectReport(sampleReport)', context);
  const report = elements.get('report-content');
  assert.deepEqual(report.children.map(child => child.tagName), ['H2', 'P', 'H3', 'UL', 'OL', 'DIV']);
  assert.equal(report.children[0].textContent, 'Short report');
  assert.equal(report.children[1].textContent, 'Line one line two');
  assert.equal(report.children[3].children.length, 2);
  assert.equal(report.children[4].children[1].textContent, 'Exclude');
  const table = report.children[5].children[0];
  assert.equal(table.tagName, 'TABLE');
  assert.equal(table.children[0].children[0].children[0].attributes.scope, 'col');
  const cell = table.children[1].children[0].children[0];
  assert.equal(cell.tagName, 'TD');
  assert.equal(cell.textContent, '<img src=x onerror=alert(1)>');
  assert.equal(cell.children.length, 0);
  vm.runInContext('renderProjectReport("# Replacement")', context);
  assert.equal(report.children.length, 1);
  assert.equal(report.textContent, 'Replacement');
  vm.runInContext('renderProjectReport("   ")', context);
  assert.equal(report.children.length, 0);

  // Data edits preserve selections but clear old answers. A response started
  // before the edit must not repopulate those answers when it finishes later.
  elements.get('committee-size').value = '2';
  let finishCommittee;
  const calculate = api.committee;
  api.committee = () => new Promise(resolve => { finishCommittee = resolve; });
  const olderCommittee = vm.runInContext('calculateCampusCommittee()', context);
  windowEvents.get('memberships-changed')();
  assert.equal(elements.get('stat-memberships').textContent, '—');
  assert.equal(elements.get('stat-active').textContent, '—');
  assert.equal(elements.get('overview-bars').children.length, 0);
  assert.equal(elements.get('verification-results').children.length, 0);
  assert.equal(elements.get('committee-size').value, '2');
  assert.equal(elements.get('verification-a').value, '1');
  assert.match(elements.get('committee-status').textContent, /Memberships changed/);
  finishCommittee(calculateCommittee(students, memberships, {
    size: 2, poolOrganizationIds: [], excludedOrganizationIds: []
  }));
  await olderCommittee;
  assert.equal(elements.get('committee-body').children.length, 0);
  assert.match(elements.get('committee-status').textContent, /Memberships changed/);
  assert.equal(elements.get('calculate-committee').disabled, false);
  api.committee = calculate;
  await vm.runInContext('calculateCampusCommittee()', context);
  assert.equal(elements.get('committee-body').children.length, 3);

  let finishProof;
  api.verify = () => new Promise(resolve => { finishProof = resolve; });
  const olderProof = vm.runInContext('verifyCampusLaws()', context);
  windowEvents.get('memberships-changed')();
  finishProof({ population: 3, countA: 1, countB: 1,
    laws: verifyDeMorgan(new Set([1, 2, 3]), new Set([1]), new Set([2])), exhaustive: exhaustiveVerification() });
  await olderProof;
  assert.equal(elements.get('verification-results').children.length, 0);
  assert.match(elements.get('verification-status').textContent, /Memberships changed/);
  assert.equal(elements.get('run-verification').disabled, false);

  let finishOverview;
  api.overview = () => new Promise(resolve => { finishOverview = resolve; });
  const olderOverview = vm.runInContext('refreshCampusOverview()', context);
  windowEvents.get('memberships-changed')();
  finishOverview({ students, organizations, membershipCount: 2, activeStudents: 2,
    exactlyOne: 2, atLeastThree: 0, organizationCounts: organizations.map(org => ({ ...org, count: 1 })) });
  await olderOverview;
  assert.equal(elements.get('stat-memberships').textContent, '—');
  assert.equal(elements.get('overview-bars').children.length, 0);
  assert.match(elements.get('overview-status').textContent, /Memberships changed/);
  assert.equal(elements.get('refresh-overview').disabled, false);
});
