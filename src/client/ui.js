// The menu screens: home, lobby, results, records and settings. Each one is a
// string of HTML put into #ui; buttons carry data-act and one click listener
// routes them to the handlers main.js passes in.

import qrcode from 'qrcode-generator';
import { TRACKS, trackById } from '../shared/tracks.js';
import { getWorld } from '../shared/world.js';
import { COLORS, MAX_CARS, LIGHTS, CUP, cleanName } from '../shared/room.js';
import { DRIVERS } from '../shared/drivers.js';
import { face, driverName } from './faces.js';
import { lamps } from './hud.js';
import { store, save, fmtTime, ordinal, esc } from './store.js';

const LAPS = [1, 3, 5, 7, 9];
const MODES = [['race', 'RACE'], ['elim', 'ELIMINATION'], ['cup', 'CUP']];
// What "laps" starts at when you pick a mode. In elimination it is the most rounds played.
const MODE_LAPS = { race: 5, elim: 7, cup: 3 };
const MODE_BLURB = {
  race: 'FIRST OVER THE LINE. EVERY LAP COUNTS FOR THE RECORD BOARD.',
  elim: 'FALL TOO FAR BEHIND THE LEADER AND YOU ARE OUT. WIN A ROUND AND ONE OF THE EIGHT LIGHTS COMES ON; FINISH IN THE BOTTOM HALF AND ONE GOES OUT. LIGHT ALL EIGHT TO WIN.',
  cup: 'EVERY ROOM ONCE, STARTING WITH THIS ONE. FINISH IN THE BOTTOM HALF AND YOU LOSE A LIFE. NO LIVES LEFT, NO MORE RACING.',
  trial: 'YOU AND THE CLOCK: NO BOTS, NO POWER-UPS, NO CATCH-UP. LAP FOR AS LONG AS YOU LIKE AND CHASE THE GHOST.',
};
const mug = (c, mood) => face(c.driver, mood, COLORS[c.color] || COLORS[0]);

