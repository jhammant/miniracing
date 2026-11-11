// Arcade car physics. Pure functions over plain objects so the same code runs
// in the browser (your own cars and bots) and in Node (tests and tuning).

import { wrapAngle } from './track.js';

export const CAR_R = 0.85;
export const DT = 1 / 60;
// The same for everything that races. How each kind of vehicle handles is in
// vehicles.js, and a world carries its room's as `world.veh`.
export const P = { g: 22, boost: 1.45, jump: 8.5, offLimit: 12 };

// How fast a vehicle can rotate at a given forward speed. The bots use the same
// curve to work out how fast a corner can be taken.
export function turnRate(speed, V) {
  return V.turn * (V.pivot ? 1 : Math.min(1, speed / 5)) * (1 - 0.45 * Math.min(1, speed / V.maxSpeed));
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function makeCar(id) {
  return {
    id, x: 0, z: 0, y: 0, vy: 0, h: 0, vx: 0, vz: 0, steer: 0, spin: 0,
    px: 0, pz: 0, py: 0, ph: 0,
    idx: 0, s: 0, lat: 0, total: 0, lapsDone: 0,
    boostT: 0, shieldT: 0, spinT: 0, squashT: 0, shrinkT: 0, fallT: 0, invT: 0,
    offT: 0, wrongT: 0, slipT: 0, slip: false, catchup: 0, onCut: false, cutK: 0,
    frozen: true, finished: false, out: false, local: true,
  };
}

// Put a car on the lap at s metres from the line (negative = behind it).
export function placeCar(car, world, s, lat = 0) {
  const { track } = world;
  const p = track.pointAt(s, lat);
  Object.assign(car, {
    x: p.x, z: p.z, y: 0, vy: 0, h: p.h, vx: 0, vz: 0, steer: 0, spin: 0,
    px: p.x, pz: p.z, py: 0, ph: p.h,
    idx: p.i, s: ((s % track.len) + track.len) % track.len, lat, total: s,
    boostT: 0, shieldT: 0, spinT: 0, squashT: 0, shrinkT: 0, fallT: 0, invT: 0,
    offT: 0, wrongT: 0, slipT: 0, slip: false, onCut: false,
  });
}

export function respawn(car, world, emit) {
  const { track } = world;
  const p = track.pointAt(car.idx * track.step, 0);
  let ds = car.idx * track.step - car.s;
  if (ds > track.len / 2) ds -= track.len; else if (ds < -track.len / 2) ds += track.len;
  car.total += ds; car.s = car.idx * track.step; car.lat = 0;
  car.x = p.x; car.z = p.z; car.h = p.h; car.y = 0; car.vy = 0; car.vx = 0; car.vz = 0;
  car.fallT = 0; car.spinT = 0; car.offT = 0; car.wrongT = 0; car.invT = 1.6;
  emit('respawn', car);
}

function startFall(car, emit) {
  car.fallT = 1.1; car.vy = 0; car.spinT = 0; car.boostT = 0;
  emit('fall', car);
}

function bounce(car, nx, nz, emit, speedOfWall = 0) {
  const vn = car.vx * nx + car.vz * nz - speedOfWall;
  if (vn >= 0) return;
  car.vx -= 1.35 * vn * nx; car.vz -= 1.35 * vn * nz;
  if (vn < -5) {
    car.vx *= 0.82; car.vz *= 0.82;
    // Glance off: swing the nose towards the wall's tangent so cars don't grind.
    const fx = Math.sin(car.h), fz = Math.cos(car.h), fn = fx * nx + fz * nz;
    const tx = fx - fn * nx, tz = fz - fn * nz;
    if (tx * tx + tz * tz > 0.04) car.h = wrapAngle(car.h + wrapAngle(Math.atan2(tx, tz) - car.h) * 0.35);
    emit('bump', car, -vn);
  }
}

function hitCircle(car, o, r, emit) {
  const dx = car.x - o.x, dz = car.z - o.z, R = r + o.r, d2 = dx * dx + dz * dz;
  if (d2 >= R * R) return;
  const d = Math.sqrt(d2) || 1e-4, nx = dx / d, nz = dz / d;
  car.x += nx * (R - d); car.z += nz * (R - d);
  bounce(car, nx, nz, emit, o.vx !== undefined ? o.vx * nx + o.vz * nz : 0);
}

function hitBox(car, o, r, emit) {
  const dx = car.x - o.x, dz = car.z - o.z;
  const lx = dx * o.cos - dz * o.sin, lz = dx * o.sin + dz * o.cos;
  const cx = clamp(lx, -o.hw, o.hw), cz = clamp(lz, -o.hd, o.hd);
  let nx = lx - cx, nz = lz - cz, pen;
  const d2 = nx * nx + nz * nz;
  if (d2 > r * r) return;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    nx /= d; nz /= d; pen = r - d;
  } else {
    const px = o.hw - Math.abs(lx), pz = o.hd - Math.abs(lz);
    if (px < pz) { nx = lx < 0 ? -1 : 1; nz = 0; pen = px + r; } else { nx = 0; nz = lz < 0 ? -1 : 1; pen = pz + r; }
  }
  const wx = nx * o.cos + nz * o.sin, wz = -nx * o.sin + nz * o.cos;
  car.x += wx * pen; car.z += wz * pen;
  bounce(car, wx, wz, emit);
}

