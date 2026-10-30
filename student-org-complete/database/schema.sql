-- Apply relationship checks to the connection executing this schema.
-- db.js enables this again whenever the application opens a connection.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS students (
    student_id INTEGER PRIMARY KEY,
    full_name TEXT NOT NULL,
    course TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organizations (
    organization_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS memberships (
    student_id INTEGER NOT NULL,
    organization_id INTEGER NOT NULL,
    joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- The pair is unique. A student may still join several different clubs.
    PRIMARY KEY (student_id, organization_id),

    -- Deleting a student/organization removes its membership links, not the
    -- other students or organizations that remain in their own tables.
    FOREIGN KEY (student_id)
        REFERENCES students(student_id)
        ON DELETE CASCADE,

    FOREIGN KEY (organization_id)
        REFERENCES organizations(organization_id)
        ON DELETE CASCADE
);


