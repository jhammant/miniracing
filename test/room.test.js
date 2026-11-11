import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room, MAX_CARS, OPEN, cleanName, ELIM } from '../src/shared/room.js';
import { TRACKS, trackById } from '../src/shared/tracks.js';

function setup(kind = 'party', settings) {
  const sent = [], clock = { t: 1000 };
  const room = new Room({ code: 'ABCD', kind, send: (id, msg) => sent.push({ id, ...msg }), now: () => clock.t, rnd: () => 0.5 });
  room.addClient('a', { name: 'Ann' });
  if (settings) room.onMessage('a', { t: 'set', settings });
  const last = (t, id) => sent.filter((m) => m.t === t && (!id || m.id === id)).pop();
  const go = () => { room.onMessage('a', { t: 'start' }); clock.t = room.race.t0 + 1; room.tick(); };
  return { room, sent, clock, last, go };
}
// An open room: nobody hosts it, so nothing is set and nobody presses start.
function setupOpen(open = true) {
  const sent = [], clock = { t: 1000 };
  const room = new Room({ code: 'OPEN', open, send: (id, msg) => sent.push({ id, ...msg }), now: () => clock.t, rnd: () => 0.5 });
  room.addClient('a', { name: 'Ann' });
  const last = (t, id) => sent.filter((m) => m.t === t && (!id || m.id === id)).pop();
  const at = (t) => { clock.t = t; room.tick(); };
  return { room, sent, clock, last, at };
}
const carOf = (room, id) => room.cars.get(room.clients.get(id).car);
const st = (car, x, total) => [car.id, x, 0, 0, 0, 0, 0, 0, total, 0];

test('names are cleaned before anyone else sees them', () => {
  assert.equal(cleanName('<b>jon</b>'), 'BJONB');
  assert.equal(cleanName(''), 'RACER');
  assert.equal(cleanName('a'.repeat(40)).length, 12);
});

test('the first client hosts, bots fill the grid and make way for people', () => {
  // Arrange
  const { room } = setup('party', { bots: 15 });
  // Act
  for (let i = 0; i < 15; i++) assert.ok(room.addClient(`p${i}`, { name: `P${i}` }).ok);
  // Assert
  assert.equal(room.host, 'a');
  assert.equal(room.cars.size, MAX_CARS);
  assert.equal([...room.cars.values()].filter((c) => c.bot).length, 0);
  assert.ok(room.addClient('late', {}).error);
  assert.equal(new Set([...room.cars.values()].map((c) => c.color)).size, MAX_CARS);
});

test('only the host changes settings, and bad values are ignored', () => {
  const { room } = setup();
  room.addClient('b', { name: 'Bob' });
  room.onMessage('b', { t: 'set', settings: { laps: 9 } });
  room.onMessage('a', { t: 'set', settings: { laps: 4, track: 'nope', mode: 'elim', bots: 99 } });
  assert.equal(room.settings.laps, 5);
  assert.equal(room.settings.track, 'breakfast');
  assert.equal(room.settings.mode, 'elim');
  assert.equal(room.settings.bots, 3);
});

test('laps are refereed: in order, not too fast, only for your own cars', () => {
  const { room, last, go } = setup('party', { laps: 3, bots: 0 });
  room.addClient('b', { name: 'Bob' });
  go();
  const a = carOf(room, 'a'), b = carOf(room, 'b'), min = trackById('breakfast').minLap;
  room.onMessage('a', { t: 'lap', car: a.id, n: 1, ms: min - 1 });
  room.onMessage('a', { t: 'lap', car: a.id, n: 2, ms: 20000 });
  room.onMessage('a', { t: 'lap', car: b.id, n: 1, ms: 20000 });
  assert.equal(a.lapsDone, 0); assert.equal(b.lapsDone, 0);
  for (const n of [1, 2, 3]) room.onMessage('a', { t: 'lap', car: a.id, n, ms: 20000 + n });
  assert.equal(a.lapsDone, 3);
  assert.equal(last('fin').pos, 1);
  assert.equal(room.phase, 'racing', 'waits for the other human');
  for (const n of [1, 2, 3]) room.onMessage('b', { t: 'lap', car: b.id, n, ms: 21000 });
  assert.equal(room.phase, 'results');
  assert.deepEqual(last('results').order.map((c) => c.name), ['ANN', 'BOB']);
  assert.equal(a.pts, 15); assert.equal(b.pts, 12);
});

