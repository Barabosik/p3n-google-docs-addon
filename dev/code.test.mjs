// Code.js against a small in-memory stand-in for DocumentApp: reading the selection, replacing it paragraph by
// paragraph, formatting, the trailing "\n", and the refusals. The stand-in follows the documented behaviour
// (Text elements with per-character attributes, range elements with inclusive offsets); how real Docs inherits
// formatting on insert, groups Undo and so on is checked in Docs itself (README, Tests).
//   node --test dev/code.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const ATTRS = ['BOLD', 'ITALIC', 'UNDERLINE', 'STRIKETHROUGH', 'FONT_FAMILY', 'FONT_SIZE', 'FOREGROUND_COLOR', 'BACKGROUND_COLOR', 'LINK_URL'];
const ET = Object.fromEntries(['TEXT', 'PARAGRAPH', 'LIST_ITEM', 'TABLE', 'INLINE_IMAGE', 'BODY_SECTION'].map((k) => [k, k]));

class Text {
  constructor(text, attrs = {}) { this.text = text; this.at = [...text].map(() => ({ ...attrs })); this.parent = null; this.writes = 0; this.ranges = []; }
  getType() { return ET.TEXT; }
  asText() { return this; }
  getParent() { return this.parent; }
  getText() { return this.text; }
  // Inserted text takes the attributes of the character before it (the first one at offset 0).
  insertText(off, s) {
    assert.ok(off >= 0 && off <= this.text.length, `insertText offset ${off} out of range`);
    const like = { ...(this.at[off - 1] ?? this.at[0] ?? {}) };
    this.text = this.text.slice(0, off) + s + this.text.slice(off);
    this.at.splice(off, 0, ...[...s].map(() => ({ ...like })));
    // Named ranges follow: text typed inside one stretches it, text typed at or before its start moves it.
    for (const r of this.ranges) {
      if (off <= r.s) { r.s += s.length; r.e += s.length; } else if (off <= r.e) r.e += s.length;
    }
    this.writes++;
    return this;
  }
  appendText(s) { return this.insertText(this.text.length, s); }
  deleteText(s, e) {
    assert.ok(s >= 0 && e < this.text.length && s <= e, `deleteText ${s}..${e} out of range`);
    this.text = this.text.slice(0, s) + this.text.slice(e + 1);
    this.at.splice(s, e - s + 1);
    const n = e - s + 1;
    const shift = (p, edge) => (p < s ? p : p > e ? p - n : edge);
    for (const r of this.ranges) { r.s = shift(r.s, s); r.e = shift(r.e, s - 1); if (r.e < r.s) r.gone = true; }
    this.writes++;
    return this;
  }
  getTextAttributeIndices() {
    const out = [];
    this.at.forEach((a, i) => { if (!i || JSON.stringify(a) !== JSON.stringify(this.at[i - 1])) out.push(i); });
    return out.length ? out : [0];
  }
  getAttributes(off) { return Object.fromEntries(ATTRS.map((k) => [k, this.at[off]?.[k] ?? null])); }
  setAttributes(s, e, attrs) { for (let i = s; i <= e; i++) Object.assign(this.at[i], attrs); return this; }
  setLinkUrl(s, e, url) { for (let i = s; i <= e; i++) this.at[i].LINK_URL = url; return this; }
  getBackgroundColor(off) { return this.at[off]?.BACKGROUND_COLOR ?? null; }
  setBackgroundColor(s, e, c) { assert.ok(s >= 0 && e < this.text.length && s <= e, `setBackgroundColor ${s}..${e} out of range`); for (let i = s; i <= e; i++) this.at[i].BACKGROUND_COLOR = c; return this; }
  bgs() { return this.at.map((a) => a.BACKGROUND_COLOR ?? null); }
  attrAt(off, k) { return this.at[off]?.[k] ?? null; }
}

