// Snooker Table: a figure of eight on the baize, with balls rolling across it.

import { row } from './util.js';

export default {
  id: 'snooker',
  name: 'Snooker Table',
  room: 'Games Room',
  blurb: 'A figure of eight on the baize. Give way at the crossing. Or don\'t.',
  size: { w: 224, d: 114 },
  edge: 'wall',
  width: 11,
  offMult: 0.7,
  color: '#1f9d55',
  minLap: 9000,
  path: [
    [-70, 38], [-46, 36], [-24, 17], [0, 0], [26, -19], [58, -38], [88, -30], [97, 4],
    [82, 35], [52, 38], [26, 19], [0, 0], [-26, -19], [-58, -38], [-88, -30], [-97, 4], [-90, 28],
  ],
  props: [
    { m: 'pocket', x: -109, z: -54 }, { m: 'pocket', x: 0, z: -57 }, { m: 'pocket', x: 109, z: -54 },
    { m: 'pocket', x: -109, z: 54 }, { m: 'pocket', x: 0, z: 57 }, { m: 'pocket', x: 109, z: 54 },
    // The pack of reds, sat inside the right-hand loop.
    ...[0, 1, 2, 3, 4].flatMap((r) => Array.from({ length: r + 1 }, (_, k) => (
      { m: 'ball', x: 52 + r * 3.7, z: (k - r / 2) * 4.2, c: '#c0261c' }))),
    { m: 'ball', x: 45, z: 0, c: '#f48fb1' },
    { m: 'ball', x: 80, z: 2, c: '#151515' },
    { m: 'ball', x: -58, z: 0, c: '#7a4a21' },
    { m: 'ball', x: -58, z: -13, c: '#1e7d3c' },
    { m: 'ball', x: -58, z: 13, c: '#f2c230' },
    { m: 'cue', x: 0, z: -47, rot: Math.PI / 2 - 0.03 },
    { m: 'chalk', at: [0.2, 2.6] },
    { m: 'chalk', at: [0.455, -2.8] },
    { m: 'chalk', at: [0.7, 2.4] },
    { m: 'chalk', at: [0.93, -2.6] },
    { m: 'chalkDust', at: [0.36, -1.5] },
    { m: 'chalkDust', at: [0.86, 1.5] },
  ],
  movers: [
    { m: 'ball', c: '#f5f1e6', kind: 'line', a: [74, -20], b: [74, -50], period: 5.5, phase: 0 },
    { m: 'ball', c: '#1f4fb5', kind: 'line', a: [-9, 30], b: [9, -30], period: 7, phase: 0.3 },
    { m: 'ball', c: '#c0261c', kind: 'line', a: [-80, 2], b: [-106, 7], period: 4.5, phase: 0.6 },
  ],
  boxes: [row(0.1), row(0.3), row(0.6), row(0.8)],
  pads: [[0.24, 0], [0.74, 0]],
};