test('the finish window closes the race on stragglers, and the next grid is reversed', () => {
  const { room, clock, go } = setup('party', { laps: 1, bots: 0 });
  room.addClient('b', {});
  go();
  const a = carOf(room, 'a'), b = carOf(room, 'b');
  room.onMessage('a', { t: 'lap', car: a.id, n: 1, ms: 20000 });
  clock.t += 31000; room.tick();
  assert.equal(room.phase, 'results');
  room.onMessage('a', { t: 'start' });
  assert.deepEqual(room.race.grid, [b.id, a.id]);
});

test('an item box gives one item, goes dark, then comes back', () => {
  const { room, clock, last, go } = setup('party', { bots: 0 });
  room.addClient('b', {});
  go();
  const a = carOf(room, 'a'), b = carOf(room, 'b');
  room.onMessage('a', { t: 'pick', car: a.id, box: 0 });
  room.onMessage('b', { t: 'pick', car: b.id, box: 0 });
  assert.ok(a.item); assert.equal(b.item, null);
  clock.t += 5100; room.tick();
  assert.equal(last('boxon').i, 0);
  room.onMessage('b', { t: 'pick', car: b.id, box: 0 });
  assert.ok(b.item);
});

test('a rocket becomes a hazard that the victim reports, once', () => {
  const { room, sent, go } = setup('party', { bots: 0 });
  room.addClient('b', {});
  go();
  const a = carOf(room, 'a'), b = carOf(room, 'b');
  a.item = 'rocket';
  room.onMessage('a', { t: 'use', car: a.id, x: 0, z: 0, s: 10, lat: 1 });
  const hz = sent.filter((m) => m.t === 'use').pop().hz;
  assert.equal(hz.kind, 'rocket'); assert.equal(a.item, null);
  room.onMessage('a', { t: 'hit', car: a.id, hz: hz.id });
  assert.equal(room.race.hazards.size, 1, 'your own rocket does not hit you');
  room.onMessage('b', { t: 'hit', car: b.id, hz: hz.id });
  room.onMessage('b', { t: 'hit', car: b.id, hz: hz.id });
  assert.equal(sent.filter((m) => m.t === 'hit').length / 2, 1);
});

test('elimination: fall behind the leader and you are out; first to the target wins', () => {
  const { room, clock, last, go } = setup('party', { mode: 'elim', laps: 1, bots: 0 });
  room.addClient('b', {});
  go();
  const a = carOf(room, 'a'), b = carOf(room, 'b');
  clock.t += ELIM.grace + 100;
  room.onMessage('a', { t: 'st', c: [st(a, 100, 100)] });
  room.onMessage('b', { t: 'st', c: [st(b, 0, 0)] });
  for (let i = 0; i < 10; i++) { clock.t += 66; room.tick(); }
  assert.ok(b.out);
  assert.equal(last('round').winner, a.id);
  assert.equal(room.phase, 'results');
  assert.equal(last('results').order[0].name, 'ANN');
});

test('a shared screen owns the pad cars and gets their sticks', () => {
  const { room, last } = setup('screen');
  room.addClient('phone', { name: 'Kid' });
  const car = carOf(room, 'phone');
  assert.equal(room.clients.get('a').role, 'screen');
  assert.equal(car.owner, 'a');
  room.onMessage('phone', { t: 'pad', s: 5, b: 1, u: 3 });
  assert.deepEqual({ ...last('pad', 'a'), id: 0 }, { id: 0, t: 'pad', car: car.id, s: 1, b: 1, u: 3 });
  room.onMessage('phone', { t: 'start' });
  assert.equal(room.phase, 'countdown', 'the first phone can start the race');
  room.removeClient('a');
  assert.ok(room.dead);
});

