// Lap records: the best lap per name on each track, kept in one small JSON file.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { TRACKS, trackById } from '../src/shared/tracks.js';
import { cleanName } from '../src/shared/room.js';

const KEEP = 20;

export class Records {
  constructor(file) {
    this.file = file;
    this.data = {};
    this.timer = null;
    if (file) {
      try { this.data = JSON.parse(readFileSync(file, 'utf8')); } catch { /* first run */ }
    }
    for (const t of TRACKS) if (!Array.isArray(this.data[t.id])) this.data[t.id] = [];
  }

  top(n = 10) {
    const out = {};
    for (const t of TRACKS) out[t.id] = this.data[t.id].slice(0, n);
    return out;
  }

  // Returns { rank } (1-based) when the lap makes the board, otherwise {}.
  submit(trackId, name, ms) {
    const def = TRACKS.find((t) => t.id === trackId);
    if (!def || !Number.isFinite(ms) || ms < def.minLap || ms > 600000) return {};
    name = cleanName(name); ms = Math.round(ms);
    const list = this.data[def.id], mine = list.find((r) => r.name === name);
    if (mine && mine.ms <= ms) return {};
    if (!mine && list.length >= KEEP && list[list.length - 1].ms <= ms) return {};
    if (mine) list.splice(list.indexOf(mine), 1);
    list.push({ name, ms, at: Date.now() });
    list.sort((a, b) => a.ms - b.ms || a.at - b.at);
    list.length = Math.min(list.length, KEEP);
    this.saveSoon();
    return { rank: list.findIndex((r) => r.name === name) + 1 };
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
      console.error('could not save records:', err.message);
    }
  }
}

export { trackById };
