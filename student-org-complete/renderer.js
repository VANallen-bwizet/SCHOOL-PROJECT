// The renderer runs like a normal web page: it changes HTML, but never opens SQLite.
// The named APIs on window come from preload.js and return Promises (future results).
const runtimeLabel = document.getElementById('runtime-label');
runtimeLabel.textContent = window.appInfo?.platformLabel ?? 'Browser preview — open with Electron for the desktop app';

const studentsBody = document.getElementById('students-body');
const studentsStatus = document.getElementById('students-status');
const databaseStatus = document.getElementById('database-status');
const refreshButton = document.getElementById('refresh-students');
const studentsRegion = document.getElementById('students-region');

async function loadStudents() {
  refreshButton.disabled = true;
  studentsRegion.setAttribute('aria-busy', 'true');
  studentsStatus.textContent = 'Loading students…';
  databaseStatus.textContent = 'Reading database…';
  studentsBody.replaceChildren();

  try {
    if (!window.studentAPI) {
      throw new Error('Open this page through Electron.');
    }

    // await waits for the response without freezing the page or its buttons.
    const students = await window.studentAPI.getStudents();
    const rows = document.createDocumentFragment();

    for (const student of students) {
      const row = document.createElement('tr');

      for (const value of [student.student_id, student.full_name, student.course]) {
        const cell = document.createElement('td');
        // Treat names as plain text, never as HTML.
        cell.textContent = String(value);
        row.appendChild(cell);
      }

      rows.appendChild(row);
    }

    studentsBody.appendChild(rows);
    studentsStatus.textContent = students.length === 0
      ? 'No students found in the database.'
      : `${students.length} students loaded.`;
    databaseStatus.textContent = 'Database connected';
  } catch (error) {
    console.error('Student list could not be loaded:', error);
    studentsStatus.textContent = window.studentAPI
      ? 'Could not load students. Click Refresh students to try again.'
      : 'Open the app using npm.cmd start to load students.';
    databaseStatus.textContent = 'Student data unavailable';
  } finally {
    refreshButton.disabled = false;
    studentsRegion.setAttribute('aria-busy', 'false');
  }
}

refreshButton.addEventListener('click', loadStudents);
loadStudents();

const organizationSelect = document.getElementById(
  'organization-select'
);

const membersBody = document.getElementById('members-body');
const membersStatus = document.getElementById('members-status');

// Fill the dropdown with organizations from SQLite.
async function loadOrganizations() {
  membersStatus.textContent = 'Loading organizations…';

  try {
    const organizations =
      await window.organizationAPI.getOrganizations();

    // Keep the first "Select an organization" option.
    organizationSelect.length = 1;

    for (const organization of organizations) {
      const option = document.createElement('option');

      option.value = organization.organization_id;
      option.textContent = organization.name;

      organizationSelect.appendChild(option);
    }

    organizationSelect.disabled = organizations.length === 0;

    membersStatus.textContent = organizations.length === 0
      ? 'No organizations found.'
      : 'Select an organization to view its members.';
  } catch (error) {
    console.error('Could not load organizations:', error);
    organizationSelect.disabled = true;
    membersStatus.textContent =
      'Could not load organizations. Restart the app to try again.';
  }
}

// Display members when the selected organization changes.
async function loadOrganizationMembers() {
  membersBody.replaceChildren();

  if (!organizationSelect.value) {
    membersStatus.textContent =
      'Select an organization to view its members.';
    updateMembershipButtons();
    return false;
  }

  // Dropdown values are text. Convert the ID to a number.
  const organizationId = Number(organizationSelect.value);

  organizationSelect.disabled = true;
  membersStatus.textContent = 'Loading members…';

  try {
    const members =
      await window.organizationAPI.getMembers(organizationId);

    for (const student of members) {
      const row = document.createElement('tr');

      for (const value of [
        student.student_id,
        student.full_name,
        student.course
      ]) {
        const cell = document.createElement('td');

        cell.textContent = String(value);
        row.appendChild(cell);
      }

      membersBody.appendChild(row);
    }

    membersStatus.textContent =
      `${members.length} members in this organization.`;
    return true;
  } catch (error) {
    console.error('Could not load members:', error);
    membersStatus.textContent =
      'Could not load members. Select an organization to try again.';
    return false;
  } finally {
    organizationSelect.disabled = false;
    updateMembershipButtons();
  }
}

organizationSelect.addEventListener(
  'change',
  loadOrganizationMembers
);


loadOrganizations();


const membershipStudentSelect = document.getElementById(
  'membership-student-select'
);

const membershipStatus = document.getElementById(
  'membership-status'
);

