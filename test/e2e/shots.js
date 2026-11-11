// Screenshots of the main screens at desktop and phone sizes, for looking at.
//   node test/e2e/shots.js [track]

import { mkdirSync } from 'node:fs';
import { launch, open, act, sleep, autopilot } from './lib.js';

const OUT = new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const track = process.argv[2] || 'breakfast';
const base = process.env.BASE_URL || 'http://localhost:8090';
const browser = await launch();
const problems = [];

for (const view of ['desktop', 'phone', 'phoneWide']) {
  const page = await open(browser, base, view);
  const shot = (name) => page.screenshot({ path: `${OUT}${view}-${name}.png` });
  await sleep(2500);
  await shot('home');
  await act(page, 'solo');
  await page.waitForSelector('.lobby');
  await page.click(`[data-key=track][data-val=${track}]`);
  await sleep(1200);
  await shot('lobby');
  await act(page, 'start');
  await sleep(2500);
  await shot('countdown');
  await sleep(3200);
  await shot(`race-${track}`);
  await autopilot(page);
  await sleep(9000);
  await shot(`race2-${track}`);
  await page.keyboard.press('Escape');
  await sleep(400);
  await shot('menu');
  problems.push(...page.problems);
  await page.context().close();
}
await browser.close();
if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
console.log(`shots in ${OUT}`);
