import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS } from '../src/shared/tracks.js';
import { PROPS } from '../src/shared/props.js';
import { getWorld, updateMovers } from '../src/shared/world.js';
import { VEHICLES } from '../src/shared/vehicles.js';
import { makeCar, placeCar, stepCar, packCar, unpackCar, DT, P, SLIDE } from '../src/shared/physics.js';
import { rollItem, itemWeights, ITEM_IDS, SHELL, shellPos } from '../src/shared/items.js';
import { makeBot, botWantsShot } from '../src/shared/ai.js';
import { simulate } from '../scripts/sim.js';

const noop = () => {};

test('every track bakes into a closed lap that fits its room', () => {
  for (const def of TRACKS) {
    // Arrange / Act
    const world = getWorld(def.id), { track } = world;
    // Assert
    assert.ok(track.len > 300, `${def.id} is long enough`);
    for (let i = 0; i < track.n; i++) {
      assert.ok(Math.abs(track.sx[i]) + track.hw < world.hx && Math.abs(track.sz[i]) + track.hw < world.hz, `${def.id} sample ${i} is inside the room`);
    }
    for (const p of def.props) assert.ok(PROPS[p.m], `${def.id} prop ${p.m} is in the catalogue`);
    assert.ok(world.boxes.length >= 9, `${def.id} has item boxes`);
  }
});

test('a full grid of bots finishes a race on every track, well above the minimum lap', () => {
  for (const def of TRACKS) {
    const r = simulate(def.id, { bots: 16, laps: 2 });
    assert.equal(r.finished, 16, `${def.id}: all bots finish`);
    assert.ok(r.best * 1000 > def.minLap * 1.4, `${def.id}: bot best ${r.best.toFixed(1)}s leaves room above minLap`);
    assert.ok(r.worst < 45, `${def.id}: nobody gets lost (${r.worst.toFixed(1)}s)`);
    // Bots never take a shortcut, so allow for a player who takes every one.
    const world = getWorld(def.id), saved = world.cuts.reduce((sum, c) => sum + c.span - (c.n - 1), 0);
    assert.ok(saved >= 0 && saved < world.track.len * 0.2, `${def.id}: shortcuts save ${saved.toFixed(0)}m, under a fifth of the lap`);
    assert.ok(r.best * (1 - saved / world.track.len) * 1000 > def.minLap * 1.25, `${def.id}: a lap with every shortcut still clears minLap`);
  }
});

test('a car accelerates to top speed and steering right turns it clockwise from above', () => {
  // Arrange
  const world = getWorld('snooker'), car = makeCar(1);
  placeCar(car, world, 0, 0); car.frozen = false;
  const h0 = car.h;
  // Act
  for (let i = 0; i < 40; i++) stepCar(car, { steer: 0, throttle: 1, brake: 0 }, DT, world, noop);
  const speed = Math.hypot(car.vx, car.vz);
  for (let i = 0; i < 20; i++) stepCar(car, { steer: 1, throttle: 1, brake: 0 }, DT, world, noop);
  // Assert
  assert.ok(speed > 10 && speed <= world.veh.maxSpeed + 0.01);
  assert.ok(car.h < h0, 'positive steer reduces the heading');
});

test('every room races a known vehicle, and a tank turns on the spot where a car cannot', () => {
  // Arrange
  const keys = Object.keys(VEHICLES.car).sort();
  const turned = (id) => {
    const world = getWorld(id), car = makeCar(1);
    placeCar(car, world, 0, 0); car.frozen = false;
    const h0 = car.h;
    for (let i = 0; i < 20; i++) stepCar(car, { steer: 1, throttle: 0, brake: 0 }, DT, world, noop);
    return Math.abs(car.h - h0);
  };
  // Act / Assert
  for (const v of Object.values(VEHICLES)) assert.deepEqual(Object.keys(v).sort(), keys);
  for (const def of TRACKS) assert.ok(VEHICLES[def.vehicle || 'car'], `${def.id} races ${def.vehicle}`);
  assert.equal(getWorld('desk').veh, VEHICLES.tank);
  assert.ok(turned('desk') > 0.5, 'a tank pivots at a standstill');
  assert.ok(turned('snooker') < 0.01, 'a car does not');
});