async function loadMembershipStudents() {
  membershipStudentSelect.disabled = true;

  try {
    const students = await window.studentAPI.getStudents();

    // Keep the first "Select a student" option.
    membershipStudentSelect.length = 1;

    for (const student of students) {
      const option = document.createElement('option');

      option.value = student.student_id;
      option.textContent =
        `${student.student_id} — ${student.full_name}`;

      membershipStudentSelect.appendChild(option);
    }

    membershipStudentSelect.disabled = students.length === 0;

    membershipStatus.textContent = students.length === 0
      ? 'No students available.'
      : 'Select an organization and a student to manage membership.';
  } catch (error) {
    console.error('Could not load student choices:', error);

    membershipStatus.textContent =
      'Could not load students. Restart the app to try again.';
  }
}

loadMembershipStudents();

const joinButton = document.getElementById('join-organization');
const removeButton = document.getElementById('remove-membership');

let membershipBusy = false;
let membershipRevision = 0;

// Membership edits change the inputs to these calculations. Clear their old
// answers while keeping selections, power sets, and pasted sample rows intact.
function invalidateMembershipResults() {
  membershipRevision++;
  for (const body of [unionBody, differenceBody, complementBody, participationBody,
    similarityBody, overlapBody, recommendationBody]) {
    body.replaceChildren();
  }
  unionStatus.textContent = 'Memberships changed. Calculate union or intersection again.';
  differenceStatus.textContent = 'Memberships changed. Calculate the comparison again.';
  relationsStatus.textContent = 'Memberships changed. Check subset and superset again.';
  complementStatus.textContent = 'Memberships changed. Calculate the complement again.';
  participationStatus.textContent = 'Memberships changed. Load analytics again.';
  similarityStatus.textContent = 'Memberships changed. Calculate similarities and rankings again.';
  recommendationCurrent.textContent = '';
  recommendationStatus.textContent = 'Memberships changed. Request recommendations again.';
  // workspace.js listens for this page-local event to clear committees/proofs.
  window.dispatchEvent(new Event('memberships-changed'));
}

// Enable buttons only when both choices are ready.
function updateMembershipButtons() {
  const studentId = Number(membershipStudentSelect.value);
  const organizationId = Number(organizationSelect.value);

  const ready =
    Number.isSafeInteger(studentId) &&
    studentId > 0 &&
    Number.isSafeInteger(organizationId) &&
    organizationId > 0 &&
    !membershipStudentSelect.disabled &&
    !organizationSelect.disabled &&
    !membershipBusy;

  joinButton.disabled = !ready;
  removeButton.disabled = !ready;
}

// Perform either a join or a removal.
async function changeMembership(action) {
  updateMembershipButtons();

  if (joinButton.disabled || membershipBusy) {
    return;
  }

  const studentId = Number(membershipStudentSelect.value);
  const organizationId = Number(organizationSelect.value);

  membershipBusy = true;
  organizationSelect.disabled = true;
  membershipStudentSelect.disabled = true;
  updateMembershipButtons();

  membershipStatus.textContent = 'Saving membership change…';

  try {
    let changed = false;
    if (action === 'join') {
      const result = await window.membershipAPI.addMembership(
        studentId,
        organizationId
      );

      membershipStatus.textContent = result.added
        ? 'Student successfully joined the organization.'
        : 'This student already belongs to the organization.';
      changed = result.added;
    } else if (action === 'remove') {
      const result = await window.membershipAPI.removeMembership(
        studentId,
        organizationId
      );

      membershipStatus.textContent = result.removed
        ? 'Membership successfully removed.'
        : 'This student does not belong to the organization.';
      changed = result.removed;
    }

    if (changed) invalidateMembershipResults();

    // Saving and reloading are separate operations. A reload failure must not
    // imply that a successful database change was undone.
    const refreshed = await loadOrganizationMembers();
    if (!refreshed) {
      membershipStatus.textContent +=
        ' The member list could not refresh. Select the organization again to retry.';
    }
  } catch (error) {
    console.error('Membership change failed:', error);

    membershipStatus.textContent =
      'Could not save the membership change. Please try again.';
  } finally {
    membershipBusy = false;
    organizationSelect.disabled = false;
    membershipStudentSelect.disabled = false;
    updateMembershipButtons();
  }
}

// Update buttons when either selection changes.
organizationSelect.addEventListener(
  'change',
  updateMembershipButtons
);

membershipStudentSelect.addEventListener(
  'change',
  updateMembershipButtons
);

// Connect each button to its action.
joinButton.addEventListener('click', () => {
  changeMembership('join');
});

removeButton.addEventListener('click', () => {
  changeMembership('remove');
});

