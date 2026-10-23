/**
 * p3n for Google Docs, an Editor add-on: check the selected text for AI, rewrite it so it doesn't read as AI,
 * and put the rewrite back in place of the selection.
 *
 * The sidebar calls api.p3n.si itself, from the user's browser, so someone without a key spends their own
 * free hourly calls instead of sharing the ones Google's servers get. This file does only what needs the
 * document: read the selection, replace it, highlight a check's sentences and take the highlights off again,
 * and keep the API key in the user's own properties.
 *
 * @OnlyCurrentDoc
 */

const PROP_KEY = 'p3n.apiKey';
const KEY_FORMAT = /^p3n_[0-9a-f]{12}_[A-Za-z0-9]{32}$/;

// ---- menu and sidebar ----------------------------------------------------------------------------

function onOpen() {
  DocumentApp.getUi().createAddonMenu()
    .addItem('Check selection for AI', 'checkSelection')
    .addItem('Rewrite selection', 'rewriteSelection')
    .addSeparator()
    .addItem('Open p3n', 'showSidebar')
    .addToUi();
}

function onInstall(e) {
  onOpen(e);
}

function showSidebar() { openSidebar_(null); }
function checkSelection() { openSidebar_('detect'); }
function rewriteSelection() { openSidebar_('humanize'); }

function openSidebar_(job) {
  const props = PropertiesService.getUserProperties();
  const page = HtmlService.createTemplateFromFile('Sidebar');
  // Lands in a script tag as JSON; "<" is escaped so nothing in it can close the tag.
  page.boot = JSON.stringify({
    job: job,
    key: props.getProperty(PROP_KEY) || '',
    mock: typeof devMock_ === 'function' && devMock_(), // dev.js, which a release push leaves out
    marks: hasHighlights_(), // highlights left in the document: the sidebar offers Clear highlights at once
  }).replace(/</g, '\\u003c');
  DocumentApp.getUi().showSidebar(page.evaluate().setTitle('p3n'));
}

