// The race as one client sees it. This client simulates the cars it owns (your
// own car; the bots if you host; the phone-pad cars if you are the big screen),
// sends their state to the room, and eases everyone else's cars towards the
// states the room relays. The room referees laps, items and results.

import { getWorld, updateMovers } from '../shared/world.js';
import { makeCar, placeCar, stepCar, collideCars, updateSlipstream, packCar, unpackCar, DT } from '../shared/physics.js';
import { bakeAI, makeBot, botInput, botWantsItem, botWantsShot } from '../shared/ai.js';
import { TUNING, SHELL, rocketPos, shellPos } from '../shared/items.js';
import { COLORS, ELIM, LIGHTS } from '../shared/room.js';
import { wrapAngle } from '../shared/track.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const SEND_EVERY = 4; // physics steps between state packets: 15 a second

export class Game {
  // `input(out)` fills { steer, throttle, brake } for your own car; `itemTap()`
  // is true once per press. `on(type, data)` receives everything worth showing.
  constructor({ conn, me, role, myCar, input, itemTap, on }) {
    Object.assign(this, { conn, me, role, myCar, input, itemTap, on });
    this.cars = new Map();
    this.bots = new Map();
    this.pads = new Map();
    this.hazards = new Map();
    this.boxes = [];
    this.race = null;
    this.world = null;
    this.phase = 'lobby';
    this.host = null;
    this.started = false;
    this.acc = 0; this.alpha = 0; this.step = 0;
    this.raceT = 0;
    this.order = [];
    this.inp = { steer: 0, throttle: 0, brake: 0 };
    this.pt = { x: 0, z: 0 };
    this.emit = (type, car, data) => this.carEvent(type, car, data);
  }

  // ---- room state ---------------------------------------------------------

  applyRoom(m) {
    this.phase = m.phase; this.host = m.host;
    const seen = new Set();
    for (const info of m.cars) {
      seen.add(info.id);
      let car = this.cars.get(info.id);
      if (!car) {
        car = Object.assign(makeCar(info.id), { item: null, laps: 0, best: 0, lastLap: 0, lapStart: 0, wins: 0, finPos: 0, active: false, snapAge: 0, fresh: true });
        this.cars.set(info.id, car);
        this.on('carAdded', car);
      }
      const wasLocal = car.local;
      Object.assign(car, { name: info.name, colorIdx: info.color, color: COLORS[info.color] || COLORS[0], bot: info.bot, owner: info.owner, pad: info.pad, pts: info.pts, waiting: info.waiting, driver: info.driver, lives: info.lives });
      car.local = info.owner === this.me;
      // The host left and its bots are now ours: pick them up where they are.
      if (car.local && !wasLocal && this.world && car.active) this.adopt(car);
      this.on('carInfo', car);
    }
    for (const [id, car] of this.cars) {
      if (seen.has(id)) continue;
      this.cars.delete(id); this.bots.delete(id); this.pads.delete(id);
      this.on('carGone', car);
    }
  }

  adopt(car) {
    const { track } = this.world;
    car.idx = track.locate(car.x, car.z);
    car.s = ((car.total % track.len) + track.len) % track.len;
    car.lapsDone = Math.max(0, Math.floor(car.total / track.len));
    car.frozen = !this.started || car.out;
    car.boostT = car.shieldT = car.spinT = car.squashT = car.shrinkT = car.fallT = car.invT = car.pushT = car.drift = car.reloadT = 0;
  }

  // ---- race lifecycle -----------------------------------------------------

  startRace(r, joining = false) {
    this.race = r;
    this.world = getWorld(r.track);
    bakeAI(this.world);
    this.boxes = r.boxes.slice();
    this.hazards = new Map((r.hazards || []).map((h) => [h.id, h]));
    this.bots.clear();
    this.started = false; this.step = 0; this.acc = 0;
    for (const car of this.cars.values()) {
      Object.assign(car, { active: false, item: null, laps: 0, best: 0, lastLap: 0, lapStart: 0, wins: 0, finPos: 0, finished: false, out: false, lapsDone: 0, catchup: 0, pickT: 0, reloadT: 0, lights: r.lights?.[car.id] ?? LIGHTS.start });
    }
    this.placeGrid(r);
    this.on('race', { race: r, world: this.world, joining });
  }

  placeGrid(r) {
    r.grid.forEach((id, slot) => {
      const car = this.cars.get(id);
      if (!car) return;
      const g = this.world.grid(slot);
      placeCar(car, this.world, r.s + g.s, g.lat);
      Object.assign(car, { active: true, frozen: true, out: false, lapsDone: 0, item: null, tx: car.x, tz: car.z, ty: 0, th: car.h, fresh: false, snapAge: 0 });
    });
  }