updateMembershipButtons();

const unionChoices = document.getElementById('union-organizations');
const unionButton = document.getElementById('calculate-union');
const intersectionButton = document.getElementById(
  'calculate-intersection'
);
const unionStatus = document.getElementById('union-status');
const unionBody = document.getElementById('union-body');
const unionRegion = document.getElementById('union-region');
const unionFieldset = unionChoices.closest('fieldset');

let setBusy = false;

// Read the selected organization IDs.
function getUnionSelection() {
  const checked = unionChoices.querySelectorAll(
    'input[type="checkbox"]:checked'
  );

  return Array.from(checked, checkbox => Number(checkbox.value));
}

// Both operations require at least two organizations.
function updateSetButtons() {
  const disabled = setBusy || getUnionSelection().length < 2;

  unionButton.disabled = disabled;
  intersectionButton.disabled = disabled;
}

// Fill the existing checkbox area.
async function loadUnionChoices() {
  unionFieldset.disabled = true;
  updateSetButtons();

  try {
    const organizations =
      await window.organizationAPI.getOrganizations();

    unionChoices.replaceChildren();

    for (const organization of organizations) {
      const container = document.createElement('div');
      const label = document.createElement('label');
      const checkbox = document.createElement('input');

      checkbox.type = 'checkbox';
      checkbox.value = organization.organization_id;

      label.appendChild(checkbox);
      label.appendChild(
        document.createTextNode(` ${organization.name}`)
      );

      container.appendChild(label);
      unionChoices.appendChild(container);
    }

    unionFieldset.disabled = false;

    unionStatus.textContent = organizations.length < 2
      ? 'At least two organizations are needed.'
      : 'Select at least two organizations.';
  } catch (error) {
    console.error('Could not load set choices:', error);
    unionChoices.textContent = 'Organization choices unavailable.';
    unionStatus.textContent =
      'Could not load organizations. Restart the app to try again.';
  }
}

// Clear old results when the selection changes.
unionChoices.addEventListener('change', () => {
  unionBody.replaceChildren();
  updateSetButtons();

  unionStatus.textContent = getUnionSelection().length < 2
    ? 'Select at least two organizations.'
    : 'Choose Calculate union or Calculate intersection.';
});

// Calculate either operation using the same display code.
async function calculateSetOperation(operation) {
  const selectedIds = getUnionSelection();

  if (setBusy || selectedIds.length < 2) {
    return;
  }

  const operationName = operation === 'union'
    ? 'Union'
    : 'Intersection';
  const requestRevision = membershipRevision;

  setBusy = true;
  unionFieldset.disabled = true;
  updateSetButtons();
  unionRegion.setAttribute('aria-busy', 'true');
  unionBody.replaceChildren();
  unionStatus.textContent = `Calculating ${operationName}…`;

  try {
    let result;

    if (operation === 'union') {
      result = await window.setAPI.union(selectedIds);
    } else {
      result = await window.setAPI.intersection(selectedIds);
    }

    if (requestRevision !== membershipRevision) return;

    for (const student of result.members) {
      const row = document.createElement('tr');

      for (const value of [
        student.student_id,
        student.full_name,
        student.course
      ]) {
        const cell = document.createElement('td');

        cell.textContent = String(value);
        row.appendChild(cell);
      }

      unionBody.appendChild(row);
    }

    unionStatus.textContent =
      `${operationName} cardinality: ${result.cardinality} unique students.`;
  } catch (error) {
    if (requestRevision !== membershipRevision) return;
    console.error(`${operationName} calculation failed:`, error);
    unionStatus.textContent =
      `Could not calculate ${operationName}. Please try again.`;
  } finally {
    setBusy = false;
    unionFieldset.disabled = false;
    unionRegion.setAttribute('aria-busy', 'false');
    updateSetButtons();
  }
}

unionButton.addEventListener('click', () => {
  calculateSetOperation('union');
});

intersectionButton.addEventListener('click', () => {
  calculateSetOperation('intersection');
});

loadUnionChoices();

const differenceA = document.getElementById('difference-a');
const differenceB = document.getElementById('difference-b');
const differenceButton = document.getElementById(
  'calculate-difference'
);
const differenceStatus = document.getElementById(
  'difference-status'
);
const differenceBody = document.getElementById('difference-body');
const differenceRegion = document.getElementById(
  'difference-region'
);


const symmetricDifferenceButton = document.getElementById(
  'calculate-symmetric-difference'
);
const relationsButton = document.getElementById('check-relations');
const relationsStatus = document.getElementById('relations-status');
let differenceBusy = false;

