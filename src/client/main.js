// Start-up and glue: owns the current session (solo, online room, big screen or
// phone pad), feeds room messages to the game, and turns what the game reports
// into pictures, sound and menus.

import '@fontsource/press-start-2p/latin-400.css';
import './style.css';
import { Scene } from './scene.js';
import { Fx } from './fx.js';
import { Hud } from './hud.js';
import { UI } from './ui.js';
import { Pad } from './pad.js';
import { Game } from './game.js';
import { WsConn, LocalConn } from './net.js';
import { initInput, readInput, takeItemTap, takePauseTap } from './input.js';
import { audio } from './audio.js';
import { store, isTouch, recordPb, fmtTime, ordinal } from './store.js';
import { TRACKS } from '../shared/tracks.js';
import { getWorld } from '../shared/world.js';
import { ITEMS } from '../shared/items.js';
import { P } from '../shared/physics.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const $ = (id) => document.getElementById(id);

const scene = new Scene($('view'));
const fx = new Fx(scene);
initInput($('touch'));
const hud = new Hud($('hud'), $('touch'), { onMenu: () => toggleMenu() });

let session = null; // what the player is in: { kind, conn, game, room, me, pad, ... }
let demo = null;    // bots racing behind the menus
let demoTrack = Math.floor(Math.random() * TRACKS.length);
let wantMusic = 'menu', unlocked = false, wakeLock = null;

const ui = new UI($('ui'), {
  click: () => { unlock(); audio.sfx('click'); },
  solo: () => open('solo'),
  create: () => open('party'),
  screen: () => open('screen'),
  join: (code) => open('party', code),
  leave: () => { close(); home(); },
  start: () => session?.conn.send({ t: 'start' }),
  toLobby: () => session?.conn.send({ t: 'lobby' }),
  set: (settings) => session?.conn.send({ t: 'set', settings }),
  profile: () => {},
  options: applyOptions,
  resume: () => {},
});

function applyOptions() {
  scene.setOptions({ quality: store.quality, retro: store.retro });
  audio.setVolume({ sfx: store.sfx, music: store.music });
  audio.setMuted(store.muted);
}

// Browsers only allow sound after a tap or key press.
function unlock() {
  if (unlocked) return;
  unlocked = true;
  audio.unlock();
  applyOptions();
  audio.music(wantMusic);
}
addEventListener('pointerdown', unlock, { capture: true });
addEventListener('keydown', unlock, { capture: true });

function music(name) { wantMusic = name; audio.music(name); }

async function keepAwake(on) {
  try {
    if (on && !wakeLock) wakeLock = await navigator.wakeLock?.request('screen');
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { wakeLock = null; }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && session) { wakeLock = null; keepAwake(true); } });

// ---- sessions ---------------------------------------------------------------

function home(opts) {
  ui.home(opts);
  hud.show(null);
  music('menu');
  startDemo();
}

function close() {
  const s = session;
  if (!s) return;
  session = null;
  clearTimeout(s.timer);
  s.conn.onclose = () => {};
  s.conn.close();
  s.pad?.destroy();
  hud.show(null); hud.setJoinHint('');
  scene.tagAll = false;
  fx.clear();
  audio.engineStopAll(); audio.skid(0);
  keepAwake(false);
}

function wire(s) {
  s.conn.onmsg = (m) => onMessage(s, m);
  s.conn.onclose = () => { if (session === s) { close(); home({ error: 'LOST THE CONNECTION TO THE ROOM' }); } };
}

async function open(kind, code) {
  stopDemo();
  close();
  const me = { name: store.name, color: store.color };
  if (kind === 'solo') {
    const s = session = { kind, conn: new LocalConn(me) };
    wire(s);
    return;
  }
  ui.busy(code ? `JOINING ${code}…` : 'OPENING A ROOM…');
  const s = session = { kind, code, conn: new WsConn() };
  wire(s);
  try { await s.conn.connect(); } catch {
    if (session === s) { session = null; home({ error: 'COULD NOT REACH THE RACE SERVER', code }); }
    return;
  }
  if (session !== s) { s.conn.close(); return; }
  s.conn.send(code ? { t: 'join', code, ...me } : { t: 'create', kind, ...me });
}

