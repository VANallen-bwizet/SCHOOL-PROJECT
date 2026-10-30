const { contextBridge, ipcRenderer } = require('electron');
// Preload is a small controlled bridge. Expose specific methods rather than
// ipcRenderer itself, so page scripts cannot send arbitrary privileged requests.
contextBridge.exposeInMainWorld('appInfo', {
  platformLabel: 'Electron desktop application'
});
contextBridge.exposeInMainWorld('studentAPI', {
  getStudents: () => ipcRenderer.invoke('students:list')
});
// Give the page two specific organization actions.
contextBridge.exposeInMainWorld('organizationAPI', {
  getOrganizations: () =>
    ipcRenderer.invoke('organizations:list'),

  getMembers: (organizationId) =>
    ipcRenderer.invoke('organizations:members', organizationId)
});

// Expose membership changes, raw-row inspection, and the saved-membership audit.
contextBridge.exposeInMainWorld('membershipAPI', {
  addMembership: (studentId, organizationId) =>
    ipcRenderer.invoke('memberships:add', studentId, organizationId),

  removeMembership: (studentId, organizationId) =>
    ipcRenderer.invoke('memberships:remove', studentId, organizationId),
  inspect: rows => ipcRenderer.invoke('memberships:inspect', rows),
  audit: () => ipcRenderer.invoke('memberships:audit')
});

// Arrow functions forward arguments and return a Promise, which renderer awaits.
contextBridge.exposeInMainWorld('setAPI', {
  union: (organizationIds) =>
    ipcRenderer.invoke('sets:union', organizationIds),

  intersection: (organizationIds) =>
    ipcRenderer.invoke('sets:intersection', organizationIds),

  difference: (organizationAId, organizationBId) =>
    ipcRenderer.invoke(
      'sets:difference',
      organizationAId,
      organizationBId
    ),
  symmetricDifference: (organizationAId, organizationBId) =>
    ipcRenderer.invoke(
      'sets:symmetric-difference',
      organizationAId,
      organizationBId
    ),

  checkRelations: (organizationAId, organizationBId) =>
    ipcRenderer.invoke('sets:relations', organizationAId, organizationBId),

  complement: (organizationId) =>
    ipcRenderer.invoke('sets:complement', organizationId),
  powerSet: (studentIds, maximumSize) =>
    ipcRenderer.invoke('sets:power-set', studentIds, maximumSize)
});

// Let the page request a participation analytics view.
contextBridge.exposeInMainWorld('analyticsAPI', {
  getParticipation: (view) =>
    ipcRenderer.invoke('analytics:participation', view),

  getSimilarity: () =>
    ipcRenderer.invoke('analytics:similarity'),
  getRecommendationOptions: () => ipcRenderer.invoke('analytics:recommendation-options'),
  getRecommendations: (studentId, interests) =>
    ipcRenderer.invoke('analytics:recommendations', studentId, interests)
});

// File operations remain in main. The page supplies a report key, never a path;
// exports use a native Save dialog so a page cannot choose a silent write target.
contextBridge.exposeInMainWorld('projectAPI', {
  overview: () => ipcRenderer.invoke('project:overview'),
  committee: options => ipcRenderer.invoke('project:committee', options),
  verify: (a, b) => ipcRenderer.invoke('project:verification', a, b),
  benchmark: () => ipcRenderer.invoke('project:benchmark'),
  exportDataset: () => ipcRenderer.invoke('project:export'),
  report: name => ipcRenderer.invoke('project:report', name)
});