// Enable calculation when both organizations are selected.
function updateDifferenceButton() {
  const disabled =
    differenceBusy ||
    !differenceA.value ||
    !differenceB.value;

  differenceButton.disabled = disabled;
  symmetricDifferenceButton.disabled = disabled;
  relationsButton.disabled = disabled;
}

// Fill both dropdowns with organization choices.
async function loadDifferenceChoices() {
  differenceButton.disabled = true;
  differenceA.disabled = true;
  differenceB.disabled = true;
  differenceStatus.textContent = 'Loading organizations…';

  try {
    const organizations =
      await window.organizationAPI.getOrganizations();

    // Keep each dropdown's placeholder.
    differenceA.length = 1;
    differenceB.length = 1;

    for (const organization of organizations) {
      for (const dropdown of [differenceA, differenceB]) {
        const option = document.createElement('option');

        option.value = organization.organization_id;
        option.textContent = organization.name;

        dropdown.appendChild(option);
      }
    }

    differenceA.disabled = organizations.length === 0;
    differenceB.disabled = organizations.length === 0;

    differenceStatus.textContent = organizations.length === 0
      ? 'No organizations found.'
      : 'Choose Organization A and Organization B.';

    updateDifferenceButton();
  } catch (error) {
    console.error('Could not load difference choices:', error);

    differenceStatus.textContent =
      'Could not load organizations. Restart the app to try again.';
  }
}

// Clear previous results when either choice changes.
function differenceSelectionChanged() {
  differenceBody.replaceChildren();
  relationsStatus.textContent =
    'Choose A and B, then click Check subset and superset.';
  differenceStatus.textContent =
  'Choose both organizations, then select a comparison button.';

  updateDifferenceButton();
}

// Both comparison buttons share the same table; only the requested calculation changes.
async function calculateComparison(operation) {
  if (
    differenceBusy ||
    !differenceA.value ||
    !differenceB.value
  ) {
    return;
  }

  const organizationAId = Number(differenceA.value);
  const organizationBId = Number(differenceB.value);

  const operationName = operation === 'difference'
    ? 'A − B'
    : 'Symmetric difference';
  const requestRevision = membershipRevision;

  differenceBusy = true;
  differenceA.disabled = true;
  differenceB.disabled = true;
  updateDifferenceButton();

  differenceRegion.setAttribute('aria-busy', 'true');
  differenceBody.replaceChildren();
  differenceStatus.textContent = `Calculating ${operationName}…`;

  try {
    let result;

    if (operation === 'difference') {
      result = await window.setAPI.difference(
        organizationAId,
        organizationBId
      );
    } else {
      result = await window.setAPI.symmetricDifference(
        organizationAId,
        organizationBId
      );
    }

    if (requestRevision !== membershipRevision) return;

    for (const student of result.members) {
      const row = document.createElement('tr');

      for (const value of [
        student.student_id,
        student.full_name,
        student.course
      ]) {
        const cell = document.createElement('td');

        cell.textContent = String(value);
        row.appendChild(cell);
      }

      differenceBody.appendChild(row);
    }

    differenceStatus.textContent =
      `${operationName} cardinality: ${result.cardinality} unique students.`;
  } catch (error) {
    if (requestRevision !== membershipRevision) return;
    console.error('Comparison failed:', error);

    differenceStatus.textContent =
      'Could not calculate the comparison. Please try again.';
  } finally {
    differenceBusy = false;
    differenceA.disabled = false;
    differenceB.disabled = false;
    differenceRegion.setAttribute('aria-busy', 'false');
    updateDifferenceButton();
  }
}
differenceA.addEventListener('change', differenceSelectionChanged);
differenceB.addEventListener('change', differenceSelectionChanged);
differenceButton.addEventListener('click', () => {
  calculateComparison('difference');
});

symmetricDifferenceButton.addEventListener('click', () => {
  calculateComparison('symmetricDifference');
});


