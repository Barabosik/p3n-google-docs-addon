// src/marks.html, which finds a check's sentences in the text that was checked so they can be highlighted.
//   node --test dev/marks.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const html = await readFile(path.join(import.meta.dirname, '..', 'src', 'marks.html'), 'utf8');
const window = {};
vm.runInNewContext(html.replace(/^\s*<script>/, '').replace(/<\/script>\s*$/, ''), { window });
const { P3N_MARKS } = window;
// Arrays from the script's own context, as plain ones for deepEqual.
const plain = (f) => (...args) => JSON.parse(JSON.stringify(f(...args)));
const locate = plain(P3N_MARKS.locate);
const marksFor = plain(P3N_MARKS.marksFor);
const at = (text, range) => range && text.slice(...range);

test('curly quotes match straight ones, and the other way round', () => {
  const text = 'He said “it’s fine” and left. Then rain.';
  assert.equal(at(text, locate('He said "it\'s fine" and left.', text)), 'He said “it’s fine” and left.');
  assert.equal(at("It's done.", locate('It’s done.', "It's done.")), "It's done.");
});

test('whitespace runs match one space, line breaks and paragraph breaks too', () => {
  const text = 'First one.\n\nIt   spans\na break here. Last.';
  assert.equal(at(text, locate('It spans a break here.', text)), 'It   spans\na break here.');
  assert.deepEqual(locate('one. It spans', text), [6, 22]);
});

test('any case, and edge punctuation trimmed but kept where the text has it', () => {
  const text = 'Moreover, THIS IS GREAT. Next.';
  assert.equal(at(text, locate('moreover, this is great.', text)), 'Moreover, THIS IS GREAT.');
  assert.equal(at(text, locate('“Moreover, this is great!”', text)), 'Moreover, THIS IS GREAT');
  assert.equal(at(text, locate('...moreover, this is great', text)), 'Moreover, THIS IS GREAT');
});

test('a match starts and ends at word edges', () => {
  assert.equal(locate('art', 'The start of it.'), null);
  assert.deepEqual(locate('art.', 'Modern art. More art.'), [7, 11]);
});

test('a sentence that is not in the text is not found', () => {
  assert.equal(locate('Not here at all.', 'Something else entirely.'), null);
  assert.equal(locate('', 'Text.'), null);
  assert.equal(locate('...', 'Text...'), null);
});

test('a repeated sentence goes to its next occurrence, and a third copy is skipped', () => {
  const text = 'Great news. We won. Great news. Done.';
  const o = { sentences: [{ text: 'Great news.' }, { text: 'Great news.' }, { text: 'great news' }] };
  assert.deepEqual(marksFor(o, text).map((m) => at(text, [m.start, m.end])), ['Great news.', 'Great news.']);
  assert.deepEqual(marksFor(o, text).map((m) => m.start), [0, 20]);
});

test('only the listed sentences and pattern hits, kinds apart, in text order; unfound ones are skipped', () => {
  const text = 'Plain start. It’s not just a tool. Moreover, it unlocks potential. Fine end.';
  const o = {
    sentences: [{ text: 'Moreover, it unlocks potential.' }, { text: 'Missing sentence.' }],
    examples: [
      { sentence: "It's not just a tool.", rules: [] },
      { sentence: 'Moreover, it unlocks potential.', rules: [] }, // already a listed sentence: not marked twice
    ],
  };
  const marks = marksFor(o, text);
  assert.deepEqual(marks.map((m) => [m.kind, at(text, [m.start, m.end])]), [['hit', 'It’s not just a tool.'], ['ai', 'Moreover, it unlocks potential.']]);
});

test('nothing outside the checked text: offsets stay inside it', () => {
  // The document has the sentence elsewhere; the checked text (the selection) doesn't.
  const checked = 'We shipped on 14 March.';
  assert.deepEqual(marksFor({ sentences: [{ text: 'Moreover, it unlocks potential.' }] }, checked), []);
  const m = marksFor({ sentences: [{ text: 'We shipped on 14 March.' }] }, checked);
  assert.deepEqual(m, [{ start: 0, end: checked.length, kind: 'ai' }]);
});

test('lists as the result does: 5 sentences, then up to 6 pattern hits not among them', () => {
  const text = Array.from({ length: 12 }, (_, i) => `Sentence number ${i}.`).join(' ');
  const o = {
    sentences: Array.from({ length: 7 }, (_, i) => ({ text: `Sentence number ${i}.` })),
    examples: Array.from({ length: 12 }, (_, i) => ({ sentence: `Sentence number ${i}.` })),
  };
  const marks = marksFor(o, text);
  assert.equal(marks.filter((m) => m.kind === 'ai').length, 5);
  assert.equal(marks.filter((m) => m.kind === 'hit').length, 6);
});
