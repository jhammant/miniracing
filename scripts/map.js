// Draws each track as an SVG (and a PNG with --png) for checking layouts:
// the lap, shortcuts, solids, zones, movers, item boxes, pads, the bots' line and where
// they came unstuck in a simulated race.  node scripts/map.js [--png] [--out dir]

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TRACKS } from '../src/shared/tracks.js';
import { getWorld } from '../src/shared/world.js';
import { bakeAI, makeBot, botInput } from '../src/shared/ai.js';
import { makeCar, placeCar, stepCar, collideCars, DT } from '../src/shared/physics.js';
import { updateMovers } from '../src/shared/world.js';

const K = 5; // pixels per unit
const ZONE = { slick: '#9bd3ff', sticky: '#c2185b', hole: '#111', jump: '#ff9f1c', boost: '#ffe14d' };

function incidents(world) {
  const cars = [], bots = [], marks = [];
  for (let i = 0; i < 16; i++) {
    const car = makeCar(i + 1), g = world.grid(i);
    placeCar(car, world, g.s, g.lat); car.frozen = false;
    cars.push(car); bots.push(makeBot(i + 1));
  }
  const inp = {};
  const emit = (type, car) => {
    if (type === 'lap') car.lapsDone++;
    else if (type === 'fall') marks.push({ x: car.x, z: car.z, c: '#f0f' });
  };
  for (let t = 0; t < 70; t += DT) {
    updateMovers(world, t);
    cars.forEach((car, i) => {
      const before = bots[i].stuckCount || 0;
      botInput(car, bots[i], world, cars, DT, null, inp);
      if ((bots[i].stuckCount || 0) > before) marks.push({ x: car.x, z: car.z, c: '#0ff' });
      stepCar(car, inp, DT, world, emit);
    });
    collideCars(cars, cars, emit);
  }
  return marks;
}

