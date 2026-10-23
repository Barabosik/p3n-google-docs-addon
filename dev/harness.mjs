// A local stand-in for Google Docs, to try the sidebar and test it without a Google account: a test document on
// the left and the real sidebar (src/Sidebar.html, its includes filled in as Apps Script would) in a 300px frame
// on the right. google.script.run is replaced by messages to the test page, which reads and replaces its own
// selection the way Code.js does in Docs. The DocumentApp code itself is covered by code.test.mjs and the live test.
//
//   node dev/harness.mjs            then open the printed URL
//   /?mock=1                        canned API answers (nothing sent to p3n)
//   /?mock=1&free=0                 mock with the free hourly calls used up
//   /?mock=1&job=detect&select=1    opened from the menu with paragraph 1 selected
//   /?key=p3n_...                   start with an API key saved
//   reopenSidebar() in the page     closes and opens the sidebar, as Extensions → p3n → Open p3n does
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, '..', 'src');

// Sidebar.html with <?!= include_('x') ?> and <?!= boot ?> filled in, as HtmlService's template does.
export async function sidebarHtml(boot, { free } = {}) {
  let html = await readFile(path.join(SRC, 'Sidebar.html'), 'utf8');
  const parts = {};
  for (const name of [...html.matchAll(/<\?!=\s*include_\('(\w+)'\);?\s*\?>/g)].map((m) => m[1])) {
    parts[name] = await readFile(path.join(SRC, `${name}.html`), 'utf8');
  }
  html = html.replace(/<\?!=\s*include_\('(\w+)'\);?\s*\?>/g, (_, name) => parts[name]);
  html = html.replace('<?!= boot ?>', JSON.stringify(boot).replace(/</g, '\\u003c'));
  const stub = `<script>${free == null ? '' : `window.P3N_MOCK_FREE = ${Number(free)};`}(${gasStub})();</script>`;
  return html.replace('<script>window.P3N_BOOT', `${stub}\n  <script>window.P3N_BOOT`);
}

// google.script.run, forwarded to the parent page by postMessage.
function gasStub() {
  const waiting = new Map();
  let next = 0;
  addEventListener('message', (e) => {
    const w = waiting.get(e.data?.p3nReply);
    if (!w) return;
    waiting.delete(e.data.p3nReply);
    if (e.data.error) w.fail(new Error(e.data.error));
    else w.ok(e.data.result);
  });
  const runner = () => {
    let ok = () => {};
    let fail = () => {};
    const r = new Proxy({}, {
      get(_, name) {
        if (name === 'withSuccessHandler') return (f) => { ok = f; return r; };
        if (name === 'withFailureHandler') return (f) => { fail = f; return r; };
        return (...args) => {
          const id = ++next;
          waiting.set(id, { ok, fail });
          parent.postMessage({ p3nCall: name, args, id }, '*');
        };
      },
    });
    return r;
  };
  window.google = { script: { get run() { return runner(); } } };
}

