// A race room: who is in it, the lobby settings and the rules of a race.
// It has no I/O of its own. The server wires one to WebSockets for online play,
// and the browser runs one in-process for solo play, so the rules are the same
// code either way. Car physics stays with whichever client owns each car; the
// room relays their states and referees laps, items, eliminations and results.

import { TRACKS, trackById } from './tracks.js';
import { getWorld } from './world.js';
import { rollItem, TUNING, ITEMS } from './items.js';

export const MAX_CARS = 16;
export const COLORS = [
  '#e63946', '#3a86ff', '#ffbe0b', '#2ec4b6', '#fb5607', '#8338ec', '#f72585', '#8ac926',
  '#f5f1e6', '#1d3557', '#ff99c8', '#00b4d8', '#9c6644', '#6c757d', '#c1121f', '#588157',
];
const BOT_NAMES = [
  'CRUMBS', 'BISCUIT', 'MARMITE', 'TOAST', 'JAMMY', 'SPROCKET', 'NIBBLES', 'PICKLE',
  'WAFFLE', 'NOODLE', 'CUSTARD', 'PEANUT', 'GIZMO', 'TURBO TED', 'FIZZ', 'BOLT',
];
const POINTS = [15, 12, 10, 8, 7, 6, 5, 4, 3, 2, 1];
export const ELIM = { dist: 40, gap: 75, grace: 3000, pause: 2600 };
// An open room is one anyone can be matched into. Nobody runs it: the settings
// are fixed, bots make up the numbers, races start on a timer and the track
// moves on after each one, and a player who has wandered off loses their place.
// Times in ms.
export const OPEN = { laps: 3, fill: 8, lobby: 20000, late: 5000, results: 15000, maxRace: 480000, away: 15000 };
const FINISH_WINDOW = 30000;
const COUNTDOWN = 4200;

export function cleanName(s) {
  return String(s ?? '').replace(/[^A-Za-z0-9 .!_-]/g, '').trim().slice(0, 12).toUpperCase() || 'RACER';
}

const num = (v) => typeof v === 'number' && Number.isFinite(v);

export class Room {
  constructor({ code = 'SOLO', kind = 'party', open = null, send, now = Date.now, records = null, rnd = Math.random }) {
    Object.assign(this, { code, kind, send, now, records, rnd });
    this.open = open ? { ...OPEN, ...(open === true ? {} : open) } : null;
    this.clients = new Map();
    this.cars = new Map();
    this.nextCar = 1;
    this.host = null;
    this.phase = 'lobby';
    this.settings = { track: TRACKS[0].id, laps: 5, mode: 'race', bots: kind === 'solo' ? 7 : 3, difficulty: 'normal', items: true, catchup: true };
    if (this.open) Object.assign(this.settings, { laps: this.open.laps, track: TRACKS[Math.floor(rnd() * TRACKS.length) % TRACKS.length].id });
    this.startAt = 0; // open rooms: when the next race starts by itself
    this.race = null;
    this.lastOrder = null;
    this.dead = false;
    this.lastPadSt = 0;
    this.touched = now();
  }

  // ---- membership ---------------------------------------------------------

  addClient(id, { name, color, role } = {}) {
    if (this.dead) return { error: 'That room has closed' };
    const first = this.clients.size === 0;
    if (this.kind === 'screen') role = first ? 'screen' : 'pad';
    else role = 'player';
    if (role !== 'screen' && this.humanCars().length >= MAX_CARS) return { error: 'That room is full' };
    const client = { id, name: cleanName(name), role, car: null };
    this.clients.set(id, client);
    if (first) this.host = id;
    if (role !== 'screen') {
      this.dropBotsTo(MAX_CARS - this.humanCars().length - 1);
      const car = this.addCar({
        name: client.name, color: this.freeColor(color), bot: false,
        owner: role === 'pad' ? this.host : id, pad: role === 'pad' ? id : null,
        waiting: this.phase !== 'lobby' && this.phase !== 'results',
      });
      client.car = car.id;
    }
    if (this.phase === 'lobby') this.reconcileBots();
    if (this.open && this.phase === 'lobby') {
      // The clock starts with the first arrival, and a late one still gets a moment to look round.
      const t = this.now();
      this.startAt = Math.max(this.startAt || t + this.open.lobby, t + this.open.late);
    }
    this.send(id, { t: 'joined', you: id, role, car: client.car, now: this.now(), race: this.raceInfo(), ...this.state() });
    this.pushState();
    return { ok: true, role };
  }