// These checks return true/false rather than a list of student records.
async function checkOrganizationRelations() {
  if (differenceBusy || !differenceA.value || !differenceB.value) return;

  const organizationAId = Number(differenceA.value);
  const organizationBId = Number(differenceB.value);
  const nameA = differenceA.selectedOptions[0].textContent;
  const nameB = differenceB.selectedOptions[0].textContent;
  const requestRevision = membershipRevision;

  differenceBusy = true;
  differenceA.disabled = true;
  differenceB.disabled = true;
  updateDifferenceButton();
  relationsStatus.textContent = 'Checking subset and superset…';
  relationsStatus.setAttribute('aria-busy', 'true');

  try {
    const result = await window.setAPI.checkRelations(organizationAId, organizationBId);
    if (requestRevision !== membershipRevision) return;
    const yesNo = value => value ? 'Yes' : 'No';

    relationsStatus.textContent =
      `Organization A: ${nameA} (${result.cardinalityA} members)\n` +
      `Organization B: ${nameB} (${result.cardinalityB} members)\n\n` +
      `A is a subset of B: ${yesNo(result.subset)}\n` +
      `A is a superset of B: ${yesNo(result.superset)}\n` +
      `Equal membership sets: ${yesNo(result.equal)}`;
  } catch (error) {
    if (requestRevision !== membershipRevision) return;
    console.error('Could not verify subset and superset:', error);
    relationsStatus.textContent =
      'Could not check subset and superset. Please try again.';
  } finally {
    differenceBusy = false;
    differenceA.disabled = false;
    differenceB.disabled = false;
    relationsStatus.setAttribute('aria-busy', 'false');
    updateDifferenceButton();
  }
}

relationsButton.addEventListener('click', checkOrganizationRelations);
loadDifferenceChoices();

// Complement has one organization choice and uses the entire student population.
const complementSelect = document.getElementById('complement-organization');
const complementButton = document.getElementById('calculate-complement');
const complementStatus = document.getElementById('complement-status');
const complementBody = document.getElementById('complement-body');
const complementRegion = document.getElementById('complement-region');
let complementBusy = false;

function updateComplementButton() {
  complementButton.disabled = complementBusy || !complementSelect.value;
}

async function loadComplementChoices() {
  complementSelect.disabled = true;
  complementButton.disabled = true;
  try {
    const organizations = await window.organizationAPI.getOrganizations();
    complementSelect.length = 1;
    for (const organization of organizations) {
      const option = document.createElement('option');
      option.value = organization.organization_id;
      option.textContent = organization.name;
      complementSelect.appendChild(option);
    }
    complementSelect.disabled = organizations.length === 0;
    complementStatus.textContent = organizations.length
      ? 'Select an organization to find students outside it.'
      : 'No organizations found.';
  } catch (error) {
    console.error('Could not load complement choices:', error);
    complementStatus.textContent = 'Could not load organizations. Restart the app to try again.';
  }
}

complementSelect.addEventListener('change', () => {
  complementBody.replaceChildren();
  complementStatus.textContent = 'Select an organization, then click Calculate complement.';
  updateComplementButton();
});

async function calculateComplement() {
  if (complementBusy || !complementSelect.value) return;
  const organizationId = Number(complementSelect.value);
  const requestRevision = membershipRevision;
  complementBusy = true;
  complementSelect.disabled = true;
  updateComplementButton();
  complementRegion.setAttribute('aria-busy', 'true');
  complementBody.replaceChildren();
  complementStatus.textContent = 'Calculating complement…';

  try {
    const result = await window.setAPI.complement(organizationId);
    if (requestRevision !== membershipRevision) return;
    for (const student of result.members) {
      const row = document.createElement('tr');
      for (const value of [student.student_id, student.full_name, student.course]) {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        row.appendChild(cell);
      }
      complementBody.appendChild(row);
    }
    complementStatus.textContent =
      `All students: ${result.population}. Members of ${result.organizationName}: ` +
      `${result.organizationCardinality}. Complement cardinality: ${result.cardinality}. ` +
      `${result.population} − ${result.organizationCardinality} = ${result.cardinality}.`;
  } catch (error) {
    if (requestRevision !== membershipRevision) return;
    console.error('Complement calculation failed:', error);
    complementStatus.textContent = 'Could not calculate the complement. Please try again.';
  } finally {
    complementBusy = false;
    complementSelect.disabled = false;
    complementRegion.setAttribute('aria-busy', 'false');
    updateComplementButton();
  }
}

complementButton.addEventListener('click', calculateComplement);
loadComplementChoices();

// A reusable plain-text table helper; data is never interpreted as HTML.
function appendAnalysisRow(body, values) {
  const row = document.createElement('tr');
  for (const value of values) {
    const cell = document.createElement('td');
    cell.textContent = String(value);
    row.appendChild(cell);
  }
  body.appendChild(row);
}

function requestErrorMessage(error) {
  // Promise rejections can contain an Error, text, or no value at all.
  return String(error?.message || error || 'The request failed.').replace(
    /^Error invoking remote method '[^']+': Error: /, ''
  );
}

const powerInput = document.getElementById('power-input');
const powerLimit = document.getElementById('power-limit');
const powerButton = document.getElementById('generate-power');
const powerStatus = document.getElementById('power-status');
const powerBody = document.getElementById('power-body');
const powerRegion = document.getElementById('power-region');
let powerBusy = false;