function startDemo() {
  if (demo || session) return;
  const s = demo = { kind: 'demo', conn: new LocalConn({ kind: 'screen', bots: 8 }) };
  s.conn.onmsg = (m) => onMessage(s, m);
}

function stopDemo() {
  if (!demo) return;
  clearTimeout(demo.timer);
  demo.conn.close();
  demo = null;
  fx.clear();
}

function demoRace(s) {
  if (demo !== s) return;
  s.conn.send({ t: 'set', settings: { track: TRACKS[demoTrack++ % TRACKS.length].id, laps: 3, difficulty: 'hard', bots: 8 } });
  s.conn.send({ t: 'start' });
}

// ---- room messages ----------------------------------------------------------

function onMessage(s, m) {
  if (s !== session && s !== demo) return;
  switch (m.t) {
    case 'error': if (s === session) { close(); home({ error: m.error.toUpperCase(), code: s.code }); } return;
    case 'closed': if (s === session) { close(); home({ error: 'THE ROOM HAS CLOSED' }); } return;
    case 'joined': joined(s, m); return;
    default:
  }
  if (!s.me) return;
  if (s.pad) { s.pad.onMessage(m); return; }
  if (m.t === 'room') {
    const before = s.room.cars.length;
    s.room = { ...s.room, ...m };
    if (s === session && m.phase === 'lobby' && m.cars.length > before) audio.sfx('join');
  }
  s.game.onMessage(m);
  if (m.t === 'room' && s === session) showPhase(s);
}

function joined(s, m) {
  s.me = { id: m.you, car: m.car, role: m.role };
  s.room = m;
  if (s === session) { s.kind = m.kind === 'solo' ? 'solo' : m.kind; keepAwake(true); }
  if (m.role === 'pad') {
    s.pad = new Pad($('ui'), s.conn, { you: m.you, car: m.car, onLeave: () => { close(); home(); }, click: () => audio.sfx('click') });
    s.pad.onMessage(m);
    music(null);
    return;
  }
  s.game = new Game({
    conn: s.conn, me: m.you, role: m.role, myCar: m.car,
    input: (out) => readInput(store.autoGas, out), itemTap: takeItemTap,
    on: (type, d) => onGame(s, type, d),
  });
  s.game.applyRoom(m);
  if (m.race) {
    // Walked in on a race: show it, with everyone snapping to where they really are.
    s.game.startRace(m.race, true);
    for (const car of s.game.cars.values()) if (!car.local) car.fresh = true;
  }
  if (s === demo) { demoRace(s); return; }
  scene.tagAll = m.role === 'screen';
  hud.setJoinHint(m.role === 'screen' ? m.code : '');
  showPhase(s);
}

// Put up the right screen for the room's phase.
function showPhase(s) {
  const { room } = s, phase = room.phase;
  if (phase === 'lobby') {
    clearTimeout(s.timer);
    s.results = null;
    hud.show(null);
    scene.setWorld(getWorld(room.settings.track));
    fx.clear();
    audio.engineStopAll(); audio.skid(0);
    ui.lobby(room, s.me);
    music('menu');
  } else if (phase === 'results') {
    if (s.results && ui.screen === 'results') ui.results(s.results, room, s.me);
    else if (!s.results && !s.game.started && ui.screen !== 'lobby') ui.lobby(room, s.me); // joined between races
  } else {
    if (ui.screen && !(ui.screen === 'settings' && ui.inRace)) ui.hide();
    hud.show(s.me.role === 'screen' ? 'screen' : 'race');
  }
}

function toggleMenu() {
  const s = session;
  if (!s || s.pad || !s.game?.race || s.room.phase === 'lobby' || s.room.phase === 'results') return;
  if (ui.screen === 'settings') ui.hide(); else ui.settings(true);
}

// ---- what the game reports --------------------------------------------------

