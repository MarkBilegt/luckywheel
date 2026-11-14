// End-to-end API test: starts the real server on a spare port, with its own throwaway database and
// a random admin password, then checks the whole API. Never touches your real data or the live site.
//
//   npm run test:api         → the Cloudflare Worker via `wrangler dev` (D1)
//   npm run test:api:node    → the VPS/Docker server (Node + SQLite)
//   node scripts/api-test.mjs --url=http://localhost:8080 --password=…   → an already running server
//
// Takes ~1.5 min because it waits out a rate limit.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const target = process.argv.includes('--node') ? 'node' : arg('url') ? 'external' : 'worker';
const projectDir = process.cwd();
const PORT = target === 'node' ? 8798 : 8799;
const BASE = arg('url') ?? `http://localhost:${PORT}`;
const persist = join(projectDir, '.wrangler', target === 'node' ? 'test-node' : 'test-state');
const PASSWORD = arg('password') ?? 'test-' + randomBytes(8).toString('hex');
const SECRET = randomBytes(32).toString('hex');
let server = null;
console.log(`Testing the ${target === 'node' ? 'Node/SQLite (VPS)' : target === 'worker' ? 'Cloudflare Worker/D1' : 'running'} server at ${BASE}`);

if (target !== 'external') {
  cleanUp(); // start from an empty database
  if (target === 'worker') {
    const mig = spawnSync(`npx wrangler d1 migrations apply luckywheel --local --persist-to "${persist}"`, { cwd: projectDir, shell: true, encoding: 'utf8' });
    if (mig.status !== 0) {
      console.error(mig.stdout, mig.stderr);
      process.exit(1);
    }
    server = spawn(
      `npx wrangler dev --port ${PORT} --persist-to "${persist}" --var ADMIN_PASSWORD:${PASSWORD} --var SESSION_SECRET:${SECRET}`,
      { cwd: projectDir, shell: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } else {
    server = spawn(process.execPath, ['server/index.ts'], {
      cwd: projectDir,
      env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATABASE_PATH: join(persist, 'test.db'), ADMIN_PASSWORD: PASSWORD, SESSION_SECRET: SECRET, TRUST_PROXY: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
  let log = '';
  server.stdout.on('data', (d) => (log += d));
  server.stderr.on('data', (d) => (log += d));
  const ready = /Ready on|running on/;
  for (let i = 0; i < 300 && !ready.test(log); i++) await new Promise((r) => setTimeout(r, 100));
  if (!ready.test(log)) {
    console.error('server did not start:\n' + log);
    stopServer();
    process.exit(1);
  }
}

function stopServer() {
  if (!server) return;
  if (process.platform === 'win32') spawnSync(`taskkill /pid ${server.pid} /T /F`, { shell: true });
  else server.kill();
}

let cookie = '';
const results = [];
const check = (name, ok, info = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  — ${info}` : ''}`);

async function call(method, path, body, useCookie = false) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(useCookie && cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = res.headers.get('set-cookie');
  if (sc && sc.startsWith('lw_admin=')) cookie = sc.split(';')[0];
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}

let n = 0;
const phone = () => `99${String(200000 + n++).padStart(6, '0')}`;

try {
  // static site + SPA fallback + headers
  const home = await call('GET', '/');
  check('site served from dist', home.status === 200 && String(home.data).includes('<html lang="mn">'));
  check('security headers on pages (_headers)', home.headers.get('x-frame-options') === 'DENY');
  check('unknown page falls back to the app', (await call('GET', '/whatever/page')).status === 200);
  check('unknown API path is a JSON 404', (await call('GET', '/api/nope')).status === 404);

  const wheel = await call('GET', '/api/wheel');
  check('public wheel hides the odds', wheel.status === 200 && wheel.data.segments.every((s) => !('weight' in s)));

  // admin login
  check('admin needs login', (await call('GET', '/api/admin/config')).status === 401);
  check('wrong password rejected', (await call('POST', '/api/admin/login', { password: 'wrong-password-1' })).status === 401);
  const login = await call('POST', '/api/admin/login', { password: PASSWORD });
  check('login works', login.status === 200 && !!cookie);
  const sc = login.headers.get('set-cookie') ?? '';
  check('cookie is HttpOnly + Secure + SameSite=Strict', /HttpOnly/i.test(sc) && /Secure/i.test(sc) && /SameSite=Strict/i.test(sc));
  const cfg = (await call('GET', '/api/admin/config', null, true)).data;

  // validation (each counts towards the 10-per-minute spin limit)
  check('name required', (await call('POST', '/api/spin', { name: '', phone: phone(), consent: true })).status === 400);
  check('bad number rejected', (await call('POST', '/api/spin', { name: 'Бат', phone: '1234', consent: true })).status === 400);
  check('consent required', (await call('POST', '/api/spin', { name: 'Бат', phone: phone(), consent: false })).status === 400);
  const broken = await fetch(BASE + '/api/spin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
  check('broken JSON → 400', broken.status === 400);

  // a real spin
  const s1 = await call('POST', '/api/spin', { name: 'Болд', phone: '+976 8811 2233', consent: true });
  check('spin succeeds', s1.status === 200, s1.data?.record?.label ?? JSON.stringify(s1.data));
  check('phone stored as 8 digits', s1.data?.record?.phone === '88112233');
  check('slice index matches the prize', s1.data.segments[s1.data.segmentIndex].id === s1.data.record.segmentId);
  const s2 = await call('POST', '/api/spin', { name: 'Болд', phone: '8811-2233', consent: true });
  check('same number (other format) blocked', s2.status === 429, s2.data?.error);

  // double-click race
  const p = phone();
  const race = await Promise.all(Array.from({ length: 3 }, () => call('POST', '/api/spin', { name: 'Сараа', phone: p, consent: true })));
  check('simultaneous spins: exactly one succeeds', race.filter((r) => r.status === 200).length === 1, race.map((r) => r.status).join(','));

  // 9 spin requests so far this minute: the 10th is allowed, the 11th must be refused
  await call('POST', '/api/spin', { name: 'Ган', phone: phone(), consent: true });
  const burst = await call('POST', '/api/spin', { name: 'Ган', phone: phone(), consent: true });
  check('burst limit: 10 spins per minute per IP', burst.status === 429 && !!burst.headers.get('retry-after'), burst.data?.error);

  // call list
  const c1 = await call('PUT', '/api/admin/contacts/8811-2233', { contacted: true, note: 'Маргааш залгах' }, true);
  check('save a call note', c1.status === 200 && c1.data.phone === '88112233');
  check('call note listed', (await call('GET', '/api/admin/contacts', null, true)).data[0]?.note === 'Маргааш залгах');

  // config cleaning
  const junk = await call('PUT', '/api/admin/config', { settings: { nameField: 'evil' }, design: { buttonColor: 'red' }, segments: [{ type: 'hack' }] }, true);
  check(
    'junk config is cleaned',
    junk.data.settings.nameField === cfg.settings.nameField && junk.data.design.buttonColor === cfg.design.buttonColor && junk.data.segments.length === cfg.segments.length,
  );

  // daily reset with 2 spins per number
  await call('PUT', '/api/admin/config', { ...cfg, settings: { ...cfg.settings, spinsPerPhone: 2, cooldownHours: 0, resetSpinsDaily: true, resetTime: '00:00' } }, true);
  console.log('waiting 61s for the per-minute spin limit to reset…');
  await new Promise((r) => setTimeout(r, 61_000));
  const daily = phone();
  const d1 = await call('POST', '/api/spin', { name: 'Өдөр', phone: daily, consent: true });
  const d2 = await call('POST', '/api/spin', { name: 'Өдөр', phone: daily, consent: true });
  const d3 = await call('POST', '/api/spin', { name: 'Өдөр', phone: daily, consent: true });
  check('2 spins per day, then blocked', d1.status === 200 && d2.status === 200 && d3.status === 429 && /Өнөөдрийн/.test(d3.data?.error ?? ''), d3.data?.error);

  // coupons: force a win on the 10% slice
  await call('PUT', '/api/admin/config', { ...cfg, segments: cfg.segments.map((s) => ({ ...s, weight: s.type === 'percent' && s.value === 10 ? 1 : 0 })) }, true);
  const win = (await call('POST', '/api/spin', { name: 'Дорж', phone: phone(), consent: true })).data;
  check('weights respected (forced 10% win)', win?.record?.type === 'percent' && !!win.record.code);
  check('coupon is valid (any letter case)', (await call('GET', `/api/admin/coupons/${win.record.code.toLowerCase()}`, null, true)).data.status === 'valid');
  const r1 = (await call('POST', `/api/admin/coupons/${win.record.code}/redeem`, null, true)).data;
  const r2 = (await call('POST', `/api/admin/coupons/${win.record.code}/redeem`, null, true)).data;
  check('a code can be used only once', r1.status === 'redeemed' && r2.record.redeemedAt === r1.record.redeemedAt);

  const spins = (await call('GET', '/api/admin/spins', null, true)).data;
  check('spin list hides IPs and slots', spins.length >= 4 && spins.every((s) => !('ip' in s) && !('slot' in s)));

  await call('PUT', '/api/admin/config', { ...cfg, settings: { ...cfg.settings, enabled: false } }, true);
  check('wheel switched off → spin refused', (await call('POST', '/api/spin', { name: 'Х', phone: phone(), consent: true })).status === 403);

  await call('POST', '/api/admin/logout', null, true);
  cookie = '';
  check('logout', (await call('GET', '/api/admin/config', null, true)).status === 401);

  // password guessing is limited to 8 tries per 15 minutes (windows follow the clock, so count until refused)
  let tries = 0;
  let last;
  do {
    last = await call('POST', '/api/admin/login', { password: 'nope-nope-nope' });
    tries++;
  } while (last.status === 401 && tries < 12);
  check('password guessing is limited', last.status === 429, `refused after ${tries} more tries`);
} catch (err) {
  console.error(err);
  results.push('FAIL  test crashed: ' + err.message);
} finally {
  stopServer();
}

console.log(results.join('\n'));
const passed = results.filter((r) => r.startsWith('PASS')).length;
console.log(`\n${passed}/${results.length} passed`);
if (target !== "external") cleanUp();
process.exit(passed === results.length && results.length > 0 ? 0 : 1);

/** Removes the throwaway database. On Windows the stopped Worker can hold files for a moment, so retry. */
function cleanUp() {
  try {
    rmSync(persist, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch {
    console.log(`(could not remove ${persist} yet; it is ignored by git and gets reset on the next run)`);
  }
}