// Dropdown values and text inputs are strings. Validate before converting to numbers;
// otherwise Number('') would silently become zero.
function readPositiveId(text) {
  if (!/^[0-9]+$/.test(text.trim())) throw new Error('IDs must be positive whole numbers.');
  const id = Number(text.trim());
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('IDs must be positive whole numbers.');
  return id;
}

async function generatePowerSet() {
  if (powerBusy) return;
  powerBody.replaceChildren();
  try {
    const ids = powerInput.value.trim() === '' ? [] : powerInput.value.split(',').map(readPositiveId);
    const limit = Number(powerLimit.value);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10) {
      throw new Error('Choose a maximum size from 1 to 10.');
    }
    powerBusy = true;
    powerButton.disabled = powerInput.disabled = powerLimit.disabled = true;
    powerRegion.setAttribute('aria-busy', 'true');
    powerStatus.textContent = 'Generating subsets…';

    const result = await window.setAPI.powerSet(ids, limit);
    for (const subset of result.subsets) {
      appendAnalysisRow(powerBody, [subset.length ? `{${subset.join(', ')}}` : '∅', subset.length]);
    }
    powerStatus.textContent =
      `Set: ${result.elements.length ? `{${result.elements.join(', ')}}` : '∅'}. ` +
      `Cardinality |A| = ${result.cardinality}. Power-set cardinality |P(A)| = ` +
      `${result.subsetCount} = 2^${result.cardinality}. ` +
      `Repeated input IDs ignored: ${result.duplicatesRemoved}.`;
  } catch (error) {
    console.error('Power-set request failed:', error);
    powerStatus.textContent = requestErrorMessage(error);
  } finally {
    powerBusy = false;
    powerButton.disabled = powerInput.disabled = powerLimit.disabled = false;
    powerRegion.setAttribute('aria-busy', 'false');
  }
}

for (const input of [powerInput, powerLimit]) {
  input.addEventListener('input', () => {
    powerBody.replaceChildren();
    powerStatus.textContent = 'Input changed. Click Generate power set to update the results.';
  });
}
powerButton.addEventListener('click', generatePowerSet);

const duplicateInput = document.getElementById('duplicate-input');
const detectDuplicatesButton = document.getElementById('detect-duplicates');
const removeDuplicatesButton = document.getElementById('remove-duplicates');
const auditMembershipsButton = document.getElementById('audit-memberships');
const duplicateStatus = document.getElementById('duplicate-status');
const duplicateBody = document.getElementById('duplicate-body');
const duplicateRegion = document.getElementById('duplicate-region');
let duplicateBusy = false;

function parseMembershipRows() {
  const lines = duplicateInput.value.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length > 1000) throw new Error('Provide at most 1000 membership rows.');
  return lines.map((line, index) => {
    const parts = line.split(',');
    if (parts.length !== 2) throw new Error(`Row ${index + 1}: use student ID, organization ID.`);
    return { studentId: readPositiveId(parts[0]), organizationId: readPositiveId(parts[1]) };
  });
}

async function processDuplicateMemberships(action) {
  if (duplicateBusy) return;
  duplicateBusy = true;
  for (const control of [duplicateInput, detectDuplicatesButton, removeDuplicatesButton, auditMembershipsButton]) {
    control.disabled = true;
  }
  duplicateRegion.setAttribute('aria-busy', 'true');
  duplicateBody.replaceChildren();
  duplicateStatus.textContent = 'Checking memberships…';

  try {
    if (action === 'audit') {
      const duplicates = await window.membershipAPI.audit();
      for (const row of duplicates) {
        appendAnalysisRow(duplicateBody, [row.studentId, row.organizationId, row.copies, row.copies - 1]);
      }
      duplicateStatus.textContent = duplicates.length
        ? `${duplicates.length} repeated pairs found in saved memberships.`
        : 'No duplicate saved memberships. The database prevents repeated student–organization pairs.';
    } else {
      const result = await window.membershipAPI.inspect(parseMembershipRows());
      if (action === 'remove') {
        duplicateInput.value = result.cleanedRows.map(row => `${row.studentId},${row.organizationId}`).join('\n');
        duplicateStatus.textContent =
          `Removed ${result.duplicateCount} extra rows. ${result.uniqueCount} unique memberships remain ` +
          'in the text above. Saved memberships were not changed.';
      } else {
        for (const row of result.duplicates) {
          appendAnalysisRow(duplicateBody, [row.studentId, row.organizationId, row.copies, row.copies - 1]);
        }
        duplicateStatus.textContent =
          `${result.inputCount} rows; ${result.uniqueCount} unique membership pairs; ` +
          `${result.duplicateCount} extra duplicate rows. ` +
          'Remove duplicate rows to keep one copy of each pair.';
      }
    }
  } catch (error) {
    console.error('Membership duplicate check failed:', error);
    duplicateStatus.textContent = action === 'audit'
      ? 'Could not check saved memberships. Please try again.'
      : requestErrorMessage(error);
  } finally {
    duplicateBusy = false;
    for (const control of [duplicateInput, detectDuplicatesButton, removeDuplicatesButton, auditMembershipsButton]) {
      control.disabled = false;
    }
    duplicateRegion.setAttribute('aria-busy', 'false');
  }
}