class Container {
  constructor(type, children = [], props = {}) { this.type = type; this.children = []; this.parent = null; Object.assign(this, props); children.forEach((c) => this.append(c)); }
  append(c) { c.parent = this; this.children.push(c); return c; }
  getType() { return this.type; }
  getParent() { return this.parent; }
  getNumChildren() { return this.children.length; }
  getChild(i) { return this.children[i]; }
  getChildIndex(c) { const i = this.children.indexOf(c); assert.ok(i >= 0); return i; }
  getText() { return this.children.map((c) => (c.getText ? c.getText() : '')).join(''); }
  removeFromParent() {
    const p = this.parent;
    if (p.type === ET.BODY_SECTION && p.children[p.children.length - 1] === this) throw new Error("Can't remove the last paragraph in a document section.");
    p.children.splice(p.children.indexOf(this), 1);
    this.parent = null;
  }
}

const para = (text, attrs, props) => new Container(ET.PARAGRAPH, text == null ? [] : [new Text(text, attrs)], props);
const re = (el, s, e) => ({ getElement: () => el, isPartial: () => s != null, getStartOffset: () => s ?? -1, getEndOffsetInclusive: () => e ?? -1 });

function makeDoc(...paras) {
  const body = new Container(ET.BODY_SECTION, paras);
  const doc = {
    body, selection: null,
    getBody: () => body,
    getSelection: () => doc.selection && { getRangeElements: () => doc.selection },
    setSelection: (r) => { doc.selection = r.getRangeElements(); },
    newRange: () => { const els = []; const b = { addElement: (el, s, e) => { els.push(re(el, s, e)); return b; }, build: () => ({ getRangeElements: () => els }) }; return b; },
    // Named ranges over one Text element each, which follow edits to it (Text.insertText, deleteText).
    named: new Map(),
    addNamedRange: (name, range) => {
      const [r] = range.getRangeElements();
      const el = r.getElement();
      const id = `kix.${doc.named.size + 1}`;
      const nr = { id, name, el, s: r.getStartOffset(), e: r.getEndOffsetInclusive() };
      el.ranges.push(nr);
      doc.named.set(id, nr);
      return { getId: () => id };
    },
    getNamedRangeById: (id) => {
      const nr = doc.named.get(id);
      if (!nr || nr.gone) return null;
      return {
        getRange: () => ({ getRangeElements: () => [re(nr.el, nr.s, nr.e)] }),
        remove: () => { doc.named.delete(id); nr.el.ranges.splice(nr.el.ranges.indexOf(nr), 1); },
      };
    },
  };
  // findText over the body's Text elements in order, continuing after `from`.
  body.findText = (pattern, from) => {
    const rx = new RegExp(pattern, 'g');
    let started = !from;
    const texts = [];
    const walk = (n) => (n instanceof Text ? texts.push(n) : n.children?.forEach(walk));
    walk(body);
    for (const t of texts) {
      rx.lastIndex = 0;
      if (!started) {
        if (t !== from.getElement()) continue;
        started = true;
        rx.lastIndex = from.getEndOffsetInclusive() + 1;
      }
      const m = rx.exec(t.text);
      if (m) return re(t, m.index, m.index + m[0].length - 1);
    }
    return null;
  };
  return doc;
}

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src');

// Code.js, plus dev.js as in a dev push, with the user's properties and the sidebar stubbed. `shown` collects
// the sidebars opened.
async function load(doc, { dev = false, props = {}, docProps = new Map() } = {}) {
  const read = (name) => readFile(path.join(SRC, name), 'utf8');
  const code = (await read('Code.js')) + (dev ? `\n${await read('dev.js')}` : '');
  const store = new Map(Object.entries(props));
  const propsOf = (m) => ({ getProperty: (k) => m.get(k) ?? null, setProperty: (k, v) => m.set(k, v), deleteProperty: (k) => m.delete(k) });
  const shown = [];
  const ctx = vm.createContext({
    DocumentApp: {
      ElementType: ET, Attribute: Object.fromEntries(ATTRS.map((k) => [k, k])), getActiveDocument: () => doc,
      getUi: () => ({ showSidebar: (page) => shown.push(page) }),
    },
    PropertiesService: { getUserProperties: () => propsOf(store), getDocumentProperties: () => propsOf(docProps) },
    HtmlService: { createTemplateFromFile: () => { const t = { evaluate: () => ({ setTitle: () => t }) }; return t; } },
  });
  const api = vm.runInContext(`${code}\n;({ getSelectedText, replaceSelection, blocksOf_, plan_, saveKey, showSidebar, highlight, clearHighlights, clean_, cleanMap_ })`, ctx);
  return Object.assign(api, { shown, docProps });
}