const PAGE = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>p3n sidebar harness</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; height: 100vh; display: grid; grid-template-columns: 1fr 301px; background: #eef0f3; font: 15px/1.6 Georgia, 'Times New Roman', serif; color: #222; }
  .canvas { overflow: auto; padding: 32px 24px; }
  #doc { max-width: 680px; min-height: calc(100vh - 64px); margin: 0 auto; background: #fff; padding: 56px 64px; box-shadow: 0 1px 3px rgba(0,0,0,.12), 0 6px 20px rgba(0,0,0,.05); outline: none; }
  #doc h2 { font: 600 22px/1.3 system-ui, sans-serif; margin: 0 0 14px; }
  #doc p, #doc li { margin: 0 0 12px; }
  aside { display: flex; flex-direction: column; border-left: 1px solid #dadce0; background: #fff; }
  aside .title { display: flex; align-items: center; justify-content: space-between; height: 44px; padding: 0 12px 0 16px; font: 500 15px system-ui, sans-serif; color: #3c4043; border-bottom: 1px solid #e8eaed; }
  aside .title span { font-size: 18px; color: #5f6368; }
  iframe { flex: 1; border: 0; width: 100%; }
</style></head>
<body>
  <div class="canvas"><div id="doc" contenteditable="true" spellcheck="false">
    <h2>Quarterly update</h2>
    <p id="p1">In today's fast-paced world, it's worth noting that effective communication is more important than ever. Moreover, leveraging the right tools can help teams unlock their full potential and navigate the complexities of modern work.</p>
    <p id="p2">We shipped the <b>new billing page</b> on 14 March. Refunds now take two days instead of nine, and support tickets about invoices fell by a third.</p>
    <ul><li>Hire two support engineers</li><li>Move the status page off the old host</li></ul>
    <p id="p3">Additionally, our seamless onboarding unlocks a rich tapestry of possibilities for teams of all sizes. It’s not just a tool, it’s a new way to work.</p>
  </div></div>
  <aside><div class="title">p3n <span aria-hidden="true">&times;</span></div><iframe id="sidebar" title="p3n sidebar" src="/sidebar__QUERY__"></iframe></aside>
<script>
// The document side of google.script.run: what Code.js does, on this page's own selection.
const doc = document.querySelector('#doc');
const BLOCKS = 'h2, p, li';
const state = { key: new URLSearchParams(location.search).get('key') || '' };
const clean = (t) => t.replace(/\r\n?|\u000b/g, '\n').trim();

// The selected part of each block, like read_() in Code.js.
function read() {
  const sel = getSelection();
  if (!sel.rangeCount || sel.isCollapsed || !doc.contains(sel.getRangeAt(0).commonAncestorContainer)) return { text: '', targets: [] };
  const range = sel.getRangeAt(0);
  const targets = [];
  for (const block of doc.querySelectorAll(BLOCKS)) {
    if (!range.intersectsNode(block)) continue;
    const r = document.createRange();
    r.selectNodeContents(block);
    if (range.compareBoundaryPoints(Range.START_TO_START, r) > 0) r.setStart(range.startContainer, range.startOffset);
    if (range.compareBoundaryPoints(Range.END_TO_END, r) < 0) r.setEnd(range.endContainer, range.endOffset);
    const raw = r.toString();
    const text = clean(raw);
    if (text) targets.push({ block, range: r, raw, text });
  }
  return { text: targets.map((t) => t.text).join('\n\n'), targets };
}

const blocksOf = (t) => String(t ?? '').split(/\n[ \t]*\n/).map((b) => b.trim()).filter(Boolean);
const plan = (texts, blocks) => blocks.length <= texts.length ? texts.map((_, i) => blocks[i] || '') : texts.map((_, i) => i < texts.length - 1 ? blocks[i] : blocks.slice(texts.length - 1).join(' '));
const edges = (raw, t) => raw.match(/^\s*/)[0] + t + raw.match(/\s*$/)[0];

const handlers = {
  getSelectedText() { const g = read(); return { text: g.text, blocked: null }; },
  replaceSelection(expected, rewrite) {
    const got = read();
    if (got.text !== expected) return { ok: false, reason: got.text ? 'changed' : 'gone' };
    const blocks = blocksOf(rewrite);
    if (!blocks.length) return { ok: false, reason: 'empty' };
    const p = plan(got.targets.map((t) => t.text), blocks);
    const sel = getSelection();
    const now = document.createRange();
    let first = null;
    got.targets.forEach((t, i) => {
      if (p[i] === t.text) { if (!first) { first = t.range; now.setStart(t.range.startContainer, t.range.startOffset); } now.setEnd(t.range.endContainer, t.range.endOffset); return; }
      const node = document.createTextNode(edges(t.raw, p[i]));
      t.range.deleteContents();
      t.range.insertNode(node);
      if (!first) { first = node; now.setStart(node, 0); }
      now.setEnd(node, node.length);
    });
    sel.removeAllRanges();
    sel.addRange(now);
    return { ok: true, text: p.map((x, i) => x === got.targets[i].text ? x : clean(x)).filter(Boolean).join('\n\n') };
  },
  // Highlights as Code.js puts them in Docs: a background on the checked text's sentences, taken off again.
  highlight(expected, marks) { return keepSelection(() => {
    handlers.clearHighlights();
    const got = read();
    if (got.text !== expected) return { ok: false, reason: got.text ? 'changed' : 'gone' };
    let at = 0;
    const segs = [];
    got.targets.forEach((t) => { t.at = at; t.lead = t.raw.length - t.raw.trimStart().length; at += t.text.length + 2; });
    marks.forEach((m) => got.targets.forEach((t) => {
      const a = Math.max(m.start, t.at) - t.at;
      const b = Math.min(m.end, t.at + t.text.length) - t.at;
      if (a < b) segs.push(...segments(t, t.lead + a, t.lead + b, m.kind));
    }));
    // From the end of the document back, so splitting a text node leaves the offsets before it as they were.
    const order = [...textNodes()];
    segs.sort((x, y) => order.indexOf(y.node) - order.indexOf(x.node) || y.s - x.s).forEach(({ node, s, e, kind }) => {
      const mid = node.splitText(s);
      mid.splitText(e - s);
      const span = document.createElement('span');
      span.className = 'p3n-mark';
      span.dataset.kind = kind;
      span.style.background = MARK[kind];
      mid.replaceWith(span);
      span.append(mid);
    });
    return { ok: true, marked: segs.length };
  }); },
  clearHighlights() { return keepSelection(() => {
    doc.querySelectorAll('.p3n-mark').forEach((m) => m.replaceWith(...m.childNodes));
    doc.normalize();
    return { ok: true, kept: 0 };
  }); },
  saveKey(k) { if (!/^p3n_[0-9a-f]{12}_[A-Za-z0-9]{32}$/.test(k)) throw new Error('That is not a p3n API key.'); state.key = k; return true; },
  removeKey() { state.key = ''; return true; },
};

const MARK = { ai: '#fcd9c4', hit: '#fdeadf' }; // Code.js's MARK_COLORS
const textNodes = () => { const w = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT); const out = []; for (let n = w.nextNode(); n; n = w.nextNode()) out.push(n); return out; };
// Characters a..b (end exclusive) of a target's selected text, as { node, s, e } per text node.
function segments(t, a, b, kind) {
  const out = [];
  let pos = 0;
  for (const node of textNodes()) {
    if (!t.block.contains(node) || !t.range.intersectsNode(node)) continue;
    const s = node === t.range.startContainer ? t.range.startOffset : 0;
    const e = node === t.range.endContainer ? t.range.endOffset : node.length;
    const from = Math.max(a, pos);
    const to = Math.min(b, pos + e - s);
    if (from < to) out.push({ node, s: s + from - pos, e: s + to - pos, kind });
    pos += e - s;
  }
  return out;
}

// Runs f and puts the selection back where it was, by character: wrapping and unwrapping text nodes moves a
// browser's selection, while in Docs a background colour leaves it as it is.
function keepSelection(f) {
  const sel = getSelection();
  const r = sel.rangeCount && doc.contains(sel.getRangeAt(0).commonAncestorContainer) ? sel.getRangeAt(0) : null;
  const charAt = (node, off) => { const x = document.createRange(); x.setStart(doc, 0); x.setEnd(node, off); return x.toString().length; };
  const kept = r && [charAt(r.startContainer, r.startOffset), charAt(r.endContainer, r.endOffset)];
  const out = f();
  if (kept) {
    // A start on the edge between two text nodes goes in the later one, an end in the earlier one.
    const point = (k, later) => {
      for (const n of textNodes()) { if (k < n.length || (k === n.length && !later)) return [n, k]; k -= n.length; }
      return [doc, doc.childNodes.length];
    };
    const n = document.createRange();
    n.setStart(...point(kept[0], true));
    n.setEnd(...point(kept[1], false));
    sel.removeAllRanges();
    sel.addRange(n);
  }
  return out;
}

// Closing the sidebar and opening it again: it boots knowing whether highlights were left, as openSidebar_ does.
window.reopenSidebar = () => {
  const q = new URLSearchParams(location.search);
  if (doc.querySelector('.p3n-mark')) q.set('marks', '1');
  document.querySelector('#sidebar').src = '/sidebar?' + q;
};

// Apps Script answers in a few hundred milliseconds; so does this.
addEventListener('message', (e) => {
  const { p3nCall, args, id } = e.data || {};
  if (!p3nCall) return;
  setTimeout(() => {
    let reply;
    try { reply = { p3nReply: id, result: handlers[p3nCall](...args) }; } catch (err) { reply = { p3nReply: id, error: err.message }; }
    e.source.postMessage(reply, '*');
  }, 250);
});

// ?select=N selects paragraph pN before the sidebar loads (the menu flow: select, then Extensions → p3n).
const pick = new URLSearchParams(location.search).get('select');
if (pick) { const r = document.createRange(); r.selectNodeContents(document.querySelector('#p' + pick)); getSelection().removeAllRanges(); getSelection().addRange(r); }
</script>
</body></html>`;

export async function startHarness(port = 0) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const q = url.searchParams;
    if (url.pathname === '/') {
      return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(PAGE.replace('__QUERY__', url.search));
    }
    if (url.pathname === '/sidebar') {
      const boot = { job: q.get('job'), key: q.get('key') || '', mock: q.has('mock'), marks: q.has('marks') };
      return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(await sidebarHtml(boot, { free: q.get('free') }));
    }
    if (url.pathname === '/favicon.ico') return res.writeHead(204).end();
    res.writeHead(404).end('not found');
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const { base } = await startHarness(Number(process.env.PORT) || 8787);
  console.log(`p3n sidebar harness: ${base}/?mock=1`);
}
