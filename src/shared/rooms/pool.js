// Pool Table: blue cloth, six wide pockets and balls rolling across the road.

import { row } from './util.js';

// Pool ball colours by number (9 to 15 are the same colours, striped). The look
// reads a ball's number back from its colour.
export const BALL = ['#f8f5ec', '#f4c20d', '#1d4fb8', '#d42a2a', '#5b2a86', '#f07f1a', '#16834a', '#7a1e2c', '#151515'];
const ball = (n, x, z) => ({ m: n > 8 ? 'poolStripe' : 'poolSolid', x, z, c: BALL[n > 8 ? n - 8 : n] });

// A ten ball rack on the foot spot, apex towards the head of the table.
const RACK = [[1], [9, 2], [10, 8, 4], [5, 13, 7, 15]];
const racked = RACK.flatMap((balls, r) => balls.map((n, k) => ball(n, 52 + r * 4.2, (k - r / 2) * 4.85)));

export default {
  id: 'pool',
  name: 'Pool Table',
  room: 'Games Room',
  blurb: 'Six hungry pockets, and the balls are still rolling.',
  vehicle: 'car',
  size: { w: 208, d: 112 },
  edge: 'wall',
  width: 11,
  offMult: 0.7,
  color: '#3a86ff',
  minLap: 12000,
  path: [
    [-40, 43.5], [20, 43.5], [66, 45], [88, 44], [95, 32], [94, -2], [93, -36], [82, -45.5], [56, -43.5], [42, -38],
    [36, -16], [24, -4], [0, -2], [-20, -8], [-30, -26], [-42, -41], [-66, -44], [-88, -45.5], [-95, -32], [-91, -14],
    [-74, -6], [-62, 4], [-64, 15], [-76, 21], [-90, 25], [-95, 36], [-84, 46],
  ],
  shapes: {
    poolPocket: { shape: 'zone', kind: 'hole', r: 6.5 },
    poolSolid: { shape: 'circle', r: 2.4 },
    poolStripe: { shape: 'circle', r: 2.4 },
    poolCueBall: { shape: 'circle', r: 2.4 },
    poolRack: { shape: 'none' },
    poolCue: { shape: 'box', hw: 0.7, hd: 32 },
    poolBridge: { shape: 'box', hw: 0.8, hd: 22 },
  },
  props: [
    { m: 'poolPocket', x: -99.5, z: -51.5 }, { m: 'poolPocket', x: 0, z: -53.5 }, { m: 'poolPocket', x: 99.5, z: -51.5 },
    { m: 'poolPocket', x: -99.5, z: 51.5 }, { m: 'poolPocket', x: 0, z: 53.5 }, { m: 'poolPocket', x: 99.5, z: 51.5 },
    { m: 'poolRack', x: 52, z: 0 },
    ...racked,
    ball(14, 74, 36),
    // Two cues and the bridge, put down beside the road.
    { m: 'poolCue', x: -8, z: 35.5, rot: Math.PI / 2 },
    { m: 'poolCue', x: 85, z: -4, rot: Math.PI },
    { m: 'poolBridge', x: -52, z: 27, rot: Math.PI / 2 + 0.12 },
    { m: 'chalk', at: [0.115, -3] },
    { m: 'chalk', at: [0.44, 2.8] },
    { m: 'chalk', at: [0.69, -2.6] },
    { m: 'chalk', at: [0.885, -2.8] },
    // The cut along the top cushion: past one chalk on the left, wide of the side pocket, the other on the right.
    { m: 'chalk', x: 22, z: -39.4 },
    { m: 'chalk', x: -20, z: -45 },
    { m: 'chalkDust', at: [0.28, 1.8] },
    { m: 'chalkDust', at: [0.79, -1.4] },
  ],
  // The cue ball and four loose balls roll to the cushion and back across the road.
  movers: [
    { m: 'poolCueBall', kind: 'line', a: [12, 24], b: [15, -50], period: 9, phase: 0, roll: true },
    { m: 'poolSolid', c: BALL[3], kind: 'line', a: [38, 4], b: [44, 53], period: 6.5, phase: 0.35, roll: true },
    { m: 'poolStripe', c: BALL[3], kind: 'line', a: [66, -14], b: [62, -53.5], period: 5.5, phase: 0.6, roll: true },
    { m: 'poolStripe', c: BALL[4], kind: 'line', a: [-56, -8], b: [-62, -53.5], period: 7.5, phase: 0.15, roll: true },
    { m: 'poolSolid', c: BALL[6], kind: 'line', a: [-101.5, 10], b: [-44, 6], period: 8, phase: 0.8, roll: true },
  ],
  cuts: [{ path: [[42, -38], [0, -45], [-42, -41]], width: 6 }],
  boxes: [row(0.1), row(0.315), row(0.6), row(0.85)],
  pads: [[0.03, 0], [0.245, 0], [0.54, 0]],
};
