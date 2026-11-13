// Starts the API server and the Vite dev server together; Ctrl+C stops both.
import { spawn } from 'node:child_process';

const run = (script) => spawn('npm', ['run', script], { stdio: 'inherit', shell: true });
const children = [run('dev:api'), run('dev:web')];

const stop = () => children.forEach((c) => c.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
children.forEach((c) => c.on('exit', (code) => { if (code) { stop(); process.exit(code); } }));