function inZone(car, zn) {
  const dx = car.x - zn.x, dz = car.z - zn.z;
  if (zn.r) return dx * dx + dz * dz < zn.r * zn.r;
  const lx = dx * zn.cos - dz * zn.sin, lz = dx * zn.sin + dz * zn.cos;
  return Math.abs(lx) < zn.hw && Math.abs(lz) < zn.hd;
}

export const carRadius = (car) => (car.shrinkT > 0 ? CAR_R * 0.6 : CAR_R);

// The shortcut this car is on, if any; leaves the nearest point in car.cutK.
function findCut(world, car) {
  for (const c of world.cuts) {
    if (!c.spans(car.idx)) continue;
    let best = -1, bd = (c.hw + 0.3) * (c.hw + 0.3);
    for (let k = 0; k < c.n; k++) {
      const dx = car.x - c.x[k], dz = car.z - c.z[k], d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = k; }
    }
    if (best >= 0) { car.cutK = best; return c; }
  }
  return null;
}

// One fixed step for one car. `inp` = { steer: -1..1 (+ = right), throttle, brake }.
// `emit(type, car, data)` reports fall | respawn | bump | jump | land | pad | squashed | lap.
export function stepCar(car, inp, dt, world, emit) {
  const { track, veh: V } = world, hover = V.hover > 0;
  car.px = car.x; car.pz = car.z; car.py = car.y; car.ph = car.h;
  for (const k of ['boostT', 'shieldT', 'spinT', 'squashT', 'shrinkT', 'invT']) if (car[k] > 0) car[k] = Math.max(0, car[k] - dt);

  if (car.fallT > 0) {
    car.fallT -= dt;
    car.vy -= P.g * dt; car.y += car.vy * dt;
    car.x += car.vx * dt; car.z += car.vz * dt;
    car.vx *= 1 - 1.5 * dt; car.vz *= 1 - 1.5 * dt;
    car.spin += 6 * dt;
    if (car.fallT <= 0) respawn(car, world, emit);
    return;
  }
  if (car.frozen) { car.vx = 0; car.vz = 0; return; }

  const air = car.y > 0.05;
  let steer = 0, throttle = 0, brake = 0;
  if (car.spinT > 0) car.spin += 15 * dt;
  else { car.spin = 0; steer = inp.steer; throttle = inp.throttle; brake = inp.brake; }
  car.steer += clamp(steer - car.steer, -dt * 9, dt * 9);

  // Surface
  const off = world.def.offMult + (1 - world.def.offMult) * V.rough;
  let maxMult = Math.abs(car.lat) <= track.hw + 0.3 ? 1 : off;
  let grip = V.grip, accelMult = 1;
  if (!air) {
    for (const zn of world.zones) {
      if (!inZone(car, zn)) continue;
      if (zn.kind === 'boost') { if (car.boostT < 0.6) emit('pad', car); car.boostT = Math.max(car.boostT, 1); }
      else if (hover) continue; // nothing on the ground touches a helicopter
      else if (zn.kind === 'slick') grip = Math.min(grip, 0.8);
      else if (zn.kind === 'sticky') maxMult *= 0.45 + 0.55 * V.rough;
      else if (zn.kind === 'hole') { startFall(car, emit); return; }
      else if (zn.kind === 'jump' && Math.hypot(car.vx, car.vz) > 9) { car.vy = P.jump; car.y = 0.06; emit('jump', car); }
    }
  }
  if (car.boostT > 0) { maxMult = Math.max(maxMult, 0.85) * P.boost; accelMult = 2.6; }
  if (car.squashT > 0) maxMult *= 0.5;
  if (car.shrinkT > 0) maxMult *= 0.6;
  if (car.slip) maxMult *= 1.07;
  maxMult *= 1 + car.catchup;
  const maxV = V.maxSpeed * maxMult;

  // Steering turns the nose; grip then drags the velocity round to follow it.
  let fx = Math.sin(car.h), fz = Math.cos(car.h);
  let vf = car.vx * fx + car.vz * fz;
  const sp = Math.abs(vf);
  if (!air) car.h = wrapAngle(car.h - car.steer * turnRate(sp, V) * (vf < 0 ? -1 : 1) * dt);
  fx = Math.sin(car.h); fz = Math.cos(car.h);
  const lx = fz, lz = -fx;
  vf = car.vx * fx + car.vz * fz;
  let vl = car.vx * lx + car.vz * lz;
  if (!air) {
    if (throttle > 0 && vf < maxV) vf = Math.min(maxV, vf + V.accel * accelMult * throttle * dt * (vf < 0 ? 2 : 1));
    if (vf > maxV) vf -= Math.min(vf - maxV, ((vf - maxV) * 4 + 6) * dt);
    if (brake > 0) vf = vf > 0.5 ? Math.max(0, vf - V.brake * brake * dt) : Math.max(-V.reverse, vf - 14 * brake * dt);
    if (throttle === 0 && brake === 0) vf -= vf * Math.min(1, V.drag * dt);
    vl *= Math.exp(-(brake > 0 && sp > 8 ? grip * 0.45 : grip) * dt);
  }
  car.vx = fx * vf + lx * vl; car.vz = fz * vf + lz * vl;

  if (air || car.vy > 0) {
    car.vy -= P.g * dt; car.y += car.vy * dt;
    if (car.y <= 0) { car.y = 0; car.vy = 0; emit('land', car); }
  }
  car.x += car.vx * dt; car.z += car.vz * dt;

  const r = carRadius(car), flying = hover || car.y > 0.6;
  for (const o of world.solids) {
    if (o.low && flying) continue;
    if (o.shape === 'circle') hitCircle(car, o, r, emit); else hitBox(car, o, r, emit);
  }
  for (const m of world.movers) {
    if (!m.on) continue;
    // Something landing on a car flattens it for a moment.
    if (m.slam && car.squashT <= 0 && car.shieldT <= 0 && Math.hypot(car.x - m.x, car.z - m.z) < m.r + r) { car.squashT = 1.6; emit('squashed', car); }
    hitCircle(car, m, r, emit);
  }

  // Edge of the world: a wall to bounce off, or a drop.
  const hx = world.hx, hz = world.hz;
  if (world.def.edge === 'wall') {
    if (car.x > hx - r) { car.x = hx - r; bounce(car, -1, 0, emit); } else if (car.x < -hx + r) { car.x = -hx + r; bounce(car, 1, 0, emit); }
    if (car.z > hz - r) { car.z = hz - r; bounce(car, 0, -1, emit); } else if (car.z < -hz + r) { car.z = -hz + r; bounce(car, 0, 1, emit); }
  } else if (!air && !hover && (Math.abs(car.x) > hx + 0.2 || Math.abs(car.z) > hz + 0.2)) {
    startFall(car, emit);
    return;
  }

  // Progress round the lap. Off the road, a shortcut counts if the car is on one.
  const i = track.nearest(car.x, car.z, car.idx);
  const ox = car.x - track.sx[i], oz = car.z - track.sz[i], far = ox * ox + oz * oz;
  const lim = track.hw + P.offLimit;
  const cut = world.cuts.length && far > track.hw * track.hw ? findCut(world, car) : null;
  car.onCut = !!cut;
  if (cut) {
    const s = (cut.s0 + cut.span * (car.cutK / (cut.n - 1))) % track.len;
    let ds = s - car.s;
    if (ds > track.len / 2) ds -= track.len; else if (ds < -track.len / 2) ds += track.len;
    car.total += ds; car.s = s; car.idx = Math.round(s / track.step) % track.n; car.lat = 0;
    car.offT = 0;
  } else if (far < lim * lim) {
    const s = i * track.step + track.along(i, car.x, car.z);
    let ds = s - car.s;
    if (ds > track.len / 2) ds -= track.len; else if (ds < -track.len / 2) ds += track.len;
    car.total += ds; car.s = s; car.idx = i; car.lat = track.lat(i, car.x, car.z);
    car.offT = 0;
  } else {
    car.offT += dt;
    if (car.offT > 2.2) { respawn(car, world, emit); return; }
  }
  const along = car.vx * track.tx[car.idx] + car.vz * track.tz[car.idx];
  car.wrongT = along < -4 ? car.wrongT + dt : 0;
  if (car.total >= (car.lapsDone + 1) * track.len) emit('lap', car);
}

