// src/api.html, the sidebar's API client, against a stand-in fetch: what every call sends to p3n.
//   node --test dev/api.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');

// The script inside api.html, run as the sidebar would, with `fetch` stubbed.
async function load(fetch) {
  const html = await readFile(path.join(ROOT, 'src', 'api.html'), 'utf8');
  const js = html.replace(/^\s*<script>/, '').replace(/<\/script>\s*$/, '');
  const window = {};
  vm.runInNewContext(js, { window, fetch, setTimeout, clearTimeout, DOMException });
  return window.P3N_API;
}

test('every call names this client and its version (X-P3N-Client), the same as package.json', async () => {
  const { version } = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  const sent = [];
  const api = await load(async (url, init) => {
    sent.push(init.headers);
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ id: 'r1', status: 'succeeded', skill: 'detect', output: { ai: 0.5 } }) };
  });
  assert.equal(api.CLIENT, `p3n-gdocs/${version}`);
  await api.runSkill('detect', 'Some text.');
  await api.me('p3n_0123456789ab_' + 'x'.repeat(32));
  assert.equal(sent.length, 2);
  for (const headers of sent) assert.equal(headers['X-P3N-Client'], `p3n-gdocs/${version}`);
});