export function trackSvg(id) {
  const world = getWorld(id), { track, def } = world, ai = bakeAI(world);
  const W = def.size.w * K + 40, H = def.size.d * K + 40;
  const X = (x) => (x + world.hx) * K + 20, Z = (z) => (z + world.hz) * K + 20;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="monospace" font-size="12">`,
    `<rect width="${W}" height="${H}" fill="#222"/>`,
    `<rect x="20" y="20" width="${def.size.w * K}" height="${def.size.d * K}" fill="#4a5a4a" stroke="${def.edge === 'wall' ? '#fff' : '#f55'}" stroke-width="3"/>`];
  const edge = (side) => Array.from({ length: track.n }, (_, i) => `${X(track.sx[i] + track.nx[i] * track.hw * side).toFixed(1)},${Z(track.sz[i] + track.nz[i] * track.hw * side).toFixed(1)}`).join(' ');
  out.push(`<polygon points="${Array.from({ length: track.n }, (_, i) => `${X(track.sx[i]).toFixed(1)},${Z(track.sz[i]).toFixed(1)}`).join(' ')}" fill="none" stroke="#777" stroke-width="${track.width * K}" stroke-linejoin="round"/>`);
  out.push(`<polygon points="${edge(1)}" fill="none" stroke="#fff" stroke-width="1"/>`, `<polygon points="${edge(-1)}" fill="none" stroke="#e33" stroke-width="1"/>`);
  out.push(`<polyline points="${Array.from({ length: track.n }, (_, i) => `${X(track.sx[i] + track.nx[i] * ai.lat[i]).toFixed(1)},${Z(track.sz[i] + track.nz[i] * ai.lat[i]).toFixed(1)}`).join(' ')}" fill="none" stroke="#6f6" stroke-width="1.5"/>`);
  for (const c of world.cuts) {
    out.push(`<polyline points="${c.x.map((x, i) => `${X(x).toFixed(1)},${Z(c.z[i]).toFixed(1)}`).join(' ')}" fill="none" stroke="#fa0" stroke-opacity="0.45" stroke-width="${c.hw * 2 * K}"/>`);
  }
  for (let f = 0; f < 1; f += 0.05) {
    const p = track.pointAt(f * track.len, 0);
    out.push(`<text x="${X(p.x)}" y="${Z(p.z)}" fill="#ff0">${f.toFixed(2)}</text>`);
  }
  const rect = (o, fill, extra = '') => {
    const deg = (-Math.atan2(o.sin, o.cos) * 180) / Math.PI;
    out.push(`<rect x="${-o.hw * K}" y="${-o.hd * K}" width="${o.hw * 2 * K}" height="${o.hd * 2 * K}" fill="${fill}" ${extra} transform="translate(${X(o.x)} ${Z(o.z)}) rotate(${deg})"/>`);
  };
  for (const zn of world.zones) {
    if (zn.r) out.push(`<circle cx="${X(zn.x)}" cy="${Z(zn.z)}" r="${zn.r * K}" fill="${ZONE[zn.kind]}" opacity="0.75"/>`);
    else rect(zn, ZONE[zn.kind], 'opacity="0.75"');
  }
  for (const o of world.solids) {
    if (o.shape === 'circle') out.push(`<circle cx="${X(o.x)}" cy="${Z(o.z)}" r="${o.r * K}" fill="${o.low ? '#c96' : '#e8e0d0'}" stroke="#000"/>`);
    else rect(o, o.low ? '#c96' : '#e8e0d0', 'stroke="#000"');
  }
  for (const p of world.props) if (p.spec.shape === 'none') out.push(`<circle cx="${X(p.x)}" cy="${Z(p.z)}" r="6" fill="none" stroke="#aaa" stroke-dasharray="3"/>`);
  for (const p of world.props) out.push(`<text x="${X(p.x) + 6}" y="${Z(p.z) - 6}" fill="#fff" font-size="10">${p.m}</text>`);
  for (const m of world.movers) {
    if (m.kind === 'pop') {
      out.push(`<line x1="${X(m.from[0])}" y1="${Z(m.from[1])}" x2="${X(m.to[0])}" y2="${Z(m.to[1])}" stroke="#0af" stroke-dasharray="6"/>`,
        `<circle cx="${X(m.to[0])}" cy="${Z(m.to[1])}" r="${m.r * K}" fill="#0af" opacity="0.5"/>`);
    } else if (m.kind === 'orbit') out.push(`<circle cx="${X(m.cx)}" cy="${Z(m.cz)}" r="${m.rad * K}" fill="none" stroke="#0af" stroke-dasharray="6"/>`);
    else out.push(`<line x1="${X(m.a[0])}" y1="${Z(m.a[1])}" x2="${X(m.b[0])}" y2="${Z(m.b[1])}" stroke="#0af" stroke-width="${m.r * 2 * K}" opacity="0.5" stroke-linecap="round"/>`);
  }
  for (const b of world.boxes) out.push(`<rect x="${X(b.x) - 5}" y="${Z(b.z) - 5}" width="10" height="10" fill="#ff0" stroke="#000"/>`);
  for (let i = 0; i < 16; i++) {
    const g = world.grid(i), p = track.pointAt(g.s, g.lat);
    out.push(`<circle cx="${X(p.x)}" cy="${Z(p.z)}" r="${0.85 * K}" fill="#39f"/>`);
  }
  const s0 = track.pointAt(0, track.hw), s1 = track.pointAt(0, -track.hw);
  out.push(`<line x1="${X(s0.x)}" y1="${Z(s0.z)}" x2="${X(s1.x)}" y2="${Z(s1.z)}" stroke="#fff" stroke-width="4" stroke-dasharray="6"/>`);
  for (const m of incidents(world)) out.push(`<circle cx="${X(m.x)}" cy="${Z(m.z)}" r="5" fill="${m.c}"/>`);
  out.push(`<text x="24" y="14" fill="#fff">${def.name} — ${track.len.toFixed(0)}m, width ${track.width}  (green: bot line, magenta: falls, cyan: stuck)</text></svg>`);
  return { svg: out.join('\n'), W, H };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'docs/maps';
  mkdirSync(outDir, { recursive: true });
  let browser;
  if (args.includes('--png')) browser = await (await import('playwright-core')).chromium.launch({ channel: 'chrome' });
  for (const t of TRACKS) {
    const { svg, W, H } = trackSvg(t.id);
    writeFileSync(join(outDir, `${t.id}.svg`), svg);
    if (browser) {
      const page = await browser.newPage({ viewport: { width: W, height: H } });
      await page.setContent(`<body style="margin:0">${svg}</body>`);
      await page.screenshot({ path: join(outDir, `${t.id}.png`) });
      await page.close();
    }
    console.log(`${t.id}: ${join(outDir, t.id)}.svg`);
  }
  await browser?.close();
}
