// Player preferences and personal bests, kept in localStorage.

const KEY = 'miniracing.v1';
const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const defaults = {
  name: '', color: -1, camera: 'chase', retro: false, quality: 'auto', autoGas: touch,
  sfx: 0.8, music: 0.5, muted: false, pbs: {},
};

export const isTouch = touch;
export const store = { ...defaults };

try { Object.assign(store, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* private mode */ }

export function save(patch) {
  Object.assign(store, patch);
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* private mode */ }
}

// Returns true when `ms` is a new personal best for the track.
export function recordPb(track, ms) {
  if (store.pbs[track] && store.pbs[track] <= ms) return false;
  save({ pbs: { ...store.pbs, [track]: ms } });
  return true;
}

export function fmtTime(ms) {
  if (!ms || !Number.isFinite(ms)) return '-:--.--';
  const m = Math.floor(ms / 60000), s = (ms % 60000) / 1000;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

export const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : Math.min(n % 10, 4) % 4]}`;
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
