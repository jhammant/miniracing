// All of the game's sound, synthesised live with the Web Audio API: one-shot
// effects, a voice per nearby car engine, tyre squeal and three looping chiptunes.
// Nothing touches audio until unlock() is called from the first tap.

const MAX_SFX = 16, MAX_ENGINES = 6, STALE_MS = 300, AHEAD = 0.15;
const MASTER = 0.8, MUSIC_LEVEL = 0.3; // music sits well under the effects

let ctx = null, master, sfxBus, musicBus, noiseBuf, crunchBuf;
let song = null, want = null, sk = null, muted = false;
const vol = { sfx: 1, music: 0.7 };
const waves = {};
const voices = []; // one-shot effects now sounding
const engines = new Map(); // car id -> engine voice

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const hidden = () => typeof document !== 'undefined' && document.hidden;
const stopAt = (src, t) => { try { src.stop(t); } catch { /* already stopped */ } };

// ---- building blocks ----

// A pulse wave with the given duty cycle (0.25 and 0.125 are the classic
// thin console leads). Built from its Fourier series.
function pulse(duty) {
  const n = 48, re = new Float32Array(n), im = new Float32Array(n);
  for (let k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
  return ctx.createPeriodicWave(re, im);
}

// One second of looping noise. hold > 1 repeats each sample for a gritty,
// low-sample-rate crunch that rumbles when played back slower.
function noiseBuffer(hold) {
  const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = b.getChannelData(0);
  let x = 0;
  for (let i = 0; i < d.length; i++) { if (i % hold === 0) x = Math.random() * 2 - 1; d[i] = x; }
  return b;
}

function setWave(o, w) { if (waves[w]) o.setPeriodicWave(waves[w]); else o.type = w; }

// Attack to vol, hold for share `sus` of the note, then fall away to silence.
function env(p, t, dur, v, a = 0.004, sus = 0) {
  v = Math.max(v, 1e-4);
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(v, t + a);
  if (sus) p.setValueAtTime(v, t + a + (dur - a) * sus);
  p.exponentialRampToValueAtTime(1e-4, t + dur);
}

// Start a source and free it and its nodes once it has finished. v is the
// voice that owns it; when its last source ends the voice's own nodes go too.
function run(v, src, nodes, t, end, offset = 0) {
  if (offset) src.start(t, offset); else src.start(t);
  if (end !== undefined) { stopAt(src, end); if (end > v.end) v.end = end; }
  v.n++;
  if (v.srcs) v.srcs.push(src);
  src.onended = () => {
    src.disconnect();
    for (const x of nodes) x.disconnect();
    if (--v.n === 0 && v.nodes) for (const x of v.nodes) x.disconnect();
  };
}

// A pitched note gliding from f to `to`, optionally with vibrato (cents) and
// a lowpass sweep lp = [from, to, Q].
function tone(v, t, wave, f, dur, peak, o = {}) {
  const osc = ctx.createOscillator(), g = ctx.createGain(), nodes = [g], end = t + dur + 0.02;
  setWave(osc, wave);
  osc.frequency.setValueAtTime(f, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide || dur));
  env(g.gain, t, dur, peak, o.a, o.sus);
  let tail = osc;
  if (o.lp) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = o.lp[2] || 1;
    lp.frequency.setValueAtTime(o.lp[0], t);
    lp.frequency.exponentialRampToValueAtTime(o.lp[1], t + dur);
    osc.connect(lp); tail = lp; nodes.push(lp);
  }
  tail.connect(g); g.connect(v.out);
  if (o.vib) {
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = o.vibRate || 6;
    if (o.vibIn) { lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(o.vib, t + o.vibIn); } else lg.gain.value = o.vib;
    lfo.connect(lg); lg.connect(osc.detune);
    run(v, lfo, [lg], t, end);
  }
  run(v, osc, nodes, t, end);
}

// Filtered noise; `to` sweeps the filter, rateTo bends the noise's pitch.
function hiss(v, t, dur, peak, o = {}) {
  const src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = o.buf || noiseBuf; src.loop = true;
  src.playbackRate.setValueAtTime(o.rate || 1, t);
  if (o.rateTo) src.playbackRate.exponentialRampToValueAtTime(o.rateTo, t + dur);
  fl.type = o.type || 'bandpass'; fl.Q.value = o.q || 1;
  fl.frequency.setValueAtTime(o.f || 1200, t);
  if (o.to) fl.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  env(g.gain, t, dur, peak, o.a || 0.002, o.sus);
  src.connect(fl); fl.connect(g); g.connect(v.out);
  // start somewhere random in the buffer so repeats never sound identical
  run(v, src, [fl, g], t, t + dur + 0.02, Math.random() * 0.9);
}

