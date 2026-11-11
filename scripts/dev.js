// Runs the game server and the Vite dev server together.  npm run dev

import { spawn } from 'node:child_process';

const run = (cmd, args, env = {}) => spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } });
// Vite's proxy rewrites the Origin header, so allow the dev origins explicitly.
const kids = [
  run('node', ['server/index.js'], { PORT: '8080', ALLOWED_ORIGINS: 'localhost:5173,localhost:8080,127.0.0.1:5173' }),
  run('npx', ['vite']),
];
const stop = () => { for (const k of kids) k.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const k of kids) k.on('exit', stop);