  removeClient(id) {
    const client = this.clients.get(id);
    if (!client) return;
    this.clients.delete(id);
    if (client.role === 'screen' || this.clients.size === 0) {
      this.broadcast({ t: 'closed', why: 'The host screen left' });
      this.dead = true;
      return;
    }
    if (client.car) this.cars.delete(client.car);
    if (this.host === id) {
      this.host = [...this.clients.values()].find((c) => c.role !== 'pad').id;
      for (const car of this.cars.values()) if (car.bot) car.owner = this.host;
    }
    if (this.phase === 'lobby') this.reconcileBots();
    this.pushState();
    if (this.phase === 'racing') this.checkEnd();
  }

  humanCars() { return [...this.cars.values()].filter((c) => !c.bot); }

  freeColor(want) {
    const used = new Set([...this.cars.values()].map((c) => c.color));
    if (Number.isInteger(want) && want >= 0 && want < COLORS.length && !used.has(want)) return want;
    for (let i = 0; i < COLORS.length; i++) if (!used.has(i)) return i;
    return 0;
  }

  addCar(props) {
    const car = {
      id: this.nextCar++, pts: 0, st: null, total: 0, lapsDone: 0, best: 0, item: null,
      finished: false, out: false, pos: 0, time: 0, behindT: 0, waiting: false, ...props,
    };
    this.cars.set(car.id, car);
    return car;
  }

  dropBotsTo(max) {
    const bots = [...this.cars.values()].filter((c) => c.bot);
    while (bots.length > Math.max(0, max)) this.cars.delete(bots.pop().id);
  }

  reconcileBots() {
    const humans = this.humanCars().length;
    let want = this.open ? Math.max(0, this.open.fill - humans) : Math.min(this.settings.bots, MAX_CARS - humans);
    if (this.settings.mode === 'elim' && humans + want < 2) want = 2 - humans;
    this.dropBotsTo(want);
    const used = new Set([...this.cars.values()].map((c) => c.name));
    let have = [...this.cars.values()].filter((c) => c.bot).length;
    for (const name of BOT_NAMES) {
      if (have >= want) break;
      if (used.has(name)) continue;
      this.addCar({ name, color: this.freeColor(), bot: true, owner: this.host, pad: null });
      have++;
    }
  }

  // ---- messaging ----------------------------------------------------------

  broadcast(msg, skipPads = false) {
    for (const c of this.clients.values()) if (!(skipPads && c.role === 'pad')) this.send(c.id, msg);
  }

  state() {
    return {
      code: this.code, kind: this.kind, host: this.host, phase: this.phase, settings: this.settings,
      open: !!this.open, startAt: this.startAt, next: this.open && this.phase === 'results' ? this.nextTrack() : null,
      cars: [...this.cars.values()].map((c) => ({
        id: c.id, name: c.name, color: c.color, bot: c.bot, owner: c.owner, pad: c.pad, pts: c.pts, waiting: c.waiting,
      })),
    };
  }

  pushState() { this.broadcast({ t: 'room', ...this.state() }); }

  raceInfo() {
    const r = this.race;
    if (!r) return null;
    return {
      track: r.track, laps: r.laps, mode: r.mode, t0: r.t0, grid: r.grid, items: r.items, catchup: r.catchup,
      difficulty: r.difficulty, round: r.round, s: r.s, boxes: r.boxes.map((b) => b.on), hazards: [...r.hazards.values()],
    };
  }

  onMessage(id, msg) {
    const client = this.clients.get(id);
    if (!client || !msg || typeof msg.t !== 'string') return;
    this.touched = this.now();
    const fn = this.handlers[msg.t];
    if (fn) fn.call(this, client, msg);
  }

  ownCar(client, carId) {
    const car = this.cars.get(carId);
    return car && car.owner === client.id ? car : null;
  }