// Notes one after another, `step` seconds apart.
function arp(v, t, wave, ms, step, len, peak, o) {
  ms.forEach((m, i) => tone(v, t + i * step, wave, hz(m), len, peak, o));
}

// Free-timed phrase: [midi, start, length] triples.
function riff(v, t, wave, list, peak, o) {
  for (const [m, at, len] of list) tone(v, t + at, wave, hz(m), len, peak, o);
}

const chime = (v, t, m, d, p = 0.17) => { tone(v, t, 'p25', hz(m), d, p, { sus: 0.1 }); tone(v, t, 'triangle', hz(m + 12), d, p * 0.6); };

// ---- one-shot effects ----

const SFX = {
  countdown: (v, t) => tone(v, t, 'square', 440, 0.16, 0.26, { sus: 0.7 }),
  go: (v, t) => { tone(v, t, 'square', 880, 0.5, 0.26, { sus: 0.75 }); tone(v, t, 'triangle', 1760, 0.5, 0.14, { sus: 0.6 }); },
  pickup: (v, t) => arp(v, t, 'p25', [72, 76, 79, 84, 88], 0.045, 0.09, 0.2),
  boost: (v, t) => {
    hiss(v, t, 0.55, 0.32, { f: 400, to: 3600, q: 1.2, a: 0.08, sus: 0.3 });
    tone(v, t, 'sawtooth', 110, 0.5, 0.13, { to: 520, a: 0.03, sus: 0.4 });
  },
  rocket: (v, t) => {
    hiss(v, t, 0.5, 0.28, { type: 'highpass', f: 2600, to: 800, a: 0.01 });
    tone(v, t, 'triangle', 500, 0.45, 0.26, { to: 2200, glide: 0.3, vib: 40, vibRate: 28, sus: 0.3 });
  },
  explode: (v, t) => {
    hiss(v, t, 0.7, 0.5, { type: 'lowpass', f: 3600, to: 150, q: 0.7, buf: crunchBuf, rateTo: 0.25 });
    tone(v, t, 'sine', 130, 0.35, 0.6, { to: 32 });
  },
  oil: (v, t) => { hiss(v, t, 0.22, 0.4, { type: 'lowpass', f: 2400, to: 180, q: 9 }); tone(v, t, 'triangle', 260, 0.16, 0.3, { to: 70 }); },
  spin: (v, t) => tone(v, t, 'square', 950, 0.55, 0.15, { to: 180, vib: 120, vibRate: 13, sus: 0.2 }),
  shield: (v, t) => {
    tone(v, t, 'triangle', 300, 0.45, 0.18, { to: 1200, a: 0.05, sus: 0.4 });
    arp(v, t + 0.02, 'p12', [72, 76, 79, 83, 84, 88, 91, 95], 0.035, 0.07, 0.09);
  },
  shieldPop: (v, t) => {
    tone(v, t, 'sine', 1900, 0.25, 0.2); tone(v, t, 'sine', 3170, 0.18, 0.12);
    tone(v, t, 'triangle', 1400, 0.08, 0.2, { to: 500 }); hiss(v, t, 0.06, 0.22, { type: 'highpass', f: 5000 });
  },
  mallet: (v, t) => {
    tone(v, t, 'triangle', 420, 0.22, 0.6, { to: 110 }); tone(v, t, 'square', 210, 0.12, 0.16, { to: 60 });
    hiss(v, t, 0.05, 0.32, { type: 'lowpass', f: 1800 });
  },
  squash: (v, t) => {
    tone(v, t, 'sawtooth', 420, 0.35, 0.3, { to: 55, lp: [2400, 160, 9] });
    hiss(v, t, 0.2, 0.18, { type: 'lowpass', f: 1500, to: 200, q: 6 });
  },
  zap: (v, t) => { tone(v, t, 'square', 1900, 0.26, 0.16, { to: 140 }); tone(v, t, 'sawtooth', 1960, 0.22, 0.09, { to: 160 }); },
  bump: (v, t) => { tone(v, t, 'triangle', 170, 0.09, 0.5, { to: 70 }); hiss(v, t, 0.05, 0.22, { type: 'lowpass', f: 700 }); },
  fall: (v, t) => tone(v, t, 'triangle', 1500, 1.2, 0.22, { to: 170, a: 0.03, sus: 0.6, vib: 25, vibRate: 5 }),
  respawn: (v, t) => { arp(v, t, 'triangle', [76, 79, 83, 88, 91], 0.045, 0.12, 0.14); tone(v, t, 'sine', 600, 0.3, 0.06, { to: 1500, a: 0.05 }); },
  jump: (v, t) => tone(v, t, 'p25', 190, 0.2, 0.2, { to: 560, glide: 0.14, vib: 60, vibRate: 24 }),
  land: (v, t) => { tone(v, t, 'sine', 115, 0.13, 0.45, { to: 48 }); hiss(v, t, 0.07, 0.18, { type: 'lowpass', f: 450 }); },
  pad: (v, t) => { tone(v, t, 'square', 700, 0.06, 0.15, { to: 1000 }); tone(v, t + 0.06, 'square', 1050, 0.09, 0.15, { to: 1600 }); },
  lap: (v, t) => { chime(v, t, 88, 0.3); chime(v, t + 0.12, 93, 0.45); },
  bestLap: (v, t) => { chime(v, t, 88, 0.25); chime(v, t + 0.09, 92, 0.25); chime(v, t + 0.18, 95, 0.55, 0.19); },
  finalLap: (v, t) => {
    for (const [m, at] of [[81, 0], [81, 0.1], [88, 0.25], [88, 0.35]]) tone(v, t + at, 'square', hz(m), 0.07, 0.18, { sus: 0.7 });
    tone(v, t + 0.5, 'p25', hz(93), 0.38, 0.2, { sus: 0.6, vib: 20, vibRate: 7 });
  },
  finish: (v, t) => {
    riff(v, t, 'p25', [[72, 0, 0.08], [76, 0.08, 0.08], [79, 0.16, 0.08], [84, 0.24, 0.14], [79, 0.4, 0.08], [84, 0.48, 0.4]], 0.18, { sus: 0.5 });
    riff(v, t, 'triangle', [[48, 0, 0.22], [55, 0.24, 0.22], [48, 0.48, 0.4]], 0.3, { sus: 0.6 });
  },
  win: (v, t) => {
    riff(v, t, 'p25', [[67, 0, 0.11], [72, 0.12, 0.11], [76, 0.24, 0.11], [79, 0.36, 0.34], [77, 0.72, 0.11],
      [76, 0.84, 0.11], [79, 0.96, 0.11], [84, 1.08, 0.75]], 0.17, { sus: 0.6, vib: 15, vibRate: 6, vibIn: 0.2 });
    riff(v, t, 'p12', [[64, 0, 0.11], [67, 0.12, 0.11], [72, 0.24, 0.11], [76, 0.36, 0.34], [74, 0.72, 0.11],
      [72, 0.84, 0.11], [76, 0.96, 0.11], [79, 1.08, 0.75]], 0.08, { sus: 0.6 });
    riff(v, t, 'triangle', [[48, 0, 0.34], [55, 0.36, 0.34], [53, 0.72, 0.34], [48, 1.08, 0.75]], 0.32, { sus: 0.7 });
    for (const at of [0.36, 0.72]) hiss(v, t + at, 0.12, 0.16, { f: 1900, q: 0.7 });
    hiss(v, t + 1.08, 0.7, 0.18, { type: 'highpass', f: 4000 });
  },
  // the sad slide: a wah on each note, sliding down by half steps
  out: (v, t) => {
    for (const [m, at, len] of [[67, 0, 0.28], [66, 0.3, 0.28], [65, 0.6, 0.28], [64, 0.9, 0.7]]) {
      const f = hz(m);
      tone(v, t + at, 'sawtooth', f, len, 0.2, { to: f * 0.96, lp: [f * 1.2, f * 5, 4], a: 0.03, sus: 0.6, vib: len > 0.5 ? 35 : 0, vibRate: 5, vibIn: 0.2 });
    }
  },
  round: (v, t) => {
    for (let i = 0; i < 8; i++) hiss(v, t + i * 0.04, 0.05, 0.07 + i * 0.025, { f: 1800, q: 0.8 });
    tone(v, t + 0.34, 'sine', 150, 0.3, 0.55, { to: 45 });
    hiss(v, t + 0.34, 0.6, 0.3, { type: 'highpass', f: 3000, to: 6000 });
  },
  click: (v, t) => tone(v, t, 'square', 1800, 0.025, 0.1),
  // Four horns, one per kind of driver: beep-beep, a lorry, a clown car and an ah-oo-gah.
  horn0: (v, t) => { for (const at of [0, 0.17]) { tone(v, t + at, 'square', 440, 0.11, 0.17, { sus: 0.8 }); tone(v, t + at, 'square', 554, 0.11, 0.13, { sus: 0.8 }); } },
  horn1: (v, t) => { tone(v, t, 'sawtooth', 185, 0.42, 0.2, { sus: 0.85, lp: [1400, 900, 1] }); tone(v, t, 'sawtooth', 233, 0.42, 0.16, { sus: 0.85, lp: [1400, 900, 1] }); },
  horn2: (v, t) => riff(v, t, 'p25', [[72, 0, 0.07], [72, 0.08, 0.07], [72, 0.16, 0.07], [77, 0.24, 0.1], [81, 0.36, 0.2]], 0.17, { sus: 0.6 }),
  horn3: (v, t) => { tone(v, t, 'p25', 300, 0.2, 0.19, { to: 520, glide: 0.16, sus: 0.8 }); tone(v, t + 0.21, 'p25', 520, 0.3, 0.19, { to: 330, glide: 0.22, sus: 0.8, vib: 30, vibRate: 18 }); },
  join: (v, t) => { tone(v, t, 'p25', hz(79), 0.07, 0.15, { sus: 0.5 }); tone(v, t + 0.07, 'p25', hz(86), 0.12, 0.15, { sus: 0.3 }); },
  wrongWay: (v, t) => {
    for (const at of [0, 0.22]) { tone(v, t + at, 'sawtooth', 110, 0.18, 0.18, { sus: 0.85 }); tone(v, t + at, 'square', 117, 0.18, 0.12, { sus: 0.85 }); }
  },
  record: (v, t) => {
    arp(v, t, 'p25', [72, 76, 79, 84, 88, 91, 96], 0.045, 0.12, 0.15);
    tone(v, t + 0.32, 'p25', hz(96), 0.5, 0.15, { sus: 0.5, vib: 15, vibRate: 7 });
    arp(v, t + 0.34, 'triangle', [91, 96, 100, 103, 108], 0.06, 0.1, 0.07);
  },
};
// Announcer-type sounds that should survive when the one-shot limit is hit.
const KEY = new Set(['countdown', 'go', 'lap', 'bestLap', 'finalLap', 'finish', 'win', 'out', 'record', 'wrongWay', 'round']);