// Nothing but floor in every direction, to measure handling on.
const plane = (veh) => ({
  veh, def: { offMult: 1, edge: 'wall' }, zones: [], solids: [], movers: [], cuts: [], hx: 1e7, hz: 1e7,
  track: { hw: 1e6, len: 1e12, step: 1, n: 1, sx: [0], sz: [0], tx: [0], tz: [1], nearest: () => 0, along: () => 0, lat: () => 0 },
});
// Drive flat out on full lock for `secs`, with a brake tap first if `tap`.
function corner(kind, { speed = VEHICLES[kind].maxSpeed, tap = false, secs = 1, release = 0 } = {}) {
  const world = plane(VEHICLES[kind]), car = makeCar(1), seen = [];
  car.frozen = false; car.vz = speed;
  let slip = 0, slowest = speed, x = 0;
  const step = (inp) => {
    stepCar(car, inp, DT, world, (t) => seen.push(t));
    const fx = Math.sin(car.h), fz = Math.cos(car.h);
    slip = Math.max(slip, Math.abs(Math.atan2(car.vx * fz - car.vz * fx, car.vx * fx + car.vz * fz)));
    slowest = Math.min(slowest, Math.hypot(car.vx, car.vz));
    x = Math.max(x, Math.abs(car.x));
  };
  for (let t = 0; t < secs; t += DT) step(tap && t < 0.06 ? { steer: 1, throttle: 0, brake: 1 } : { steer: 1, throttle: 1, brake: 0 });
  let top = 0;
  for (let t = 0; t < release; t += DT) { step({ steer: 0, throttle: 1, brake: 0 }); top = Math.max(top, Math.hypot(car.vx, car.vz)); }
  return { car, seen, slip, slowest, x, top, turned: Math.abs(car.h) };
}

test('a brake tap in a corner starts a powerslide that turns tighter than gripping, without spinning out', () => {
  // Arrange / Act
  const grip = corner('car'), slide = corner('car', { tap: true });
  // Assert
  assert.ok(!grip.seen.includes('slide') && grip.car.drift === 0, 'no tap, no slide');
  assert.deepEqual(slide.seen, ['slide']);
  assert.ok(slide.car.drift !== 0, 'still sliding while the wheel is held over');
  assert.ok(slide.turned > grip.turned * 1.25, `slide turned ${slide.turned.toFixed(2)} rad against ${grip.turned.toFixed(2)}`);
  assert.ok(slide.slip > 0.5 && slide.slip < 1.05, `tail out but caught: ${(slide.slip * 57.3).toFixed(0)} degrees`);
  assert.ok(slide.slowest > VEHICLES.car.maxSpeed * 0.75, `keeps its speed: ${slide.slowest.toFixed(1)}`);
  assert.ok(grip.slip > 0.2, 'even gripping, the tail comes round at top speed');
});

test('letting a held slide go pays a short push; a quick flick does not', () => {
  // Arrange / Act
  const held = corner('car', { tap: true, secs: SLIDE.hold + 0.3, release: 1 });
  const flick = corner('car', { tap: true, secs: SLIDE.hold - 0.2, release: 1 });
  // Assert
  assert.deepEqual(held.seen, ['slide', 'push']);
  assert.ok(held.top > VEHICLES.car.maxSpeed * 1.08, `push takes it past top speed: ${held.top.toFixed(1)}`);
  assert.deepEqual(flick.seen, ['slide']);
  assert.ok(flick.top <= VEHICLES.car.maxSpeed + 0.01);
  assert.equal(held.car.drift, 0);
});

test('slides need speed and wheels: not below the threshold, never in a tank or a helicopter, milder in a boat', () => {
  // Arrange / Act
  const slow = corner('car', { tap: true, speed: SLIDE.from - 2 });
  const tank = corner('tank', { tap: true }), heli = corner('heli', { tap: true }), boat = corner('boat', { tap: true, speed: 22 });
  // Assert
  for (const r of [slow, tank, heli]) assert.ok(!r.seen.includes('slide'));
  assert.ok(boat.seen.includes('slide'));
  assert.ok(VEHICLES.boat.slide < VEHICLES.car.slide);
});

test('going sideways is never quicker than going straight', () => {
  // Arrange
  const world = plane(VEHICLES.car), car = makeCar(1);
  car.frozen = false; car.vz = VEHICLES.car.maxSpeed;
  let top = 0;
  // Act: weave flat out for five seconds
  for (let i = 0; i < 300; i++) {
    stepCar(car, { steer: Math.floor(i / 20) % 2 ? 1 : -1, throttle: 1, brake: 0 }, DT, world, noop);
    top = Math.max(top, Math.hypot(car.vx, car.vz));
  }
  // Assert
  assert.ok(top <= VEHICLES.car.maxSpeed + 0.05, `weaving reached ${top.toFixed(2)}`);
});

test('a shell flies straight from the barrel, and a bot only fires at a tank in front of it', () => {
  // Arrange
  const hz = { x: 2, z: 3, h: Math.PI / 2 }, bot = makeBot(3), me = makeCar(1);
  const target = Object.assign(makeCar(2), { x: 0.5, z: 20 }), beside = Object.assign(makeCar(3), { x: 14, z: 20 });
  bot.shotT = 0;
  // Act
  const p = shellPos(hz, 0.5);
  const atNothing = botWantsShot(me, bot, [me, beside], DT);
  const atTarget = botWantsShot(me, bot, [me, beside, target], DT);
  const again = botWantsShot(me, bot, [me, target], DT);
  // Assert
  assert.ok(Math.abs(p.x - (2 + SHELL.speed * 0.5)) < 1e-9 && Math.abs(p.z - 3) < 1e-9);
  assert.equal(atNothing, false);
  assert.equal(atTarget, true);
  assert.equal(again, false, 'then it has to reload');
  assert.ok(bot.shotT >= SHELL.reload);
});

