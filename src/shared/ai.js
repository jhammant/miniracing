// Bot drivers. bakeAI() works out a line round the lap that avoids the props
// and a speed for every sample; botInput() chases that line.

import { wrapAngle } from './track.js';
import { CAR_R, turnRate } from './physics.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function bakeAI(world) {
  if (world.ai) return world.ai;
  const { track, veh: V } = world;
  const { n, hw, step } = track;
  const lat = new Float64Array(n), vmax = new Float64Array(n);

  // Things worth steering round: solids, slow or slippery zones, holes.
  const blockers = [];
  for (const o of world.solids) if (!(o.low && V.hover)) blockers.push({ x: o.x, z: o.z, r: o.shape === 'circle' ? o.r : Math.max(o.hw, o.hd), w: 1 });
  for (const zn of world.zones) {
    if (zn.kind === 'boost' || zn.kind === 'jump' || V.hover) continue;
    blockers.push({ x: zn.x, z: zn.z, r: (zn.r || Math.max(zn.hw, zn.hd)) * 0.8, w: zn.kind === 'hole' ? 1 : 0.5 });
  }
  const edge = hw - CAR_R - 0.6;
  for (let i = 0; i < n; i++) {
    const near = [];
    for (const b of blockers) {
      const al = track.along(i, b.x, b.z), la = track.lat(i, b.x, b.z);
      if (Math.abs(al) < b.r + 7 && Math.abs(la) < hw + b.r + 1) near.push({ la, r: b.r, w: b.w });
    }
    const ideal = clamp(track.curv[i] * 70, -1, 1) * edge * 0.65; // drift towards the apex
    let best = ideal, bc = Infinity;
    for (let c = -edge; c <= edge + 1e-6; c += 0.5) {
      let cost = (c - ideal) * (c - ideal) * 0.6;
      for (const b of near) {
        const clear = Math.abs(c - b.la) - (b.r + CAR_R + 0.8);
        cost += clear < 0 ? 400 * b.w : (12 * b.w) / (1 + clear);
      }
      if (cost < bc) { bc = cost; best = c; }
    }
    lat[i] = best;
  }
  for (let pass = 0; pass < 2; pass++) {
    const src = Float64Array.from(lat);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let o = -6; o <= 6; o++) s += src[(i + o + n) % n];
      lat[i] = s / 13;
    }
  }

  // Corner speed from the same steering curve the cars use, then a backwards
  // pass so the bots brake in time.
  for (let i = 0; i < n; i++) {
    const k = Math.abs(track.curv[i]) * 1.12 * V.caution;
    let v = V.maxSpeed * 1.5;
    while (v > 8 && turnRate(v, V) < v * k) v -= 0.5;
    vmax[i] = v;
  }
  for (let lap = 0; lap < 2; lap++) {
    for (let i = n - 1; i >= 0; i--) {
      const next = vmax[(i + 1) % n];
      vmax[i] = Math.min(vmax[i], Math.sqrt(next * next + 2 * 26 * step));
    }
  }
  world.ai = { lat, vmax };
  return world.ai;
}

const SKILL = { easy: [0.78, 0.9], normal: [0.87, 0.97], hard: [0.94, 1.03] };

export function makeBot(seed, difficulty = 'normal') {
  const [lo, hi] = SKILL[difficulty] || SKILL.normal;
  const r = (k) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  return { skill: lo + (hi - lo) * r(1), lane: (r(2) - 0.5) * 3.6, band: 0, stuckT: 0, revT: 0, revDir: 1, itemT: 0, shotT: 1.5 + 3 * r(3), seed };
}

