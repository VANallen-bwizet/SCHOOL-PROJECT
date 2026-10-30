// This page script handles navigation and the final tools. renderer.js handles the
// membership/set/analytics controls. Neither file has direct database access.
const pageNames = { overview: 'Overview', members: 'Members', sets: 'Set laboratory',
  analytics: 'Analytics', committees: 'Committees', verification: 'Verification',
  performance: 'Performance', reports: 'Reports & data' };

function showWorkspacePage(name) {
  if (!Object.hasOwn(pageNames, name)) return;
  document.querySelectorAll('[data-page]').forEach(page => { page.hidden = page.dataset.page !== name; });
  document.querySelectorAll('[data-view]').forEach(button => {
    if (button.dataset.view === name) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  document.getElementById('page-location').textContent = pageNames[name];
  window.scrollTo({ top: 0, behavior: 'instant' });
  // Move keyboard/screen-reader focus into the newly visible page, not a hidden panel.
  document.getElementById('workspace').focus({ preventScroll: true });
  if (name === 'overview') refreshCampusOverview();
}

document.querySelectorAll('[data-view]').forEach(button => {
  button.addEventListener('click', () => showWorkspacePage(button.dataset.view));
});
document.querySelectorAll('[data-open]').forEach(button => {
  button.addEventListener('click', () => showWorkspacePage(button.dataset.open));
});
document.querySelectorAll('.skip-link').forEach(link => {
  link.addEventListener('click', event => {
    // Keep the local page URL unchanged so its permitted database requests
    // still match main.js's exact sender check after keyboard navigation.
    event.preventDefault();
    document.getElementById('workspace').focus();
  });
});

const get = id => document.getElementById(id);
const textError = error => String(error?.message || error || 'Request failed.').replace(/^Error invoking remote method '[^']+': Error: /, '');
const formatCount = value => Number(value).toLocaleString('en-US');
function addRow(body, values) {
  const row = document.createElement('tr');
  for (const value of values) {
    const cell = document.createElement('td');
    cell.textContent = String(value);
    row.appendChild(cell);
  }
  body.appendChild(row);
}
function selectedIds(container) {
  return Array.from(container.querySelectorAll('input:checked'), input => Number(input.value));
}
function checkboxChoices(container, organizations) {
  container.replaceChildren();
  for (const org of organizations) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = org.organization_id;
    label.append(input, document.createTextNode(org.name));
    container.appendChild(label);
  }
}
function selectChoices(select, organizations) {
  select.length = 1;
  for (const org of organizations) {
    const option = document.createElement('option');
    option.value = org.organization_id;
    option.textContent = org.name;
    select.appendChild(option);
  }
  select.disabled = organizations.length === 0;
}

let overviewBusy = false;
let workspaceChoicesReady = false;
let workspaceMembershipRevision = 0;

window.addEventListener('memberships-changed', () => {
  workspaceMembershipRevision++;
  get('stat-memberships').textContent = '—';
  get('stat-active').textContent = '—';
  get('overview-bars').replaceChildren();
  get('overview-status').textContent = 'Memberships changed. Refresh the overview to update its totals.';
  get('committee-body').replaceChildren();
  get('committee-status').textContent = workspaceChoicesReady
    ? 'Memberships changed. Calculate the committee again.'
    : 'Memberships changed. Open Overview and click Refresh to load organization choices.';
  get('verification-results').replaceChildren();
  get('verification-status').textContent = 'Memberships changed. Verify the selected sets again.';
});

function prepareWorkspaceChoices(snapshot) {
  // Prepare controls on the first successful fetch, including after a retry.
  // Later overview refreshes must not reset the user's committee/proof selections.
  if (workspaceChoicesReady) return;
  checkboxChoices(get('committee-pools'), snapshot.organizations);
  checkboxChoices(get('committee-exclusions'), snapshot.organizations);
  selectChoices(get('verification-a'), snapshot.organizations);
  selectChoices(get('verification-b'), snapshot.organizations);
  get('calculate-committee').disabled = false;
  get('committee-status').textContent = 'All students are eligible until you choose a pool or exclusions.';
  workspaceChoicesReady = true;
}

async function refreshCampusOverview() {
  if (overviewBusy) return;
  const requestRevision = workspaceMembershipRevision;
  overviewBusy = true;
  get('refresh-overview').disabled = true;
  try {
    const result = await window.projectAPI.overview();
    if (requestRevision !== workspaceMembershipRevision) return;
    get('stat-students').textContent = formatCount(result.students.length);
    get('stat-organizations').textContent = formatCount(result.organizations.length);
    get('stat-memberships').textContent = formatCount(result.membershipCount);
    get('stat-active').textContent = formatCount(result.activeStudents);
    get('overview-bars').replaceChildren();
    for (const org of result.organizationCounts) {
      const bar = document.createElement('div');
      const heading = document.createElement('div');
      heading.className = 'bar-heading';
      const name = document.createElement('span');
      name.textContent = org.name;
      const count = document.createElement('strong');
      count.textContent = String(org.count);
      const progress = document.createElement('progress');
      progress.max = Math.max(1, result.students.length);
      progress.value = org.count;
      progress.setAttribute('aria-label', `${org.name}: ${org.count} members`);
      heading.append(name, count);
      bar.append(heading, progress);
      get('overview-bars').appendChild(bar);
    }
    get('overview-status').textContent = `${result.exactlyOne} students in exactly one club · ${result.atLeastThree} in at least three.`;
    prepareWorkspaceChoices(result);
    return result;
  } catch (error) {
    if (requestRevision !== workspaceMembershipRevision) return;
    get('overview-status').textContent = `Could not refresh the snapshot. ${textError(error)}`;
    if (!workspaceChoicesReady) {
      get('committee-status').textContent = 'Could not load organizations. Open Overview and click Refresh to retry.';
    }
  } finally {
    overviewBusy = false;
    get('refresh-overview').disabled = false;
  }
}
get('refresh-overview').addEventListener('click', refreshCampusOverview);

const committeeControls = ['committee-size', 'calculate-committee'];
let committeeBusy = false;
async function calculateCampusCommittee() {
  if (committeeBusy) return;
  const requestRevision = workspaceMembershipRevision;
  committeeBusy = true;
  committeeControls.forEach(id => { get(id).disabled = true; });
  get('committee-pools').closest('fieldset').disabled = true;
  get('committee-exclusions').closest('fieldset').disabled = true;
  get('committee-body').replaceChildren();
  get('committee-status').textContent = 'Calculating eligible students and exact combinations…';
  try {
    // Input values are text; the backend validates the integer again before using it.
    const size = Number(get('committee-size').value);
    if (get('committee-size').value.trim() === '' || !Number.isSafeInteger(size) || size < 0) throw new Error('Enter a non-negative whole-number size.');
    const result = await window.projectAPI.committee({ size,
      poolOrganizationIds: selectedIds(get('committee-pools')),
      excludedOrganizationIds: selectedIds(get('committee-exclusions')) });
    if (requestRevision !== workspaceMembershipRevision) return;
    result.eligible.forEach(student => addRow(get('committee-body'), [student.student_id, student.full_name, student.course]));
    get('committee-status').textContent =
      `Starting pool: ${result.poolCount} students\nRemoved by exclusions: ${result.excludedCount}\n` +
      `Eligible population n: ${result.eligibleCount}\nCommittee size k: ${result.size}\n\n` +
      // BigInt displays exact counts larger than JavaScript's safe Number range.
      `${result.formula} = ${BigInt(result.ways).toLocaleString('en-US')} possible committees` +
      (result.feasible ? '' : '\nThe requested committee is larger than the eligible population.');
  } catch (error) {
    if (requestRevision !== workspaceMembershipRevision) return;
    get('committee-status').textContent = textError(error);
  } finally {
    committeeBusy = false;
    committeeControls.forEach(id => { get(id).disabled = false; });
    get('committee-pools').closest('fieldset').disabled = false;
    get('committee-exclusions').closest('fieldset').disabled = false;
  }
}
get('calculate-committee').addEventListener('click', calculateCampusCommittee);
function invalidateCommittee() {
  get('committee-body').replaceChildren();
  get('committee-status').textContent = 'Options changed. Calculate again to update the eligible population and count.';
}
['committee-pools', 'committee-exclusions', 'committee-size'].forEach(id => get(id).addEventListener('change', invalidateCommittee));

let verificationBusy = false;
function updateVerificationButton() {
  get('run-verification').disabled = verificationBusy || !get('verification-a').value || !get('verification-b').value;
}
async function verifyCampusLaws() {
  if (verificationBusy || !get('verification-a').value || !get('verification-b').value) return;
  const requestRevision = workspaceMembershipRevision;
  verificationBusy = true;
  updateVerificationButton();
  get('verification-a').disabled = get('verification-b').disabled = true;
  get('verification-results').replaceChildren();
  get('verification-status').textContent = 'Checking both identities and all four-element sample cases…';
  try {
    const result = await window.projectAPI.verify(Number(get('verification-a').value), Number(get('verification-b').value));
    if (requestRevision !== workspaceMembershipRevision) return;
    for (const law of result.laws) {
      const card = document.createElement('article');
      card.className = 'proof-card';
      const badge = document.createElement('span');
      badge.className = law.passed ? 'pass-label' : 'pass-label fail-label';
      badge.textContent = law.passed ? 'VERIFIED' : 'MISMATCH';
      const heading = document.createElement('h3');
      heading.textContent = law.expression;
      const summary = document.createElement('p');
      summary.textContent = `Left: ${law.left.length} students · Right: ${law.right.length} · Direct computation: ${law.direct.length}. Compared by student IDs, not just counts.`;
      const details = document.createElement('details');
      const caption = document.createElement('summary');
      caption.textContent = 'Inspect the student ID sets';
      const ids = document.createElement('pre');
      const setText = values => values.length ? `{${values.join(', ')}}` : '∅';
      ids.textContent = `Left: ${setText(law.left)}\n\nRight: ${setText(law.right)}\n\nDirect: ${setText(law.direct)}\n\nMismatched IDs: ${setText(law.mismatch)}`;
      details.append(caption, ids);
      card.append(badge, heading, summary, details);
      get('verification-results').appendChild(card);
    }
    get('verification-status').textContent = `Population: ${result.population}. |A| = ${result.countA}, |B| = ${result.countB}. ` +
      `Exhaustive sample: ${result.exhaustive.pairs} set pairs, ${result.exhaustive.lawsChecked} law checks, ${result.exhaustive.failures} failures.`;
  } catch (error) {
    if (requestRevision !== workspaceMembershipRevision) return;
    get('verification-status').textContent = textError(error);
  }
  finally {
    verificationBusy = false;
    get('verification-a').disabled = get('verification-b').disabled = false;
    updateVerificationButton();
  }
}
['verification-a', 'verification-b'].forEach(id => get(id).addEventListener('change', () => {
  get('verification-results').replaceChildren();
  get('verification-status').textContent = 'Selection changed. Verify again for these organizations.';
  updateVerificationButton();
}));
get('run-verification').addEventListener('click', verifyCampusLaws);

let benchmarkBusy = false;
async function runCampusBenchmark() {
  if (benchmarkBusy) return;
  benchmarkBusy = true;
  get('run-benchmark').disabled = true;
  get('benchmark-body').replaceChildren();
  get('benchmark-status').textContent = 'Measuring five trials for each dataset size. You can continue using the other pages.';
  try {
    const result = await window.projectAPI.benchmark();
    for (const row of result.results) addRow(get('benchmark-body'), [formatCount(row.size),
      row.listMs.toFixed(3), row.hashMs.toFixed(3), row.buildMs.toFixed(3), row.hashTotalMs.toFixed(3),
      row.lookupSpeedup ? `${row.lookupSpeedup.toFixed(1)}×` : 'Below timer resolution', row.correct ? 'Yes' : 'No']);
    get('benchmark-status').textContent = `${result.trials} trials · ${result.queryCount} queries per trial · ${result.runtime} · ${result.platform}. Measured ${new Date(result.measuredAt).toLocaleString()}.`;
  } catch (error) { get('benchmark-status').textContent = textError(error); }
  finally { benchmarkBusy = false; get('run-benchmark').disabled = false; }
}
get('run-benchmark').addEventListener('click', runCampusBenchmark);

get('export-dataset').addEventListener('click', async () => {
  get('export-dataset').disabled = true;
  try {
    const result = await window.projectAPI.exportDataset();
    get('report-status').textContent = result.canceled ? 'Export canceled.' : `Current dataset saved to ${result.path}`;
  } catch (error) { get('report-status').textContent = textError(error); }
  finally { get('export-dataset').disabled = false; }
});
// Render the reports' simple Markdown as readable blocks. textContent keeps any
// HTML-looking report text harmless; no report text becomes executable markup.
function renderProjectReport(content) {
  const container = get('report-content');
  container.replaceChildren();
  const lines = String(content).replace(/\r/g, '').split('\n');
  const isTableRow = line => /^\s*\|.*\|\s*$/.test(line);
  const isTableDivider = line => /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line);
  const cells = line => line.trim().slice(1, -1).split('|').map(value => value.trim());
  function listType(line) {
    if (/^\s*\d+\.\s+/.test(line)) return 'ol';
    if (/^\s*-\s+/.test(line)) return 'ul';
    return null;
  }
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) { index++; continue; }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const element = document.createElement(`h${heading[1].length + 1}`);
      element.textContent = heading[2];
      container.appendChild(element);
      index++;
      continue;
    }

    if (isTableRow(line) && isTableDivider(lines[index + 1] || '')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'table-container';
      const table = document.createElement('table');
      const head = document.createElement('thead');
      const row = document.createElement('tr');
      for (const label of cells(line)) {
        const cell = document.createElement('th');
        cell.setAttribute('scope', 'col');
        cell.textContent = label;
        row.appendChild(cell);
      }
      head.appendChild(row);
      table.appendChild(head);
      const body = document.createElement('tbody');
      index += 2; // The next line contains Markdown's column dividers, not data.
      while (index < lines.length && isTableRow(lines[index])) {
        addRow(body, cells(lines[index]));
        index++;
      }
      table.appendChild(body);
      wrapper.appendChild(table);
      container.appendChild(wrapper);
      continue;
    }

    const type = listType(line);
    if (type) {
      const list = document.createElement(type);
      while (index < lines.length && listType(lines[index]) === type) {
        const item = document.createElement('li');
        item.textContent = lines[index].trim().replace(/^(?:-\s+|\d+\.\s+)/, '');
        list.appendChild(item);
        index++;
      }
      container.appendChild(list);
      continue;
    }

    const paragraph = document.createElement('p');
    const text = [];
    while (index < lines.length && lines[index].trim() &&
      !/^#{1,3}\s+/.test(lines[index].trim()) && !listType(lines[index]) &&
      !(isTableRow(lines[index]) && isTableDivider(lines[index + 1] || ''))) {
      text.push(lines[index].trim());
      index++;
    }
    paragraph.textContent = text.join(' ');
    container.appendChild(paragraph);
  }
}

let latestReportRequest = 0;
document.querySelectorAll('[data-report]').forEach(button => button.addEventListener('click', async () => {
  // Different report requests may finish out of order. Only the latest choice
  // may update the shared viewer, so an older response cannot replace it.
  const requestId = ++latestReportRequest;
  const reportName = button.textContent.trim();
  button.disabled = true;
  get('report-content').textContent = '';
  get('report-status').textContent = `Loading ${reportName}…`;
  try {
    const content = await window.projectAPI.report(button.dataset.report);
    if (requestId === latestReportRequest) {
      renderProjectReport(content);
      get('report-status').textContent = reportName;
    }
  } catch (error) {
    if (requestId === latestReportRequest) get('report-status').textContent = textError(error);
  }
  finally { button.disabled = false; }
}));

// A later Refresh can also recover startup choices after a failed first request.
refreshCampusOverview();