const textOf = (p) => p.children[0].text;

test('blocksOf_ drops the trailing line break and empty paragraphs', async () => {
  const c = await load(makeDoc(para('x')));
  assert.deepEqual([...c.blocksOf_('One.\n\nTwo.\n')], ['One.', 'Two.']);
  assert.deepEqual([...c.blocksOf_('One.\n \n\n\nTwo.')], ['One.', 'Two.']);
  assert.deepEqual([...c.blocksOf_('\n')], []);
});

test('plan_ maps one to one, empties the rest, or joins the surplus', async () => {
  const c = await load(makeDoc(para('x')));
  assert.deepEqual([...c.plan_(['a', 'b'], ['A', 'B'])], ['A', 'B']);
  assert.deepEqual([...c.plan_(['a', 'b', 'c'], ['A'])], ['A', '', '']);
  assert.deepEqual([...c.plan_(['a', 'b'], ['A', 'B', 'C'])], ['A', 'B C']);
});

test('reads a selection across paragraphs with blank lines between, soft breaks as \\n', async () => {
  const p0 = para('Intro text here.');
  const p1 = para('Line one\rline two');
  const p2 = para('');
  const p3 = para('Tail starts here and goes on.');
  const doc = makeDoc(p0, p1, p2, p3);
  doc.selection = [re(p0.children[0], 6, 15), re(p1), re(p2), re(p3.children[0], 0, 10)];
  const c = await load(doc);
  const got = c.getSelectedText();
  assert.equal(got.text, 'text here.\n\nLine one\nline two\n\nTail starts');
  assert.equal(got.blocked, null);
});

test('a tab between words goes over as a space, not glued together', async () => {
  const p = para('Owner:	Maja');
  const doc = makeDoc(p);
  doc.selection = [re(p)];
  const c = await load(doc);
  assert.equal(c.getSelectedText().text, 'Owner: Maja');
});

test('replaces a word range in place, in the formatting most of it had, without a trailing paragraph', async () => {
  const p = para('Hello brave new world.');
  const t = p.children[0];
  for (let i = 6; i <= 10; i++) t.at[i].BOLD = true; // "brave" bold, " new" plain
  const doc = makeDoc(p);
  doc.selection = [re(t, 6, 14)];
  const c = await load(doc);
  const r = c.replaceSelection('brave new', 'bold\n');
  assert.equal(r.ok, true);
  assert.equal(r.text, 'bold');
  assert.equal(t.text, 'Hello bold world.');
  assert.equal(doc.body.children.length, 1);
  for (let i = 6; i <= 9; i++) assert.equal(t.attrAt(i, 'BOLD'), true);
  assert.equal(t.attrAt(5, 'BOLD'), null);
  assert.equal(t.attrAt(10, 'BOLD'), null);
  // The new text is what's selected now.
  const [sel] = doc.selection;
  assert.deepEqual([sel.getStartOffset(), sel.getEndOffsetInclusive()], [6, 9]);
});

test('keeps the spaces at the edges of the selection', async () => {
  const p = para('Hello brave new world.');
  const doc = makeDoc(p);
  doc.selection = [re(p.children[0], 6, 11)]; // "brave " as a double-click selects it
  const c = await load(doc);
  assert.equal(c.replaceSelection('brave', 'bold\n').ok, true);
  assert.equal(textOf(p), 'Hello bold new world.');
});