// A sound placed in the world: quieter with distance from the car you follow.
function sfxAt(s, name, car, vol = 1) {
  const f = s.game.focus();
  if (!car || !f || car === f || s.me.role === 'screen') { audio.sfx(name, { vol, pan: car && f && car !== f ? clamp((car.x - f.x) / 80, -0.7, 0.7) : 0 }); return; }
  const dx = car.x - f.x, d = Math.hypot(dx, car.z - f.z);
  if (d < 85) audio.sfx(name, { vol: vol * (1 - d / 85) ** 1.5, pan: clamp(dx / 40, -0.8, 0.8) });
}

const USE_SFX = { boost: 'boost', rocket: 'rocket', oil: 'oil', shield: 'shield', mallet: 'mallet', zap: 'zap' };

function onGame(s, type, d) {
  const game = s.game;
  if (type === 'race') {
    scene.setWorld(d.world);
    fx.clear();
    if (s === demo) return;
    hud.setRace(game);
    s.count = 4; s.results = null; s.wrong = false;
    clearTimeout(s.timer);
    music('race');
    if (!isTouch && s.me.car != null && !d.joining) hud.toast(store.autoGas ? '◀ ▶ STEER   ▼ BRAKE   SPACE POWER-UP' : '▲ GO   ◀ ▶ STEER   ▼ BRAKE   SPACE POWER-UP', '', 4200);
    return;
  }
  fx.on(type, d);
  if (s === demo) {
    if (type === 'results') s.timer = setTimeout(() => demoRace(s), 3500);
    return;
  }
  const car = d && d.car, mine = !!car && car.id === s.me.car, screen = s.me.role === 'screen';
  switch (type) {
    case 'regrid': hud.clearBanner(); fx.clear(); s.count = 4; hud.toast(`ROUND ${d.race.round}`, 'big'); break;
    case 'go': if (game.raceT < 1.5) { hud.go(); audio.sfx('go'); } break;
    case 'pickup':
      if (mine) { audio.sfx('pickup'); hud.toast(ITEMS[d.item].name, 'item'); } else sfxAt(s, 'pickup', car, 0.4);
      break;
    case 'use':
      sfxAt(s, USE_SFX[d.kind], car);
      if (d.kind === 'mallet' || d.kind === 'zap') { const f = game.focus(); if (f && Math.hypot(f.x - d.x, f.z - d.z) < 30) scene.shake(d.kind === 'mallet' ? 0.9 : 0.4); }
      break;
    case 'hit':
      sfxAt(s, d.blocked ? 'shieldPop' : d.kind === 'rocket' ? 'explode' : 'spin', car);
      if (mine && !d.blocked) { scene.shake(d.kind === 'rocket' ? 1 : 0.5); navigator.vibrate?.(80); }
      break;
    case 'squashed': sfxAt(s, 'squash', car); if (mine) navigator.vibrate?.(60); break;
    case 'shieldPop': sfxAt(s, 'shieldPop', car); break;
    case 'lap':
      if (!mine) break;
      if (recordPb(game.race.track, d.ms)) hud.toast(`NEW BEST LAP ${fmtTime(d.ms)}`, 'gold');
      else hud.toast(`LAP ${fmtTime(d.ms)}`);
      if (d.final) { hud.toast('FINAL LAP!', 'big'); audio.sfx('finalLap'); } else audio.sfx(d.isBest ? 'bestLap' : 'lap');
      break;
    case 'record': hud.toast(`${d.name}: ${ordinal(d.rank)} ON THE RECORD BOARD  ${fmtTime(d.ms)}`, 'gold', 3200); audio.sfx('record'); break;
    case 'finish':
      if (mine) { hud.banner(d.pos === 1 ? 'YOU WIN!' : `${ordinal(d.pos)} PLACE`, fmtTime(d.time)); audio.sfx(d.pos === 1 ? 'win' : 'finish'); } else if (screen) { hud.toast(`${car.name} FINISHES ${ordinal(d.pos)}`); audio.sfx(d.pos === 1 ? 'win' : 'finish', { vol: 0.7 }); }
      break;
    case 'out':
      sfxAt(s, 'out', car, mine ? 1 : 0.5);
      if (mine) hud.banner('OUT!', 'TOO FAR BEHIND'); else if (screen) hud.toast(`${car.name} IS OUT`);
      break;
    case 'round': hud.toast(`${car.name} WINS THE ROUND`, 'gold', 2400); audio.sfx('round'); break;
    case 'results':
      s.results = d;
      music('results');
      s.timer = setTimeout(() => { if (session === s && s.results === d) { hud.show(null); ui.results(d, s.room, s.me); } }, 2600);
      break;
    case 'engineOff': audio.engineStopAll(); audio.skid(0); break;
    case 'fall': case 'respawn': case 'jump': case 'land': case 'pad': sfxAt(s, type, car, mine ? 1 : 0.6); break;
    case 'bump': sfxAt(s, 'bump', car, clamp(d.data / 22, 0.15, 1)); if (mine && d.data > 14) scene.shake(0.3); break;
    default:
  }
}