function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text); qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c},${r}h1v1h-1z`;
  return `<svg class="qr" viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges" role="img" aria-label="QR code to join"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#14101f"/></svg>`;
}

const thumbs = new Map();
function trackThumb(id) {
  if (!thumbs.has(id)) {
    const w = getWorld(id), t = w.track;
    let d = '';
    for (let i = 0; i < t.n; i += 4) d += `${i ? 'L' : 'M'}${Math.round(t.sx[i])},${Math.round(t.sz[i])}`;
    thumbs.set(id, `<svg viewBox="${-w.hx - 6} ${-w.hz - 6} ${w.hx * 2 + 12} ${w.hz * 2 + 12}"><path d="${d}Z" fill="none" stroke="currentColor" stroke-width="${t.width}" stroke-linejoin="round"/></svg>`);
  }
  return thumbs.get(id);
}

const seg = (key, options, current, on = true, wrap = false) => `<div class="seg${on ? '' : ' ro'}${wrap ? ' wrap' : ''}">${options.map(([val, label]) =>
  `<button data-act="set" data-key="${key}" data-val="${val}" class="${String(current) === String(val) ? 'on' : ''}"${on ? '' : ' disabled'}>${label}</button>`).join('')}</div>`;
const stepper = (key, text, on, canDown, canUp) => `<div class="stepper${on ? '' : ' ro'}">
  <button data-act="step" data-key="${key}" data-val="-1"${on && canDown ? '' : ' disabled'}>−</button><b>${text}</b>
  <button data-act="step" data-key="${key}" data-val="1"${on && canUp ? '' : ' disabled'}>+</button></div>`;
const opt = (key, options) => `<div class="seg">${options.map(([val, label]) =>
  `<button data-act="opt" data-key="${key}" data-val="${val}" class="${String(store[key]) === String(val) ? 'on' : ''}">${label}</button>`).join('')}</div>`;

export class UI {
  constructor(root, handlers) {
    this.root = root; this.h = handlers; this.screen = null; this.recTrack = TRACKS[0].id;
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      this.h.click();
      this.act(b.dataset);
    });
    root.addEventListener('input', (e) => {
      const t = e.target;
      if (t.id === 'name') save({ name: t.value.trim() ? cleanName(t.value) : '' });
      else if (t.id === 'code') t.value = t.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
      else if (t.dataset.vol) { save({ [t.dataset.vol]: Number(t.value) / 100, muted: false }); this.h.options(); }
    });
    root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'code') this.act({ act: 'join' }); });
  }

  show(name, html) {
    this.screen = name;
    this.root.className = `on at-${name}`;
    this.root.innerHTML = html;
    this.root.scrollTop = 0;
  }

  hide() { this.screen = null; this.root.className = ''; this.root.innerHTML = ''; }

  // Counts down anything marked with the time it is waiting for (open rooms start by themselves).
  clock(now) {
    for (const el of this.root.querySelectorAll('[data-until]')) {
      const text = `${el.dataset.pre}${Math.max(0, Math.ceil((el.dataset.until - now) / 1000))}`;
      if (el.textContent !== text) el.textContent = text;
    }
  }

  act({ act, key, val }) {
    const h = this.h, room = this.room;
    switch (act) {
      case 'solo': h.solo(); break;
      case 'create': h.create(); break;
      case 'quick': h.quick(); break;
      case 'screen': h.screen(); break;
      case 'join': {
        const code = (this.root.querySelector('#code')?.value || '').trim();
        if (code.length === 4) h.join(code); else this.root.querySelector('#code')?.focus();
        break;
      }
      case 'color': save({ color: Number(val) }); this.root.querySelectorAll('.swatches button').forEach((b) => b.classList.toggle('on', b.dataset.val === val)); h.profile('color'); break;
      case 'driver': {
        save({ driver: Number(val) });
        this.root.querySelectorAll('.drivers button').forEach((b) => b.classList.toggle('on', b.dataset.val === val));
        const who = this.root.querySelector('.profile .who');
        if (who) who.textContent = driverName(store.driver);
        h.profile('driver');
        break;
      }
      case 'ghost': save({ ghost: val }); if (room) this.lobby(room, this.me); break;
      case 'leave': h.leave(); break;
      case 'start': h.start(); break;
      case 'tolobby': h.toLobby(); break;
      case 'home': this.home(); break;
      case 'records': this.records(); break;
      case 'rectrack': this.recTrack = val; this.records(true); break;
      case 'settings': this.settings(false); break;
      case 'resume': if (this.inRace) { this.hide(); h.resume(); } else this.home(); break;
      case 'opt': {
        const v = val === 'true' ? true : val === 'false' ? false : val;
        save({ [key]: v });
        h.options();
        this.settings(this.inRace);
        break;
      }
      case 'set': {
        if (!room) break;
        const patch = key === 'items' || key === 'catchup' ? { [key]: val === 'true' } : { [key]: val };
        if (key === 'mode' && MODE_LAPS[val]) patch.laps = MODE_LAPS[val];
        h.set(patch);
        break;
      }
      case 'step': {
        if (!room) break;
        const s = room.settings, dir = Number(val);
        if (key === 'laps') h.set({ laps: LAPS[Math.max(0, Math.min(LAPS.length - 1, LAPS.indexOf(s.laps) + dir))] });
        else h.set({ bots: Math.max(0, Math.min(MAX_CARS - 1, s.bots + dir)) });
        break;
      }
      default:
    }
  }

  // ---- screens --------------------------------------------------------------

  home({ error = '', code = '' } = {}) {
    this.room = null; this.inRace = false;
    if (!DRIVERS[store.driver]) save({ driver: Math.floor(Math.random() * DRIVERS.length) });
    const mine = store.color;
    this.show('home', `
      <div class="home">
        <div class="brand">
          <h1 class="logo"><span>MINI</span><span>RACING</span></h1>
          <p class="tag">TINY CARS. BIG HOUSE.</p>
          <div class="card profile">
            <label for="name">YOUR NAME</label>
            <input id="name" maxlength="12" value="${esc(store.name)}" placeholder="RACER" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="done">
            <div class="swatches">${COLORS.map((c, i) => `<button data-act="color" data-val="${i}" class="${i === mine ? 'on' : ''}" style="background:${c}" aria-label="Car colour ${i + 1}"></button>`).join('')}</div>
            <label>YOUR DRIVER <em class="who">${driverName(store.driver)}</em></label>
            <div class="drivers">${DRIVERS.map((d, i) => `<button data-act="driver" data-val="${i}" class="${i === store.driver ? 'on' : ''}" aria-label="Driver ${d.name}">${face(i, 'happy')}</button>`).join('')}</div>
          </div>
        </div>
        <div class="menu">
          ${error ? `<p class="err">${esc(error)}</p>` : ''}
          ${code ? '' : '<button class="btn big primary" data-act="solo">SOLO RACE<small>YOU AGAINST THE BOTS</small></button>'}
          ${code ? '' : '<button class="btn big" data-act="quick">PLAY ONLINE<small>AN OPEN RACE WITH ANYONE WHO JOINS</small></button>'}
          <div class="joinrow${code ? ' hot' : ''}">
            <input id="code" maxlength="4" value="${esc(code)}" placeholder="CODE" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Room code">
            <button class="btn${code ? ' primary' : ''}" data-act="join">JOIN ROOM</button>
          </div>
          ${code ? '<button class="btn big" data-act="solo">SOLO RACE<small>YOU AGAINST THE BOTS</small></button><button class="btn big" data-act="quick">PLAY ONLINE<small>AN OPEN RACE WITH ANYONE WHO JOINS</small></button>' : ''}
          <button class="btn big" data-act="create">HOST A ROOM<small>UP TO 16, EVERYONE ON THEIR OWN SCREEN</small></button>
          <button class="btn big" data-act="screen">BIG SCREEN PARTY<small>ONE TV, PHONES AS CONTROLLERS</small></button>
          <div class="row"><button class="btn" data-act="records">RECORDS</button><button class="btn" data-act="settings">SETTINGS</button></div>
        </div>
      </div>`);
  }

  busy(text) { this.show('busy', `<div class="busy"><div class="spinner"></div><p>${esc(text)}</p></div>`); }

  // `room` is the latest room message; `me` says who we are in it.
  lobby(room, me) {
    this.room = room; this.me = me; this.inRace = false;
    const s = room.settings, host = me.id === room.host && !room.open, solo = room.kind === 'solo', screen = room.kind === 'screen';
    const humans = room.cars.filter((c) => !c.bot), elim = s.mode === 'elim', trial = s.mode === 'trial', track = room.next || s.track;
    const soon = room.startAt ? `<span class="soon" data-until="${Number(room.startAt)}" data-pre="${room.next ? 'NEXT RACE IN ' : 'STARTS IN '}"></span>` : '<span class="soon">STARTING…</span>';
    const url = `${location.origin}/?j=${room.code}`;
    const title = solo ? 'SOLO RACE' : screen ? 'BIG SCREEN PARTY' : room.open ? 'OPEN RACE' : `ROOM ${esc(room.code)}`;
    const invite = solo ? '' : `
      <section class="card invite">
        ${qrSvg(url)}
        <div><small>${screen ? 'SCAN TO USE YOUR PHONE AS A PAD' : room.open ? 'ANYONE CAN JOIN. SCAN OR SHARE TO BRING A FRIEND' : 'SCAN OR SHARE TO JOIN'}</small>
        <div class="code">${esc(room.code)}</div><small class="url">${esc(location.host)}</small></div>
      </section>`;
    const players = `
      <section class="card players">
        <h3>ON THE GRID <em>${room.cars.length}/${MAX_CARS}</em></h3>
        <ul>${room.cars.map((c) => `<li class="${c.id === me.car ? 'me' : ''}">${mug(c)}<span>${esc(c.name)}</span>${c.bot ? '<em>BOT</em>' : c.pts ? `<em>${c.pts} PTS</em>` : ''}</li>`).join('')}</ul>
        ${screen && !humans.length ? '<p class="hint">WAITING FOR PHONES TO JOIN…</p>' : ''}
      </section>`;
    const setup = `
      <section class="card setup">
        <div class="tracks${host ? '' : ' ro'}">${TRACKS.map((t) => `
          <button data-act="set" data-key="track" data-val="${t.id}" class="${t.id === track ? 'on' : ''}" style="--c:${t.color}"${host ? '' : ' disabled'}>
            ${trackThumb(t.id)}<b>${esc(t.name.toUpperCase())}</b></button>`).join('')}</div>
        <p class="blurb">${esc(trackById(track).blurb)}${store.pbs[track] ? ` &nbsp;YOUR BEST ${fmtTime(store.pbs[track])}` : ''}</p>
        <div class="opts">
          <label>MODE</label>${seg('mode', solo ? [...MODES, ['trial', 'TIME TRIAL']] : MODES, s.mode, host, true)}
          ${trial ? `<label>GHOST</label><div class="seg">${[['best', 'YOUR BEST'], ['record', 'RECORD'], ['off', 'OFF']].map(([val, label]) =>
    `<button data-act="ghost" data-val="${val}" class="${store.ghost === val ? 'on' : ''}">${label}</button>`).join('')}</div>` : `
          <label>${elim ? 'MAX ROUNDS' : 'LAPS'}</label>${stepper('laps', s.laps, host, s.laps > LAPS[0], s.laps < LAPS[LAPS.length - 1])}
          <label>BOTS</label>${stepper('bots', room.cars.filter((c) => c.bot).length, host, s.bots > 0, room.cars.length < MAX_CARS)}
          <label>BOT SKILL</label>${seg('difficulty', [['easy', 'EASY'], ['normal', 'MEDIUM'], ['hard', 'HARD']], s.difficulty, host)}
          <label>POWER-UPS</label>${seg('items', [[true, 'ON'], [false, 'OFF']], s.items, host)}
          <label>CATCH-UP</label>${seg('catchup', [[true, 'ON'], [false, 'OFF']], s.catchup, host)}`}
        </div>
        <p class="blurb">${MODE_BLURB[s.mode] || MODE_BLURB.race}</p>
      </section>`;
    const canStart = host && room.cars.length > 0;
    this.show('lobby', `
      <div class="lobby${solo ? ' solo' : ''}">
        <header><button class="btn back" data-act="leave">◀ LEAVE</button><h2>${title}</h2>
          ${host ? `<button class="btn primary go" data-act="start"${canStart ? '' : ' disabled'}>START ▶</button>` : room.open ? soon : '<span class="wait">WAITING FOR THE HOST…</span>'}</header>
        <div class="cols">${invite}${players}${setup}</div>
      </div>`);
  }

  results(msg, room, me) {
    this.room = room; this.me = me; this.inRace = false;
    const host = me.id === room.host && !room.open, elim = msg.mode === 'elim', cup = msg.cup, track = trackById(msg.track), n = msg.order.length;
    const soon = room.open && room.startAt && room.next ? `<span class="soon" data-until="${Number(room.startAt)}" data-pre="${esc(trackById(room.next).name.toUpperCase())} IN "></span>` : '';
    // Smiles for the winner, a tear for the bottom half and anyone who did not finish.
    const mood = (c, i) => (i === 0 ? 'happy' : c.lost || (n > 2 && i >= Math.ceil(n / 2)) || (!elim && !c.time) ? 'sad' : 'neutral');
    const lives = (c) => `<span class="pips lives">${lamps(c.lives ?? CUP.lives, CUP.lives)}</span>`;
    const rows = msg.order.map((c, i) => `
      <tr class="${c.id === me.car ? 'me' : ''}">
        <td class="p">${ordinal(i + 1)}</td>
        <td class="n">${mug(c, mood(c, i))}${esc(c.name)}</td>
        <td>${elim ? `<span class="pips">${lamps(c.lights ?? LIGHTS.start, LIGHTS.total)}</span>` : c.time ? fmtTime(c.time) : 'DNF'}</td>
        ${elim ? '' : `<td class="b">${c.best ? fmtTime(c.best) : ''}</td>`}
        ${cup ? `<td class="l${c.lost ? ' lost' : ''}">${lives(c)}</td>` : ''}
        <td class="g">${c.gained ? `+${c.gained}` : ''}</td><td class="t">${c.pts ?? 0}</td>
      </tr>`).join('');
    const podium = `<div class="podium">${[1, 0, 2].filter((i) => msg.order[i]).map((i) => {
      const c = msg.order[i];
      return `<div class="p${i + 1}${c.id === me.car ? ' me' : ''}">${mug(c, mood(c, i))}<b>${ordinal(i + 1)}</b><span>${esc(c.name)}</span></div>`;
    }).join('')}</div>`;
    // The cup is over: the champion, then how everyone stands.
    const champ = cup && cup.done ? cup.table.find((c) => c.id === cup.champion) : null;
    const final = champ ? `
      <div class="card champ${champ.id === me.car ? ' me' : ''}">${mug(champ, 'happy')}<div><small>CUP CHAMPION</small><b>${esc(champ.name)}</b><small>${champ.pts} PTS</small></div></div>
      <div class="card"><table><tbody>${cup.table.map((c, i) => `
        <tr class="${c.id === me.car ? 'me' : ''}"><td class="p">${ordinal(i + 1)}</td><td class="n">${mug(c, c.id === champ.id ? 'happy' : c.lives ? 'neutral' : 'sad')}${esc(c.name)}</td><td>${lives(c)}</td><td class="t">${c.pts}</td></tr>`).join('')}
      </tbody></table></div>` : '';
    const title = elim ? (msg.order[0]?.lights >= LIGHTS.total ? 'ALL EIGHT LIGHTS!' : 'LAST CAR STANDING') : champ ? 'THE CUP IS WON' : cup ? `CUP: ROOM ${cup.i + 1} OF ${cup.n}` : 'RACE RESULTS';
    const again = cup && !cup.done ? '<button class="btn" data-act="tolobby">END THE CUP</button><button class="btn primary" data-act="start">NEXT ROOM ▶</button>'
      : `<button class="btn" data-act="tolobby">CHANGE TRACK</button><button class="btn primary" data-act="start">${cup ? 'NEW CUP ▶' : 'RACE AGAIN ▶'}</button>`;
    this.show('results', `
      <div class="results">
        <h2>${title}</h2>
        ${champ ? final : podium}
        <p class="blurb">${esc(track.name.toUpperCase())}${cup && cup.next ? ` &nbsp;NEXT: ${esc(trackById(cup.next).name.toUpperCase())}` : ''}</p>
        <div class="card"><table>
          <thead><tr><th></th><th></th><th>${elim ? 'LIGHTS' : 'TIME'}</th>${elim ? '' : '<th class="b">BEST LAP</th>'}${cup ? '<th>LIVES</th>' : ''}<th></th><th>PTS</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
        <div class="row">
          <button class="btn" data-act="leave">LEAVE</button>
          ${host ? again : room.open ? soon : '<span class="wait">WAITING FOR THE HOST…</span>'}
        </div>
      </div>`);
  }

  // Global top ten for each track, plus your own best.
  records(keep = false) {
    this.room = null; this.inRace = false;
    const draw = () => {
      if (this.screen !== 'records') return;
      const list = this.board ? this.board[this.recTrack] || [] : null, pb = store.pbs[this.recTrack];
      const body = !list ? '<p class="hint">LOADING…</p>'
        : this.board.error ? '<p class="hint">THE RECORD BOARD NEEDS A CONNECTION.</p>'
          : list.length ? `<table><tbody>${list.map((r, i) => `<tr><td class="p">${ordinal(i + 1)}</td><td class="n">${esc(r.name)}</td><td>${fmtTime(r.ms)}</td></tr>`).join('')}</tbody></table>`
            : '<p class="hint">NO LAPS YET. BE THE FIRST.</p>';
      this.root.querySelector('.board').innerHTML = `${body}<p class="blurb">YOUR BEST LAP: ${pb ? fmtTime(pb) : 'NONE YET'}</p>`;
    };
    this.show('records', `
      <div class="records">
        <header><button class="btn back" data-act="home">◀ BACK</button><h2>LAP RECORDS</h2></header>
        <div class="tabs">${TRACKS.map((t) => `<button data-act="rectrack" data-val="${t.id}" class="${t.id === this.recTrack ? 'on' : ''}" style="--c:${t.color}">${esc(t.name.toUpperCase())}</button>`).join('')}</div>
        <div class="card board"></div>
      </div>`);
    draw();
    if (keep && this.board) return;
    this.board = null;
    fetch('/api/records').then((r) => (r.ok ? r.json() : Promise.reject(new Error('records')))).then((b) => { this.board = b; }, () => { this.board = { error: true }; }).then(draw);
  }

  // Also the in-race menu, where it gains RESUME and LEAVE RACE.
  settings(inRace) {
    this.inRace = inRace;
    this.show('settings', `
      <div class="settings">
        <h2>${inRace ? 'MENU' : 'SETTINGS'}</h2>
        <div class="card opts">
          <label>CAMERA</label>${opt('camera', [['chase', 'BEHIND'], ['classic', 'CLASSIC']])}
          <label>LOOK</label>${opt('retro', [[false, 'MODERN'], [true, '16-BIT']])}
          <label>DETAIL</label>${opt('quality', [['auto', 'AUTO'], ['high', 'HIGH'], ['medium', 'MED'], ['low', 'LOW']])}
          <label>ACCELERATE</label>${opt('autoGas', [[true, 'AUTO'], [false, 'MANUAL']])}
          <label>SOUND</label><input type="range" min="0" max="100" value="${Math.round(store.sfx * 100)}" data-vol="sfx" aria-label="Sound volume">
          <label>MUSIC</label><input type="range" min="0" max="100" value="${Math.round(store.music * 100)}" data-vol="music" aria-label="Music volume">
        </div>
        <p class="blurb">STEER: ◀ ▶ OR A D &nbsp; BRAKE: ▼ OR S &nbsp; POWER-UP: SPACE &nbsp; HORN: H</p>
        <div class="row">
          ${inRace ? '<button class="btn" data-act="leave">LEAVE RACE</button>' : ''}
          ${inRace && this.room?.kind === 'solo' ? `<button class="btn" data-act="tolobby">${this.room.settings.mode === 'trial' ? 'END THE TRIAL' : 'CHANGE TRACK'}</button>` : ''}
          <button class="btn primary" data-act="resume">${inRace ? 'BACK TO THE RACE' : 'DONE'}</button>
        </div>
      </div>`);
  }
}
