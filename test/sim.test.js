import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS } from '../src/shared/tracks.js';
import { PROPS } from '../src/shared/props.js';
import { getWorld } from '../src/shared/world.js';
import { makeCar, placeCar, stepCar, packCar, unpackCar, DT, P } from '../src/shared/physics.js';
import { rollItem, itemWeights, ITEM_IDS } from '../src/shared/items.js';
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
  assert.ok(speed > 10 && speed <= P.maxSpeed + 0.01);
  assert.ok(car.h < h0, 'positive steer reduces the heading');
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
