// End to end in headless Chrome, on the local harness (dev/harness.mjs): the real sidebar next to a test
// document, Check, Rewrite and Replace through the same code Docs runs, plus the refusals, the menu flow, the
// free limit, the API key screen and reduced motion. Mock API by default (no calls to p3n).
//   npm run e2e                 mock API
//   LIVE=1 npm run e2e          also one Check and one Rewrite on the live API, keyless (2 of the 10 free calls an hour)
//   CHROME=path/to/chrome       if Chrome isn't in the default Windows location
//   SLOW=4                      slows the page's CPU 4x, to shake out timing races before CI does
// Captures land in dev/out/.
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { startHarness } from './harness.mjs';

const OUT = path.join(import.meta.dirname, 'out');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const LIVE = !!process.env.LIVE;
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };

const settled = () => {
  const n = document.querySelector('.score .num');
  const sr = document.querySelector('.score .sr');
  return !!n && n.textContent === sr.textContent && !document.querySelector('.meter i')?.style.transform;
};

await mkdir(OUT, { recursive: true });
const { server, base } = await startHarness();
// CI runners have no usable Chrome sandbox.
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--window-size=1280,860', '--lang=en-US', ...(process.env.CI ? ['--no-sandbox'] : [])] });
const errors = [];

async function open(query, { calm = false } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 2 });
  if (calm) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  if (process.env.SLOW) await page.emulateCPUThrottling(Number(process.env.SLOW) || 4);
  page.on('pageerror', (e) => errors.push(`${query}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${query}: ${m.text()}`); });
  await page.goto(`${base}/${query}`);
  const frame = await (await page.waitForSelector('#sidebar')).contentFrame();
  await frame.waitForFunction(() => window.P3N_BOOT && document.readyState === 'complete');
  return { page, frame };
}

// Selects block elements in the test document, the way a user would drag across them.
const select = (page, from, to = from, { start = 0, end = null } = {}) => page.evaluate((from, to, start, end) => {
  const a = document.querySelector(from).firstChild;
  const b = document.querySelector(to).lastChild;
  const r = document.createRange();
  r.setStart(a, start);
  r.setEnd(b, end ?? b.length);
  getSelection().removeAllRanges();
  getSelection().addRange(r);
}, from, to, start, end);

const shot = async (page, name) => {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  await (await page.$('aside')).screenshot({ path: path.join(OUT, `${name}-sidebar.png`) });
};
const click = (frame, sel) => frame.$eval(sel, (b) => b.click());
const buttonByText = (frame, text) => frame.evaluateHandle((t) => [...document.querySelectorAll('button, a')].find((b) => b.textContent.trim() === t), text);
const docText = (page, sel) => page.$eval(sel, (n) => n.textContent);
// The visible blue ("action") buttons: Google's review allows one per view.
const blue = (frame) => frame.$$eval('.action', (b) => b.filter((x) => x.offsetParent).map((x) => x.textContent.trim()).join(' | '));
// The footer's link to p3n.si: opens the site in a new tab, is the link a screen reader names "p3n.si" (the arrow is
// hidden from it), shows, and sits on one line inside the sidebar. Also returns the quota line next to it.
const siteLink = async (frame) => frame.evaluate((named) => {
  const a = document.querySelector('#foot a');
  const box = a?.getBoundingClientRect();
  return {
    ok: !!a && a === named && a.getAttribute('href') === 'https://p3n.si/' && a.target === '_blank' && /\bnoopener\b/.test(a.rel)
      && a.textContent === 'p3n.si ↗' && a.title === 'Open p3n.si in your browser' && !!a.offsetParent
      && a.getClientRects().length === 1 && box.height < 20 && box.right <= innerWidth,
    quota: document.querySelector('#quota').textContent,
  };
}, await frame.$('aria/p3n.si[role="link"]'));
// The test document's highlights, [kind, text] in document order, and whole blocks selected (from the start of
// one to the end of another: highlights split a paragraph's text, so it may not start with a text node).
const marksIn = (page) => page.$$eval('#doc .p3n-mark', (m) => m.map((x) => [x.dataset.kind, x.textContent]));
const selectBlocks = (page, from, to = from) => page.evaluate((from, to) => {
  const r = document.createRange();
  const b = document.querySelector(to);
  r.setStart(document.querySelector(from), 0);
  r.setEnd(b, b.childNodes.length);
  getSelection().removeAllRanges();
  getSelection().addRange(r);
}, from, to);
const NOTICE = 'The highlights are in the document, so anyone who can open it sees them until you click Clear highlights.';
// The key screen slides in with a view transition: wait until it shows and its field has focus, or typing
// lands in the hidden field (slow CI runners hit this).
const openKeyScreen = async (frame) => {
  await click(frame, '#account');
  await frame.waitForFunction(() => !document.querySelector('#settings').hidden && document.activeElement === document.querySelector('#key'), { timeout: 5000 });
};

