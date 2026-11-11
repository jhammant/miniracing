// Smoke test of a deployed copy: two browsers share an online room and race
// for a few seconds. Stops before a lap is finished, so nothing reaches the
// record board.   BASE_URL=https://example.com node test/e2e/live.js

import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { launch, open, act, sleep, autopilot, state } from './lib.js';

const url = process.env.BASE_URL;
assert.ok(url, 'set BASE_URL');
const SHOTS = new URL('./shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const browser = await launch();
try {
  const host = await open(browser, url, 'desktop');
  await host.fill('#name', 'smoke');
  await act(host, 'create');
  await host.waitForSelector('.lobby .code');
  const code = (await host.textContent('.lobby .code')).trim();
  const guest = await open(browser, `${url}/?j=${code}`, 'phone');
  await guest.fill('#name', 'smoke2');
  await act(guest, 'join');
  await guest.waitForSelector('.lobby');
  await host.screenshot({ path: `${SHOTS}live-lobby.png` });
  await act(host, 'start');
  for (const p of [host, guest]) {
    await p.waitForFunction(() => window.miniracing.session?.game?.started, null, { timeout: 15000 });
    await autopilot(p);
  }
  await sleep(5000);
  const [a, b] = await Promise.all([state(host), state(guest)]);
  for (const [own, other] of [[a, b], [b, a]]) {
    const real = own.cars.find((c) => c.id === own.mine), seen = other.cars.find((c) => c.id === own.mine);
    assert.ok(real.total > 30, `${real.name} is under way`);
    assert.ok(Math.hypot(seen.x - real.x, seen.z - real.z) < 15, `${real.name} is where the other player sees them`);
  }
  await host.screenshot({ path: `${SHOTS}live-race.png` });
  await guest.screenshot({ path: `${SHOTS}live-race-phone.png` });
  assert.deepEqual([...host.problems, ...guest.problems], [], 'no errors in either browser console');
  const board = await (await fetch(`${url}/api/records`)).json();
  assert.ok(Object.keys(board).length >= 4, 'the record board answers');
  console.log(`ok   live room ${code} at ${url}`);
} finally {
  await browser.close();
}
