const { app, BrowserWindow, session, ipcMain, dialog } = require('electron');
const fs = require('node:fs');
const { Worker } = require('node:worker_threads');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  union,
  intersection,
  difference,
  symmetricDifference,
  isSubset,
  isSuperset,
  complement,
  cardinality,
  powerSet
} = require('./modules/set-operations');
const { inspectMemberships } = require('./modules/membership-cleanup');

const {
  initializeDatabase,
  getStudents,
  getMemberships,
  getOrganizations,
  getOrganizationMembers,
  addMembership,
  removeMembership,
  closeDatabase,
  findSavedMembershipDuplicates
} = require('./database/db');

const {
  getParticipation,
  getExactlyOne,
  getAtLeastThree,
  rankOrganizationPairs,
  rankOrganizations,
  recommendOrganizations
} = require('./modules/analytics');
const { interestLabels, getOrganizationProfiles } = require('./modules/organization-interests');
const { calculateCommittee } = require('./modules/combinatorics');
const { verifyDeMorgan, exhaustiveVerification } = require('./modules/verification');

// Main owns system access. Page scripts can only call the named handlers below.
// One validation rule also rejects sparse arrays (missing entries between IDs).
function isValidIdList(values) {
  return Array.isArray(values) && values.length <= 1000 &&
    Array.from(values).every(id => Number.isSafeInteger(id) && id > 0);
}

let activeBenchmarkWorker;

function createWindow() {
  const window = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 880,
    minHeight: 620,
    title: 'Advanced Student Organization and Set Analytics System',
    backgroundColor: '#f5f6fa',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, // Page scripts cannot import Node.js modules.
      contextIsolation: true, // Keep preload's privileged context separate.
      sandbox: true // Restrict the page's operating-system access.
    }
  });

  // Local tools need neither external navigation nor additional browser windows.
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.loadFile(path.join(__dirname, 'index.html')).catch((error) => {
    console.error('The application page could not be loaded:', error);
    app.quit();
  });
}


