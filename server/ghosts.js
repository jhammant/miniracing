// The fastest lap anyone has sent a ghost for, one per track: a name, a time
// and the path the car took. Kept in one JSON file beside the records.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { TRACKS } from '../src/shared/tracks.js';
import { cleanName } from '../src/shared/room.js';
import { validGhost } from '../src/shared/ghost.js';

export class Ghosts {
  constructor(file) {
    this.file = file;
    this.data = {};
    this.timer = null;
    let saved = {};
    if (file) {
      try { saved = JSON.parse(readFileSync(file, 'utf8')) || {}; } catch { /* first run */ }
    }
    for (const t of TRACKS) {
      const g = saved[t.id];
      if (g && validGhost(t.id, g.ms, g.d)) this.data[t.id] = { name: cleanName(g.name), ms: g.ms, at: Number(g.at) || 0, d: g.d };
    }
  }

  get(trackId) {
    const g = Object.hasOwn(this.data, trackId) ? this.data[trackId] : null;
    return g ? { name: g.name, ms: g.ms, d: g.d } : null;
  }

  // Kept only if it is a sound lap and quicker than the one already held.
  submit(trackId, name, ms, d) {
    ms = Math.round(Number(ms));
    if (!validGhost(trackId, ms, d)) return { kept: false };
    const held = this.data[trackId];
    if (held && held.ms <= ms) return { kept: false };
    this.data[trackId] = { name: cleanName(name), ms, at: Date.now(), d };
    this.saveSoon();
    return { kept: true };
  }

  saveSoon() {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.save(); }, 500);
    this.timer.unref?.();
  }

  save() {
    if (!this.file) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(`${this.file}.tmp`, JSON.stringify(this.data));
      renameSync(`${this.file}.tmp`, this.file);
    } catch (err) {
      console.error('could not save ghosts:', err.message);
    }
  }
}