  regrid(r) {
    Object.assign(this.race, r);
    this.boxes = r.boxes.slice();
    this.hazards.clear();
    this.started = false;
    this.placeGrid(r);
    this.on('regrid', { race: this.race });
  }

  endRace() {
    for (const car of this.cars.values()) { car.frozen = true; car.vx = 0; car.vz = 0; car.catchup = 0; }
    this.on('engineOff');
  }

  // ---- messages -----------------------------------------------------------

  onMessage(m) {
    const car = m.car !== undefined ? this.cars.get(m.car) : null;
    switch (m.t) {
      case 'room': this.applyRoom(m); break;
      case 'race': this.startRace(m); break;
      case 'regrid': this.regrid(m); break;
      case 'snap':
        for (const a of m.c) {
          const c = this.cars.get(a[0]);
          if (!c || c.local) continue;
          unpackCar(c, a); c.snapAge = 0;
          if (c.fresh || !c.active) { c.x = c.px = c.tx; c.z = c.pz = c.tz; c.y = c.py = c.ty; c.h = c.ph = c.th; c.fresh = false; c.active = true; }
        }
        break;
      case 'box':
        this.boxes[m.i] = false;
        if (car) { car.item = m.item; car.pickT = 0; this.on('pickup', { car, item: m.item, box: m.i }); }
        break;
      case 'boxon': this.boxes[m.i] = true; this.on('boxOn', m.i); break;
      case 'use': if (car) this.applyUse(car, m); break;
      case 'fire': if (car) this.applyFire(car, m); break;
      case 'hit': this.applyHit(car, m); break;
      case 'hzoff': { const hz = this.hazards.get(m.id); this.hazards.delete(m.id); if (hz) this.on('hazardGone', { hz, fizzle: true }); break; }
      case 'lapd':
        if (!car) break;
        car.laps = m.n; car.best = m.best; car.lastLap = m.ms;
        this.on('lap', { car, n: m.n, ms: m.ms, isBest: m.ms === m.best, final: m.n === this.race.laps - 1 });
        break;
      case 'record': this.on('record', m); break;
      case 'fin':
        if (!car) break;
        car.finished = true; car.finPos = m.pos; car.finTime = m.time; car.item = null;
        this.race.deadline = m.deadline;
        this.on('finish', { car, pos: m.pos, time: m.time });
        break;
      case 'out':
        if (!car) break;
        car.out = true; car.item = null;
        if (car.local) { car.frozen = true; car.vx = 0; car.vz = 0; }
        this.on('out', { car });
        break;
      case 'round': {
        const winner = this.cars.get(m.winner);
        for (const c of this.cars.values()) if (m.lights[c.id] !== undefined) c.lights = m.lights[c.id];
        if (winner) { winner.wins = m.wins; this.on('round', { car: winner, round: m.round, max: m.max, lost: m.lost }); }
        break;
      }
      case 'horn': if (car) this.on('horn', { car }); break;
      case 'results': this.phase = 'results'; this.endRace(); this.on('results', m); break;
      case 'pad': this.pads.set(m.car, { s: m.s, b: m.b, u: m.u, used: this.pads.get(m.car)?.used ?? m.u, at: performance.now() }); break;
      default:
    }
  }

  applyUse(car, m) {
    car.item = null;
    const shielded = (c) => { if (c.shieldT > 0) { c.shieldT = 0; this.on('shieldPop', { car: c }); return true; } return false; };
    if (m.kind === 'rocket' || m.kind === 'oil') this.hazards.set(m.hz.id, m.hz);
    else if (m.kind === 'boost') { if (car.local) car.boostT = TUNING.boostT; } else if (m.kind === 'shield') { if (car.local) car.shieldT = TUNING.shieldT; } else if (m.kind === 'mallet') {
      for (const c of this.cars.values()) {
        if (c === car || !c.local || !c.active || c.out || c.fallT > 0 || c.invT > 0) continue;
        if (Math.hypot(c.x - m.x, c.z - m.z) < TUNING.malletR && !shielded(c)) { c.squashT = TUNING.squashT; this.on('squashed', { car: c }); }
      }
    } else if (m.kind === 'zap') {
      for (const id of m.targets) {
        const c = this.cars.get(id);
        if (c && c.local && !c.out && !shielded(c)) c.shrinkT = TUNING.shrinkT;
      }
    }
    this.on('use', { car, kind: m.kind, x: m.x ?? car.x, z: m.z ?? car.z, hz: m.hz, targets: m.targets });
  }

