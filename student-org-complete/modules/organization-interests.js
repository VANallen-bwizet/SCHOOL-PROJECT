// Editable simulated interest tags. These describe clubs, not student records.
const interestLabels = {
  technology: 'Technology', mathematics: 'Mathematics', speaking: 'Public speaking',
  arts: 'Arts and creativity', sports: 'Sports and fitness', music: 'Music',
  environment: 'Environment'
};
const organizationInterests = {
  'Computer Science Club': ['technology', 'mathematics'],
  'Mathematics Society': ['mathematics'],
  'Debate Society': ['speaking'],
  'Arts Guild': ['arts'],
  'Sports Club': ['sports'],
  'Music Club': ['music', 'arts'],
  'Environmental Society': ['environment']
};

function getOrganizationProfiles(organizations) {
  return organizations.map(organization => ({
    ...organization,
    // Only our own configured names are tags. Normal JavaScript objects also
    // inherit names such as "constructor", which are not organization entries.
    interests: Object.hasOwn(organizationInterests, organization.name)
      ? [...organizationInterests[organization.name]] : []
  }));
}

module.exports = { interestLabels, getOrganizationProfiles };