function sfx(name, opts = {}) {
  const play = Object.hasOwn(SFX, name) && SFX[name];
  if (!ctx || !play || muted || !vol.sfx) return;
  const { vol: ov = 1, pan = 0 } = opts || {};
  const loud = clamp(+ov || 0, 0, 1), now = ctx.currentTime;
  if (loud < 0.01) return;
  const score = (x) => x.loud * x.pri * (x.end > x.t ? clamp((x.end - now) / (x.end - x.t), 0, 1) : 0);
  for (let i = voices.length - 1; i >= 0; i--) if (voices[i].end <= now) voices.splice(i, 1);
  const pri = KEY.has(name) ? 3 : 1;
  if (voices.length >= MAX_SFX) {
    // the quietest (counting how far each has already decayed); oldest wins ties
    let k = 0;
    for (let i = 1; i < voices.length; i++) if (score(voices[i]) < score(voices[k])) k = i;
    if (score(voices[k]) > loud * pri) return;
    kill(voices.splice(k, 1)[0]);
  }
  const out = ctx.createGain(), v = { out, loud, pri, t: now, end: now, n: 0, srcs: [], nodes: [out] };
  out.gain.value = loud;
  if (+pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(+pan, -1, 1);
    out.connect(p); p.connect(sfxBus); v.nodes.push(p);
  } else out.connect(sfxBus);
  play(v, now);
  voices.push(v);
}