// Sidebar.html pulls in its styles and scripts with <?!= include_('name') ?>.
function include_(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

// ---- API key: the user's own properties (per user, per add-on), never the document's ---------------

function saveKey(key) {
  key = String(key || '').trim();
  if (!KEY_FORMAT.test(key)) throw new Error('That is not a p3n API key.');
  PropertiesService.getUserProperties().setProperty(PROP_KEY, key);
  return true;
}

function removeKey() {
  PropertiesService.getUserProperties().deleteProperty(PROP_KEY);
  return true;
}

// ---- reading the selection -----------------------------------------------------------------------
// The sidebar shows, and the API gets, the selected text of each paragraph with a blank line between
// paragraphs (the API reads a blank line as a paragraph break). A line break inside a paragraph
// (Shift+Enter) goes over as \n. Empty paragraphs are skipped, and stay as they are on Replace.

// What is selected now: { text, blocked }. `blocked` names what Replace won't write over (a table, a
// picture, a chip), or is null. Reads the document only; nothing is sent anywhere.
function getSelectedText() {
  const got = read_(DocumentApp.getActiveDocument());
  return { text: got.text, blocked: got.blocked };
}

// Inline things that sit between words and that a rewrite has no place for.
const BLOCKERS = {
  TABLE: 'table', TABLE_ROW: 'table', TABLE_CELL: 'table', TABLE_OF_CONTENTS: 'table',
  INLINE_IMAGE: 'picture', INLINE_DRAWING: 'picture', EQUATION: 'equation',
  FOOTNOTE: 'footnote', RICH_LINK: 'chip', PERSON: 'chip', DATE: 'chip',
};
const blocker_ = (type) => BLOCKERS[String(type)] || 'other';

const CONTROL = /[\u0000-\u0008\u000c\u000e-\u001f]/g;
// A tab goes over as a space, so the words on either side of it stay apart.
const clean_ = (raw) => String(raw).replace(/\r\n?|\u000b/g, '\n').replace(/\t/g, ' ').replace(CONTROL, '').trim();

// The selection as targets, one per non-empty paragraph: the paragraph's Text element and the selected
// offsets in it (inclusive), the raw selected text, and its plain form.
function read_(doc) {
  const sel = doc.getSelection();
  if (!sel) return { text: '', targets: [], blocked: null };
  const T = DocumentApp.ElementType;
  const items = []; // paragraphs, and the text of tables and the like, in document order
  let blocked = null;

  // Range elements come in document order, so a paragraph's parts are next to each other.
  const groupOf = (para) => {
    const key = pathOf_(para);
    const last = items[items.length - 1];
    if (last && last.key === key) return last;
    const g = { key, para, spans: [], other: [] };
    items.push(g);
    return g;
  };

  sel.getRangeElements().forEach((re) => {
    const el = re.getElement();
    const type = el.getType();
    if (type === T.TEXT) {
      const text = el.asText();
      const len = text.getText().length;
      const s = re.isPartial() ? re.getStartOffset() : 0;
      const e = re.isPartial() ? re.getEndOffsetInclusive() : len - 1;
      if (e >= s) groupOf(text.getParent()).spans.push({ el: text, s, e, len });
    } else if (type === T.PARAGRAPH || type === T.LIST_ITEM) {
      const g = groupOf(el);
      for (let i = 0; i < el.getNumChildren(); i++) {
        const c = el.getChild(i);
        if (c.getType() !== T.TEXT) { g.other.push(c.getType()); continue; }
        const len = c.asText().getText().length;
        if (len) g.spans.push({ el: c.asText(), s: 0, e: len - 1, len });
      }
    } else {
      const parent = el.getParent();
      const inline = parent && (parent.getType() === T.PARAGRAPH || parent.getType() === T.LIST_ITEM);
      if (inline) groupOf(parent).other.push(type);
      else {
        // A table or the like: its text is checked like the rest, but Replace leaves it alone.
        blocked = blocked || blocker_(type);
        const t = typeof el.getText === 'function' ? el.getText() : '';
        items.push({ texts: String(t).split(/\r?\n/).map(clean_).filter(Boolean) });
      }
    }
  });

  const texts = [];
  const targets = [];
  let at = 0; // where the next text starts in the joined text, so highlight() can find a paragraph's part of it
  const add = (t) => { texts.push(t); at += t.length + 2; };
  items.forEach((g) => {
    if (g.texts) return g.texts.forEach(add);
    const raw = g.spans.map((sp) => sp.el.getText().substring(sp.s, sp.e + 1)).join('');
    const text = clean_(raw);
    if (g.other.length) blocked = blocked || blocker_(g.other[0]);
    if (!text) return;
    if (g.spans.length > 1) blocked = blocked || 'other';
    targets.push({ span: g.spans[0], spans: g.spans, raw, text, para: g.para, at });
    add(text);
  });
  return { text: texts.join('\n\n'), targets, blocked };
}

// Where an element sits in the document, as child indexes from the top ("4" or "7.0.1.0").
function pathOf_(el) {
  const at = [];
  for (let p = el.getParent(); p; el = p, p = p.getParent()) at.push(p.getChildIndex(el));
  return at.reverse().join('.');
}

// ---- replacing it --------------------------------------------------------------------------------

// Puts `rewrite` where the selection is, if the selected text is still `expected` (what was rewritten).
// If the selection has moved, it looks for `expected` in the document and replaces it there, but only a
// single paragraph and only when it appears exactly once. Each paragraph gets its own rewritten paragraph,
// so headings, list items and alignment stay; inside it the new words take the formatting most of the old
// words had. Paragraphs the rewrite left as they were aren't touched. The API ends a rewrite with "\n",
// which never becomes an empty paragraph. One call, so one step for Undo in Docs.
function replaceSelection(expected, rewrite) {
  const doc = DocumentApp.getActiveDocument();
  let got = read_(doc);
  if (got.text !== expected) got = findOnce_(doc, expected) || got;
  if (got.text !== expected) return { ok: false, reason: got.text ? 'changed' : 'gone' };
  if (got.blocked) return { ok: false, reason: got.blocked };
  const blocks = blocksOf_(rewrite);
  if (!blocks.length) return { ok: false, reason: 'empty' };

  const plan = plan_(got.targets.map((t) => t.text), blocks);
  const now = [];
  try {
    got.targets.forEach((t, i) => {
      if (plan[i] === t.text) return now.push({ el: t.span.el, s: t.span.s, e: t.span.e });
      const whole = t.span.s === 0 && t.span.e === t.span.len - 1;
      const written = write_(t.span, plan[i] ? edges_(t.raw, soft_(plan[i])) : '');
      if (written) now.push(written);
      else if (whole) dropIfEmpty_(t.para);
    });
  } catch (e) {
    // View or comment access, or a part of the document Docs won't let a script edit.
    return { ok: false, reason: 'locked', detail: String(e && e.message || e) };
  }

  // The new text ends up selected, so the user sees what changed and can run p3n on it again.
  if (now.length) {
    const range = doc.newRange();
    now.forEach((r) => range.addElement(r.el, r.s, r.e));
    doc.setSelection(range.build());
  }
  // What the selection reads as now, so the sidebar can replace again (after another rewrite).
  const text = plan.map((p, i) => (p === got.targets[i].text ? p : clean_(soft_(p)))).filter(Boolean).join('\n\n');
  return { ok: true, text };
}

// The rewrite as paragraphs: split on blank lines, trimmed, empty ones dropped (the trailing "\n" too).
function blocksOf_(text) {
  return String(text == null ? '' : text).split(/\n[ \t]*\n/).map((b) => b.trim()).filter(Boolean);
}

// Which rewritten paragraph goes into which selected one. Humanize returns one paragraph per paragraph
// sent, so this is nearly always one to one. If it returned fewer, the last selected paragraphs are
// emptied; if more, the extra ones join the last paragraph.
function plan_(texts, blocks) {
  const n = texts.length;
  if (blocks.length <= n) return texts.map((_, i) => blocks[i] || '');
  return texts.map((_, i) => (i < n - 1 ? blocks[i] : blocks.slice(n - 1).join(' ')));
}

// The spaces around the selected words stay (a double-click selects a word and the space after it).
function edges_(raw, text) {
  return raw.match(/^\s*/)[0] + text + raw.match(/\s*$/)[0];
}

// A line break inside a paragraph goes back as a Docs line break, not a new paragraph.
const soft_ = (text) => text.replace(/\n/g, '\r');

// Replaces s..e (inclusive) of a Text element with `str` in the formatting most of s..e had, and
// returns where the new text is (null when `str` is empty). The new text goes in before the old is
// deleted, so the Text element is never empty in between.
function write_(span, str) {
  const el = span.el;
  const s = span.s;
  const e = span.e;
  const style = styleOf_(el, s, e);
  if (str) {
    if (e + 1 >= el.getText().length) el.appendText(str);
    else el.insertText(e + 1, str);
  }
  el.deleteText(s, e);
  if (!str) return null;
  const end = s + str.length - 1;
  if (Object.keys(style.attrs).length) el.setAttributes(s, end, style.attrs);
  // New text takes on the background of the text it went in next to, a highlight included: not that.
  if (style.unmark && !style.attrs[DocumentApp.Attribute.BACKGROUND_COLOR]) el.setBackgroundColor(s, end, null);
  el.setLinkUrl(s, end, style.link);
  return { el, s, e: end };
}

const STYLE_ATTRS = ['BOLD', 'ITALIC', 'UNDERLINE', 'STRIKETHROUGH', 'FONT_FAMILY', 'FONT_SIZE', 'FOREGROUND_COLOR', 'BACKGROUND_COLOR'];

// For each character attribute, the value that covers the most selected characters. A link is kept only
// if the whole selection was that one link, so a rewrite never turns plain words into a link, and a p3n
// highlight never becomes the rewrite's own background.
function styleOf_(el, s, e) {
  const starts = el.getTextAttributeIndices();
  const len = el.getText().length;
  const tally = {};
  const links = {};
  let unmark = false;
  for (let i = 0; i < starts.length; i++) {
    const a = Math.max(starts[i], s);
    const b = Math.min((i + 1 < starts.length ? starts[i + 1] : len) - 1, e);
    if (a > b) continue;
    const at = el.getAttributes(a);
    STYLE_ATTRS.forEach((k) => {
      const mark = k === 'BACKGROUND_COLOR' && isMark_(at[k]);
      unmark = unmark || mark;
      const v = JSON.stringify(at[k] == null || mark ? null : at[k]);
      tally[k] = tally[k] || {};
      tally[k][v] = (tally[k][v] || 0) + (b - a + 1);
    });
    links[at.LINK_URL || ''] = true;
  }
  const attrs = {};
  STYLE_ATTRS.forEach((k) => {
    const counts = tally[k] || {};
    const best = Object.keys(counts).sort((x, y) => counts[y] - counts[x])[0];
    const value = best === undefined ? null : JSON.parse(best);
    if (value !== null) attrs[DocumentApp.Attribute[k]] = value;
  });
  const urls = Object.keys(links);
  return { attrs, link: urls.length === 1 && urls[0] ? urls[0] : null, unmark };
}

// A paragraph the rewrite emptied goes, unless it is the last one in its section (Docs keeps that one).
function dropIfEmpty_(para) {
  if (para.getText().trim()) return;
  try { para.removeFromParent(); } catch (e) { /* the section's last paragraph stays, empty */ }
}

// The selection moved: find `expected` in the open tab, if it is one paragraph and appears exactly once.
function findOnce_(doc, expected) {
  if (!expected || /\n/.test(expected) || expected.length > 2000) return null;
  const body = body_(doc);
  const pattern = expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hit = body.findText(pattern);
  if (!hit || body.findText(pattern, hit)) return null;
  const el = hit.getElement().asText();
  const s = hit.getStartOffset();
  const e = hit.getEndOffsetInclusive();
  const raw = el.getText().substring(s, e + 1);
  const text = clean_(raw);
  const span = { el, s, e, len: el.getText().length };
  return { text, blocked: null, targets: [{ span, spans: [span], raw, text, para: el.getParent(), at: 0 }] };
}

// The body of the tab the user is on (documents with tabs), or the document's only body.
function body_(doc) {
  try {
    const tab = doc.getActiveTab && doc.getActiveTab();
    if (tab) return tab.asDocumentTab().getBody();
  } catch (e) { /* no tabs API: one body */ }
  return doc.getBody();
}

// ---- highlighting a check's sentences ------------------------------------------------------------
// DocumentApp has no decoration that stays out of the document, so a highlight is a background colour
// written into it, and taking it off puts back what was there. For each run of characters it colours,
// highlight() keeps a named range, which Docs moves and stretches as the text around and inside it is
// edited, and the run's background from before (null for none, as on most text). Those are kept in the
// document's properties for this add-on, so they outlast the sidebar, and whoever opens p3n in the
// document next can take the highlights off. Only range IDs and colours are kept there, no text.

const PROP_MARKS = 'p3n.highlights';
const MARK_NAME = 'p3n.highlight';
// p3n's AI tint for the listed sentences, a lighter one for the pattern hits. Neither is in Docs' palette,
// so text in exactly these colours is taken to be p3n's.
const MARK_COLORS = { ai: '#fcd9c4', hit: '#fdeadf' };
const MAX_RUNS = 150; // what fits in one property value (9 KB)

const same_ = (a, b) => !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();
const isMark_ = (c) => Object.keys(MARK_COLORS).some((k) => same_(c, MARK_COLORS[k]));

function hasHighlights_() {
  try { return !!PropertiesService.getDocumentProperties().getProperty(PROP_MARKS); } catch (e) { return false; }
}

// Highlights `marks` ([{ start, end, kind }]: offsets in `expected`, end exclusive, from marks.html) if the
// selection still reads as `expected`, the text that was checked. Takes off any highlights left from before
// first. { ok, marked }: the number of runs coloured. Or { ok: false, reason }.
function highlight(expected, marks) {
  clearHighlights();
  const doc = DocumentApp.getActiveDocument();
  let got = read_(doc);
  if (got.text !== expected) got = findOnce_(doc, expected) || got;
  if (got.text !== expected) return { ok: false, reason: got.text ? 'changed' : 'gone' };
  const tab = tab_(doc);
  const kinds = Object.keys(MARK_COLORS);
  const saved = { tab: tab.id, colors: kinds.map((k) => MARK_COLORS[k]), runs: [] };
  try {
    (marks || []).forEach((m) => {
      const k = Math.max(0, kinds.indexOf(m.kind));
      pieces_(got.targets, Number(m.start), Number(m.end)).forEach((p) => runsOf_(p).forEach((r) => {
        if (saved.runs.length >= MAX_RUNS) return;
        const range = tab.at.newRange().addElement(r.el, r.s, r.e).build();
        // Kept before the colour goes on: a run that didn't get it matches nothing on clear.
        saved.runs.push([tab.at.addNamedRange(MARK_NAME, range).getId(), r.bg, k]);
        r.el.setBackgroundColor(r.s, r.e, saved.colors[k]);
      }));
    });
  } catch (e) {
    return { ok: false, reason: 'locked', marked: saved.runs.length };
  } finally {
    if (saved.runs.length) PropertiesService.getDocumentProperties().setProperty(PROP_MARKS, JSON.stringify(saved));
  }
  return { ok: true, marked: saved.runs.length };
}

// Takes p3n's highlights off. Each run gets back the background it had, wherever it still has p3n's colour;
// text typed inside a highlighted sentence took that colour and is inside the range, so it goes back too.
// What isn't put back: a run whose background was changed since (it stays as the user made it), and text
// that is no longer in its range (copied elsewhere). Text typed right before or after a highlight took its
// colour but is outside the range: it goes back when it has p3n's exact colour. { ok, kept }: the stretches
// left as they were because their background had changed.
function clearHighlights() {
  const props = PropertiesService.getDocumentProperties();
  const raw = props.getProperty(PROP_MARKS);
  if (!raw) return { ok: true, kept: 0 };
  let saved;
  try { saved = JSON.parse(raw); } catch (e) { saved = { runs: [] }; }
  const doc = DocumentApp.getActiveDocument();
  const tab = tabById_(doc, saved.tab);
  const T = DocumentApp.ElementType;
  const back = [];
  let kept = 0;
  (saved.runs || []).forEach(([id, bg, k]) => {
    const mark = (saved.colors || [])[k];
    const named = tab.getNamedRangeById(id);
    if (!named) return; // all of its text was deleted
    named.getRange().getRangeElements().forEach((re) => {
      const el = re.getElement();
      const text = el.getType() === T.TEXT ? el.asText() : (typeof el.editAsText === 'function' ? el.editAsText() : null);
      const len = text ? text.getText().length : 0;
      if (!len) return;
      const s = re.isPartial() ? re.getStartOffset() : 0;
      const e = re.isPartial() ? re.getEndOffsetInclusive() : len - 1;
      eachRun_(text, s, e, (a, b, now) => {
        if (same_(now, mark)) text.setBackgroundColor(a, b, bg); // null takes the background off
        else kept++;
      });
      back.push({ text, s, e, bg, mark });
    });
    named.remove();
  });
  // Once every run is back, so text next to one highlight that belongs to another already has its own colour.
  back.forEach((r) => { spill_(r.text, r.e + 1, 1, r.bg, r.mark); spill_(r.text, r.s - 1, -1, r.bg, r.mark); });
  props.deleteProperty(PROP_MARKS);
  return { ok: true, kept };
}

// Calls fn(a, b, background) for each stretch of s..e (inclusive) with its own formatting.
function eachRun_(text, s, e, fn) {
  const starts = text.getTextAttributeIndices();
  const len = text.getText().length;
  for (let i = 0; i < starts.length; i++) {
    const a = Math.max(starts[i], s);
    const b = Math.min((i + 1 < starts.length ? starts[i + 1] : len) - 1, e);
    if (a <= b) fn(a, b, text.getBackgroundColor(a));
  }
}

// A piece split where its background changes: { el, s, e, bg } with the background to put back on clear.
// One already in p3n's exact colour (a stray highlight, pasted from another) counts as none.
function runsOf_(p) {
  const out = [];
  eachRun_(p.el, p.s, p.e, (a, b, now) => {
    const bg = now && !isMark_(now) ? now : null;
    const last = out[out.length - 1];
    if (last && last.bg === bg) last.e = b;
    else out.push({ el: p.el, s: a, e: b, bg });
  });
  return out;
}

// Text right next to a highlight that has its exact colour, from `from` in direction `step`, gets `bg`.
function spill_(text, from, step, bg, mark) {
  const len = text.getText().length;
  let k = from;
  while (k >= 0 && k < len && same_(text.getBackgroundColor(k), mark)) k += step;
  if (k !== from) text.setBackgroundColor(Math.min(from, k - step), Math.max(from, k - step), bg);
}

// The document text behind start..end (end exclusive) of read_()'s joined text: { el, s, e } per Text
// element, offsets inclusive, over a paragraph break when a sentence runs across one.
function pieces_(targets, start, end) {
  const out = [];
  targets.forEach((t) => {
    const a = Math.max(start, t.at) - t.at;
    const b = Math.min(end, t.at + t.text.length) - t.at;
    if (a >= b) return;
    const map = cleanMap_(t.raw);
    const chars = []; // the paragraph's selected characters, as raw has them
    t.spans.forEach((sp) => { for (let k = sp.s; k <= sp.e; k++) chars.push({ el: sp.el, off: k }); });
    for (let i = a; i < b; i++) {
      const c = chars[map[i]];
      const last = out[out.length - 1];
      if (last && last.el === c.el && last.e === c.off - 1) last.e = c.off;
      else out.push({ el: c.el, s: c.off, e: c.off });
    }
  });
  return out;
}

// clean_ as a map: where each character of clean_(raw) is in raw.
function cleanMap_(raw) {
  raw = String(raw);
  let s = '';
  const at = [];
  for (let i = 0; i < raw.length; i++) {
    let c = raw[i];
    if (c === '\r' && raw[i + 1] === '\n') continue;
    if (c === '\r' || c === '\u000b') c = '\n';
    else if (c === '\t') c = ' ';
    else if (/[\u0000-\u0008\u000c\u000e-\u001f]/.test(c)) continue;
    s += c;
    at.push(i);
  }
  const lead = s.length - s.trimStart().length;
  return at.slice(lead, lead + s.trim().length);
}

// The tab the user is on and its ID (documents with tabs), or the document itself: where named ranges go.
function tab_(doc) {
  try {
    const tab = doc.getActiveTab && doc.getActiveTab();
    if (tab) return { id: tab.getId(), at: tab.asDocumentTab() };
  } catch (e) { /* no tabs API */ }
  return { id: '', at: doc };
}

function tabById_(doc, id) {
  try {
    if (id) return doc.getTab(id).asDocumentTab();
  } catch (e) { /* that tab is gone, and its highlights with it */ }
  return doc;
}