  applyFire(car, m) {
    this.hazards.set(m.hz.id, m.hz);
    // The gun kicks.
    if (car.local) { car.vx -= Math.sin(m.hz.h) * 2.5; car.vz -= Math.cos(m.hz.h) * 2.5; }
    car.kick = 1;
    this.on('fire', { car, hz: m.hz });
  }

  applyHit(car, m) {
    const hz = this.hazards.get(m.hz);
    this.hazards.delete(m.hz);
    if (hz) this.on('hazardGone', { hz, fizzle: false });
    if (!car) return;
    if (car.local) {
      if (m.blocked) car.shieldT = 0;
      else if (m.kind === 'rocket') { car.spinT = TUNING.spinT; car.vx *= 0.35; car.vz *= 0.35; } else if (m.kind === 'shell') { car.spinT = SHELL.spinT; car.vx *= SHELL.slow; car.vz *= SHELL.slow; } else car.spinT = TUNING.oilSpinT;
    }
    this.on('hit', { car, kind: m.kind, blocked: m.blocked, by: this.cars.get(m.by) });
  }

  // ---- simulation ---------------------------------------------------------

  // Events from the physics for the cars we own.
  carEvent(type, car, data) {
    if (type !== 'lap') { this.on(type, { car, data }); return; }
    car.lapsDone++;
    const ms = (this.raceT - car.lapStart) * 1000;
    car.lapStart = this.raceT;
    // The room counts laps; ask for the one after the last it confirmed.
    if (this.race.mode === 'race' && !car.finished) this.conn.send({ t: 'lap', car: car.id, n: car.laps + 1, ms });
  }

  // The item button: the power-up you hold, or in a tank with none, the gun.
  useItem(car) {
    if (car.out || car.finished || !this.started) return;
    const fx = Math.sin(car.h), fz = Math.cos(car.h);
    if (!car.item) {
      if (!this.world.veh.gun || car.reloadT > 0 || car.spinT > 0 || car.fallT > 0 || this.phase === 'results') return;
      car.reloadT = SHELL.reload;
      this.conn.send({ t: 'fire', car: car.id, x: car.x + fx * 1.8, z: car.z + fz * 1.8, h: car.h });
      return;
    }
    // Oil drops behind the car; everything else happens where the car is.
    const back = car.item === 'oil' ? 2.6 : 0;
    this.conn.send({ t: 'use', car: car.id, x: car.x - fx * back, z: car.z - fz * back, s: car.s, lat: car.lat });
    car.item = null;
  }

  driverFor(car) {
    let bot = this.bots.get(car.id);
    if (!bot) { bot = makeBot(car.id * 7 + this.race.round, this.race.difficulty); this.bots.set(car.id, bot); }
    return bot;
  }