// Electron must be ready before creating windows or using its default session.
app.whenReady().then(() => {
  try {
    initializeDatabase(app.getPath('userData'));
  } catch (error) {
    console.error('Database setup failed:', error);
    app.quit();
    return;
  }
  
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  
  
  ipcMain.handle('students:list', (event) => {
    if (!isAllowedSender(event)) {
      throw new Error('Student request is not allowed.');
    }

    try {
      return getStudents();
    } catch (error) {
      console.error('Could not read students:', error);
      throw new Error('Could not load students. Please try again.');
    }
  });

  // Allow requests only from this application's main page.
  function isAllowedSender(event) {
    // A page/frame can disappear before its request arrives. Reject it explicitly
    // instead of trying to read properties from null and causing a TypeError.
    if (!event?.sender || !event.senderFrame) return false;
    const expectedURL = pathToFileURL(
      path.join(__dirname, 'index.html')
    ).href;

    return Boolean(
      BrowserWindow.fromWebContents(event.sender) &&
      event.senderFrame === event.sender.mainFrame &&
      event.senderFrame?.url === expectedURL
    );
  }

  // Return the organization list.
  ipcMain.handle('organizations:list', (event) => {
    if (!isAllowedSender(event)) {
      throw new Error('Request is not allowed.');
    }

    try {
      return getOrganizations();
    } catch (error) {
      console.error('Could not read organizations:', error);
      throw new Error('Could not load organizations.');
    }
  });

  // Return members of the selected organization.
  ipcMain.handle('organizations:members', (event, organizationId) => {
    if (!isAllowedSender(event)) {
      throw new Error('Request is not allowed.');
    }

    if (!Number.isSafeInteger(organizationId) || organizationId < 1) {
      throw new Error('Invalid organization ID.');
    }

    try {
      return getOrganizationMembers(organizationId);
    } catch (error) {
      console.error('Could not read organization members:', error);
      throw new Error('Could not load organization members.');
    }
  });


  // Validate who sent the request and the supplied IDs.
  function validateMembershipRequest(event, studentId, organizationId) {
    if (!isAllowedSender(event)) {
      throw new Error('Request is not allowed.');
    }

    if (
      !Number.isSafeInteger(studentId) ||
      studentId < 1 ||
      !Number.isSafeInteger(organizationId) ||
      organizationId < 1
    ) {
      throw new Error('Invalid student or organization ID.');
    }
  }

  // Handle a request to join an organization.
  ipcMain.handle(
    'memberships:add',
    (event, studentId, organizationId) => {
      validateMembershipRequest(event, studentId, organizationId);

      try {
        return addMembership(studentId, organizationId);
      } catch (error) {
        console.error('Could not add membership:', error);
        throw new Error('Could not add membership.');
      }
    }
  );

  // Handle a request to leave an organization.
  ipcMain.handle(
    'memberships:remove',
    (event, studentId, organizationId) => {
      validateMembershipRequest(event, studentId, organizationId);

      try {
        return removeMembership(studentId, organizationId);
      } catch (error) {
        console.error('Could not remove membership:', error);
        throw new Error('Could not remove membership.');
      }
    }
  );
  // Combine the members of two or more organizations.
  ipcMain.handle('sets:union', (event, organizationIds) => {
    if (!isAllowedSender(event)) {
      throw new Error('Request is not allowed.');
    }

    // Require at least two different, valid numeric IDs.
    if (
      !isValidIdList(organizationIds) ||
      organizationIds.length < 2 ||
      new Set(organizationIds).size !== organizationIds.length
    ) {
      throw new Error('Select at least two different organizations.');
    }

    try {
      // Check that the selected organizations actually exist.
      const existingIds = new Set(
        getOrganizations().map(
          organization => organization.organization_id
        )
      );

      if (!organizationIds.every(id => existingIds.has(id))) {
        throw new Error('A selected organization does not exist.');
      }

      // Convert each organization's members into a set of student IDs.
      const membershipSets = organizationIds.map(organizationId => {
        const members = getOrganizationMembers(organizationId);

        return new Set(
          members.map(student => student.student_id)
        );
      });

      const combinedIds = union(...membershipSets);

      // Find the complete student records for the resulting IDs.
      const members = getStudents().filter(
        student => combinedIds.has(student.student_id)
      );

      return {
        members,
        cardinality: combinedIds.size
      };
    } catch (error) {
      console.error('Union calculation failed:', error);
      throw new Error('Could not calculate the union.');
    }
  });
  // Find students belonging to every selected organization.
  ipcMain.handle('sets:intersection', (event, organizationIds) => {
    if (!isAllowedSender(event)) {
      throw new Error('Request is not allowed.');
    }

    if (
      !isValidIdList(organizationIds) ||
      organizationIds.length < 2 ||
      new Set(organizationIds).size !== organizationIds.length
    ) {
      throw new Error('Select at least two different organizations.');
    }

    try {
      const existingIds = new Set(
        getOrganizations().map(
          organization => organization.organization_id
        )
      );

      if (!organizationIds.every(id => existingIds.has(id))) {
        throw new Error('A selected organization does not exist.');
      }

      const membershipSets = organizationIds.map(organizationId => {
        const members = getOrganizationMembers(organizationId);

        return new Set(
          members.map(student => student.student_id)
        );
      });

      const sharedIds = intersection(...membershipSets);

      const members = getStudents().filter(
        student => sharedIds.has(student.student_id)
      );

      return {
        members,
        cardinality: sharedIds.size
      };
    } catch (error) {
      console.error('Intersection calculation failed:', error);
      throw new Error('Could not calculate the intersection.');
    }
  });

  // Find members of organization A who are not in organization B.
  ipcMain.handle(
    'sets:difference',
    (event, organizationAId, organizationBId) => {
      if (!isAllowedSender(event)) {
        throw new Error('Request is not allowed.');
      }

      if (
        !Number.isSafeInteger(organizationAId) ||
        organizationAId < 1 ||
        !Number.isSafeInteger(organizationBId) ||
        organizationBId < 1
      ) {
        throw new Error('Invalid organization IDs.');
      }

      try {
        const existingIds = new Set(
          getOrganizations().map(
            organization => organization.organization_id
          )
        );

        if (
          !existingIds.has(organizationAId) ||
          !existingIds.has(organizationBId)
        ) {
          throw new Error('A selected organization does not exist.');
        }

        const setA = new Set(
          getOrganizationMembers(organizationAId).map(
            student => student.student_id
          )
        );

        const setB = new Set(
          getOrganizationMembers(organizationBId).map(
            student => student.student_id
          )
        );

        const resultIds = difference(setA, setB);

        const members = getStudents().filter(
          student => resultIds.has(student.student_id)
        );

        return {
          members,
          cardinality: resultIds.size
        };
      } catch (error) {
        console.error('Difference calculation failed:', error);
        throw new Error('Could not calculate the difference.');
      }
    }
  );

  // Find students belonging to either organization, but not both.
  ipcMain.handle(
    'sets:symmetric-difference',
    (event, organizationAId, organizationBId) => {
      if (!isAllowedSender(event)) {
        throw new Error('Request is not allowed.');
      }

      if (
        !Number.isSafeInteger(organizationAId) ||
        organizationAId < 1 ||
        !Number.isSafeInteger(organizationBId) ||
        organizationBId < 1
      ) {
        throw new Error('Invalid organization IDs.');
      }

      try {
        const existingIds = new Set(
          getOrganizations().map(
            organization => organization.organization_id
          )
        );

        if (
          !existingIds.has(organizationAId) ||
          !existingIds.has(organizationBId)
        ) {
          throw new Error('A selected organization does not exist.');
        }

        const setA = new Set(
          getOrganizationMembers(organizationAId).map(
            student => student.student_id
          )
        );

        const setB = new Set(
          getOrganizationMembers(organizationBId).map(
            student => student.student_id
          )
        );

        const resultIds = symmetricDifference(setA, setB);

        const members = getStudents().filter(
          student => resultIds.has(student.student_id)
        );

        return {
          members,
          cardinality: resultIds.size
        };
      } catch (error) {
        console.error('Symmetric difference failed:', error);
        throw new Error('Could not calculate symmetric difference.');
      }
    }
  );
  // Compare membership containment without changing either organization.
  ipcMain.handle('sets:relations', (event, organizationAId, organizationBId) => {
    if (!isAllowedSender(event)) {
      throw new Error('Request is not allowed.');
    }

    if (!Number.isSafeInteger(organizationAId) || organizationAId < 1 ||
        !Number.isSafeInteger(organizationBId) || organizationBId < 1) {
      throw new Error('Invalid organization IDs.');
    }

    try {
      const existingIds = new Set(
        getOrganizations().map(organization => organization.organization_id)
      );
      if (!existingIds.has(organizationAId) || !existingIds.has(organizationBId)) {
        throw new Error('A selected organization does not exist.');
      }

      const setA = new Set(getOrganizationMembers(organizationAId).map(
        student => student.student_id
      ));
      const setB = new Set(getOrganizationMembers(organizationBId).map(
        student => student.student_id
      ));
      const subset = isSubset(setA, setB);
      const superset = isSuperset(setA, setB);

      return {
        subset,
        superset,
        equal: subset && superset,
        cardinalityA: setA.size,
        cardinalityB: setB.size
      };
    } catch (error) {
      console.error('Subset and superset verification failed:', error);
      throw new Error('Could not verify subset and superset.');
    }
  });

  ipcMain.handle('sets:complement', (event, organizationId) => {
    if (!isAllowedSender(event)) throw new Error('Request is not allowed.');
    if (!Number.isSafeInteger(organizationId) || organizationId < 1) {
      throw new Error('Invalid organization ID.');
    }

    try {
      const organization = getOrganizations().find(
        item => item.organization_id === organizationId
      );
      if (!organization) throw new Error('Organization does not exist.');

      // U includes every student, including those with no memberships.
      const students = getStudents();
      const universe = new Set(students.map(student => student.student_id));
      const memberIds = new Set(getOrganizationMembers(organizationId).map(
        student => student.student_id
      ));
      const resultIds = complement(memberIds, universe);

      return {
        organizationName: organization.name,
        population: universe.size,
        organizationCardinality: memberIds.size,
        cardinality: resultIds.size,
        members: students.filter(student => resultIds.has(student.student_id))
      };
    } catch (error) {
      console.error('Complement calculation failed:', error);
      throw new Error('Could not calculate the complement.');
    }
  });

  ipcMain.handle('sets:power-set', (event, studentIds, maximumSize) => {
    if (!isAllowedSender(event)) throw new Error('Request is not allowed.');
    if (!isValidIdList(studentIds)) {
      throw new Error('Provide a list of positive whole-number student IDs.');
    }
    const knownIds = new Set(getStudents().map(student => student.student_id));
    if (!studentIds.every(id => knownIds.has(id))) {
      throw new Error('Every student ID must exist in the database.');
    }
    const elements = [...new Set(studentIds)];
    const subsets = powerSet(elements, maximumSize);
    return {
      elements,
      cardinality: cardinality(elements),
      duplicatesRemoved: studentIds.length - elements.length,
      subsets,
      subsetCount: cardinality(subsets),
      expectedSubsetCount: 2 ** elements.length
    };
  });

  ipcMain.handle('memberships:inspect', (event, rows) => {
    if (!isAllowedSender(event)) throw new Error('Request is not allowed.');
    const result = inspectMemberships(rows);
    const students = new Set(getStudents().map(student => student.student_id));
    const organizations = new Set(getOrganizations().map(item => item.organization_id));
    if (!result.cleanedRows.every(row => students.has(row.studentId) && organizations.has(row.organizationId))) {
      throw new Error('Every student and organization ID must exist in the database.');
    }
    return result;
  });

  ipcMain.handle('memberships:audit', event => {
    if (!isAllowedSender(event)) throw new Error('Request is not allowed.');
    return findSavedMembershipDuplicates();
  });

  // Read participation analytics across all organizations.
  ipcMain.handle('analytics:participation', (event, view) => {
    if (!isAllowedSender(event)) {
      throw new Error('Request is not allowed.');
    }

    const allowedViews = ['all', 'exactly-one', 'at-least-three'];

    if (!allowedViews.includes(view)) {
      throw new Error('Invalid participation view.');
    }

    try {
      const participation = getParticipation(
        getStudents(),
        getMemberships()
      );

      let students;

      if (view === 'exactly-one') {
        students = getExactlyOne(participation);
      } else if (view === 'at-least-three') {
        students = getAtLeastThree(participation);
      } else {
        students = participation;
      }

      // Attach readable organization names to each student.
      const organizationNames = new Map(
        getOrganizations().map(organization => [
          organization.organization_id,
          organization.name
        ])
      );

      const results = students.map(student => ({
        ...student,
        organizationNames: student.organizationIds.map(
          id => organizationNames.get(id)
        )
      }));

      return {
        students: results,
        cardinality: results.length,
        totalStudents: participation.length
      };
    } catch (error) {
      console.error('Participation analytics failed:', error);
      throw new Error('Could not load participation analytics.');
    }
  });


  // Register analytics beside the other handlers so sender validation is in scope.
  ipcMain.handle('analytics:similarity', event => {
    if (!isAllowedSender(event)) throw new Error('Request is not allowed.');
    try {
      const organizations = getOrganizations();
      const memberships = getMemberships();
      const pairs = rankOrganizationPairs(organizations, memberships);
      return { pairs, organizationCount: organizations.length, pairCount: pairs.length,
        rankings: rankOrganizations(organizations, memberships) };
    } catch (error) {
      console.error('Organization similarity calculation failed:', error);
      throw new Error('Could not calculate organization similarity.');
    }
  });

  ipcMain.handle('analytics:recommendation-options', event => {
    if (!isAllowedSender(event)) throw new Error('Request is not allowed.');
    return { students: getStudents(), interests: interestLabels,
      organizations: getOrganizationProfiles(getOrganizations()) };
  });

  ipcMain.handle('analytics:recommendations', (event, studentId, interests) => {
    if (!isAllowedSender(event)) throw new Error('Request is not allowed.');
    if (!Number.isSafeInteger(studentId) || studentId < 1 || !Array.isArray(interests) ||
        interests.length > Object.keys(interestLabels).length ||
        !Array.from(interests).every(value => typeof value === 'string' && Object.hasOwn(interestLabels, value))) {
      throw new Error('Select a valid student and interests.');
    }
    const student = getStudents().find(item => item.student_id === studentId);
    if (!student) throw new Error('Student does not exist.');
    try {
      const organizations = getOrganizationProfiles(getOrganizations());
      const memberships = getMemberships();
      const currentOrganizations = organizations.filter(org => memberships.some(row =>
        row.student_id === studentId && row.organization_id === org.organization_id
      )).map(org => org.name);
      return { studentName: student.full_name, currentOrganizations,
        recommendations: recommendOrganizations(studentId, interests, organizations, memberships) };
    } catch (error) {
      console.error('Recommendation calculation failed:', error);
      throw new Error('Could not calculate recommendations.');
    }
  });

  // Completed-project endpoints keep all database and file access in main.
  function validateOrganizationChoices(ids) {
    if (!isValidIdList(ids)) {
      throw new Error('Select valid organizations.');
    }
    const known = new Set(getOrganizations().map(org => org.organization_id));
    if (!ids.every(id => known.has(id))) throw new Error('Unknown organization.');
    return [...new Set(ids)];
  }

  ipcMain.handle('project:overview', event => {
    if (!isAllowedSender(event)) throw new Error('Request is not allowed.');
    const students = getStudents();
    const organizations = getOrganizations();
    const memberships = getMemberships();
    const participation = getParticipation(students, memberships);
    return { students, organizations, membershipCount: memberships.length,
      activeStudents: participation.filter(student => student.membershipCount > 0).length,
      exactlyOne: getExactlyOne(participation).length,
      atLeastThree: getAtLeastThree(participation).length,
      organizationCounts: organizations.map(org => ({ ...org,
        count: new Set(memberships.filter(row => row.organization_id === org.organization_id).map(row => row.student_id)).size }))
    };
  });

  ipcMain.handle('project:committee', (event, options) => {
    if (!isAllowedSender(event)) throw new Error('Request is not allowed.');
    if (!options || typeof options !== 'object') throw new Error('Provide committee options.');
    const poolOrganizationIds = validateOrganizationChoices(options.poolOrganizationIds);
    const excludedOrganizationIds = validateOrganizationChoices(options.excludedOrganizationIds);
    return calculateCommittee(getStudents(), getMemberships(), {
      size: options.size, poolOrganizationIds, excludedOrganizationIds
    });
  });

  ipcMain.handle('project:verification', (event, a, b) => {
    if (!isAllowedSender(event)) throw new Error('Request is not allowed.');
    validateOrganizationChoices([a, b]);
    const universe = new Set(getStudents().map(student => student.student_id));
    const setA = new Set(getOrganizationMembers(a).map(student => student.student_id));
    const setB = new Set(getOrganizationMembers(b).map(student => student.student_id));
    return { population: universe.size, countA: setA.size, countB: setB.size,
      laws: verifyDeMorgan(universe, setA, setB), exhaustive: exhaustiveVerification() };
  });

  let benchmarkTask;
  ipcMain.handle('project:benchmark', event => {
    if (!isAllowedSender(event)) throw new Error('Request is not allowed.');
    // Repeated clicks share one measurement rather than starting many workers.
    if (benchmarkTask) return benchmarkTask;
    // A worker keeps repeated timing loops away from the desktop UI.
    benchmarkTask = new Promise((resolve, reject) => {
      const worker = new Worker(path.join(__dirname, 'modules/benchmark-worker.js'));
      activeBenchmarkWorker = worker;
      let settled = false;
      const timeout = setTimeout(() => {
        finish(new Error('Benchmark timed out. Try again.'));
        worker.terminate().catch(error => console.error('Could not stop benchmark worker:', error));
      }, 30000);

      // Exactly one outcome settles the request and clears its timer, even when
      // a worker exits normally without returning a result.
      function finish(error, result) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (activeBenchmarkWorker === worker) activeBenchmarkWorker = undefined;
        if (error) reject(error);
        else resolve(result);
      }

      worker.once('message', message => {
        if (message?.error) finish(new Error(message.error));
        else if (!message?.result || !Array.isArray(message.result.results)) {
          finish(new Error('Benchmark worker returned an invalid result.'));
        } else finish(null, message.result);
      });
      worker.once('error', error => finish(error));
      worker.once('exit', () => finish(new Error('Benchmark worker stopped before returning a result.')));
    }).finally(() => { benchmarkTask = undefined; });
    return benchmarkTask;
  });

  ipcMain.handle('project:export', async event => {
    if (!isAllowedSender(event)) throw new Error('Request is not allowed.');
    const choice = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'Export the current membership dataset', defaultPath: 'student-organization-dataset.json',
      filters: [{ name: 'JSON dataset', extensions: ['json'] }]
    });
    if (choice.canceled || !choice.filePath) return { canceled: true };
    const snapshot = { exportedAt: new Date().toISOString(), students: getStudents(),
      organizations: getOrganizations(), memberships: getMemberships() };
    await fs.promises.writeFile(choice.filePath, JSON.stringify(snapshot, null, 2), 'utf8');
    return { canceled: false, path: choice.filePath };
  });

  ipcMain.handle('project:report', (event, name) => {
    if (!isAllowedSender(event)) throw new Error('Request is not allowed.');
    const files = { mathematics: 'MATHEMATICAL-VERIFICATION.md', performance: 'PERFORMANCE.md',
      tests: 'TEST-CASES.md', guide: 'USER-GUIDE.md' };
    if (typeof name !== 'string' || !Object.hasOwn(files, name)) throw new Error('Unknown report.');
    return fs.readFileSync(path.join(__dirname, 'docs', files[name]), 'utf8');
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  if (activeBenchmarkWorker) {
    activeBenchmarkWorker.terminate().catch(error => console.error('Could not stop benchmark worker:', error));
    activeBenchmarkWorker = undefined;
  }
  closeDatabase();
});