function kill(v) {
  const t = ctx.currentTime;
  v.out.gain.setTargetAtTime(0, t, 0.01);
  for (const s of v.srcs) stopAt(s, t + 0.05);
}

// ---- engines ----

// Speed (fraction of top speed) to pitch through four gears: the note climbs,
// drops back on each shift and climbs again. Each gear's [low, high] in Hz.
const SHIFT = [0.24, 0.48, 0.74];
const GEAR_HZ = [[55, 112], [80, 150], [105, 185], [135, 220]];

function makeEngine(id, own) {
  const t = ctx.currentTime, hash = [...String(id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7) >>> 0;
  const e = { id, own, gear: 0, n: 0, end: 0, srcs: [], k: { gain: 0 }, hold: 0, last: 0, loud: 0 };
  // other cars are detuned a little each so a pack does not merge into one tone
  e.tune = own ? 1 : 1 + ((hash % 9) - 4) * 0.012;
  e.out = ctx.createGain(); e.out.gain.value = 0;
  e.lp = ctx.createBiquadFilter(); e.lp.type = 'lowpass'; e.lp.Q.value = own ? 4 : 2; e.lp.frequency.value = 300;
  e.nodes = [e.out, e.lp];
  e.lp.connect(e.out);
  let tail = e.out;
  if (ctx.createStereoPanner) { e.pan = ctx.createStereoPanner(); e.out.connect(e.pan); tail = e.pan; e.nodes.push(e.pan); }
  tail.connect(sfxBus);
  const voice = (wave, f, level, dest) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    setWave(o, wave); o.frequency.value = f; g.gain.value = level;
    o.connect(g); g.connect(dest);
    run(e, o, [g], t);
    return [o, g];
  };
  [e.a] = voice('sawtooth', 55, 0.6, e.lp);
  [e.b] = voice('square', 27.5, own ? 0.5 : 0.2, e.lp); // sub-octave body
  [e.c, e.cg] = voice('p25', 110, 0, e.out); // boost overtone, bypasses the filter
  // a slow wobble in pitch keeps the idle sounding alive
  const lfo = ctx.createOscillator(), lg = ctx.createGain();
  lfo.frequency.value = 6 + (hash % 5); lg.gain.value = 18;
  lfo.connect(lg); for (const o of [e.a, e.b, e.c]) lg.connect(o.detune);
  run(e, lfo, [lg], t);
  e.lg = lg;
  return e;
}