  handlers = {
    ping(client, msg) { this.send(client.id, { t: 'pong', c: msg.c, now: this.now() }); },

    set(client, msg) {
      if (this.open || client.id !== this.host || (this.phase !== 'lobby' && this.phase !== 'results')) return;
      const s = this.settings, v = msg.settings || {};
      if (TRACKS.some((t) => t.id === v.track)) s.track = v.track;
      if ([1, 3, 5, 7, 9].includes(v.laps)) s.laps = v.laps;
      if (v.mode === 'race' || v.mode === 'elim') s.mode = v.mode;
      if (Number.isInteger(v.bots) && v.bots >= 0 && v.bots < MAX_CARS) s.bots = v.bots;
      if (['easy', 'normal', 'hard'].includes(v.difficulty)) s.difficulty = v.difficulty;
      if (typeof v.items === 'boolean') s.items = v.items;
      if (typeof v.catchup === 'boolean') s.catchup = v.catchup;
      if (this.phase === 'lobby') this.reconcileBots();
      this.pushState();
    },

    me(client, msg) {
      const car = this.cars.get(client.car);
      if (!car || this.phase === 'racing' || this.phase === 'countdown') return;
      if (msg.name !== undefined) car.name = client.name = cleanName(msg.name);
      if (msg.color !== undefined) { car.color = -1; car.color = this.freeColor(msg.color); }
      this.pushState();
    },

    start(client) {
      if (!this.mayRun(client) || (this.phase !== 'lobby' && this.phase !== 'results')) return;
      this.startRace();
    },

    lobby(client) {
      if (!this.mayRun(client) || this.phase !== 'results') return;
      this.phase = 'lobby'; this.race = null;
      for (const car of this.cars.values()) car.waiting = false;
      this.reconcileBots();
      this.pushState();
    },

    st(client, msg) {
      if (!this.race || !Array.isArray(msg.c)) return;
      client.drove = this.now();
      for (const a of msg.c) {
        if (!Array.isArray(a) || a.length !== 10 || !a.every(num)) continue;
        const car = this.ownCar(client, a[0]);
        if (car) { car.st = a; car.total = a[8]; }
      }
    },

    lap(client, msg) {
      const r = this.race, car = this.ownCar(client, msg.car);
      if (!car || !r || this.phase !== 'racing' || r.mode !== 'race' || car.finished || car.waiting) return;
      if (msg.n !== car.lapsDone + 1 || !num(msg.ms) || msg.ms < trackById(r.track).minLap || msg.ms > 600000) return;
      const ms = Math.round(msg.ms);
      car.lapsDone = msg.n;
      if (!car.best || ms < car.best) car.best = ms;
      this.broadcast({ t: 'lapd', car: car.id, n: msg.n, ms, best: car.best });
      if (!car.bot && this.records) {
        Promise.resolve(this.records.submit(r.track, car.name, ms)).then((res) => {
          if (res && res.rank) this.broadcast({ t: 'record', car: car.id, name: car.name, track: r.track, ms, rank: res.rank });
        }).catch(() => {});
      }
      if (msg.n >= r.laps) {
        car.finished = true; car.pos = ++r.finishCount; car.time = this.now() - r.t0;
        if (!r.deadline) r.deadline = this.now() + FINISH_WINDOW;
        this.broadcast({ t: 'fin', car: car.id, pos: car.pos, time: car.time, deadline: r.deadline });
        this.checkEnd();
      }
    },

    pick(client, msg) {
      const r = this.race, car = this.ownCar(client, msg.car);
      const box = r && r.boxes[msg.box];
      if (!car || !box || !r.items || this.phase !== 'racing' || !box.on || car.item || car.out || car.finished) return;
      box.on = false; box.at = this.now() + TUNING.boxRespawn * 1000;
      const field = this.racers().filter((c) => !c.out);
      const rank = this.order().filter((c) => !c.out).indexOf(car);
      car.item = rollItem(field.length > 1 ? rank / (field.length - 1) : 0, field.length, this.rnd);
      this.broadcast({ t: 'box', i: msg.box, car: car.id, item: car.item });
    },

    use(client, msg) {
      const r = this.race, car = this.ownCar(client, msg.car);
      if (!car || !r || this.phase !== 'racing' || !car.item || ![msg.x, msg.z, msg.s, msg.lat].every(num)) return;
      const kind = car.item, now = this.now();
      car.item = null;
      if (kind === 'rocket' || kind === 'oil') {
        const hz = kind === 'rocket'
          ? { id: ++r.hzSeq, kind, by: car.id, s: msg.s + 2, lat: msg.lat, t0: now, until: now + TUNING.rocketLife * 1000 }
          : { id: ++r.hzSeq, kind, by: car.id, x: msg.x, z: msg.z, t0: now, until: now + TUNING.oilLife * 1000 };
        r.hazards.set(hz.id, hz);
        this.broadcast({ t: 'use', car: car.id, kind, hz });
      } else if (kind === 'zap') {
        const targets = this.racers().filter((c) => c !== car && !c.out && !c.finished && c.total > car.total).map((c) => c.id);
        this.broadcast({ t: 'use', car: car.id, kind, targets });
      } else {
        this.broadcast({ t: 'use', car: car.id, kind, x: msg.x, z: msg.z });
      }
    },

    hit(client, msg) {
      const r = this.race, car = this.ownCar(client, msg.car);
      const hz = r && r.hazards.get(msg.hz);
      if (!car || !hz || (hz.kind === 'rocket' && hz.by === car.id)) return;
      r.hazards.delete(hz.id);
      this.broadcast({ t: 'hit', car: car.id, hz: hz.id, kind: hz.kind, by: hz.by, blocked: !!msg.blocked });
    },

    // A phone acting as a gamepad: forward its sticks to the screen that owns the car.
    pad(client, msg) {
      const car = this.cars.get(client.car);
      if (!car || client.role !== 'pad' || !num(msg.s)) return;
      this.send(car.owner, { t: 'pad', car: car.id, s: Math.max(-1, Math.min(1, msg.s)), b: msg.b ? 1 : 0, u: msg.u | 0 });
    },
  };