duplicateInput.addEventListener('input', () => {
  duplicateBody.replaceChildren();
  duplicateStatus.textContent = 'Input changed. Detect duplicates to update the results.';
});
detectDuplicatesButton.addEventListener('click', () => processDuplicateMemberships('detect'));
removeDuplicatesButton.addEventListener('click', () => processDuplicateMemberships('remove'));
auditMembershipsButton.addEventListener('click', () => processDuplicateMemberships('audit'));

const participationView = document.getElementById(
  'participation-view'
);
const participationButton = document.getElementById(
  'load-participation'
);
const participationStatus = document.getElementById(
  'participation-status'
);
const participationBody = document.getElementById(
  'participation-body'
);
const participationRegion = document.getElementById(
  'participation-region'
);

let participationBusy = false;

// A busy flag plus disabled controls prevents overlapping requests from mixing rows.
// finally restores controls after both a successful response and an error.
async function loadParticipationAnalytics() {
  if (participationBusy) {
    return;
  }
  const requestRevision = membershipRevision;

  participationBusy = true;
  participationView.disabled = true;
  participationButton.disabled = true;
  participationRegion.setAttribute('aria-busy', 'true');
  participationBody.replaceChildren();
  participationStatus.textContent = 'Loading participation analytics…';

  try {
    const result = await window.analyticsAPI.getParticipation(
      participationView.value
    );

    if (requestRevision !== membershipRevision) return;

    for (const student of result.students) {
      const row = document.createElement('tr');

      const organizationNames = student.organizationNames.length > 0
        ? student.organizationNames.join(', ')
        : 'No organizations';

      for (const value of [
        student.student_id,
        student.full_name,
        organizationNames,
        student.membershipCount
      ]) {
        const cell = document.createElement('td');

        cell.textContent = String(value);
        row.appendChild(cell);
      }

      participationBody.appendChild(row);
    }

    const viewLabel =
      participationView.selectedOptions[0].textContent.trim();

    participationStatus.textContent =
      `${viewLabel}: ${result.cardinality} of ` +
      `${result.totalStudents} students.`;
  } catch (error) {
    if (requestRevision !== membershipRevision) return;
    console.error('Participation analytics failed:', error);

    participationStatus.textContent =
      'Could not load analytics. Click Load analytics to try again.';
  } finally {
    participationBusy = false;
    participationView.disabled = false;
    participationButton.disabled = false;
    participationRegion.setAttribute('aria-busy', 'false');
  }
}

// Clear results when the selected view changes.
participationView.addEventListener('change', () => {
  participationBody.replaceChildren();

  participationStatus.textContent =
    'View changed. Click Load analytics to display the results.';
});

participationButton.addEventListener(
  'click',
  loadParticipationAnalytics
);

// Activate the button after the page code is ready.
participationButton.disabled = false;

const similarityButton = document.getElementById('load-similarity');
const similarityStatus = document.getElementById('similarity-status');
const similarityBody = document.getElementById('similarity-body');
const overlapBody = document.getElementById('overlap-body');
const similarityRegion = document.getElementById('similarity-region');
let similarityBusy = false;
const percentageText = value => `${(value * 100).toFixed(2)}%`;

async function loadSimilarityAnalytics() {
  if (similarityBusy) return;
  const requestRevision = membershipRevision;
  similarityBusy = true;
  similarityButton.disabled = true;
  similarityRegion.setAttribute('aria-busy', 'true');
  similarityBody.replaceChildren();
  overlapBody.replaceChildren();
  similarityStatus.textContent = 'Calculating similarities and overlap rankings…';
  try {
    const result = await window.analyticsAPI.getSimilarity();
    if (requestRevision !== membershipRevision) return;
    result.pairs.forEach((pair, index) => appendAnalysisRow(similarityBody, [
      index + 1, pair.organizationAName, pair.organizationBName,
      pair.sharedCount, pair.uniqueCount, percentageText(pair.similarity)
    ]));
    result.rankings.forEach((org, index) => appendAnalysisRow(overlapBody, [
      index + 1, org.name, org.memberCount, org.sharedMemberCount,
      percentageText(org.overlapRate), percentageText(org.averageSimilarity)
    ]));
    similarityStatus.textContent = `${result.pairCount} pairs across ${result.organizationCount} organizations. ` +
      'Recalculate after changing memberships.';
  } catch (error) {
    if (requestRevision !== membershipRevision) return;
    console.error('Similarity analytics failed:', error);
    similarityStatus.textContent = 'Could not calculate similarities. Click Calculate to retry.';
  } finally {
    similarityBusy = false;
    similarityButton.disabled = false;
    similarityRegion.setAttribute('aria-busy', 'false');
  }
}
similarityButton.addEventListener('click', loadSimilarityAnalytics);
similarityButton.disabled = false;