// Glide a param toward val, skipping changes too small to hear so a steady
// car does not pile up automation events every frame. The first value snaps
// (gain is seeded at 0 so a new voice still fades in).
function glide(e, key, param, val, tc, t) {
  const old = e.k[key];
  if (old === undefined) param.setValueAtTime(val, t);
  else if (Math.abs(val - old) > Math.abs(old) * 0.004 + 1e-4) param.setTargetAtTime(val, t, tc);
  else return;
  e.k[key] = val;
}

function engine(id, { speed = 0, boost = false, own = false, pan = 0, vol: v = 1 } = {}) {
  if (!ctx) return;
  const loud = own ? 2 : clamp(+v || 0, 0, 1); // own car always keeps its voice
  let e = engines.get(id);
  const fresh = !e;
  if (fresh) {
    if (loud < 0.02) return;
    if (engines.size >= MAX_ENGINES) {
      let q = null;
      for (const x of engines.values()) if (!x.own && (!q || x.loud < q.loud)) q = x;
      // a margin stops two cars at similar distance swapping the slot every frame
      if (!q || q.loud * 1.3 + 0.05 > loud) return;
      dropEngine(q);
    }
    e = makeEngine(id, own);
    engines.set(id, e);
  }
  e.last = performance.now(); e.loud = loud;
  const t = ctx.currentTime, s = clamp(+speed || 0, 0, 1.5), b = boost === true ? 1 : clamp(+boost || 0, 0, 1);
  let g = e.gear;
  while (g < SHIFT.length && s > SHIFT[g]) g++;
  while (g > 0 && s < SHIFT[g - 1] - 0.05) g--; // shift down a little later than up, so it does not hunt
  const [lo, hi] = GEAR_HZ[g], from = g ? SHIFT[g - 1] : 0, to = g < SHIFT.length ? SHIFT[g] : 1;
  const f = lo * (hi / lo) ** clamp((s - from) / (to - from), -0.3, 1.4) * e.tune;
  const level = clamp(+v || 0, 0, 1) * (own ? 0.26 : 0.1) * (0.75 + 0.25 * Math.min(s, 1)) * (1 + 0.15 * b);
  if (g > e.gear && !fresh && t >= e.hold) {
    // gear change: a quick dip in volume as the pitch drops back
    e.out.gain.setTargetAtTime(level * 0.45, t, 0.012);
    e.out.gain.setTargetAtTime(level, t + 0.07, 0.03);
    e.k.gain = level; e.hold = t + 0.1;
  }
  e.gear = g;
  glide(e, 'f', e.a.frequency, f, 0.05, t);
  glide(e, 'fb', e.b.frequency, f / 2, 0.05, t);
  glide(e, 'fc', e.c.frequency, f * 2, 0.05, t);
  glide(e, 'lp', e.lp.frequency, Math.min(f * (own ? 7 : 5) + b * 1500, 8000), 0.06, t);
  glide(e, 'boost', e.cg.gain, b * (own ? 0.3 : 0.18), 0.08, t);
  glide(e, 'wob', e.lg.gain, 18 - 12 * Math.min(s, 1), 0.2, t);
  if (t >= e.hold) glide(e, 'gain', e.out.gain, level, 0.05, t);
  if (e.pan) glide(e, 'pan', e.pan.pan, clamp(+pan || 0, -1, 1), 0.05, t);
}