  // The host runs the room; on a shared screen the first phone to join can too.
  // Nobody runs an open room.
  mayRun(client) {
    if (this.open) return false;
    if (client.id === this.host) return true;
    const firstPad = [...this.clients.values()].find((c) => c.role === 'pad');
    return this.kind === 'screen' && firstPad === client;
  }

  // ---- race ---------------------------------------------------------------

  racers() { return [...this.cars.values()].filter((c) => !c.waiting); }

  // Running order: finishers by place, then everyone else by distance covered.
  order() {
    return this.racers().sort((a, b) => (a.finished || b.finished)
      ? (a.finished ? a.pos : 1e9) - (b.finished ? b.pos : 1e9)
      : b.total - a.total);
  }

  startRace() {
    this.startAt = 0;
    for (const car of this.cars.values()) car.waiting = false;
    this.reconcileBots();
    const cars = [...this.cars.values()];
    if (!cars.length) return;
    const s = this.settings, world = getWorld(s.track);
    // First race: shuffled grid. After that: reverse the last result, winner at the back.
    let grid;
    if (this.lastOrder) {
      const rank = new Map(this.lastOrder.map((id, i) => [id, i]));
      grid = cars.sort((a, b) => (rank.get(b.id) ?? -1) - (rank.get(a.id) ?? -1)).map((c) => c.id);
    } else {
      grid = cars.map((c) => c.id);
      for (let i = grid.length - 1; i > 0; i--) { const j = Math.floor(this.rnd() * (i + 1)); [grid[i], grid[j]] = [grid[j], grid[i]]; }
    }
    for (const car of cars) Object.assign(car, { st: null, total: 0, lapsDone: 0, best: 0, item: null, finished: false, out: false, pos: 0, time: 0, behindT: 0, wins: 0 });
    const t0 = this.now() + COUNTDOWN;
    this.race = {
      track: s.track, laps: s.laps, mode: s.mode, items: s.items, catchup: s.catchup, difficulty: s.difficulty,
      t0, grid, round: 1, s: 0, graceUntil: t0 + ELIM.grace,
      boxes: world.boxes.map(() => ({ on: true, at: 0 })), hazards: new Map(), hzSeq: 0,
      finishCount: 0, deadline: 0, regridAt: 0,
    };
    this.phase = 'countdown';
    this.pushState();
    this.broadcast({ t: 'race', ...this.raceInfo() });
  }

  checkEnd() {
    const r = this.race;
    if (!r || this.phase !== 'racing' || r.mode !== 'race') return;
    const racers = this.racers(), humans = racers.filter((c) => !c.bot);
    const done = (list) => list.length > 0 && list.every((c) => c.finished);
    if (done(humans) || done(racers) || racers.length === 0 || (r.deadline && this.now() >= r.deadline)) this.endRace(this.order());
  }

  endRace(order) {
    const r = this.race;
    order.forEach((car, i) => { car.gained = POINTS[i] || 0; car.pts += car.gained; });
    this.lastOrder = order.map((c) => c.id);
    this.phase = 'results';
    if (this.open) this.startAt = this.now() + this.open.results;
    this.pushState();
    this.broadcast({
      t: 'results', mode: r.mode, track: r.track,
      order: order.map((c) => ({ id: c.id, name: c.name, color: c.color, bot: c.bot, time: c.finished ? c.time : 0, best: c.best, wins: c.wins, gained: c.gained, pts: c.pts })),
    });
  }