try {
  // ---- Check, Rewrite, Replace on one paragraph ----
  {
    const { page, frame } = await open('?mock=1');
    ok('one blue action: Check for AI before a result', (await blue(frame)) === 'Check for AI', await blue(frame));
    const link = await siteLink(frame);
    ok('footer: p3n.si ↗ after the quota line, opens https://p3n.si/ in a new tab, read as "p3n.si"', link.ok && /^Free without a key/.test(link.quota), link.quota);
    await select(page, '#p1');
    await click(frame, '#check');
    await frame.waitForFunction(settled, { timeout: 10000 });
    ok('check: selection read and scored', (await frame.$eval('.score .label', (n) => n.textContent)) === 'Likely AI-written');
    const linkAfter = await siteLink(frame);
    ok('footer: the link stays when the free count updates', linkAfter.ok && /free calls left this hour/.test(linkAfter.quota), linkAfter.quota);
    ok('check: box shows the selection', (await frame.$eval('#text', (t) => t.value)).startsWith("In today's fast-paced world"));
    ok('check: flagged sentences listed', (await frame.$$('.quotes li.hit')).length >= 1);
    await new Promise((r) => setTimeout(r, 1200)); // let the highlighter sweep finish for the capture
    await shot(page, 'check');

    await click(frame, '#rewrite');
    await frame.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent === 'Replace selection'), { timeout: 15000 });
    await frame.waitForFunction(settled, { timeout: 10000 });
    const rewrite = await frame.$eval('.rewrite', (n) => n.textContent);
    ok('rewrite: shown without the API\'s trailing line break', rewrite === rewrite.trim() && rewrite.length > 0);
    ok('rewrite: "No longer reads as AI" when the text sent scored as AI', (await frame.$eval('.score .label', (n) => n.textContent)) === 'No longer reads as AI');
    ok('one blue action: Replace selection after a rewrite', (await blue(frame)) === 'Replace selection', await blue(frame));
    await new Promise((r) => setTimeout(r, 900));
    await shot(page, 'rewrite');

    const blocksBefore = await page.$$eval('#doc h2, #doc p, #doc li', (n) => n.length);
    await (await buttonByText(frame, 'Replace selection')).click();
    await frame.waitForFunction(() => document.querySelector('.note.ok'), { timeout: 5000 });
    ok('replace: paragraph now holds the rewrite', (await docText(page, '#p1')) === rewrite);
    ok('replace: no paragraph added or lost', (await page.$$eval('#doc h2, #doc p, #doc li', (n) => n.length)) === blocksBefore);
    ok('replace: the new text is selected', (await page.evaluate(() => getSelection().toString())) === rewrite);
    ok('replace: undo hint shown', /Ctrl\+Z|Cmd\+Z/.test(await frame.$eval('.note.ok', (n) => n.textContent)));
    ok('one blue action: back to Check for AI once replaced', (await blue(frame)) === 'Check for AI', await blue(frame));
    await new Promise((r) => setTimeout(r, 500));
    await shot(page, 'replaced');

    // Check again: the box follows the document's selection, which is now the rewrite.
    await click(frame, '#check');
    const checked = await frame.waitForFunction((want) => document.querySelector('#text').value === want && /likely AI/.test(document.querySelector('.score .pct small')?.textContent ?? ''), { timeout: 10000 }, rewrite).then(() => true, () => false);
    ok('check after replace: checks the rewrite', checked);
    await page.close();
  }

  // ---- several paragraphs: one rewritten paragraph each, the short heading untouched ----
  {
    const { page, frame } = await open('?mock=1');
    await select(page, '#doc h2', '#p2');
    await click(frame, '#rewrite');
    await frame.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent === 'Replace selection'), { timeout: 15000 });
    const before = await page.$$eval('#doc h2, #doc p, #doc li', (n) => n.map((x) => x.textContent));
    await (await buttonByText(frame, 'Replace selection')).click();
    await frame.waitForFunction(() => document.querySelector('.note.ok, .note.warn'), { timeout: 5000 });
    const after = await page.$$eval('#doc h2, #doc p, #doc li', (n) => n.map((x) => x.textContent));
    ok('multi: same number of paragraphs', after.length === before.length, `${before.length} → ${after.length}`);
    ok('multi: heading left as it was', after[0] === before[0]);
    ok('multi: both paragraphs rewritten', after[1] !== before[1] && after[2] !== before[2]);
    await page.close();
  }

  // ---- a rewrite of text the detector model didn't score as AI: no "No longer" ----
  {
    const { page, frame } = await open('?mock=1');
    await select(page, '#p2');
    await click(frame, '#rewrite');
    await frame.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent === 'Replace selection'), { timeout: 15000 });
    const label = await frame.$eval('.score .label', (n) => n.textContent);
    ok('rewrite: "Doesn\'t read as AI" when the text sent didn\'t score as AI', label === "Doesn't read as AI", label);
    await page.close();
  }

  // ---- the text changed in the document before Replace ----
  {
    const { page, frame } = await open('?mock=1');
    await select(page, '#p3');
    await click(frame, '#rewrite');
    await frame.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent === 'Replace selection'), { timeout: 15000 });
    await page.evaluate(() => { const p = document.querySelector('#p3'); p.firstChild.textContent = 'Someone edited this meanwhile.'; const r = document.createRange(); r.selectNodeContents(p); getSelection().removeAllRanges(); getSelection().addRange(r); });
    await (await buttonByText(frame, 'Replace selection')).click();
    await frame.waitForFunction(() => document.querySelector('.note.warn'), { timeout: 5000 });
    ok('changed: refuses and says so', /changed/.test(await frame.$eval('.note.warn', (n) => n.textContent)));
    ok('changed: document left alone', (await docText(page, '#p3')) === 'Someone edited this meanwhile.');
    await page.close();
  }

  // ---- other text taken in after the rewrite: that rewrite no longer belongs to the selection ----
  {
    const { page, frame } = await open('?mock=1');
    await select(page, '#p3');
    await click(frame, '#rewrite');
    await frame.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent === 'Replace selection'), { timeout: 15000 });
    await select(page, '#p2');
    await click(frame, '#grab');
    await frame.waitForFunction(() => document.querySelector('#text').value.startsWith('We shipped'), { timeout: 5000 });
    await (await buttonByText(frame, 'Replace selection')).click();
    await frame.waitForFunction(() => document.querySelector('.note.warn'), { timeout: 5000 });
    ok('stale rewrite: refused after other text was taken in', /other text/.test(await frame.$eval('.note.warn', (n) => n.textContent)));
    ok('stale rewrite: document left alone', (await docText(page, '#p2')).startsWith('We shipped the new billing page'));
    await page.close();
  }

  // ---- an answer missing what the sidebar shows: an error, not a script error or a 0% score ----
  {
    const { page, frame } = await open('?mock=1');
    await frame.evaluate(() => {
      const real = window.P3N_MOCK.runSkill;
      window.P3N_MOCK.runSkill = async (skill, text, o) => { const r = await real(skill, text, o); delete r.run.output[skill === 'detect' ? 'ai' : 'text']; return r; };
    });
    for (const [button, what] of [['#check', 'score'], ['#rewrite', 'text']]) {
      await frame.evaluate(() => { const t = document.querySelector('#text'); t.value = 'Moreover, this seamless tool unlocks a rich tapestry of value for every team.'; t.dispatchEvent(new Event('input')); });
      await click(frame, button);
      await frame.waitForFunction(() => document.querySelector('#result .note.error'), { timeout: 15000 }).catch(() => {});
      const t = await frame.$eval('#result', (r) => r.innerText);
      ok(`malformed: an answer with no ${what} says so`, /can't read/.test(t), t.slice(0, 100));
    }
    await page.close();
  }

  // ---- typed text: no Replace, Copy instead ----
  {
    const { page, frame } = await open('?mock=1');
    await frame.click('#text');
    await frame.type('#text', 'Moreover, this seamless tool unlocks a rich tapestry of value for every team.');
    await click(frame, '#rewrite');
    await frame.waitForFunction(() => document.querySelector('.rewrite'), { timeout: 15000 });
    const labels = await frame.$$eval('#result button', (b) => b.map((x) => x.textContent));
    ok('typed: no Replace for text that isn\'t from the document', !labels.includes('Replace selection') && labels.includes('Copy'), labels.join(', '));
    // Copy says what happened: Copied, or (no clipboard for the frame) the rewrite selected and a key to press.
    const copyBtn = await buttonByText(frame, 'Copy');
    await copyBtn.click();
    const said = await frame.waitForFunction((b) => b.textContent !== 'Copy' && b.textContent, { timeout: 3000 }, copyBtn).then((h) => h.jsonValue(), () => 'Copy');
    ok('typed: Copy confirms', /^(Copied|Press (Ctrl|Cmd)\+C)$/.test(said), said);
    await page.close();
  }

  // ---- nothing selected ----
  {
    const { page, frame } = await open('?mock=1');
    await click(frame, '#check');
    await frame.waitForFunction(() => !document.querySelector('#hint').hidden, { timeout: 5000 });
    ok('nothing selected: says so, sends nothing', /Nothing is selected/.test(await frame.$eval('#hint', (n) => n.textContent)) && !(await frame.$('#result > *')));
    await page.close();
  }

  // ---- Extensions → p3n → Check selection: runs on open ----
  {
    const { page, frame } = await open('?mock=1&job=detect&select=3');
    await frame.waitForFunction(settled, { timeout: 10000 });
    ok('menu: check runs on the selection when the sidebar opens', (await frame.$eval('#text', (t) => t.value)).startsWith('Additionally'));
    await page.close();
  }

  // ---- free calls used up ----
  {
    const { page, frame } = await open('?mock=1&free=0&select=1');
    await frame.waitForFunction(() => document.querySelector('#text').value);
    await click(frame, '#check');
    await frame.waitForFunction(() => document.querySelector('.note.error'), { timeout: 10000 });
    const t = await frame.$eval('.note.error', (n) => n.textContent);
    ok('free limit: explains and offers sign-up and a key', /used up/.test(t) && /Sign up/.test(t) && /Add an API key/.test(t));
    ok('one blue action: Sign up on the free-limit error', (await blue(frame)) === 'Sign up', await blue(frame));
    await new Promise((r) => setTimeout(r, 500));
    await shot(page, 'free-limit');
    await page.close();
  }

  // ---- highlights in the document after a check ----
  {
    const { page, frame } = await open('?mock=1');
    await selectBlocks(page, '#doc h2', '#p3');
    await click(frame, '#check');
    await frame.waitForFunction(settled, { timeout: 10000 });
    await frame.waitForFunction(() => !document.querySelector('#marks').hidden, { timeout: 5000 });
    const marks = await marksIn(page);
    const listed = await frame.$$eval('.quotes li.hit q', (q) => q.map((x) => x.textContent));
    const ai = marks.filter(([k]) => k === 'ai').map(([, t]) => t);
    ok('highlights: the listed sentences marked in the document', listed.length === 3 && JSON.stringify(ai) === JSON.stringify(listed), `${ai.length} of ${listed.length}`);
    const hit = marks.filter(([k]) => k === 'hit').map(([, t]) => t);
    const colours = await page.$$eval('#doc .p3n-mark', (m) => [...new Set(m.map((x) => `${x.dataset.kind} ${getComputedStyle(x).backgroundColor}`))]);
    ok('highlights: the pattern hit in a lighter colour, its curly quotes matched', JSON.stringify(hit) === JSON.stringify(['It’s not just a tool, it’s a new way to work.']) && colours.length === 2, colours.join(', '));
    const box = await frame.$eval('#marks', (m) => ({ text: m.querySelector('p').textContent, button: m.querySelector('button').textContent, after: !!(document.querySelector('#result').compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING) }));
    ok('highlights: the notice and Clear highlights under the result', box.text === NOTICE && box.button === 'Clear highlights' && box.after && (await blue(frame)) === 'Check for AI');
    await shot(page, 'highlights');

    // The next Check takes them off first: this paragraph has nothing to mark.
    await selectBlocks(page, '#p2');
    await click(frame, '#check');
    // The last result shows until this one replaces it: wait for this one, and for the run to end.
    await frame.waitForFunction(() => document.querySelector('.score .label')?.textContent === 'Likely human-written' && !document.querySelector('#check').disabled, { timeout: 10000 });
    await frame.waitForFunction(() => document.querySelector('#marks').hidden, { timeout: 5000 }).catch(() => {});
    ok('highlights: cleared on the next Check', !(await marksIn(page)).length && await frame.$eval('#marks', (m) => m.hidden));

    // Left in the document when the sidebar closes: it opens again with Clear highlights.
    await selectBlocks(page, '#p1');
    await click(frame, '#check');
    await frame.waitForFunction(() => !document.querySelector('#marks').hidden, { timeout: 15000 });
    const before = await docText(page, '#p1');
    await Promise.all([frame.waitForNavigation(), page.evaluate(() => window.reopenSidebar())]);
    await frame.waitForFunction(() => window.P3N_BOOT && document.readyState === 'complete');
    ok('highlights: left in the document, the reopened sidebar offers Clear highlights', await frame.$eval('#marks', (m) => !m.hidden && !document.querySelector('#result > *')));
    await click(frame, '#unmark');
    await frame.waitForFunction(() => document.querySelector('#marks').hidden, { timeout: 5000 }).catch(() => {});
    ok('highlights: Clear highlights takes them off, text as it was', !(await marksIn(page)).length && (await docText(page, '#p1')) === before && await frame.$eval('#marks', (m) => m.hidden));

    // Rewrite takes them off before it runs, so Replace never carries one.
    await click(frame, '#check');
    await frame.waitForFunction(() => !document.querySelector('#marks').hidden, { timeout: 15000 });
    await click(frame, '#rewrite');
    await frame.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent === 'Replace selection'), { timeout: 15000 });
    const during = (await marksIn(page)).length;
    await (await buttonByText(frame, 'Replace selection')).click();
    await frame.waitForFunction(() => document.querySelector('.note.ok'), { timeout: 5000 });
    ok('highlights: cleared on Rewrite, so Replace carries none', !during && !(await marksIn(page)).length && await frame.$eval('#marks', (m) => m.hidden));
    await page.close();
  }

  // ---- API key screen ----
  {
    const { page, frame } = await open('?mock=1');
    await openKeyScreen(frame);
    await frame.type('#key', 'sk-not-a-p3n-key');
    await frame.waitForFunction(() => document.querySelector('#key-status').classList.contains('warn'));
    ok('key: a malformed key is caught before any call', true);
    await frame.$eval('#key', (k) => { k.value = ''; });
    await frame.type('#key', `p3n_0123456789ab_${'A'.repeat(32)}`);
    await frame.waitForFunction(() => document.querySelector('#key-status').classList.contains('ok'), { timeout: 5000 });
    ok('key: a key p3n accepts is saved', /Saved\. Signed in as/.test(await frame.$eval('#key-status', (n) => n.textContent)));
    await new Promise((r) => setTimeout(r, 400));
    await shot(page, 'key');
    await click(frame, '#back');
    await frame.waitForFunction(() => /Balance \$4\.20/.test(document.querySelector('#quota').textContent), { timeout: 5000 });
    ok('key: footer shows the balance', true);
    const linkKey = await siteLink(frame);
    ok('footer: the link stays with a key, next to the balance', linkKey.ok, linkKey.quota);
    await openKeyScreen(frame);
    await frame.$eval('#key', (k) => { k.value = ''; });
    await frame.type('#key', `p3n_0123456789ab_bad${'A'.repeat(29)}`);
    await frame.waitForFunction(() => document.querySelector('#key-status').classList.contains('error'), { timeout: 5000 });
    ok('key: a revoked key is refused and the old one kept', /wasn't saved/.test(await frame.$eval('#key-status', (n) => n.textContent)));
    await click(frame, '#remove');
    await frame.waitForFunction(() => /Key removed/.test(document.querySelector('#key-status').textContent), { timeout: 5000 });
    ok('key: removed', true);
    await page.close();
  }

  // ---- reduced motion: the end state at once ----
  {
    const { page, frame } = await open('?mock=1&select=1', { calm: true });
    await frame.waitForFunction(() => document.querySelector('#text').value);
    await click(frame, '#check');
    await frame.waitForSelector('.score', { timeout: 10000 });
    ok('reduced motion: score shows its value with no count-up', await frame.evaluate(settled));
    await page.close();
  }

  // ---- live API, keyless: 2 calls ----
  if (LIVE) {
    const { page, frame } = await open('?select=1');
    await frame.waitForFunction(() => document.querySelector('#text').value);
    await click(frame, '#check');
    await frame.waitForFunction(() => document.querySelector('.score, .note.error'), { timeout: 60000 });
    const err = await frame.$eval('#result', (n) => n.querySelector('.note.error')?.textContent ?? '');
    ok('live: check answered', !err, err);
    if (!err) {
      await frame.waitForFunction(settled, { timeout: 10000 });
      await new Promise((r) => setTimeout(r, 1200));
      await shot(page, 'live-check');
      await click(frame, '#rewrite');
      await frame.waitForFunction(() => document.querySelector('.rewrite, .note.error'), { timeout: 120000 });
      const err2 = await frame.$eval('#result', (n) => n.querySelector('.note.error')?.textContent ?? '');
      ok('live: rewrite answered', !err2, err2);
      if (!err2) {
        await frame.waitForFunction(settled, { timeout: 10000 });
        const rewrite = await frame.$eval('.rewrite', (n) => n.textContent);
        await (await buttonByText(frame, 'Replace selection')).click();
        await frame.waitForFunction(() => document.querySelector('.note.ok, .note.warn'), { timeout: 5000 });
        ok('live: replaced, no trailing line break', (await docText(page, '#p1')) === rewrite && !/\n$/.test(await docText(page, '#p1')));
        await new Promise((r) => setTimeout(r, 900));
        await shot(page, 'live-replaced');
      }
      console.log(`      free calls left this hour: ${await frame.$eval('#quota', (n) => n.textContent)}`);
    }
    await page.close();
  }

  ok('no page errors', !errors.length, errors.join(' | '));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
