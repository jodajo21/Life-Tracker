// One-time setup: creates the database, sets your secrets, and deploys to your own Cloudflare account.
//   npm run setup
import { spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import readline from 'readline/promises';

const run = (args, opts = {}) => spawnSync('npx', ['wrangler', ...args], { encoding: 'utf8', stdio: opts.input ? ['pipe', 'pipe', 'inherit'] : ['inherit', 'pipe', 'inherit'], ...opts });
const show = (r) => { if (r.stdout) process.stdout.write(r.stdout); return r; };
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const die = (m) => { console.error('\n✗ ' + m); process.exit(1); };

console.log('\nOrrery setup\n');
let who = run(['whoami']);
if (/not authenticated|not logged/i.test(who.stdout + (who.stderr || '')) || who.status !== 0) {
  console.log('Opening the Cloudflare sign-in in your browser…');
  if (spawnSync('npx', ['wrangler', 'login'], { stdio: 'inherit' }).status !== 0) die('Sign-in did not finish.');
}

let toml = fs.readFileSync('wrangler.toml', 'utf8');
if (toml.includes('REPLACE_WITH_ID_FROM_SETUP')) {
  console.log('Creating your database…');
  const r = run(['d1', 'create', 'orrery']); const out = (r.stdout || '') + (r.stderr || '');
  const id = out.match(/database_id\s*=\s*"([0-9a-f-]{36})"/)?.[1] || out.match(/"database_id":\s*"([0-9a-f-]{36})"/)?.[1];
  if (!id) { console.log(out); die('Could not read the new database id. If a database named "orrery" already exists, paste its id into wrangler.toml and run this again.'); }
  toml = toml.replace('REPLACE_WITH_ID_FROM_SETUP', id); fs.writeFileSync('wrangler.toml', toml);
}

console.log('Preparing the database…');
if (run(['d1', 'migrations', 'apply', 'orrery', '--remote']).status !== 0) die('The database could not be prepared.');

const code = crypto.randomBytes(9).toString('base64url');
console.log('\nYour access code (you will type it once on each device): ' + code);
const key = (await rl.question('\nPaste your Anthropic API key (starts sk-ant-): ')).trim();
if (!key) die('An API key is needed for photos, text logging and Ask.');
for (const [name, value] of [['APP_TOKEN', code], ['ANTHROPIC_API_KEY', key]]) {
  const r = spawnSync('npx', ['wrangler', 'secret', 'put', name], { input: value + '\n', encoding: 'utf8', stdio: ['pipe', 'inherit', 'inherit'] });
  if (r.status !== 0) die('Could not save ' + name + '.');
}

console.log('\nBuilding and deploying…');
const b = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' }); if (b.status !== 0) die('Build failed.');
const d = show(run(['deploy'])); if (d.status !== 0) die('Deploy failed.');
const url = (d.stdout.match(/https:\/\/[^\s]+\.workers\.dev/) || ['(see the line above)'])[0];

console.log(`\n✓ Done.\n\n  App:          ${url}\n  Access code:  ${code}\n\nKeep the code somewhere safe. On your iPhone open the link in Safari → Share → Add to Home Screen.\nSiri: see README.md, "Hey Siri, log workout".\n`);
rl.close();
