// Kitchen Floor: under the table, round the dog bowl, over the dustpan.

import { row } from './util.js';

export default {
  id: 'kitchen',
  name: 'Kitchen Floor',
  room: 'Kitchen',
  blurb: 'Under the table, round the dog bowl, over the dustpan.',
  size: { w: 264, d: 164 },
  edge: 'wall',
  width: 12,
  offMult: 0.72,
  color: '#3a7bd5',
  minLap: 10500,
  path: [
    [-60, 62], [0, 64], [60, 60], [104, 44], [113, 8], [96, -27], [62, -30], [40, -6],
    [0, 5], [-40, -6], [-66, -22], [-80, -53], [-108, -51], [-117, -16], [-105, 24], [-92, 52],
  ],
  props: [
    { m: 'tableLeg', x: -35, z: -23 }, { m: 'tableLeg', x: 35, z: -23 },
    { m: 'tableLeg', x: -35, z: 24 }, { m: 'tableLeg', x: 35, z: 24 },
    { m: 'chairLeg', x: -7, z: 36 }, { m: 'chairLeg', x: 7, z: 36 },
    { m: 'chairLeg', x: -7, z: 47 }, { m: 'chairLeg', x: 7, z: 47 },
    { m: 'chairLeg', x: -7, z: -37 }, { m: 'chairLeg', x: 7, z: -37 },
    { m: 'chairLeg', x: -7, z: -48 }, { m: 'chairLeg', x: 7, z: -48 },
    { m: 'petBowl', x: -93, z: -24 },
    { m: 'bucket', x: 104, z: -62 },
    { m: 'broom', x: 24, z: -70, rot: Math.PI / 2 + 0.06 },
    { m: 'tin', x: 76, z: 20 }, { m: 'tin', x: 70, z: 27 },
    { m: 'sponge', at: [0.385, 4.6], rot: 0.5 },
    { m: 'sponge', at: [0.905, -3.4], rot: -0.3 },
    { m: 'waterPuddle', at: [0.215, -2.5] },
    { m: 'waterPuddle', at: [0.655, 2.4] },
    { m: 'cerealSpill', at: [0.5, -3] },
    { m: 'cerealSpill', at: [0.8, 3] },
    { m: 'dustpan', at: [0.115, 0], face: true },
    { m: 'bottleCap', at: [0.14, -3.6] }, { m: 'bottleCap', at: [0.14, -1.2] },
    { m: 'bottleCap', at: [0.14, 1.2] }, { m: 'bottleCap', at: [0.14, 3.6] },
    { m: 'magnet', x: -20, z: -68, c: '#e8503a' }, { m: 'magnet', x: -60, z: 30, c: '#f2c230' },
    { m: 'magnet', x: 70, z: -58, c: '#1f9d55' }, { m: 'magnet', x: 120, z: 66, c: '#7e57c2' },
    { m: 'rugMat', x: -6, z: 0 },
  ],
  movers: [
    { m: 'tin', kind: 'line', a: [100, -8], b: [124, -2], period: 6, phase: 0.2 },
  ],
  boxes: [row(0.07), row(0.3), row(0.56), row(0.76)],
  pads: [[0.44, 0], [0.955, 0]],
};