function dropEngine(e) {
  engines.delete(e.id);
  const t = ctx.currentTime;
  e.out.gain.cancelScheduledValues(t);
  e.out.gain.setTargetAtTime(0, t, 0.05);
  for (const s of e.srcs) stopAt(s, t + 0.3);
}

function engineStop(id) { const e = ctx && engines.get(id); if (e) dropEngine(e); }
function engineStopAll() { if (ctx) for (const e of engines.values()) dropEngine(e); }

// ---- tyre squeal ----

function skid(amount) {
  if (!ctx) return;
  const a = clamp(+amount || 0, 0, 1), now = performance.now();
  if (!sk) {
    if (a < 0.02) return;
    const t = ctx.currentTime, src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    sk = { n: 0, end: 0, srcs: [], nodes: [g], k: { g: 0 }, bp, g, last: now, loud: now };
    src.buffer = noiseBuf; src.loop = true;
    bp.type = 'bandpass'; bp.Q.value = 9; bp.frequency.value = 1500;
    g.gain.value = 0;
    // a fast wobble in the band makes the hiss read as a squeal
    lfo.frequency.value = 9; lg.gain.value = 140;
    lfo.connect(lg); lg.connect(bp.frequency);
    src.connect(bp); bp.connect(g); g.connect(sfxBus);
    run(sk, src, [bp], t, undefined, Math.random() * 0.9);
    run(sk, lfo, [lg], t);
  }
  const t = ctx.currentTime;
  sk.last = now;
  if (a >= 0.02) sk.loud = now;
  glide(sk, 'g', sk.g.gain, a * a * 0.3, 0.04, t);
  glide(sk, 'f', sk.bp.frequency, 1300 + 1100 * a, 0.08, t);
}

function dropSkid() {
  const t = ctx.currentTime;
  sk.g.gain.setTargetAtTime(0, t, 0.03);
  for (const s of sk.srcs) stopAt(s, t + 0.2);
  sk = null;
}

// ---- music ----
// Each piece is a little tracker song on a 16th-note grid. lead: 'note/len'
// tokens (len in 16ths, '-' rests). One chord per bar ('F+G' splits a bar);
// bass and arp patterns are 16 steps of chord degrees (1 3 5 8, '.' holds);
// drums: k kick, s snare, h hat, o open hat, with a fill every `fill` bars.

const SONGS = {
  menu: {
    bpm: 110, swing: 0.3, wave: 'square', vol: 0.09, echo: 3, arpWave: 'p25', arpVol: 0.035, drumVol: 0.6,
    chords: ['C', 'Am', 'Dm', 'G', 'C', 'Am', 'F+G', 'C', 'F', 'G', 'Em', 'Am', 'Dm', 'G', 'C', 'G'],
    lead: `e5 g5 - e5 c5/4 d5 e5   c5 a4 - c5 e5/6 -   f5 a5 - f5 d5/4 e5 f5   g5/6 f5 d5 b4 g4/4
      e5 g5 - e5 c6/4 b5 a5   g5 e5 - c5 a4/6 -   a4 c5 f5/4 g4 b4 d5/4   c5/6 -/6 c5 d5
      a5 - a5 g5 f5/4 c5/4   b5 - b5 a5 g5/4 d5/4   g5 e5 b4 e5 g5/4 b5/4   a5/6 - e5 c5 a4/4
      f5 - f5 e5 d5/4 a4/4   b4 d5 g5 b5 a5/4 g5/4   e5 g5 c6/4 g5 e5 c5/4   d5/4 b4/4 g4/4 -/4`,
    bass: '1...5...8...5...', bassOct: 2,
    arp: '..3...5...3...5.', arpOct: 4,
    drums: 'k.h.s.h.k.h.s.h.', fill: 'k.h.s.h.k.h.s.ss', every: 8,
  },
  race: {
    bpm: 150, wave: 'p25', vol: 0.12, arpWave: 'p12', arpVol: 0.045, drumVol: 1,
    chords: ['Am', 'Am', 'F', 'G', 'Am', 'Am', 'F', 'E', 'F', 'G', 'Em', 'Am', 'F', 'G', 'Am', 'E'],
    lead: `e5/3 e5/3 d5 e5/4 a4/4   c5/3 d5/3 e5 g5/4 e5/4   f5/3 e5/3 c5 a4/4 c5/4   d5/3 c5/3 b4 g4/8
      e5/3 e5/3 d5 e5/4 a5/4   g5/3 e5/3 d5 e5 g5 a5/4   a5/3 g5/3 f5 e5/4 c5/4   b4/3 d5/3 e5 g#5/4 b5/4
      a5/6 g5 f5/4 c5/4   b4/6 d5 g5/8   e5/3 g5/3 b5 a5/4 g5/4   a5/8 g5 a5 c6/4
      c6/6 a5 f5/4 a5/4   b5/6 g5 d5/4 g5/4   a5/3 c6/3 b5 a5/4 e5/4   g#5/4 b5/4 e6/4 - e5`,
    bass: '1.8.1.8.1.8.5.8.', bassOct: 2,
    arp: '1358135813581358', arpOct: 3,
    drums: 'k.h.s.h.k.k.s.hh', fill: 'k.h.s.h.k.s.ssss', every: 8,
  },
  results: {
    bpm: 128, wave: 'p25', vol: 0.11, arpWave: 'p12', arpVol: 0.04, drumVol: 0.8,
    chords: ['G', 'C', 'Am', 'D', 'G', 'C', 'Am+D', 'G'],
    lead: `d5 g5 b5/4 a5 g5 d5/4   e5 g5 c6/4 b5 a5 g5/4   a5 c6 e6/4 d6 c6 a5/4   f#5/4 a5/4 d6/6 -
      b5 a5 g5 d5 g5/4 b5/4   c6 b5 a5 g5 e5/4 g5/4   a5/4 c6/4 f#5/4 a5/4   g5/6 d5 g5/4 -/4`,
    bass: '1.8.5.8.1.8.5.8.', bassOct: 2,
    arp: '1358853113588531', arpOct: 4,
    drums: 'k.h.s.h.k.h.s.hh', fill: 'k.h.s.h.k.s.s.ss', every: 4,
  },
};