test('the toast is harmless in the air, flattens whoever it lands on, then goes away', () => {
  // Arrange
  const world = getWorld('breakfast'), toast = world.movers.find((m) => m.kind === 'pop'), seen = [];
  const car = makeCar(1);
  placeCar(car, world, 0, 0); car.frozen = false;
  car.x = toast.to[0]; car.z = toast.to[1];
  // Act: in the air
  updateMovers(world, 0.4);
  stepCar(car, { steer: 0, throttle: 0, brake: 0 }, DT, world, (t) => seen.push(t));
  const flying = { on: toast.on, y: toast.y, squashed: car.squashT > 0 };
  // Act: the moment it lands
  updateMovers(world, 0.92);
  stepCar(car, { steer: 0, throttle: 0, brake: 0 }, DT, world, (t) => seen.push(t));
  // Assert
  assert.deepEqual(flying, { on: false, y: flying.y, squashed: false });
  assert.ok(flying.y > 3, 'it is well above the cars on the way over');
  assert.ok(toast.on && toast.slam && car.squashT > 0 && seen.includes('squashed'));
  updateMovers(world, 5);
  assert.ok(toast.hidden && !toast.on, 'gone until the next one');
  updateMovers(world, 0);
});

test('the cereal cut counts as the stretch of lap it bypasses, and only from that stretch', () => {
  // Arrange
  const world = getWorld('breakfast'), { track } = world, cut = world.cuts[0], mid = Math.floor(cut.n / 2);
  const at = (idx) => {
    const car = makeCar(1);
    placeCar(car, world, idx * track.step, 0); car.frozen = false;
    car.x = cut.x[mid]; car.z = cut.z[mid]; car.vx = car.vz = 0;
    stepCar(car, { steer: 0, throttle: 0, brake: 0 }, DT, world, noop);
    return car;
  };
  // Act
  const taking = at(cut.i0 + 5), elsewhere = at((cut.i0 + Math.floor(track.n / 2)) % track.n);
  // Assert
  assert.ok(taking.onCut, 'a car that left the road at the way in is on the cut');
  const along = (taking.s - cut.s0 + track.len) % track.len;
  assert.ok(along > cut.span * 0.3 && along < cut.span * 0.7, `halfway along the cut is about halfway round the bypassed stretch (${along.toFixed(0)} of ${cut.span.toFixed(0)}m)`);
  assert.ok(!elsewhere.onCut, 'a car from the far side of the lap is just off the road');
});

test('driving off the breakfast table falls, then respawns on the lap', () => {
  const world = getWorld('breakfast'), car = makeCar(1), seen = [];
  placeCar(car, world, 0, 0); car.frozen = false;
  car.x = world.hx + 1;
  for (let i = 0; i < 90; i++) stepCar(car, { steer: 0, throttle: 0, brake: 0 }, DT, world, (t) => seen.push(t));
  assert.deepEqual(seen, ['fall', 'respawn']);
  assert.ok(Math.abs(car.lat) < 0.01 && car.invT > 0);
});

test('car state survives the wire format', () => {
  const car = makeCar(7);
  Object.assign(car, { x: 12.345, z: -3.21, h: 1.5, vx: 3, vz: -4, total: 99.5, boostT: 1, shieldT: 2, out: true });
  const other = makeCar(7);
  unpackCar(other, JSON.parse(JSON.stringify(packCar(car))));
  assert.equal(other.tx, 12.35); assert.equal(other.th, 1.5); assert.equal(other.total, 99.5);
  assert.ok(other.boostT > 0 && other.shieldT > 0 && other.out && !other.finished && other.spinT === 0);
  assert.ok(!other.drift && !other.pushT);
  // A sliding car says so, so everyone else can draw the smoke.
  Object.assign(car, { drift: -1, pushT: 0.4 });
  unpackCar(other, JSON.parse(JSON.stringify(packCar(car))));
  assert.ok(other.drift && other.pushT > 0);
});

test('the leader never rolls a shrink ray and the back of the field gets more turbo', () => {
  assert.equal(itemWeights(0, 8).zap, 0);
  assert.ok(itemWeights(1, 8).boost > itemWeights(0, 8).boost);
  let seed = 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 500; i++) {
    const it = rollItem(0, 8, rnd);
    assert.ok(ITEM_IDS.includes(it) && it !== 'zap');
  }
});