test('a whole paragraph, the end of its Text element', async () => {
  const p = para('Moreover, this unlocks a rich tapestry of possibilities.');
  const doc = makeDoc(p, para('Next.'));
  doc.selection = [re(p)];
  const c = await load(doc);
  assert.equal(c.replaceSelection(textOf(p), 'This opens many possibilities.\n').ok, true);
  assert.equal(textOf(p), 'This opens many possibilities.');
  assert.equal(doc.body.children.length, 2);
});

test('several paragraphs: each gets its own, keeps its style, and untouched ones are left alone', async () => {
  const h = para('Quarterly update', {}, { heading: 'HEADING2' });
  const p1 = para('In today\'s world, teams leverage tools.');
  const p2 = para('Moreover, it unlocks potential. Then more text.');
  const doc = makeDoc(h, p1, p2);
  doc.selection = [re(h), re(p1), re(p2.children[0], 0, 31)];
  const c = await load(doc);
  const sent = c.getSelectedText().text;
  assert.equal(sent, 'Quarterly update\n\nIn today\'s world, teams leverage tools.\n\nMoreover, it unlocks potential.');
  const r = c.replaceSelection(sent, 'Quarterly update\n\nTeams use tools.\n\nIt helps.\n');
  assert.equal(r.ok, true);
  assert.equal(r.text, 'Quarterly update\n\nTeams use tools.\n\nIt helps.');
  assert.equal(h.children[0].writes, 0, 'the unchanged heading was not written');
  assert.equal(h.heading, 'HEADING2');
  assert.equal(textOf(p1), 'Teams use tools.');
  assert.equal(textOf(p2), 'It helps. Then more text.');
  assert.equal(doc.body.children.length, 3);
  assert.equal(doc.selection.length, 3);
});

test('a link is kept only when the whole selection was that link', async () => {
  const p = para('See the pricing page today.');
  const t = p.children[0];
  for (let i = 8; i <= 19; i++) t.at[i].LINK_URL = 'https://p3n.si/pricing';
  const doc = makeDoc(p);
  doc.selection = [re(t, 4, 25)]; // "the pricing page today", partly a link
  const c = await load(doc);
  c.replaceSelection('the pricing page today', 'our prices\n');
  assert.equal(t.text, 'See our prices.');
  for (let i = 4; i <= 13; i++) assert.equal(t.attrAt(i, 'LINK_URL'), null);

  const q = para('See the pricing page.');
  const u = q.children[0];
  for (let i = 8; i <= 19; i++) u.at[i].LINK_URL = 'https://p3n.si/pricing';
  const doc2 = makeDoc(q);
  doc2.selection = [re(u, 8, 19)];
  const c2 = await load(doc2);
  c2.replaceSelection('pricing page', 'prices\n');
  assert.equal(u.text, 'See the prices.');
  for (let i = 8; i <= 13; i++) assert.equal(u.attrAt(i, 'LINK_URL'), 'https://p3n.si/pricing');
});

test('refuses when the text was edited since it was sent', async () => {
  // "brave new" was rewritten; meanwhile the user typed "bravo" and selected "Hello".
  const p = para('Hello bravo new world.');
  const doc = makeDoc(p);
  doc.selection = [re(p.children[0], 0, 4)];
  const c = await load(doc);
  assert.deepEqual({ ...c.replaceSelection('brave new', 'bold\n') }, { ok: false, reason: 'changed' });
  assert.equal(textOf(p), 'Hello bravo new world.');
});