  frame(dt) {
    if (!this.race) return;
    this.raceT = (this.conn.now() - this.race.t0) / 1000;
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= DT) { this.tick(); this.acc -= DT; }
    this.alpha = this.acc / DT;
    this.rank();
  }

  tick() {
    const { world, race } = this;
    const racing = this.phase !== 'results';
    if (!this.started && racing && this.raceT >= 0) {
      this.started = true;
      for (const car of this.cars.values()) if (car.local && car.active && !car.out) { car.frozen = false; car.lapStart = Math.max(0, this.raceT); }
      this.on('go', { round: race.round });
    }
    updateMovers(world, Math.max(0, this.raceT));

    const all = [], own = [];
    let lead = -Infinity, human = null;
    for (const car of this.cars.values()) {
      if (!car.active) continue;
      all.push(car);
      if (car.local) own.push(car);
      if (car.out) continue;
      if (car.total > lead) lead = car.total;
      if (!car.bot && !car.finished && (human === null || car.total > human)) human = car.total;
    }
    if (!race.catchup) human = null;

    const inp = this.inp;
    for (const car of own) {
      const mine = car.id === this.myCar && !car.finished;
      if (car.frozen && car.fallT <= 0) { inp.steer = 0; inp.throttle = 0; inp.brake = 0; if (mine) this.itemTap(); } else if (mine) {
        this.input(inp);
        if (this.itemTap()) this.useItem(car);
      } else if (car.pad && !car.finished) {
        const p = this.pads.get(car.id);
        const live = p && performance.now() - p.at < 1000;
        inp.steer = live ? p.s : 0; inp.brake = live ? p.b : 0; inp.throttle = inp.brake ? 0 : 1;
        if (p && p.u !== p.used) { p.used = p.u; this.useItem(car); }
      } else {
        const bot = this.driverFor(car);
        botInput(car, bot, world, all, DT, car.bot ? human : null, inp);
        if (car.bot && (car.item ? botWantsItem(car, bot, car.item, all, DT) : world.veh.gun && botWantsShot(car, bot, all, DT))) this.useItem(car);
      }
      if (car.reloadT > 0) car.reloadT -= DT;
      car.catchup = race.catchup && !car.bot && !car.finished ? clamp((lead - car.total) / 160, 0, 1) * 0.13 : 0;
      stepCar(car, inp, DT, world, this.emit);
    }
    collideCars(own, all, this.emit);
    updateSlipstream(own, all, DT);

    // Everyone else's cars: coast along their last known velocity and ease in.
    const k = 1 - Math.exp(-14 * DT);
    for (const car of all) {
      if (car.local) continue;
      car.px = car.x; car.pz = car.z; car.py = car.y; car.ph = car.h;
      car.snapAge += DT;
      if (car.snapAge < 0.4 && racing) { car.tx += car.vx * DT; car.tz += car.vz * DT; car.total += Math.hypot(car.vx, car.vz) * DT; }
      car.x += (car.tx - car.x) * k; car.z += (car.tz - car.z) * k; car.y += (car.ty - car.y) * k;
      car.h = wrapAngle(car.h + wrapAngle(car.th - car.h) * k);
      if (car.spinT > 0) car.spin += 15 * DT; else car.spin = 0;
    }

    if (this.started && racing) this.touch(own);
    if (++this.step % SEND_EVERY === 0 && own.length && racing) this.conn.send({ t: 'st', c: own.map(packCar) });
  }

  // Item boxes and hazards, checked only for the cars we own.
  touch(own) {
    const { world, race } = this, now = this.conn.now();
    for (const car of own) {
      if (car.out || car.fallT > 0) continue;
      if (car.pickT > 0) car.pickT -= DT;
      if (race.items && !car.item && !car.finished && car.pickT <= 0 && car.y < 1.5) {
        for (let i = 0; i < world.boxes.length; i++) {
          const b = world.boxes[i];
          if (!this.boxes[i] || Math.abs(car.x - b.x) > 2.4 || Math.abs(car.z - b.z) > 2.4) continue;
          car.pickT = 0.5;
          this.conn.send({ t: 'pick', car: car.id, box: i });
          break;
        }
      }
      if (car.invT > 0 || car.y > 0.8) continue;
      for (const hz of this.hazards.values()) {
        if (hz.claimed) continue;
        const age = (now - hz.t0) / 1000;
        let x = hz.x, z = hz.z, reach = 2.2;
        if (hz.kind === 'rocket') {
          if (hz.by === car.id || age < 0.15) continue;
          const p = rocketPos(world.track, hz, age);
          x = p.x; z = p.z; reach = 2;
        } else if (hz.kind === 'shell') {
          if (hz.by === car.id) continue;
          const p = shellPos(hz, age, this.pt);
          x = p.x; z = p.z; reach = SHELL.reach;
        } else if (hz.by === car.id && age < 0.8) continue;
        if (Math.hypot(car.x - x, car.z - z) > reach) continue;
        hz.claimed = true;
        this.conn.send({ t: 'hit', car: car.id, hz: hz.id, blocked: car.shieldT > 0 });
      }
    }
  }

  // Running order: finishers by place, then distance covered. Cars that are
  // out of an elimination round drop to the back.
  rank() {
    const list = this.order;
    list.length = 0;
    for (const car of this.cars.values()) if (car.active) list.push(car);
    list.sort((a, b) => (a.finished || b.finished)
      ? (a.finished ? a.finPos : 1e9) - (b.finished ? b.finPos : 1e9)
      : (a.out ? 1 : 0) - (b.out ? 1 : 0) || b.total - a.total);
    list.forEach((car, i) => { car.pos = i + 1; });
  }

  leader() { return this.order.find((c) => !c.out && !c.finished) || this.order[0] || null; }

  // The car the camera and the HUD are about: yours, or the leader if you are
  // watching (big screen, joined mid-race, or out of the round).
  focus() {
    const mine = this.cars.get(this.myCar);
    return mine && mine.active && !mine.out ? mine : this.leader();
  }

  // 0..1: how close your car is to being dropped in an elimination round.
  danger() {
    const car = this.cars.get(this.myCar), lead = this.leader();
    if (!car || !lead || lead === car || car.out || !this.started || this.race.mode !== 'elim') return 0;
    const gap = lead.total - car.total;
    if (gap < 12) return 0;
    return clamp(Math.max(Math.hypot(car.x - lead.x, car.z - lead.z) / ELIM.dist, gap / ELIM.gap), 0, 1);
  }
}
