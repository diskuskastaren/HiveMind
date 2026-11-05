import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addSection, appendToSection, applyContentWrite, composeContent, hasSections, moveSection, noteSections,
  normalizeNoteSections, removeSection, resolveSection, restoreSection, updateSection, MAIN_SECTION_ID,
} from './noteSections.ts';

const plain = (content = '<p>Agenda</p>') => ({ id: 'n', projectIds: [], supplierIds: [], title: 'Sync', content, attendees: '', createdAt: 1, updatedAt: 1 });

test('a plain note has one implicit tab holding its content', () => {
  const note = plain();
  assert.equal(hasSections(note), false);
  assert.deepEqual(noteSections(note), [{ id: MAIN_SECTION_ID, title: 'Notes', content: '<p>Agenda</p>' }]);
  assert.equal(resolveSection(note, 'missing').id, MAIN_SECTION_ID);
});

test('adding a tab splits a plain note without changing its text', () => {
  const { note, sectionId } = addSection(plain());
  assert.equal(note.sections.length, 2);
  assert.equal(note.sections[0].title, 'Notes');
  assert.equal(note.sections[0].content, '<p>Agenda</p>');
  assert.equal(note.sections[1].id, sectionId);
  assert.equal(note.sections[1].title, 'Tab 2');
  assert.equal(note.content, '<h2>Notes</h2><p>Agenda</p><h2>Tab 2</h2>');
});

test('the content mirror escapes tab names', () => {
  assert.equal(composeContent([{ id: 'a', title: 'R&D <x>', content: '<p>1</p>' }]), '<h2>R&amp;D &lt;x&gt;</h2><p>1</p>');
});

test('editing, renaming and moving tabs keep the mirror current', () => {
  let { note, sectionId } = addSection(plain(), { title: 'Valves' });
  note = addSection(note, { title: 'Pricing' }).note;
  note = updateSection(note, sectionId, { content: '<p>Lead time</p>', title: '  Valve delivery ' });
  assert.equal(note.sections[1].title, 'Valve delivery');
  note = updateSection(note, sectionId, { title: '   ' });
  assert.equal(note.sections[1].title, 'Valve delivery', 'an empty name is not saved');
  note = moveSection(note, sectionId, 0);
  assert.deepEqual(note.sections.map((s) => s.title), ['Valve delivery', 'Notes', 'Pricing']);
  assert.equal(note.content, composeContent(note.sections));
  assert.match(note.content, /^<h2>Valve delivery<\/h2><p>Lead time<\/p>/);
});

test('removing the second-to-last tab makes the note plain, and undo splits it again', () => {
  const split = addSection(plain(), { title: 'Valves', content: '<p>V</p>' });
  const { note, removed } = removeSection(split.note, split.sectionId);
  assert.equal(hasSections(note), false);
  assert.equal('sections' in note, false);
  assert.equal(note.content, '<p>Agenda</p>');
  assert.equal(removed.remainingTitle, 'Notes');
  const restored = restoreSection(note, removed);
  assert.deepEqual(restored.sections.map((s) => [s.title, s.content]), [['Notes', '<p>Agenda</p>'], ['Valves', '<p>V</p>']]);
  assert.equal(restored.sections[1].id, split.sectionId);
});

test('text is appended to the tab being shown', () => {
  const split = addSection(plain(), { title: 'Valves', content: '<p>V</p>' });
  const note = appendToSection(split.note, split.sectionId, '<h2>Meeting Summary</h2>');
  assert.equal(note.sections[1].content, '<p>V</p><h2>Meeting Summary</h2>');
  assert.equal(appendToSection(plain(), undefined, '<p>x</p>').content, '<p>Agenda</p><p>x</p>');
});

test('a direct write to the mirror is routed into the tabs without losing anything', () => {
  const split = addSection(plain(), { title: 'Valves' });
  const appended = applyContentWrite(split.note, split.sectionId, `${split.note.content}<p>Added</p>`);
  assert.equal(appended.sections[1].content, '<p>Added</p>');
  const replaced = applyContentWrite(split.note, split.sectionId, '<p>Something else</p>');
  assert.equal(replaced.sections.length, 3);
  assert.deepEqual(replaced.sections[2], { ...replaced.sections[2], title: 'Recovered', content: '<p>Something else</p>' });
});

test('loading repairs malformed tabs and keeps text edited outside the tabs', () => {
  const untouched = plain();
  assert.equal(normalizeNoteSections(untouched), untouched, 'a plain note is returned unchanged');

  const single = normalizeNoteSections({ ...plain(''), sections: [{ id: 'a', title: 'Only', content: '<p>A</p>' }, { bad: true }] });
  assert.equal('sections' in single, false);
  assert.equal(single.content, '<p>A</p>');

  const sections = [{ id: 'a', title: 'One', content: '<p>1</p>' }, { id: 'a', title: 'Two', content: '<p>2</p>' }];
  const repaired = normalizeNoteSections({ ...plain(''), sections });
  assert.notEqual(repaired.sections[0].id, repaired.sections[1].id, 'duplicate ids are renewed');
  assert.equal(repaired.content, composeContent(repaired.sections));

  const consistent = { ...plain(composeContent(sections.map((s, i) => ({ ...s, id: `s${i}` })))), sections: sections.map((s, i) => ({ ...s, id: `s${i}` })) };
  assert.equal(normalizeNoteSections(consistent), consistent, 'a consistent note is returned unchanged');

  const edited = normalizeNoteSections({ ...consistent, content: `${consistent.content}<p>typed in 1.7</p>` });
  assert.equal(edited.sections.length, 3);
  assert.equal(edited.sections[2].title, 'Recovered');
  assert.match(edited.sections[2].content, /typed in 1\.7/);
  assert.equal(edited.content, composeContent(edited.sections));

  assert.equal('sections' in normalizeNoteSections({ ...plain(), sections: 'nope' }), false);
});
