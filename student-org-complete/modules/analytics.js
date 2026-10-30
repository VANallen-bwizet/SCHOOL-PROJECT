// Count each student's unique organization memberships.
function getParticipation(students, memberships) {
  const organizationsByStudent = new Map();

  // Include every student, even those with no memberships.
  for (const student of students) {
    organizationsByStudent.set(student.student_id, new Set());
  }

  // Add each organization to the correct student's set.
  for (const membership of memberships) {
    const organizationIds = organizationsByStudent.get(
      membership.student_id
    );

    if (!organizationIds) {
      throw new Error('A membership refers to an unknown student.');
    }

    organizationIds.add(membership.organization_id);
  }

  // Return student details together with their membership counts.
  return students.map(student => {
    const organizationIds = organizationsByStudent.get(
      student.student_id
    );

    return {
      ...student,
      organizationIds: [...organizationIds],
      membershipCount: organizationIds.size
    };
  });
}

// Students belonging to exactly one organization.
function getExactlyOne(participation) {
  return participation.filter(
    student => student.membershipCount === 1
  );
}

// Students belonging to three or more organizations.
function getAtLeastThree(participation) {
  return participation.filter(
    student => student.membershipCount >= 3
  );
}

// Compare two membership sets using their overlap.
function jaccardSimilarity(setA, setB) {
  let sharedCount = 0;

  for (const studentId of setA) {
    if (setB.has(studentId)) {
      sharedCount++;
    }
  }

  const uniqueCount = setA.size + setB.size - sharedCount;

  // Convention: two empty sets have identical memberships.
  const similarity = uniqueCount === 0
    ? 1
    : sharedCount / uniqueCount;

  return {
    sharedCount,
    uniqueCount,
    similarity
  };
}

function rankOrganizationPairs(organizations, memberships) {
  const membersByOrganization = new Map();

  // Create a membership set for every organization.
  for (const organization of organizations) {
    membersByOrganization.set(
      organization.organization_id,
      new Set()
    );
  }

  // Fill the membership sets.
  for (const membership of memberships) {
    const memberIds = membersByOrganization.get(
      membership.organization_id
    );

    if (!memberIds) {
      throw new Error('A membership refers to an unknown organization.');
    }

    memberIds.add(membership.student_id);
  }

  const pairs = [];

  // Compare each distinct pair once.
  for (let first = 0; first < organizations.length; first++) {
    for (
      let second = first + 1;
      second < organizations.length;
      second++
    ) {
      const organizationA = organizations[first];
      const organizationB = organizations[second];

      const comparison = jaccardSimilarity(
        membersByOrganization.get(organizationA.organization_id),
        membersByOrganization.get(organizationB.organization_id)
      );

      pairs.push({
        organizationAId: organizationA.organization_id,
        organizationAName: organizationA.name,
        organizationBId: organizationB.organization_id,
        organizationBName: organizationB.name,
        ...comparison
      });
    }
  }

  // Highest similarity first, then most shared members.
  pairs.sort((a, b) =>
    b.similarity - a.similarity ||
    b.sharedCount - a.sharedCount ||
    a.organizationAId - b.organizationAId ||
    a.organizationBId - b.organizationBId
  );

  return pairs;
}

// Rank organizations by how many of their members also join other clubs.
function rankOrganizations(organizations, memberships) {
  const sets = new Map(organizations.map(org => [org.organization_id, new Set()]));
  const studentOrganizations = new Map();
  for (const row of memberships) {
    if (!sets.has(row.organization_id)) throw new Error('Unknown organization.');
    sets.get(row.organization_id).add(row.student_id);
    if (!studentOrganizations.has(row.student_id)) studentOrganizations.set(row.student_id, new Set());
    studentOrganizations.get(row.student_id).add(row.organization_id);
  }
  const pairs = rankOrganizationPairs(organizations, memberships);
  return organizations.map(org => {
    const members = sets.get(org.organization_id);
    // A person in three clubs counts once here, rather than once per other club.
    const sharedMemberCount = [...members].filter(id => studentOrganizations.get(id).size > 1).length;
    const comparisons = pairs.filter(pair =>
      pair.organizationAId === org.organization_id || pair.organizationBId === org.organization_id
    );
    return {
      organizationId: org.organization_id,
      name: org.name,
      memberCount: members.size,
      sharedMemberCount,
      overlapRate: members.size ? sharedMemberCount / members.size : 0,
      averageSimilarity: comparisons.length
        ? comparisons.reduce((sum, pair) => sum + pair.similarity, 0) / comparisons.length : 0
    };
  }).sort((a, b) => b.sharedMemberCount - a.sharedMemberCount ||
    b.overlapRate - a.overlapRate || a.organizationId - b.organizationId);
}

// Explainable recommendations; interests are choices for this request only.
function recommendOrganizations(studentId, selectedInterests, organizations, memberships) {
  const interests = new Set(selectedInterests);
  const sets = new Map(organizations.map(org => [org.organization_id, new Set()]));
  for (const row of memberships) {
    if (!sets.has(row.organization_id)) throw new Error('Unknown organization.');
    sets.get(row.organization_id).add(row.student_id);
  }
  const joined = organizations.filter(org => sets.get(org.organization_id).has(studentId));
  return organizations.filter(org => !sets.get(org.organization_id).has(studentId)).map(org => {
    const matchedInterests = [...interests].filter(interest => (org.interests || []).includes(interest));
    const interestScore = interests.size ? matchedInterests.length / interests.size : 0;
    const membershipScore = joined.length ? joined.reduce((sum, existing) =>
      sum + jaccardSimilarity(sets.get(org.organization_id), sets.get(existing.organization_id)).similarity, 0
    ) / joined.length : 0;
    // Use both signals when available; otherwise use the available signal alone.
    let score;
    if (interests.size > 0 && joined.length > 0) {
      score = 0.6 * interestScore + 0.4 * membershipScore;
    } else if (interests.size > 0) {
      score = interestScore;
    } else {
      score = membershipScore;
    }
    return {
      organizationId: org.organization_id, name: org.name, score,
      interestScore, membershipScore, matchedInterests,
      currentOrganizationCount: joined.length
    };
  }).filter(org => org.score > 0).sort((a, b) => b.score - a.score || a.organizationId - b.organizationId);
}

module.exports = {
  getParticipation,
  getExactlyOne,
  getAtLeastThree,
  jaccardSimilarity,
  rankOrganizationPairs,
  rankOrganizations,
  recommendOrganizations
};
