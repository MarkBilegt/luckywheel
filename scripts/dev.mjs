// Local development: the Worker + local D1 (wrangler dev, :8787) and the Vite site (:5173) together.
// Ctrl+C stops both.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const npx = (args, opts = {}) => spawn('npx', args, { stdio: 'inherit', shell: true, ...opts });

// wrangler needs dist/ to exist (it serves it as static assets).
if (!existsSync('dist')) spawnSync('npx vite build', { stdio: 'inherit', shell: true });
// Create/update the local database tables.
spawnSync('npx wrangler d1 migrations apply luckywheel --local', { stdio: 'inherit', shell: true });

const children = [npx(['wrangler', 'dev', '--port', '8787']), npx(['vite'])];
const stop = () => children.forEach((c) => c.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
children.forEach((c) => c.on('exit', (code) => { if (code) { stop(); process.exit(code); } }));