const ghost = (c) => c.fallT > 0 || c.invT > 0 || c.out || c.gone || c.y > 0.8;

// Car against car. Each client only moves the cars it owns; a remote car is
// treated as a moving wall, and its owner does the same from their side.
export function collideCars(own, all, emit) {
  for (const a of own) {
    if (ghost(a)) continue;
    for (const b of all) {
      if (b === a || ghost(b) || (b.local && b.id < a.id)) continue;
      const dx = a.x - b.x, dz = a.z - b.z, R = carRadius(a) + carRadius(b), d2 = dx * dx + dz * dz;
      if (d2 >= R * R || d2 < 1e-8) continue;
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, pen = R - d;
      if (b.local) {
        a.x += nx * pen / 2; a.z += nz * pen / 2; b.x -= nx * pen / 2; b.z -= nz * pen / 2;
      } else { a.x += nx * pen * 0.6; a.z += nz * pen * 0.6; }
      const vn = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (vn < 0) {
        const j = -0.75 * vn;
        a.vx += j * nx; a.vz += j * nz;
        if (b.local) { b.vx -= j * nx; b.vz -= j * nz; }
        if (vn < -4) emit('bump', a, -vn);
      }
    }
  }
}

// Slipstream: sit in another car's wake for a moment and you get a tow.
export function updateSlipstream(own, all, dt) {
  for (const a of own) {
    let tow = false;
    const fx = Math.sin(a.h), fz = Math.cos(a.h);
    if (!ghost(a) && a.vx * fx + a.vz * fz > 15) {
      for (const b of all) {
        if (b === a || ghost(b)) continue;
        const dx = b.x - a.x, dz = b.z - a.z, f = dx * fx + dz * fz;
        if (f < 2.2 || f > 13 || Math.abs(dx * fz - dz * fx) > 1.8) continue;
        if (b.vx * fx + b.vz * fz > 12) { tow = true; break; }
      }
    }
    a.slipT = tow ? Math.min(1.4, a.slipT + dt) : Math.max(0, a.slipT - 2 * dt);
    a.slip = a.slipT > 0.6;
  }
}

