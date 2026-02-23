export const TEMPLATES: Record<string, { name: string; content: string }> = {
  standard: {
    name: 'Standard Meeting',
    content: [
      '<h2>Agenda</h2><ul><li><p></p></li></ul>',
      '<h2>Open Issues</h2><ul><li><p></p></li></ul>',
      '<h2>Discussion</h2><p></p>',
      '<h2>Decisions</h2><ul><li><p></p></li></ul>',
      '<h2>Action Items</h2><ul><li><p></p></li></ul>',
      '<h2>Risks / Blockers</h2><ul><li><p></p></li></ul>',
      '<h2>Next Steps</h2><ul><li><p></p></li></ul>',
    ].join(''),
  },
  quick: {
    name: 'Quick Sync',
    content: [
      '<h2>Updates</h2><p></p>',
      '<h2>Blockers</h2><p></p>',
      '<h2>Action Items</h2><ul><li><p></p></li></ul>',
    ].join(''),
  },
  technical: {
    name: 'Technical Review',
    content: [
      '<h2>Topic</h2><p></p>',
      '<h2>Technical Details</h2><p></p>',
      '<h2>Open Questions</h2><ul><li><p></p></li></ul>',
      '<h2>Decisions</h2><ul><li><p></p></li></ul>',
      '<h2>Action Items</h2><ul><li><p></p></li></ul>',
      '<h2>Risks</h2><ul><li><p></p></li></ul>',
    ].join(''),
  },
  commercial: {
    name: 'Commercial Review',
    content: [
      '<h2>Pricing Discussion</h2><p></p>',
      '<h2>Terms & Conditions</h2><p></p>',
      '<h2>Capacity / Lead Time</h2><p></p>',
      '<h2>Decisions</h2><ul><li><p></p></li></ul>',
      '<h2>Action Items</h2><ul><li><p></p></li></ul>',
      '<h2>Next Steps</h2><ul><li><p></p></li></ul>',
    ].join(''),
  },
};

export const getTemplateContent = (key: string | null): string => {
  if (!key || !TEMPLATES[key]) return '';
  return TEMPLATES[key].content;
};

export const TEMPLATE_OPTIONS = Object.entries(TEMPLATES).map(([key, t]) => ({
  key,
  name: t.name,
}));
