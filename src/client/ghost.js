// Time-trial ghosts: your own best lap for each room is kept on this device,
// and the quickest ghosted lap anyone has sent is kept by the server.

import { validGhost } from '../shared/ghost.js';

const key = (track) => `miniracing.ghost.${track}`;

export function loadOwn(track) {
  try {
    const g = JSON.parse(localStorage.getItem(key(track)) || 'null');
    return g && validGhost(track, g.ms, g.d) ? { ms: g.ms, d: g.d, name: 'YOUR BEST', own: true } : null;
  } catch { return null; }
}

export function saveOwn(track, g) {
  try { localStorage.setItem(key(track), JSON.stringify({ ms: g.ms, d: g.d })); } catch { /* private mode, or full */ }
}

// The record holder's lap, or null when there is none or no connection.
export async function fetchRecord(track) {
  try {
    const res = await fetch(`/api/ghost?track=${encodeURIComponent(track)}`);
    if (!res.ok) return null;
    const g = await res.json();
    return validGhost(track, g.ms, g.d) ? { ms: g.ms, d: g.d, name: String(g.name || 'RECORD').slice(0, 12) } : null;
  } catch { return null; }
}

export function sendGhost(track, name, g) {
  fetch('/api/ghost', { method: 'POST', body: JSON.stringify({ track, name, ms: g.ms, d: g.d }) }).catch(() => {});
}