test('selection gone: replaces the sent text where it appears exactly once', async () => {
  const p = para('Hello brave (new) world.');
  const doc = makeDoc(para('Intro.'), p);
  const c = await load(doc);
  const r = c.replaceSelection('brave (new)', 'bold\n');
  assert.equal(r.ok, true);
  assert.equal(textOf(p), 'Hello bold world.');

  const twice = makeDoc(para('brave new'), para('brave new'));
  const c2 = await load(twice);
  assert.deepEqual({ ...c2.replaceSelection('brave new', 'bold\n') }, { ok: false, reason: 'gone' });
});

test('won\'t write over a table or a picture, but still reads the text', async () => {
  const table = { getType: () => ET.TABLE, getParent: () => null, getText: () => 'Cell one\nCell two' };
  const p = para('Before the table.');
  const doc = makeDoc(p);
  doc.selection = [re(p), re(table)];
  const c = await load(doc);
  const got = c.getSelectedText();
  assert.equal(got.text, 'Before the table.\n\nCell one\n\nCell two');
  assert.equal(got.blocked, 'table');
  assert.equal(c.replaceSelection(got.text, 'x\n').reason, 'table');

  const q = para('Look at this');
  const img = { getType: () => ET.INLINE_IMAGE, getParent: () => q };
  q.children.push(img);
  const doc2 = makeDoc(q);
  doc2.selection = [re(q.children[0], 0, 11), re(img)];
  const c2 = await load(doc2);
  assert.equal(c2.getSelectedText().blocked, 'picture');
  assert.equal(c2.replaceSelection('Look at this', 'See\n').reason, 'picture');
  assert.equal(textOf(q), 'Look at this');
});

test('a paragraph the rewrite dropped is removed, the last one in the document stays', async () => {
  const p1 = para('First paragraph here.');
  const p2 = para('Second paragraph here.');
  const doc = makeDoc(p1, p2);
  doc.selection = [re(p1), re(p2)];
  const c = await load(doc);
  const r = c.replaceSelection('First paragraph here.\n\nSecond paragraph here.', 'Only one.\n');
  assert.equal(r.ok, true);
  assert.equal(textOf(p1), 'Only one.');
  // p2 was the last paragraph of the section, so it stays (empty) rather than failing.
  assert.equal(doc.body.children.length, 2);
  assert.equal(p2.getText(), '');
});

test('saveKey takes only a well-formed p3n key', async () => {
  const c = await load(makeDoc(para('x')));
  assert.throws(() => c.saveKey('sk-123'));
  assert.throws(() => c.saveKey('p3n_abc'));
});

test('mock mode needs dev.js, which a release push leaves out', async () => {
  const boot = async (opts) => {
    const c = await load(makeDoc(para('x')), opts);
    c.showSidebar();
    return JSON.parse(c.shown[0].boot);
  };
  assert.equal((await boot({ props: { 'p3n.mock': '1' } })).mock, false);
  assert.equal((await boot({ dev: true, props: { 'p3n.mock': '1' } })).mock, true);
  assert.equal((await boot({ dev: true })).mock, false);
});

test('npm run push leaves out dev.js and nothing else, npm run push:dev sends it all', async () => {
  const { default: micromatch } = await import('micromatch'); // the matcher clasp applies its ignore file with
  const files = (await readdir(SRC)).sort();
  const pushed = async (ignore) => {
    const rules = (await readFile(path.join(ROOT, ignore), 'utf8')).split(/\r?\n/).filter(Boolean);
    return micromatch.not(files, rules, { dot: true }).sort();
  };
  assert.ok(files.includes('dev.js'));
  assert.deepEqual(await pushed('.claspignore'), files.filter((f) => f !== 'dev.js'));
  assert.deepEqual(await pushed('.claspignore.dev'), files);
});

test('the manifest asks for exactly the scopes the listing gives the SDK and the consent screen', async () => {
  // Google rejects an add-on whose manifest, Marketplace SDK and consent screen don't list identical scopes.
  const { oauthScopes } = JSON.parse(await readFile(path.join(SRC, 'appsscript.json'), 'utf8'));
  const row = (await readFile(path.join(ROOT, 'store', 'listing.md'), 'utf8')).split('\n').find((l) => l.startsWith('| OAuth scopes |'));
  const listed = new Set([...row.matchAll(/`(https:\/\/www\.googleapis\.com\/auth\/[\w.]+)`/g)].map((m) => m[1]));
  assert.deepEqual([...oauthScopes].sort(), [...listed].sort());
});