const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const acc = (x) => (x === '#' ? 1 : x === 'b' ? -1 : 0);
const midi = (n) => { const m = /^([a-g])(#|b)?(\d)$/.exec(n); return 12 * (+m[3] + 1) + NOTE[m[1]] + acc(m[2]); };
const chord = (n) => { const m = /^([A-G])(#|b)?(m?)$/.exec(n); return { root: NOTE[m[1].toLowerCase()] + acc(m[2]), third: m[3] ? 3 : 4 }; };
const degree = (c, d) => (d === '3' ? c.third : d === '5' ? 7 : d === '8' ? 12 : 0);

// Turn a song into a list of [instrument, midi, length in steps] per 16th step.
function compile(d) {
  const len = d.chords.length * 16, ev = Array.from({ length: len }, () => []);
  let s = 0;
  for (const tok of d.lead.trim().split(/\s+/)) {
    const [n, l] = tok.split('/'), k = +l || 2;
    if (n !== '-') {
      ev[s % len].push(['lead', midi(n), k]);
      if (d.echo) ev[(s + d.echo) % len].push(['echo', midi(n), k]);
    }
    s += k;
  }
  d.chords.forEach((name, b) => {
    const parts = name.split('+').map(chord), drums = (b + 1) % d.every ? d.drums : d.fill;
    for (let i = 0; i < 16; i++) {
      const c = parts[Math.floor((i * parts.length) / 16)], at = ev[b * 16 + i];
      for (const [inst, pat, oct] of [['bass', d.bass, d.bassOct], ['arp', d.arp, d.arpOct]]) {
        if (pat[i] === '.') continue;
        let k = 1;
        while (i + k < 16 && pat[i + k] === '.') k++;
        at.push([inst, 12 * (oct + 1) + c.root + degree(c, pat[i]), k]);
      }
      if (drums[i] !== '.') at.push([drums[i], 0, 1]);
    }
  });
  return { ...d, len, ev, step: 60 / d.bpm / 4 };
}

// Music instruments: (song, midi, time, seconds).
const INST = {
  lead: (s, m, t, d) => tone(s, t, s.p.wave, hz(m), d * 0.92, s.p.vol, { a: 0.006, sus: 0.6, vib: d > 0.3 ? 14 : 0, vibRate: 5.5, vibIn: 0.15 }),
  echo: (s, m, t, d) => tone(s, t, s.p.wave, hz(m), d * 0.9, s.p.vol * 0.3, { sus: 0.5 }),
  arp: (s, m, t, d) => tone(s, t, s.p.arpWave, hz(m), Math.min(d, 0.12), s.p.arpVol),
  bass: (s, m, t, d) => tone(s, t, 'triangle', hz(m), d * 0.85, 0.3, { sus: 0.7 }),
  k: (s, m, t) => tone(s, t, 'triangle', 160, 0.14, 0.4 * s.p.drumVol, { to: 45 }),
  s: (s, m, t) => { hiss(s, t, 0.13, 0.2 * s.p.drumVol, { f: 1900, q: 0.7 }); tone(s, t, 'triangle', 230, 0.06, 0.16 * s.p.drumVol, { to: 150 }); },
  h: (s, m, t) => hiss(s, t, 0.035, 0.08 * s.p.drumVol, { type: 'highpass', f: 7000 }),
  o: (s, m, t) => hiss(s, t, 0.16, 0.07 * s.p.drumVol, { type: 'highpass', f: 6000 }),
};

// Lookahead scheduler: called every 50 ms, queues the notes due in the next
// 150 ms on the audio clock so timing stays tight even if the page stutters.
function schedule() {
  if (!song || hidden()) return;
  const now = ctx.currentTime, p = song.p;
  if (song.next < now) song.next = now + 0.03; // fell behind (hidden tab): skip ahead, never burst
  for (let guard = 0; song.next < now + AHEAD && guard < 64; guard++) {
    const i = song.step % p.len, t = song.next + (p.swing && i % 4 === 2 ? p.swing * p.step : 0);
    for (const [inst, m, k] of p.ev[i]) INST[inst](song, m, t, k * p.step);
    song.step++; song.next += p.step;
  }
}

function music(name) {
  want = Object.hasOwn(SONGS, name) ? name : null;
  if (!ctx || (song && song.name === want)) return;
  if (song) {
    const old = song.out;
    old.gain.setTargetAtTime(0, ctx.currentTime, 0.06);
    setTimeout(() => old.disconnect(), 1000);
    song = null;
  }
  if (!want) return;
  const def = SONGS[want];
  def.compiled ||= compile(def);
  const out = ctx.createGain();
  out.connect(musicBus);
  song = { name: want, p: def.compiled, out, n: 0, end: 0, step: 0, next: ctx.currentTime + 0.06 };
  schedule();
}

// ---- master ----

function tick() {
  const now = performance.now();
  for (const e of engines.values()) if (now - e.last > STALE_MS) dropEngine(e);
  if (sk && (now - sk.last > STALE_MS || now - sk.loud > 500)) dropSkid();
  schedule();
}

function applyVolume() {
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(muted ? 0 : MASTER, t, 0.03);
  sfxBus.gain.setTargetAtTime(vol.sfx, t, 0.03);
  musicBus.gain.setTargetAtTime(vol.music * MUSIC_LEVEL, t, 0.03);
}

function unlock() {
  if (ctx) {
    if (ctx.state !== 'running') ctx.resume()?.catch?.(() => {});
    return;
  }
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  // effects and music meet in the master gain, then a compressor keeps a
  // pile-up of sounds from clipping. It is set hard and fast because Chrome
  // adds makeup gain, so a gentler setting still lets 16 sounds at once clip.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 4; comp.ratio.value = 12;
  comp.attack.value = 0.001; comp.release.value = 0.15;
  master = ctx.createGain(); sfxBus = ctx.createGain(); musicBus = ctx.createGain();
  // start at the set levels (not a fade up) so the very first tap is heard
  master.gain.value = muted ? 0 : MASTER; sfxBus.gain.value = vol.sfx; musicBus.gain.value = vol.music * MUSIC_LEVEL;
  sfxBus.connect(master); musicBus.connect(master);
  master.connect(comp); comp.connect(ctx.destination);
  waves.p25 = pulse(0.25); waves.p12 = pulse(0.125);
  noiseBuf = noiseBuffer(1); crunchBuf = noiseBuffer(8);
  if (ctx.state !== 'running') ctx.resume()?.catch?.(() => {});
  setInterval(tick, 50).unref?.(); // unref: never keep Node alive
  if (want) music(want); // a piece asked for before the first tap starts now
}

function setVolume(o) {
  const { sfx: s, music: m } = o || {};
  if (s !== undefined) vol.sfx = clamp(+s || 0, 0, 1);
  if (m !== undefined) vol.music = clamp(+m || 0, 0, 1);
  if (ctx) applyVolume();
}

function setMuted(on) {
  muted = !!on;
  if (ctx) applyVolume();
}

export const audio = { unlock, sfx, engine, engineStop, engineStopAll, skid, music, setVolume, setMuted };
