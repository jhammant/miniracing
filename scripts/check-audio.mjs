// Drives client/audio.js against a stand-in AudioContext: every call must be
// safe before the first tap, and must actually build sound after it.

let nodes = 0;
const fake = () => new Proxy(function () {}, {
  get(t, k) {
    if (k === 'then' || typeof k === 'symbol') return undefined;
    if (k === 'currentTime') return 1;
    if (k === 'sampleRate') return 44100;
    if (k === 'state') return 'running';
    if (k === 'length') return 44100;
    if (k === 'getChannelData') return () => new Float32Array(44100);
    if (k === 'value') return t.value ?? 0;
    if (!(k in t)) t[k] = fake();
    return t[k];
  },
  set(t, k, v) { t[k] = v; return true; },
  apply() { nodes++; return fake(); },
  construct() { nodes++; return fake(); },
});

const { audio } = await import('../src/client/audio.js');
const SFX = ['countdown', 'go', 'pickup', 'boost', 'rocket', 'explode', 'oil', 'spin', 'shield', 'shieldPop', 'mallet', 'squash', 'zap',
  'bump', 'fall', 'respawn', 'jump', 'land', 'pad', 'lap', 'bestLap', 'finalLap', 'finish', 'win', 'out', 'round', 'click', 'join', 'wrongWay', 'record'];
const drive = () => {
  for (const name of SFX) audio.sfx(name, { vol: 0.5, pan: -0.3 });
  audio.sfx('no-such-sound');
  for (let id = 1; id <= 10; id++) audio.engine(id, { speed: id / 10, boost: id === 2, own: id === 1, pan: 0, vol: 0.8 });
  audio.engineStop(3); audio.skid(0.7); audio.skid(0);
  for (const m of ['menu', 'race', 'results', null]) audio.music(m);
  audio.setVolume({ sfx: 0.8, music: 0.4 }); audio.setMuted(true); audio.setMuted(false);
  audio.engineStopAll();
};

drive(); // before unlock: must be silent no-ops
if (nodes !== 0) { console.error('FAIL audio touched an AudioContext before unlock()'); process.exit(1); }
globalThis.AudioContext = fake();
audio.unlock();
drive();
audio.music('race');
await new Promise((r) => setTimeout(r, 400)); // let the music scheduler run a few times
audio.music(null);
if (nodes < 100) { console.error(`FAIL only ${nodes} audio calls were made; the sounds look empty`); process.exit(1); }
console.log(`audio ok: ${nodes} audio calls`);
process.exit(0);