// ---- highlights: a background on a check's sentences, and what was there put back ----

const AI = '#fcd9c4';
const HIT = '#fdeadf';
const YELLOW = '#ffff00';
// Offsets of `part` in `text`, end exclusive, as marks.html sends them.
const markOf = (text, part, kind = 'ai', from = 0) => ({ start: text.indexOf(part, from), end: text.indexOf(part, from) + part.length, kind });
const run = (t, from, to, v) => t.bgs().slice(from, to).every((x) => x === v);

test('highlight colours the sentences, a pattern hit lighter and across a paragraph break; clear takes all of it off', async () => {
  const p1 = para('Plain start. Moreover, it');
  const p2 = para('unlocks potential. Fine end.');
  const doc = makeDoc(p1, p2);
  doc.selection = [re(p1), re(p2)];
  const c = await load(doc);
  const text = 'Plain start. Moreover, it\n\nunlocks potential. Fine end.';
  assert.equal(c.getSelectedText().text, text);
  const r = c.highlight(text, [markOf(text, 'Moreover, it\n\nunlocks potential.'), markOf(text, 'Fine end.', 'hit')]);
  assert.equal(r.ok, true);
  const [t1, t2] = [p1.children[0], p2.children[0]];
  assert.ok(run(t1, 0, 13, null) && run(t1, 13, 25, AI));
  assert.ok(run(t2, 0, 18, AI) && run(t2, 18, 19, null) && run(t2, 19, 28, HIT));
  assert.ok(c.docProps.get('p3n.highlights'), 'what to put back is kept in the document properties');
  assert.equal(c.clearHighlights().kept, 0);
  assert.ok(run(t1, 0, t1.text.length, null) && run(t2, 0, t2.text.length, null));
  assert.equal(c.docProps.size, 0);
  assert.equal(doc.named.size, 0);
});

test('clear puts back the user\'s own background inside a sentence, and null stays null', async () => {
  const t = new Text('Moreover, it unlocks potential.');
  t.setBackgroundColor(13, 19, YELLOW); // "unlocks"
  const p = new Container(ET.PARAGRAPH, [t]);
  const doc = makeDoc(p);
  doc.selection = [re(p)];
  const c = await load(doc);
  c.highlight(t.text, [{ start: 0, end: t.text.length, kind: 'ai' }]);
  assert.ok(run(t, 0, t.text.length, AI));
  c.clearHighlights();
  assert.ok(run(t, 0, 13, null) && run(t, 13, 20, YELLOW) && run(t, 20, t.text.length, null));
});

test('a background the user changed after the highlight went on stays as they made it', async () => {
  const p = para('Moreover, it unlocks potential.');
  const t = p.children[0];
  const doc = makeDoc(p);
  doc.selection = [re(p)];
  const c = await load(doc);
  c.highlight(t.text, [{ start: 0, end: t.text.length, kind: 'ai' }]);
  t.setBackgroundColor(0, 8, '#00ff00'); // "Moreover,"
  assert.ok(c.clearHighlights().kept >= 1);
  assert.ok(run(t, 0, 9, '#00ff00') && run(t, 9, t.text.length, null));
});

