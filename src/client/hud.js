// The on-screen race display: position, laps, timer, minimap, standings,
// countdown and pop-up messages. Plain DOM over the canvas; elements are only
// touched when their value changes.

import { ITEMS } from '../shared/items.js';
import { LIGHTS, CUP } from '../shared/room.js';
import { store, fmtTime, ordinal, esc } from './store.js';

const put = (el, text) => { if (el._t !== text) { el._t = text; el.textContent = text; } };
const html = (el, h) => { if (el._h !== h) { el._h = h; el.innerHTML = h; } };
// A row of lamps, `lit` of them on: the eight lights, or the lives left in a cup.
export const lamps = (lit, total) => '<i class="on"></i>'.repeat(Math.max(0, Math.min(total, lit))) + '<i></i>'.repeat(Math.max(0, total - Math.max(0, lit)));
const flag = (el, name, on) => { if (el[`_${name}`] !== on) { el[`_${name}`] = on; el.classList.toggle(name, on); } };

export class Hud {
  constructor(root, touchRoot, { onMenu }) {
    this.root = root; this.touchRoot = touchRoot;
    root.innerHTML = `
      <div class="vignette"></div>
      <div class="tl"><div class="pos"><b></b><sup></sup><span></span></div><div class="lap"></div><div class="pips"></div><div class="sub"></div></div>
      <div class="tr"><div class="time"></div><div class="best"></div><canvas class="map"></canvas></div>
      <ol class="standings"></ol>
      <button class="menu-btn" aria-label="Pause menu">II</button>
      <div class="slot"><span class="glyph"></span><small></small></div>
      <div class="wrong">WRONG WAY</div>
      <div class="watch"></div>
      <div class="count"></div>
      <div class="toasts"></div>
      <div class="banner"><b></b><span></span></div>
      <div class="joinhint"></div>`;
    const q = (s) => root.querySelector(s);
    this.el = {
      vignette: q('.vignette'), tl: q('.tl'), posN: q('.pos b'), posS: q('.pos sup'), posOf: q('.pos span'), lap: q('.lap'), pips: q('.pips'), sub: q('.sub'),
      time: q('.time'), best: q('.best'), map: q('.map'), standings: q('.standings'), slot: q('.slot'), slotGlyph: q('.slot .glyph'), slotName: q('.slot small'),
      wrong: q('.wrong'), watch: q('.watch'), count: q('.count'), toasts: q('.toasts'), banner: q('.banner'), bannerT: q('.banner b'), bannerS: q('.banner span'),
      join: q('.joinhint'), padGlyph: touchRoot.querySelector('.item .glyph'), padItem: touchRoot.querySelector('.item'),
    };
    q('.menu-btn').addEventListener('click', onMenu);
    this.note = ''; // a line under the lap counter that main.js sets: the ghost you are chasing
    this.kind = null; this.goT = 0; this.listT = 0; this.mapT = 0; this.danger = 0;
  }

  // kind: 'race' (your own device), 'screen' (shared big screen) or null (hidden).
  show(kind) {
    this.kind = kind;
    this.root.hidden = !kind;
    this.root.dataset.kind = kind || '';
    this.noTouch = kind !== 'race';
    this.touchRoot.hidden = this.noTouch;
    if (!kind) this.clearBanner();
  }

  setJoinHint(code) { this.el.join.innerHTML = code ? `JOIN AT <b>${esc(location.host)}</b> &nbsp;CODE <b>${esc(code)}</b>` : ''; }

  setRace(game) {
    const { world } = game, { track } = world, c = this.el.map;
    const W = 132, H = Math.round(W * world.hz / world.hx), dpr = Math.min(2, devicePixelRatio || 1);
    c.width = W * dpr; c.height = H * dpr; c.style.width = `${W}px`; c.style.height = `${H}px`;
    const k = (W - 12) / (world.hx * 2) * dpr;
    this.mapTf = { k, ox: c.width / 2, oz: c.height / 2 };
    const bg = this.mapBg = document.createElement('canvas');
    bg.width = c.width; bg.height = c.height;
    const g = bg.getContext('2d');
    g.lineJoin = 'round'; g.lineCap = 'round';
    const path = () => {
      g.beginPath();
      for (let i = 0; i < track.n; i += 2) g.lineTo(this.mapTf.ox + track.sx[i] * k, this.mapTf.oz + track.sz[i] * k);
      g.closePath();
    };
    path(); g.strokeStyle = 'rgba(20,16,31,0.75)'; g.lineWidth = track.width * k + 5 * dpr; g.stroke();
    path(); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = Math.max(3 * dpr, track.width * k); g.stroke();
    const p = track.pointAt(0, 0);
    g.fillStyle = '#14101f'; g.fillRect(this.mapTf.ox + p.x * k - 2 * dpr, this.mapTf.oz + p.z * k - 2 * dpr, 4 * dpr, 4 * dpr);
    this.el.toasts.innerHTML = '';
    this.clearBanner();
    this.listT = 0;
  }

  go() { this.goT = 0.9; }

  toast(text, cls = '', ms = 1900) {
    const t = document.createElement('div');
    t.className = `toast ${cls}`; t.textContent = text;
    const box = this.el.toasts;
    while (box.children.length >= 3) box.firstChild.remove();
    box.append(t);
    setTimeout(() => t.classList.add('gone'), ms);
    setTimeout(() => t.remove(), ms + 350);
  }

  banner(title, sub = '') { put(this.el.bannerT, title); put(this.el.bannerS, sub); flag(this.el.banner, 'on', true); }
  clearBanner() { flag(this.el.banner, 'on', false); }