// Compact wire format for one car. Flags pack the status effects.
export function packCar(c) {
  const f = (c.boostT > 0 ? 1 : 0) | (c.shieldT > 0 ? 2 : 0) | (c.spinT > 0 ? 4 : 0) | (c.squashT > 0 ? 8 : 0)
    | (c.shrinkT > 0 ? 16 : 0) | (c.fallT > 0 ? 32 : 0) | (c.invT > 0 ? 64 : 0) | (c.finished ? 128 : 0)
    | (c.out ? 256 : 0) | (c.slip ? 512 : 0);
  const r = (v) => Math.round(v * 100) / 100;
  return [c.id, r(c.x), r(c.z), r(c.y), r(c.h), r(c.vx), r(c.vz), f, r(c.total), r(c.steer)];
}

// Apply a snapshot to a remote car: store the target, the renderer eases to it.
export function unpackCar(c, a) {
  c.tx = a[1]; c.tz = a[2]; c.ty = a[3]; c.th = a[4]; c.vx = a[5]; c.vz = a[6];
  const f = a[7];
  c.boostT = f & 1 ? 1 : 0; c.shieldT = f & 2 ? 1 : 0; c.spinT = f & 4 ? 1 : 0; c.squashT = f & 8 ? 1 : 0;
  c.shrinkT = f & 16 ? 1 : 0; c.fallT = f & 32 ? 1 : 0; c.invT = f & 64 ? 1 : 0;
  c.finished = !!(f & 128); c.out = !!(f & 256); c.slip = !!(f & 512);
  c.total = a[8]; c.steer = a[9];
}
