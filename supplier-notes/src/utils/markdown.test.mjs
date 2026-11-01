import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSummaryMarkdown, summaryToHtml, summaryToNoteHtml, summaryToEmailHtml, summaryToPlainText } from './markdown.ts';

const sample = `### Overview
The supplier confirmed **pilot capacity** for *March*.

**Decisions:**
* Ship samples by week 12
* Use the revised enclosure

1. Nora sends the BOM
2) Eli books the fit check
Closing remarks <script>alert(1)</script> & thanks.`;

test('parses the markdown shapes models actually produce', () => {
  const blocks = parseSummaryMarkdown(sample);
  assert.deepEqual(blocks.map((b) => b.kind), ['heading', 'paragraph', 'heading', 'list', 'list', 'paragraph']);
  assert.equal(blocks[2].text, 'Decisions:');
  assert.deepEqual(blocks[3].items, ['Ship samples by week 12', 'Use the revised enclosure']);
  assert.equal(blocks[4].ordered, true);
  assert.equal(blocks[4].items.length, 2);
});

test('renders lists inside list elements and escapes model output', () => {
  for (const html of [summaryToHtml(sample), summaryToNoteHtml(sample), summaryToEmailHtml(sample)]) {
    assert.ok(!html.includes('<script>'), 'markup from the model is escaped');
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(!/(^|>)\s*<li/.test(html.replace(/<(ul|ol)[^>]*>/g, '')) || /<(ul|ol)[^>]*><li/.test(html), 'list items are wrapped');
    assert.ok(!html.includes('###') && !html.includes('* Ship'), 'no raw markdown left');
  }
  assert.match(summaryToNoteHtml(sample), /<h3>Overview<\/h3>/);
  assert.match(summaryToNoteHtml(sample), /<ol><li><p>Nora sends the BOM<\/p><\/li>/);
  assert.match(summaryToHtml(sample), /<strong>pilot capacity<\/strong>/);
  assert.match(summaryToHtml(sample), /<em>March<\/em>/);
});

test('plain text keeps structure without markup', () => {
  const text = summaryToPlainText(sample);
  assert.match(text, /^Overview\n\nThe supplier confirmed pilot capacity/);
  assert.match(text, /• Ship samples by week 12\n• Use the revised enclosure/);
  assert.match(text, /1\. Nora sends the BOM\n2\. Eli books the fit check/);
  assert.ok(!text.includes('**'));
});