  update(game, dt) {
    const race = game.race, el = this.el;
    if (!this.kind || !race || !game.world) return;
    const mine = game.cars.get(game.myCar), f = game.focus(), elim = race.mode === 'elim';
    const own = mine && f === mine;

    // Countdown: 3, 2, 1 before the lights, GO for a moment after.
    this.goT = Math.max(0, this.goT - dt);
    const n = Math.ceil(-game.raceT);
    const count = !game.started && game.phase !== 'results' ? (n >= 1 && n <= 3 ? String(n) : '') : this.goT > 0 ? 'GO!' : '';
    if (el.count._t !== count) { put(el.count, count); el.count.classList.remove('pop'); void el.count.offsetWidth; if (count) el.count.classList.add('pop'); }

    if (f && this.kind === 'race') {
      put(el.posN, String(f.pos)); put(el.posS, ordinal(f.pos).slice(-2)); put(el.posOf, `/${game.order.length}`);
      put(el.lap, elim ? `ROUND ${race.round}/${race.laps}` : race.trial ? `LAP ${f.laps + 1}` : `LAP ${Math.min(race.laps, f.laps + 1)}/${race.laps}`);
      html(el.pips, elim ? lamps(f.lights ?? LIGHTS.start, LIGHTS.total) : race.cup ? lamps(f.lives ?? CUP.lives, CUP.lives) : '');
      flag(el.pips, 'lives', !!race.cup);
    flag(this.root, 'alone', !!race.trial);
      put(el.sub, race.cup ? `ROOM ${race.cup.i + 1}/${race.cup.n}` : race.trial ? this.note : '');
      const lapMs = own && game.started && !f.finished ? (game.raceT - f.lapStart) * 1000 : f.finished ? f.lastLap : 0;
      put(el.time, elim ? '' : fmtTime(Math.max(0, lapMs)));
      const pb = store.pbs[race.track];
      put(el.best, elim ? `ALL ${LIGHTS.total} LIGHTS WINS` : f.best ? `BEST ${fmtTime(f.best)}` : pb ? `PB ${fmtTime(pb)}` : '');
    }

    // Item slot: on phones the item button itself shows what you hold.
    const item = own ? mine.item : null;
    if (el.slot._item !== item) {
      el.slot._item = item;
      const info = item ? ITEMS[item] : null;
      el.slotGlyph.textContent = info ? info.glyph : ''; el.slotName.textContent = info ? info.name : '';
      el.slot.style.setProperty('--c', info ? info.color : 'transparent');
      el.slot.classList.toggle('has', !!info);
      if (el.padGlyph) { el.padGlyph.textContent = info ? info.glyph : ''; el.padItem.style.setProperty('--c', info ? info.color : ''); el.padItem.classList.toggle('has', !!info); }
    }

    flag(el.wrong, 'on', !!(own && game.started && !mine.finished && mine.wrongT > 1));
    const watching = this.kind === 'race' && f && !own;
    const noTouch = this.kind !== 'race' || !!watching;
    if (noTouch !== this.noTouch) { this.noTouch = noTouch; this.touchRoot.hidden = noTouch; }
    put(el.watch, !watching ? '' : mine && mine.waiting ? 'YOU JOIN THE NEXT RACE' : mine && mine.out ? `OUT!  WATCHING ${f.name}` : `WATCHING ${f.name}`);

    const danger = game.danger();
    if (Math.abs(danger - this.danger) > 0.02 || (danger === 0) !== (this.danger === 0)) { this.danger = danger; el.vignette.style.opacity = danger < 0.45 ? 0 : (danger - 0.45) / 0.55; }

    this.listT -= dt;
    if (this.listT <= 0) { this.listT = 0.25; this.standings(game, elim); }
    this.mapT -= dt;
    if (this.mapT <= 0) { this.mapT = 1 / 30; this.drawMap(game); }
  }

  standings(game, elim) {
    const lead = game.order[0];
    let list = '';
    for (const car of game.order) {
      let note = '';
      if (elim) note = car.out ? 'OUT' : `${car.lights ?? LIGHTS.start}●`;
      else if (car.finished) note = fmtTime(car.finTime);
      else if (car !== lead && lead && game.started) note = `+${Math.max(0, (lead.total - car.total) / 30).toFixed(1)}`;
      list += `<li class="${car.id === game.myCar ? 'me ' : ''}${car.out ? 'out ' : ''}${car.finished ? 'fin' : ''}"><i style="background:${esc(car.color)}"></i><span>${esc(car.name)}</span><em>${esc(note)}</em></li>`;
    }
    html(this.el.standings, list);
  }

  drawMap(game) {
    const c = this.el.map, g = c.getContext('2d'), { k, ox, oz } = this.mapTf, dpr = c.width / parseFloat(c.style.width);
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(this.mapBg, 0, 0);
    const dot = (car, r) => {
      g.beginPath(); g.arc(ox + car.x * k, oz + car.z * k, r * dpr, 0, 7);
      g.fillStyle = car.color; g.fill(); g.lineWidth = dpr; g.strokeStyle = '#14101f'; g.stroke();
    };
    let me = null;
    for (const car of game.order) { if (car.out) continue; if (car.id === game.myCar) me = car; else dot(car, car.bot ? 2.3 : 3); }
    if (me) { dot(me, 4.2); g.lineWidth = 1.5 * dpr; g.strokeStyle = '#fff'; g.stroke(); }
  }
}
