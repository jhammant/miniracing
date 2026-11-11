import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room, MAX_CARS, OPEN, cleanName, ELIM, LIGHTS } from '../src/shared/room.js';
import { DRIVERS } from '../src/shared/drivers.js';
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
  assert.deepEqual(last('round').lights, { [a.id]: 5, [b.id]: 3 });
  assert.equal(room.phase, 'results');
  assert.equal(last('results').order[0].name, 'ANN');
});

test('eight lights: a round win lights one, the bottom half lose one, all eight ends it early', () => {
  // Arrange
  const { room, clock, last, go } = setup('party', { mode: 'elim', laps: 9, bots: 0 });
  room.addClient('b', {}); room.addClient('c', {});
  go();
  const [a, b, c] = ['a', 'b', 'c'].map((id) => carOf(room, id));
  const round = () => {
    clock.t = room.race.graceUntil + 100;
    room.onMessage('a', { t: 'st', c: [st(a, 300, 300)] });
    room.onMessage('b', { t: 'st', c: [st(b, 100, 100)] });
    room.onMessage('c', { t: 'st', c: [st(c, 0, 0)] });
    for (let i = 0; i < 10; i++) { clock.t += 66; room.tick(); }
  };
  // Act
  round();
  // Assert: three cars, so only the last of them is in the bottom half
  assert.deepEqual(last('round').lights, { [a.id]: 5, [b.id]: 4, [c.id]: 3 });
  assert.deepEqual(last('round').lost, [c.id]);
  assert.equal(room.phase, 'racing');
  // Act: the same again until somebody has all eight
  for (let i = 0; i < 3; i++) { clock.t += ELIM.pause + 10; room.tick(); assert.equal(room.race.round, i + 2); round(); }
  // Assert
  assert.equal(room.phase, 'results');
  assert.equal(room.race.round, 4);
  assert.deepEqual(last('results').order.map((r) => [r.name, r.lights]), [['ANN', LIGHTS.total], ['RACER', 4], ['RACER', 0]]);
});

test('a cup goes round every room, the bottom half lose a life, and no lives means watching', () => {
  // Arrange
  const { room, last, go } = setup('party', { mode: 'cup', laps: 1, bots: 0, track: TRACKS[1].id });
  room.addClient('b', { name: 'Bob' }); room.addClient('c', { name: 'Cy' }); room.addClient('d', { name: 'Di' });
  const ids = ['a', 'b', 'c', 'd'], minLap = (id) => trackById(id).minLap + 1;
  const race = () => { for (const id of ids) { const car = carOf(room, id); if (!car.waiting) room.onMessage(id, { t: 'lap', car: car.id, n: 1, ms: minLap(room.race.track) }); } };
  // Act: the first race, finished in joining order
  go(); race();
  // Assert
  let res = last('results');
  assert.equal(room.race.track, TRACKS[1].id);
  assert.deepEqual(res.cup && [res.cup.i, res.cup.n, res.cup.done, res.cup.next], [0, TRACKS.length, false, TRACKS[2 % TRACKS.length].id]);
  assert.deepEqual(res.order.map((r) => [r.name, r.lives, r.lost]), [['ANN', 3, false], ['BOB', 3, false], ['CY', 2, true], ['DI', 2, true]]);
  // Settings are fixed while a cup is on
  room.onMessage('a', { t: 'set', settings: { mode: 'race' } });
  assert.equal(room.settings.mode, 'cup');
  // Act: two more, same order, so Cy and Di run out of lives
  go(); race(); go(); race();
  res = last('results');
  assert.equal(room.race.track, TRACKS[3 % TRACKS.length].id);
  assert.deepEqual(res.cup.table.map((r) => [r.name, r.lives]), [['ANN', 3], ['BOB', 3], ['CY', 0], ['DI', 0]]);
  assert.equal(res.cup.done, false);
  // Act: the fourth race has two cars on the grid, and its loser is the bottom half
  go();
  assert.deepEqual(room.race.grid.map((id) => room.cars.get(id).name).sort(), ['ANN', 'BOB']);
  assert.ok(carOf(room, 'c').waiting && room.state().cars.find((c) => c.name === 'CY').lives === 0);
  race(); go(); race(); go(); race();
  // Assert: Bob is out too, one car left, so the cup is over and Ann has it
  res = last('results');
  assert.ok(res.cup.done);
  assert.equal(res.cup.champion, carOf(room, 'a').id);
  assert.equal(carOf(room, 'a').pts, 15 * 6);
  // Back to the lobby clears it
  room.onMessage('a', { t: 'lobby' });
  assert.equal(room.state().cup, null);
  assert.equal(room.settings.track, TRACKS[1].id);
  assert.ok(room.state().cars.every((c) => !c.waiting && c.lives === undefined));
});

test('a time trial is solo only: no bots, no items, and laps until you stop', () => {
  // Arrange
  const party = setup('party', { mode: 'trial' });
  const { room, go } = setup('solo', { mode: 'trial', laps: 3 });
  // Act
  go();
  // Assert
  assert.equal(party.room.settings.mode, 'race');
  assert.equal(room.cars.size, 1);
  assert.deepEqual([room.race.trial, room.race.items, room.race.catchup, room.race.mode], [true, false, false, 'race']);
  const car = carOf(room, 'a');
  for (let n = 1; n <= 5; n++) room.onMessage('a', { t: 'lap', car: car.id, n, ms: trackById(room.race.track).minLap + n });
  assert.equal(car.lapsDone, 5);
  assert.equal(room.phase, 'racing');
  // Alone, you may stop whenever you like; with others in the room the race is not yours to end
  party.room.onMessage('a', { t: 'set', settings: { mode: 'race' } });
  party.go();
  party.room.onMessage('a', { t: 'lobby' });
  room.onMessage('a', { t: 'lobby' });
  assert.equal(party.room.phase, 'racing');
  assert.deepEqual([room.phase, room.race], ['lobby', null]);
});

test('drivers are a number from the list; the horn reaches everyone, not too often, and only for your own car', () => {
  // Arrange
  const { room, sent, clock, go } = setup('party', { bots: 2 });
  room.addClient('b', { name: 'Bob', driver: 7 });
  room.addClient('c', { name: 'Cy', driver: 'x<script>' });
  // Assert
  assert.equal(carOf(room, 'b').driver, 7);
  assert.ok([...room.cars.values()].every((c) => Number.isInteger(c.driver) && c.driver >= 0 && c.driver < DRIVERS.length));
  room.onMessage('b', { t: 'me', driver: 999 });
  assert.equal(carOf(room, 'b').driver, 7);
  room.onMessage('b', { t: 'me', driver: 2 });
  assert.equal(room.state().cars.find((c) => c.name === 'BOB').driver, 2);
  // Act: not before a race; then twice at once, then again later
  const horns = () => sent.filter((m) => m.t === 'horn' && m.id === 'a');
  room.onMessage('b', { t: 'horn' });
  assert.equal(horns().length, 0);
  go();
  room.onMessage('b', { t: 'horn', car: carOf(room, 'a').id });
  room.onMessage('b', { t: 'horn' });
  clock.t += 500;
  room.onMessage('b', { t: 'horn' });
  // Assert: always Bob's own car, whatever the message says
  assert.deepEqual(horns().map((m) => m.car), [carOf(room, 'b').id, carOf(room, 'b').id]);
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