test('edits inside a highlight: typed text goes back with it, deleted text is fine, text typed right after too', async () => {
  const t = new Text('Intro. Moreover, it unlocks potential. Later.');
  t.setBackgroundColor(39, 44, YELLOW); // "Later." is the user's own yellow
  const p = new Container(ET.PARAGRAPH, [t]);
  const doc = makeDoc(p);
  doc.selection = [re(p)];
  const c = await load(doc);
  c.highlight(t.text, [markOf(t.text, 'Moreover, it unlocks potential.')]);
  t.insertText(20, 'really '); // inside: takes the highlight from the character before it
  t.deleteText(7, 16); // "Moreover, " gone
  t.insertText(t.text.indexOf('potential.') + 10, ' Truly'); // right after the sentence, outside its range
  assert.equal(t.text, 'Intro. it really unlocks potential. Truly Later.');
  assert.ok(t.bgs().some((x) => x === AI));
  c.clearHighlights();
  assert.ok(run(t, 0, t.text.indexOf('Later.'), null), 'no highlight colour left');
  assert.ok(run(t, t.text.indexOf('Later.'), t.text.length, YELLOW), 'the user\'s yellow next to it untouched');
});

test('a highlight whose text was all deleted is skipped; the rest still goes back', async () => {
  const p = para('One two. Three four.');
  const t = p.children[0];
  const doc = makeDoc(p);
  doc.selection = [re(p)];
  const c = await load(doc);
  c.highlight(t.text, [markOf(t.text, 'One two.'), markOf(t.text, 'Three four.')]);
  t.deleteText(0, 8); // "One two. "
  c.clearHighlights();
  assert.equal(t.text, 'Three four.');
  assert.ok(run(t, 0, t.text.length, null));
});

test('only the selected text is highlighted, even where the same sentence is outside it', async () => {
  const p = para('Great news. Great news.');
  const t = p.children[0];
  const doc = makeDoc(p);
  doc.selection = [re(t, 12, 22)];
  const c = await load(doc);
  c.highlight('Great news.', [{ start: 0, end: 11, kind: 'ai' }]);
  assert.ok(run(t, 0, 12, null) && run(t, 12, 23, AI));
});

test('no highlight when the selection no longer reads as the text checked', async () => {
  const p = para('Someone edited this.');
  const doc = makeDoc(p);
  doc.selection = [re(p)];
  const c = await load(doc);
  assert.deepEqual({ ...c.highlight('The text that was checked.', [{ start: 0, end: 9, kind: 'ai' }]) }, { ok: false, reason: 'changed' });
  assert.ok(run(p.children[0], 0, 20, null));
  assert.equal(c.docProps.size, 0);
});

test('highlights outlast the sidebar: it opens with Clear highlights, and a later run can take them off', async () => {
  const p = para('Moreover, it unlocks potential.');
  const doc = makeDoc(p);
  doc.selection = [re(p)];
  const docProps = new Map();
  const boot = async (c) => { c.showSidebar(); return JSON.parse(c.shown.at(-1).boot).marks; };
  const first = await load(doc, { docProps });
  assert.equal(await boot(first), false);
  first.highlight(p.getText(), [{ start: 0, end: 31, kind: 'ai' }]);
  const later = await load(doc, { docProps }); // a new execution, as after the sidebar closed
  assert.equal(await boot(later), true);
  later.clearHighlights();
  assert.ok(run(p.children[0], 0, 31, null));
  assert.equal(await boot(later), false);
});

test('Replace never takes a highlight on as the rewrite\'s own background', async () => {
  const p = para('Moreover, it unlocks potential.', { BACKGROUND_COLOR: AI });
  const doc = makeDoc(p);
  doc.selection = [re(p)];
  const c = await load(doc);
  assert.equal(c.replaceSelection('Moreover, it unlocks potential.', 'It helps.\n').ok, true);
  assert.equal(textOf(p), 'It helps.');
  assert.ok(run(p.children[0], 0, 9, null));
});

test('the offsets map back through what reading the selection cleans up', async () => {
  const c = await load(makeDoc(para('x')));
  const raw = ' \t a\r\nb\u0001c\td\u000be\r f  ';
  const map = c.cleanMap_(raw);
  assert.equal(map.map((i) => raw[i]).join('').replace(/\r|\u000b/g, '\n').replace(/\t/g, ' '), c.clean_(raw));
});
