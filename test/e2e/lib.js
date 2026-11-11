// Shared helpers for the browser tests: one Chrome, pages that fail loudly.

import { chromium } from 'playwright-core';


export const VIEWS = {
  desktop: { viewport: { width: 1280, height: 720 } },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  phoneWide: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  tv: { viewport: { width: 1920, height: 1080 } },
};

export async function launch() {
  return chromium.launch({
    channel: 'chrome',
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
}

// A page whose console errors and crashes are collected in `page.problems`.
export async function open(browser, url, view = 'desktop') {
  const ctx = await browser.newContext(VIEWS[view]);
  const page = await ctx.newPage();
  page.problems = [];
  page.on('pageerror', (e) => page.problems.push(`${view}: ${e.message}\n${(e.stack || '').split('\n').slice(1, 4).join('\n')}`));
  page.on('console', (m) => { if (m.type() === 'error') page.problems.push(`${view}: console: ${m.text()}`); });
  await page.goto(url);
  await page.waitForSelector('#ui.on');
  return page;
}

export const act = (page, name) => page.click(`[data-act=${name}]`);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Drives the page's own car round the track, so a test can finish a race.
export const autopilot = (page) => page.evaluate(() => {
  const { game } = window.miniracing.session;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  game.input = (out) => {
    const car = game.cars.get(game.myCar), sp = Math.hypot(car.vx, car.vz);
    const p = game.world.track.pointAt(car.s + 9 + sp * 0.35, 0);
    const err = wrap(Math.atan2(p.x - car.x, p.z - car.z) - car.h);
    out.steer = Math.max(-1, Math.min(1, -err * 2.5));
    out.throttle = Math.abs(err) > 0.9 && sp > 14 ? 0 : 1;
    out.brake = 0;
  };
});

// What the page's game currently believes, in a form a test can assert on.
export const state = (page) => page.evaluate(() => {
  const s = window.miniracing.session;
  if (!s || !s.game) return { phase: s?.room?.phase || null, cars: [] };
  return {
    phase: s.room.phase, role: s.me.role, mine: s.me.car, started: s.game.started,
    cars: [...s.game.cars.values()].map((c) => ({ id: c.id, name: c.name, bot: c.bot, local: c.local, x: c.x, z: c.z, laps: c.laps, total: c.total, finished: c.finished, out: c.out })),
  };
});
