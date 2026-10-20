// Code.js against a small in-memory stand-in for DocumentApp: reading the selection, replacing it paragraph by
// paragraph, formatting, the trailing "\n", and the refusals. The stand-in follows the documented behaviour
// (Text elements with per-character attributes, range elements with inclusive offsets); how real Docs inherits
// formatting on insert, groups Undo and so on is checked in Docs itself (README, Tests).
//   node --test dev/code.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const ATTRS = ['BOLD', 'ITALIC', 'UNDERLINE', 'STRIKETHROUGH', 'FONT_FAMILY', 'FONT_SIZE', 'FOREGROUND_COLOR', 'BACKGROUND_COLOR', 'LINK_URL'];
const ET = Object.fromEntries(['TEXT', 'PARAGRAPH', 'LIST_ITEM', 'TABLE', 'INLINE_IMAGE', 'BODY_SECTION'].map((k) => [k, k]));

class Text {
  constructor(text, attrs = {}) { this.text = text; this.at = [...text].map(() => ({ ...attrs })); this.parent = null; this.writes = 0; }
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
    this.writes++;
    return this;
  }
  appendText(s) { return this.insertText(this.text.length, s); }
  deleteText(s, e) {
    assert.ok(s >= 0 && e < this.text.length && s <= e, `deleteText ${s}..${e} out of range`);
    this.text = this.text.slice(0, s) + this.text.slice(e + 1);
    this.at.splice(s, e - s + 1);
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

async function load(doc) {
  const code = await readFile(path.resolve(import.meta.dirname, '..', 'src', 'Code.js'), 'utf8');
  const ctx = vm.createContext({
    DocumentApp: { ElementType: ET, Attribute: Object.fromEntries(ATTRS.map((k) => [k, k])), getActiveDocument: () => doc },
  });
  return vm.runInContext(`${code}\n;({ getSelectedText, replaceSelection, blocksOf_, plan_, saveKey })`, ctx);
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
