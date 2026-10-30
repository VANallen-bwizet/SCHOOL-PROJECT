const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { seedDatabase } = require('./seed');

let database;

function initializeDatabase(userDataFolder) {
  // Keep one connection for this app. Opening a second one would lose the first
  // connection's reference, so close it explicitly before opening another.
  if (database) throw new Error('Database is already open.');

  fs.mkdirSync(userDataFolder, { recursive: true });

  const databasePath = path.join(
    userDataFolder,
    'student-organizations.db'
  );

  // Publish the connection only after all setup succeeds. If reading the schema
  // or seeding fails, close this temporary connection before reporting the error.
  const connection = new DatabaseSync(databasePath);
  try {
    connection.exec('PRAGMA foreign_keys = ON;');
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    connection.exec(schema);
    seedDatabase(connection);

    const result = connection
      .prepare('SELECT sqlite_version() AS version')
      .get();

    database = connection;
    console.log('SQLite connected. Version:', result.version);
    console.log('Database saved at:', databasePath);
  } catch (error) {
    connection.close();
    throw error;
  }
}


function getStudents() {
  if (!database) throw new Error('Database is not open.');

  return database.prepare(`
    SELECT student_id, full_name, course
    FROM students
    ORDER BY student_id
  `).all();
}

// Read all organizations.
function getOrganizations() {
  if (!database) {
    throw new Error('Database is not open.');
  }

  return database.prepare(`
    SELECT organization_id, name
    FROM organizations
    ORDER BY name
  `).all();
}

// Read the students belonging to one organization.
function getOrganizationMembers(organizationId) {
  if (!database) {
    throw new Error('Database is not open.');
  }

  // The ? is a bound value, not part of the SQL text. SQLite treats it as data
  // even if a caller supplies text containing SQL punctuation.
  return database.prepare(`
    SELECT students.student_id,
           students.full_name,
           students.course
    FROM students
    INNER JOIN memberships
      ON students.student_id = memberships.student_id
    WHERE memberships.organization_id = ?
    ORDER BY students.student_id
  `).all(organizationId);
}

// Check that both IDs are positive whole numbers.
function validateMembershipIds(studentId, organizationId) {
  if (
    !Number.isSafeInteger(studentId) ||
    studentId < 1 ||
    !Number.isSafeInteger(organizationId) ||
    organizationId < 1
  ) {
    throw new Error('Invalid student or organization ID.');
  }
}

// Add one student to one organization.
function addMembership(studentId, organizationId) {
  if (!database) {
    throw new Error('Database is not open.');
  }

  validateMembershipIds(studentId, organizationId);

  const result = database.prepare(`
    INSERT INTO memberships (student_id, organization_id)
    VALUES (?, ?)
    ON CONFLICT(student_id, organization_id) DO NOTHING
  `).run(studentId, organizationId);

  return { added: result.changes === 1 };
}

// Remove one student's membership in one organization.
function removeMembership(studentId, organizationId) {
  if (!database) {
    throw new Error('Database is not open.');
  }

  validateMembershipIds(studentId, organizationId);

  const result = database.prepare(`
    DELETE FROM memberships
    WHERE student_id = ? AND organization_id = ?
  `).run(studentId, organizationId);

  return { removed: result.changes === 1 };
}


// The composite primary key normally guarantees this query returns no rows.
function findSavedMembershipDuplicates() {
  if (!database) throw new Error('Database is not open.');
  return database.prepare(`
    SELECT student_id AS studentId, organization_id AS organizationId, COUNT(*) AS copies
    FROM memberships
    GROUP BY student_id, organization_id
    HAVING COUNT(*) > 1
    ORDER BY student_id, organization_id
  `).all();
}

// Read every student–organization connection for analytics.
function getMemberships() {
  if (!database) {
    throw new Error('Database is not open.');
  }

  return database.prepare(`
    SELECT student_id, organization_id
    FROM memberships
    ORDER BY student_id, organization_id
  `).all();
}

function closeDatabase() {
  if (database) {
    database.close();
    database = undefined;
  }
}

module.exports = {
  initializeDatabase,
  getStudents,
  getOrganizations,
  getOrganizationMembers,
  addMembership,
  removeMembership,
  findSavedMembershipDuplicates,
  getMemberships,
  closeDatabase
};