  // Elimination: fall too far behind the leader and you are out of the round.
  // Last car standing takes the round; first to `laps` rounds wins.
  tickElim(now, dt) {
    const r = this.race;
    if (r.regridAt) {
      if (now < r.regridAt) return;
      const world = getWorld(r.track), order = this.order();
      const lead = order[0];
      r.s = lead ? ((lead.total % world.track.len) + world.track.len) % world.track.len : 0;
      r.grid = order.map((c) => c.id);
      r.round++; r.regridAt = 0;
      r.t0 = now + 3000; r.graceUntil = r.t0 + ELIM.grace;
      r.hazards.clear();
      for (const b of r.boxes) b.on = true;
      for (const car of this.racers()) Object.assign(car, { out: false, item: null, behindT: 0, total: r.s, st: null });
      this.broadcast({ t: 'regrid', ...this.raceInfo() });
      return;
    }
    if (now < r.graceUntil) return;
    const alive = this.racers().filter((c) => !c.out && c.st);
    if (alive.length > 1) {
      const lead = alive.reduce((a, b) => (b.total > a.total ? b : a));
      for (const car of alive) {
        if (car === lead) continue;
        const gap = lead.total - car.total, d = Math.hypot(car.st[1] - lead.st[1], car.st[2] - lead.st[2]);
        car.behindT = (d > ELIM.dist && gap > 12) || gap > ELIM.gap ? car.behindT + dt : 0;
        if (car.behindT > 0.4) { car.out = true; car.item = null; this.broadcast({ t: 'out', car: car.id }); }
      }
    }
    const left = this.racers().filter((c) => !c.out);
    if (left.length <= 1 && this.racers().length > 0) {
      const winner = left[0] || this.order()[0];
      winner.wins = (winner.wins || 0) + 1;
      this.broadcast({ t: 'round', winner: winner.id, wins: winner.wins, target: r.laps });
      if (winner.wins >= r.laps || this.racers().length < 2) {
        this.endRace(this.racers().sort((a, b) => (b.wins || 0) - (a.wins || 0) || b.total - a.total));
      } else r.regridAt = now + ELIM.pause;
    }
  }

  nextTrack() {
    return TRACKS[(TRACKS.findIndex((t) => t.id === this.settings.track) + 1) % TRACKS.length].id;
  }

  // An open room runs itself: start when the clock says so, never let a race
  // nobody is finishing hold everyone there, and clear out anyone who has gone.
  tickOpen(now) {
    if (this.phase === 'racing') {
      const t0 = this.race.t0;
      if (now - t0 > this.open.maxRace) { this.endRace(this.order()); return; }
      // A closed tab or a pocketed phone stops sending. Its car would sit on the
      // track, and its bots with it if it was the host, so the place goes.
      for (const c of [...this.clients.values()]) {
        const car = this.cars.get(c.car);
        if (!car || car.waiting || now - Math.max(c.drove || 0, t0) <= this.open.away) continue;
        this.send(c.id, { t: 'closed', away: true });
        this.removeClient(c.id);
        if (this.dead) return;
      }
    }
    if ((this.phase !== 'lobby' && this.phase !== 'results') || !this.startAt || now < this.startAt) return;
    if (this.phase === 'results') this.settings.track = this.nextTrack();
    this.startRace();
  }

  tick(dt = 1 / 15) {
    const now = this.now();
    if (this.dead) return;
    if (this.open) this.tickOpen(now);
    const r = this.race;
    if (!r) return;
    if (this.phase === 'countdown' && now >= r.t0) this.phase = 'racing';
    if (this.phase !== 'racing' && this.phase !== 'countdown') return;

    const viewers = [...this.clients.values()].filter((c) => c.role !== 'pad');
    if (viewers.length > 1) {
      const c = [];
      for (const car of this.cars.values()) if (car.st) c.push(car.st);
      if (c.length) for (const v of viewers) this.send(v.id, { t: 'snap', now, c });
    }
    if (this.phase !== 'racing') return;

    r.boxes.forEach((b, i) => { if (!b.on && now >= b.at) { b.on = true; this.broadcast({ t: 'boxon', i }); } });
    for (const hz of r.hazards.values()) if (now >= hz.until) { r.hazards.delete(hz.id); this.broadcast({ t: 'hzoff', id: hz.id }); }

    if (r.mode === 'elim') this.tickElim(now, dt);
    else if (r.deadline && now >= r.deadline) this.checkEnd();

    if (this.kind === 'screen' && now - this.lastPadSt > 400) {
      this.lastPadSt = now;
      const order = this.order();
      for (const c of this.clients.values()) {
        const car = c.role === 'pad' && this.cars.get(c.car);
        if (car) this.send(c.id, { t: 'padst', pos: order.indexOf(car) + 1, of: order.length, lap: Math.min(r.laps, car.lapsDone + 1), laps: r.laps, item: car.item, out: car.out, fin: car.finished, mode: r.mode, wins: car.wins || 0 });
      }
    }
  }
}

export { ITEMS };