// `others` are the cars this bot can see; `humanTotal` is the progress of the
// best human (or null), used to keep the bots in touch with the people.
export function botInput(car, bot, world, others, dt, humanTotal, out) {
  const { track } = world, ai = bakeAI(world), n = track.n;
  const fx = Math.sin(car.h), fz = Math.cos(car.h);
  const speed = car.vx * fx + car.vz * fz;
  out.steer = 0; out.throttle = 0; out.brake = 0;

  // Stuck? Back up and turn away for a moment.
  if (bot.revT > 0) {
    bot.revT -= dt;
    out.brake = 1; out.steer = bot.revDir;
    return out;
  }
  if (!car.frozen && Math.abs(speed) < 2.5 && car.spinT <= 0 && car.fallT <= 0) {
    bot.stuckT += dt;
    if (bot.stuckT > 1.1) {
      // Back up further each time it does not work: a fluffed jump needs a proper run-up.
      bot.stuckCount = (bot.stuckCount || 0) + 1;
      bot.stuckT = 0; bot.revT = 0.75 * Math.min(4, bot.stuckCount); bot.revDir = car.lat > 0 ? -1 : 1;
    }
  } else { bot.stuckT = 0; if (speed > 12) bot.stuckCount = 0; }

  // Rubber band: ease off when well ahead of the humans, push when behind.
  if (humanTotal != null) {
    const gap = car.total - humanTotal;
    const want = gap > 25 ? -Math.min(0.1, (gap - 25) / 600) : gap < -25 ? Math.min(0.07, (-gap - 25) / 700) : 0;
    bot.band += (want - bot.band) * Math.min(1, dt * 0.8);
  }
  const pace = bot.skill + bot.band;

  // Pick a lane, then nudge off it if someone is right in front.
  let lane = bot.lane;
  for (const o of others) {
    if (o === car || o.out || o.fallT > 0) continue;
    const dx = o.x - car.x, dz = o.z - car.z, f = dx * fx + dz * fz;
    if (f < 0.5 || f > 7) continue;
    const side = dx * fz - dz * fx; // + = to our left
    if (Math.abs(side) < 2) { lane += side > 0 ? -2.2 : 2.2; break; }
  }
  const look = 5 + Math.max(0, speed) * 0.32;
  const j = (car.idx + Math.round(look / track.step)) % n;
  const edge = track.hw - CAR_R - 0.4;
  const room = Math.max(0, 1 - Math.abs(track.curv[j]) * 22); // hold the line through corners
  const tl = clamp(ai.lat[j] + lane * room * 0.6, -edge, edge);
  const txp = track.sx[j] + track.nx[j] * tl, tzp = track.sz[j] + track.nz[j] * tl;
  const diff = wrapAngle(Math.atan2(txp - car.x, tzp - car.z) - car.h);
  out.steer = clamp(-diff * 2.6, -1, 1);

  const target = ai.vmax[(car.idx + Math.round(Math.max(0, speed) * 0.12)) % n] * pace;
  if (Math.abs(diff) > 1.3) out.throttle = 0.5;
  else if (speed < target) out.throttle = 1;
  else if (speed > target + 2.5) out.brake = 0.8;
  return out;
}

// Should the bot fire its item now?
export function botWantsItem(car, bot, item, others, dt) {
  bot.itemT += dt;
  if (bot.itemT < 1.2) return false;
  const fx = Math.sin(car.h), fz = Math.cos(car.h);
  let ahead = false, behind = false, close = 0;
  for (const o of others) {
    if (o === car || o.out || o.finished) continue;
    const dx = o.x - car.x, dz = o.z - car.z, f = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
    const d = Math.hypot(dx, dz);
    if (d < 8) close++;
    if (f > 4 && f < 45 && side < 6) ahead = true;
    if (f < -2 && f > -14 && side < 4) behind = true;
  }
  const fire = item === 'rocket' ? ahead
    : item === 'oil' ? behind || bot.itemT > 7
      : item === 'mallet' ? close > 0
        : item === 'boost' ? Math.abs(car.steer) < 0.25 && bot.itemT > 1.8
          : bot.itemT > 2; // shield, zap
  if (fire) bot.itemT = 0;
  return fire;
}

// Tanks: fire when someone is sitting in front of the barrel. Bots take their
// time over it, the better ones a little less.
export function botWantsShot(car, bot, others, dt) {
  bot.shotT -= dt;
  if (bot.shotT > 0 || car.spinT > 0) return false;
  const fx = Math.sin(car.h), fz = Math.cos(car.h);
  for (const o of others) {
    if (o === car || o.out || o.finished || o.fallT > 0) continue;
    const dx = o.x - car.x, dz = o.z - car.z, f = dx * fx + dz * fz;
    if (f < 5 || f > 38 || Math.abs(dx * fz - dz * fx) > 1.2 + f * 0.05) continue;
    bot.shotT = 5.5 - 1.5 * bot.skill + ((bot.shots = (bot.shots || 0) + 1) % 3) * 0.8;
    return true;
  }
  return false;
}
