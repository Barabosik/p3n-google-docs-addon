// The publishing setup in one command: a standalone Apps Script project named "p3n" holding src/, pushed.
// An Editor add-on is published from a standalone project, not one bound to a document.
// Run `npx clasp login` as the publishing account first. A bound test project's .clasp.json is kept as
// .clasp.test.json (git ignores both).
//   node dev/standalone.mjs
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync } from 'node:fs';
import path from 'node:path';

process.chdir(path.join(import.meta.dirname, '..'));
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

if (existsSync('.clasp.json')) {
  if (existsSync('.clasp.test.json')) throw new Error('Both .clasp.json and .clasp.test.json exist. Move one of them away first.');
  renameSync('.clasp.json', '.clasp.test.json');
  console.log('Kept the old .clasp.json as .clasp.test.json.');
}
run('npx clasp create --type standalone --title "p3n" --rootDir src');
run('git checkout -- src/appsscript.json'); // clasp swaps in its default manifest
run('npx clasp push --force');

const { scriptId } = JSON.parse(readFileSync('.clasp.json', 'utf8'));
console.log(`\nDone. The project: https://script.google.com/home/projects/${scriptId}/edit`);
console.log('Next: Project Settings → Google Cloud Platform (GCP) Project → Change project, with the Cloud project number.');
