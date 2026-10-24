/** Fictional, self-contained workspace shared by the app sandbox and HyperFrames capture. */
export function createDemoState(now = Date.now()) {
  const day = 86400000;
  const projectId = 'demo-project-solstice';
  const velaId = 'demo-supplier-vela';
  const mosaicId = 'demo-supplier-mosaic';
  const meetingId = 'demo-note-pilot';
  const packagingId = 'demo-note-packaging';
  const rawText = '09:05 Nora: We will send the controller bill of materials by Tuesday. 09:12 Eli: The enclosure fit check is the last gate before the pilot run. 09:18 Ari: Please request a revised packaging estimate from Mosaic.';
  let hash = 2166136261;
  for (const char of rawText) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const date = (daysFromNow) => new Date(now + daysFromNow * day).toISOString().slice(0, 10);

  return {
    projects: [{ id: projectId, name: 'Project Solstice', color: '#0891b2', archived: false, createdAt: now - 30 * day }],
    suppliers: [
      { id: velaId, name: 'Vela Components', color: '#3b82f6', pinned: true, defaultTemplate: null, projectIds: [projectId], createdAt: now - 20 * day },
      { id: mosaicId, name: 'Mosaic Enclosures', color: '#10b981', pinned: false, defaultTemplate: null, projectIds: [projectId], createdAt: now - 18 * day },
    ],
    notes: [
      {
        id: meetingId, projectIds: [projectId], supplierIds: [velaId], title: 'Pilot run planning', attendees: 'Nora Vale, Eli Park, Ari Morgan',
        content: '<h2>Pilot run planning</h2><p>We reviewed controller readiness and the final enclosure check for the pilot run.</p><h3>Agreed next steps</h3><ul><li><p>Vela will send the controller bill of materials by Tuesday.</p></li><li><p>Release the pilot run after the enclosure fit check passes.</p></li></ul>',
        createdAt: now - 2 * day, updatedAt: now - day,
        transcripts: [{ id: 'demo-transcript-pilot', rawText, summary: 'Controller BOM due Tuesday; enclosure fit is the final pilot gate.', duration: 84, recordedAt: now - day,
          analysis: { sourceHash: (hash >>> 0).toString(16), analyzedAt: now - day, model: 'gpt-4o-mini', suggestions: [
            { id: 'demo-suggestion-bom', kind: 'task', text: 'Review controller bill of materials', owner: 'Nora Vale', dueDate: date(2), priority: 'high', sourceQuote: 'send the controller bill of materials by Tuesday', timestampSeconds: 5, status: 'pending', saveAs: 'task', projectId },
            { id: 'demo-suggestion-packaging', kind: 'followup', text: 'Request revised packaging estimate', owner: 'Ari Morgan', dueDate: date(5), priority: 'medium', sourceQuote: 'request a revised packaging estimate', timestampSeconds: 18, status: 'pending', saveAs: 'followup', projectId },
          ] } }],
      },
      { id: packagingId, projectIds: [projectId], supplierIds: [mosaicId], title: 'Enclosure sample check', attendees: 'Eli Park, Jules Reed', content: '<p>New enclosure samples are ready for fit and finish review. Confirm the packaging specification before dispatch.</p>', createdAt: now - 6 * day, updatedAt: now - 3 * day, transcripts: [] },
    ],
    tasks: [
      { id: 'demo-task-bom', projectId, supplierId: velaId, noteId: meetingId, title: 'Review controller bill of materials', status: 'open', priority: 'high', owner: 'Nora Vale', dueDate: date(2), description: '', createdAt: now - day },
      { id: 'demo-task-fit', projectId, supplierId: mosaicId, noteId: packagingId, title: 'Approve enclosure samples', status: 'doing', priority: 'medium', owner: 'Eli Park', dueDate: date(5), description: '', createdAt: now - 3 * day },
      { id: 'demo-task-test', projectId, supplierId: velaId, noteId: meetingId, title: 'Share vibration test results', status: 'done', priority: 'low', owner: 'Ari Morgan', dueDate: '', description: '', createdAt: now - 4 * day },
    ],
    decisions: [{ id: 'demo-decision-pilot', projectId, supplierId: velaId, noteId: meetingId, text: 'Release the pilot run after the enclosure fit check passes', status: 'active', rationale: 'The controller design is ready; enclosure fit is the remaining gate.', createdAt: now - day, history: [{ id: 'demo-decision-history', timestamp: now - day, action: 'created', text: 'Release the pilot run after the enclosure fit check passes', status: 'active' }] }],
    followUps: [{ id: 'demo-followup-estimate', projectId, supplierId: mosaicId, noteId: packagingId, text: 'Request revised packaging estimate', status: 'open', createdAt: now - 2 * day }],
    activeProjectId: projectId, openTabs: [velaId], activeTabId: velaId, activeNoteId: meetingId, rightPanelOpen: true,
    settings: { openaiApiKey: '', groqApiKey: '', gptModel: 'gpt-4o-mini', temperature: 0.3, customSummaryInstructions: '', defaultAudioMode: 'system', chunkIntervalSeconds: 60, autoStopHours: 4, teamsEnabled: false, theme: 'dark', releaseVersionDraft: '', releaseNotesDraft: '', releaseHistory: [] },
  };
}