test('when the host leaves, the next player takes over the bots', () => {
  const { room } = setup('party', { bots: 3 });
  room.addClient('b', {});
  room.removeClient('a');
  assert.equal(room.host, 'b');
  assert.ok([...room.cars.values()].filter((c) => c.bot).every((c) => c.owner === 'b'));
});

test('an open room fills up with bots and starts by itself; nobody runs it', () => {
  // Arrange
  const { room, clock, last, at } = setupOpen();
  const track = room.settings.track;
  assert.ok(trackById(track));
  assert.equal(room.settings.laps, OPEN.laps);
  assert.equal(room.cars.size, OPEN.fill);
  assert.equal(last('joined').open, true);
  assert.equal(last('joined').startAt, 1000 + OPEN.lobby);
  // Act: the only player tries to run it anyway
  room.onMessage('a', { t: 'set', settings: { laps: 9, track: TRACKS.find((t) => t.id !== track).id, bots: 0 } });
  room.onMessage('a', { t: 'start' });
  // Assert
  assert.equal(room.phase, 'lobby');
  assert.deepEqual([room.settings.laps, room.settings.track, room.cars.size], [OPEN.laps, track, OPEN.fill]);
  // A late arrival takes a bot's place and gets a moment before the off.
  at(1000 + OPEN.lobby - 1);
  room.addClient('b', { name: 'Bob' });
  assert.equal(room.cars.size, OPEN.fill);
  assert.equal(room.humanCars().length, 2);
  assert.equal(room.startAt, clock.t + OPEN.late);
  at(1000 + OPEN.lobby + 1);
  assert.equal(room.phase, 'lobby');
  at(room.startAt);
  assert.equal(room.phase, 'countdown');
  assert.equal(last('race').laps, OPEN.laps);
  assert.equal(room.startAt, 0);
});

test('an open room moves to the next track and goes again after the results', () => {
  // Arrange
  const { room, clock, last, at } = setupOpen({ laps: 1 });
  const first = room.settings.track, next = TRACKS[(TRACKS.findIndex((t) => t.id === first) + 1) % TRACKS.length].id;
  at(room.startAt);
  at(room.race.t0 + 1);
  const a = carOf(room, 'a');
  // Act
  room.onMessage('a', { t: 'st', c: [st(a, 0, 0)] });
  room.onMessage('a', { t: 'lap', car: a.id, n: 1, ms: 20000 });
  // Assert
  assert.equal(room.phase, 'results');
  assert.equal(last('room').next, next);
  assert.equal(room.startAt, clock.t + OPEN.results);
  room.onMessage('a', { t: 'start' });
  room.onMessage('a', { t: 'lobby' });
  assert.equal(room.phase, 'results', 'still nobody to press the button');
  at(room.startAt);
  assert.equal(room.phase, 'countdown');
  assert.equal(room.race.track, next);
});

test('an open room drops a player who has gone quiet, and ends a race that drags on', () => {
  // Arrange
  const { room, clock, last, at } = setupOpen();
  room.addClient('b', { name: 'Bob' });
  at(room.startAt);
  const t0 = room.race.t0, b = carOf(room, 'b');
  // Act: Bob keeps driving, Ann (the host) has put her phone down
  for (let t = t0 + 1; t <= t0 + OPEN.away + 1000; t += 1000) { clock.t = t; room.onMessage('b', { t: 'st', c: [st(b, 0, 10)] }); room.tick(); }
  // Assert
  assert.equal(last('closed', 'a').away, true);
  assert.ok(!room.clients.has('a'));
  assert.equal(room.host, 'b');
  assert.ok([...room.cars.values()].filter((c) => c.bot).every((c) => c.owner === 'b'));
  assert.equal(room.phase, 'racing');
  for (let t = clock.t; t <= t0 + OPEN.maxRace + 1000; t += 5000) { clock.t = t; room.onMessage('b', { t: 'st', c: [st(b, 0, 10)] }); room.tick(); }
  assert.equal(room.phase, 'results');
  assert.ok(room.clients.has('b'));
});