// ---- every frame ------------------------------------------------------------

function viewFor(s, game) {
  if (!game) return { mode: 'orbit', focus: null };
  if (s === demo) return { mode: 'classic', focus: game.focus() };
  if (s.room.phase === 'results' && ui.screen === 'results') return { mode: 'orbit', focus: null };
  if (s.me.role === 'screen') return { mode: 'overview', focus: null };
  return { mode: store.camera === 'classic' ? 'classic' : 'chase', focus: game.focus() };
}

function sounds(s, game) {
  const f = game.focus(), mine = game.cars.get(s.me.car);
  if (!f || s.room.phase === 'results') return;
  // Countdown beeps, and a buzzer when you turn round.
  const n = Math.ceil(-game.raceT);
  if (!game.started && n !== s.count) { s.count = n; if (n >= 1 && n <= 3) audio.sfx('countdown'); }
  const wrong = !!mine && game.started && !mine.finished && mine.wrongT > 1;
  if (wrong && !s.wrong) audio.sfx('wrongWay');
  s.wrong = wrong;
  // Engines for the nearest few cars.
  const near = [];
  for (const car of game.order) {
    if (car.out || car.waiting || car.fallT > 0) continue;
    const d = Math.hypot(car.x - f.x, car.z - f.z);
    if (d < 70) near.push({ car, d });
  }
  near.sort((a, b) => a.d - b.d);
  const big = s.me.role === 'screen';
  for (const { car, d } of near.slice(0, 6)) {
    const own = car === mine;
    audio.engine(car.id, {
      speed: Math.hypot(car.vx, car.vz) / P.maxSpeed, boost: car.boostT > 0, own,
      pan: clamp((car.x - f.x) / 40, -0.8, 0.8), vol: own ? 1 : big ? 0.5 : (1 - d / 70) ** 1.5,
    });
  }
  let skid = 0;
  if (mine && mine === f && mine.y <= 0.05 && game.started) {
    const slide = Math.abs(mine.vx * Math.cos(mine.h) - mine.vz * Math.sin(mine.h));
    skid = clamp((slide - 5) / 9, 0, 1);
  }
  audio.skid(skid);
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (session?.pad) return; // a phone being used as a pad draws nothing
  const s = session || demo;
  let game = s?.game || null;
  if (game) game.frame(dt);
  if (takePauseTap()) toggleMenu();
  if (game && (!game.race || s.room.phase === 'lobby')) game = null; // nothing on track to show
  scene.update(game, dt, viewFor(s, game));
  fx.update(game, dt);
  if (game && s === session) { hud.update(game, dt); sounds(s, game); }
  scene.watchPerf(dt);
  scene.render();
}

// A way in for the browser tests, and for tinkering from the console.
window.miniracing = { get session() { return session; }, get demo() { return demo; }, scene, ui };

applyOptions();
scene.setWorld(getWorld(TRACKS[demoTrack % TRACKS.length].id));
const code = (new URLSearchParams(location.search).get('j') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
if (code) history.replaceState(null, '', location.pathname);
home({ code });
requestAnimationFrame(frame);
