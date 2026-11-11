// Bedroom Rug: the printed road rug, a book ramp and a toy train.

import { row } from './util.js';

export default {
  id: 'bedroom',
  name: 'Bedroom Rug',
  room: 'Bedroom',
  blurb: 'The road rug, a book ramp and a toy train with right of way.',
  size: { w: 252, d: 164 },
  edge: 'wall',
  width: 11.5,
  offMult: 0.6,
  color: '#f2b632',
  minLap: 10500,
  path: [
    [-40, -58], [20, -60], [70, -52], [100, -30], [105, 4], [96, 40], [64, 58], [28, 48],
    [14, 18], [-14, 0], [-30, 24], [-36, 50], [-66, 60], [-100, 44], [-108, 6], [-96, -36], [-70, -54],
  ],
  props: [
    { m: 'teddy', x: 60, z: 4 },
    { m: 'block', x: 44, z: -24, rot: 0.3, c: '#e8503a' }, { m: 'block', x: 50, z: -19, rot: 0.9, c: '#3a7bd5' },
    { m: 'block', x: 46, z: -30, rot: -0.2, c: '#f2c230' },
    { m: 'toyBall', x: -64, z: 8, c: '#e8503a' },
    { m: 'robot', x: -58, z: -24 },
    { m: 'book', x: -6, z: -32, rot: 0.25, c: '#7e57c2' },
    { m: 'book', x: 108, z: -62, rot: -0.2, c: '#1f9d55' },
    { m: 'house', x: 30, z: -34 }, { m: 'house', x: -70, z: 32 }, { m: 'house', x: 72, z: 34 },
    { m: 'house', x: -30, z: -30 }, { m: 'house', x: -10, z: 24 },
    { m: 'bookRamp', at: [0.075, 0], face: true },
    { m: 'brick', at: [0.1, -3.4], c: '#e8503a' }, { m: 'brick', at: [0.1, 0], c: '#f2c230', rot: 0.2 },
    { m: 'brick', at: [0.1, 3.4], c: '#3a7bd5' },
    { m: 'crayon', at: [0.3, -3.2], rot: 0.5, c: '#1f9d55' },
    { m: 'crayon', at: [0.66, 3], rot: -0.6, c: '#e8503a' },
    { m: 'pond', at: [0.41, 2.4] },
    { m: 'pond', at: [0.83, -2.4] },
    { m: 'marble', at: [0.24, 3.4], c: '#3a7bd5' }, { m: 'marble', at: [0.585, -3.4], c: '#f48fb1' },
    { m: 'marble', at: [0.93, 3.2], c: '#1f9d55' },
  ],
  movers: [
    { m: 'toyTrain', kind: 'orbit', cx: -10, cz: 22, rad: 19, period: 9, phase: 0 },
    { m: 'toyBall', c: '#3a7bd5', kind: 'line', a: [92, 4], b: [118, 8], period: 6.5, phase: 0.5 },
  ],
  boxes: [row(0.16), row(0.36), row(0.6), row(0.78)],
  pads: [[0.5, 0], [0.9, 0]],
};