const recommendationStudent = document.getElementById('recommendation-student');
const recommendationInterests = document.getElementById('recommendation-interests');
const recommendationChoices = document.getElementById('recommendation-interest-choices');
const recommendationButton = document.getElementById('load-recommendations');
const recommendationStatus = document.getElementById('recommendation-status');
const recommendationCurrent = document.getElementById('recommendation-current');
const recommendationBody = document.getElementById('recommendation-body');
const recommendationRegion = document.getElementById('recommendation-region');
let recommendationBusy = false;
let recommendationInterestLabels = {};

function recommendationSelectionChanged() {
  recommendationBody.replaceChildren();
  recommendationCurrent.textContent = '';
  recommendationButton.disabled = recommendationBusy || !recommendationStudent.value;
  recommendationStatus.textContent = 'Choose a student and optional interests, then request recommendations.';
}

async function loadRecommendationOptions() {
  try {
    const options = await window.analyticsAPI.getRecommendationOptions();
    recommendationInterestLabels = options.interests;
    for (const student of options.students) {
      const option = document.createElement('option');
      option.value = student.student_id;
      option.textContent = `${student.student_id} — ${student.full_name}`;
      recommendationStudent.appendChild(option);
    }
    for (const [id, name] of Object.entries(options.interests)) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = id;
      label.append(input, document.createTextNode(name));
      recommendationChoices.appendChild(label);
    }
    recommendationStudent.disabled = options.students.length === 0;
    recommendationInterests.disabled = false;
    recommendationStatus.textContent = options.students.length
      ? 'Choose a student and optional interests.' : 'No students found.';
  } catch (error) {
    console.error('Recommendation options failed:', error);
    recommendationStatus.textContent = 'Could not load recommendation choices. Restart the app to retry.';
  }
}

async function loadRecommendations() {
  if (recommendationBusy || !recommendationStudent.value) return;
  const interests = Array.from(recommendationChoices.querySelectorAll('input:checked'), input => input.value);
  const requestRevision = membershipRevision;
  recommendationBusy = true;
  recommendationButton.disabled = true;
  recommendationStudent.disabled = true;
  recommendationInterests.disabled = true;
  recommendationBody.replaceChildren();
  recommendationCurrent.textContent = '';
  recommendationRegion.setAttribute('aria-busy', 'true');
  recommendationStatus.textContent = 'Calculating recommendations…';
  try {
    const result = await window.analyticsAPI.getRecommendations(Number(recommendationStudent.value), interests);
    if (requestRevision !== membershipRevision) return;
    recommendationCurrent.textContent = `Current organizations: ${result.currentOrganizations.join(', ') || 'None'}.`;
    result.recommendations.forEach((org, index) => appendAnalysisRow(recommendationBody, [
      index + 1, org.name, percentageText(org.score), percentageText(org.interestScore),
      percentageText(org.membershipScore),
      org.matchedInterests.map(id => recommendationInterestLabels[id]).join(', ') || 'No selected interest matched'
    ]));
    recommendationStatus.textContent = result.recommendations.length
      ? `${result.recommendations.length} suggestions for ${result.studentName}. Already joined organizations are excluded.`
      : 'No unjoined organizations have a positive match. Select different interests or check current memberships.';
  } catch (error) {
    if (requestRevision !== membershipRevision) return;
    console.error('Recommendations failed:', error);
    recommendationStatus.textContent = 'Could not calculate recommendations. Click Recommend to retry.';
  } finally {
    recommendationBusy = false;
    recommendationStudent.disabled = false;
    recommendationInterests.disabled = false;
    recommendationButton.disabled = !recommendationStudent.value;
    recommendationRegion.setAttribute('aria-busy', 'false');
  }
}

recommendationStudent.addEventListener('change', recommendationSelectionChanged);
recommendationChoices.addEventListener('change', recommendationSelectionChanged);
recommendationButton.addEventListener('click', loadRecommendations);
loadRecommendationOptions();

