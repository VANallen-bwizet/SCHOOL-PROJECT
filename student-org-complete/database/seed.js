function seedDatabase(database) {
  // Seed only a new, empty database. Restarting must not restore memberships
  // that the user deliberately removed in an earlier session.
  const students = database
    .prepare('SELECT COUNT(*) AS total FROM students')
    .get();

  const organizations = database
    .prepare('SELECT COUNT(*) AS total FROM organizations')
    .get();

  if (students.total > 0 || organizations.total > 0) {
    console.log('Existing data found. Sample data was not added.');
    return;
  }

  const organizationNames = [
    'Computer Science Club',
    'Mathematics Society',
    'Debate Society',
    'Arts Guild',
    'Sports Club',
    'Music Club'
  ];

  const firstNames = [
    'Alex', 'Jamie', 'Taylor', 'Jordan', 'Morgan',
    'Casey', 'Riley', 'Avery', 'Cameron', 'Quinn'
  ];

  const lastNames = [
    'Santos', 'Reyes', 'Cruz', 'Garcia', 'Ramos',
    'Mendoza', 'Torres', 'Flores', 'Rivera', 'Lopez'
  ];

  const courses = [
    'Computer Science',
    'Information Technology',
    'Business Administration',
    'Education'
  ];

  // Prepared statements keep data separate from SQL instructions.
  const insertStudent = database.prepare(`
    INSERT INTO students (student_id, full_name, course)
    VALUES (?, ?, ?)
  `);

  const insertOrganization = database.prepare(`
    INSERT INTO organizations (organization_id, name, description)
    VALUES (?, ?, ?)
  `);

  const insertMembership = database.prepare(`
    INSERT INTO memberships (student_id, organization_id)
    VALUES (?, ?)
  `);

  // A transaction saves everything together: either all sample records are
  // inserted, or ROLLBACK below removes the unfinished batch.
  database.exec('BEGIN TRANSACTION');

  try {
    organizationNames.forEach((name, index) => {
      insertOrganization.run(
        index + 1,
        name,
        `Simulated organization: ${name}`
      );
    });

    for (let index = 0; index < 100; index++) {
      const studentId = index + 1;

      // % cycles through the short lists. Math.floor moves to the next surname
      // after ten first names, giving 100 repeatable simulated combinations.
      const firstName = firstNames[index % firstNames.length];
      const lastName = lastNames[
        Math.floor(index / firstNames.length)
      ];

      const course = courses[index % courses.length];

      insertStudent.run(
        studentId,
        `${firstName} ${lastName}`,
        course
      );

      // Give each student between one and four memberships.
      const membershipCount = (index % 4) + 1;

      for (let offset = 0; offset < membershipCount; offset++) {
        const organizationId = ((index + offset) % 6) + 1;

        insertMembership.run(studentId, organizationId);
      }
    }

    database.exec('COMMIT');

    console.log(
      'Sample data created: 100 students, 6 organizations, 250 memberships.'
    );
  } catch (error) {
    // Undo the entire seed if any insertion fails.
    database.exec('ROLLBACK');
    throw error;
  }
}

module.exports = { seedDatabase };
