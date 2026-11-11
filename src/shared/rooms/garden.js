// Garden Path: helicopters over the lawn, with a tight cut through the sunflowers.

import { row } from './util.js';

export default {
  id: 'garden',
  name: 'Garden Path',
  room: 'Garden',
  blurb: 'Follow the flagstones. Mind the bees. Thread the sunflowers if you dare.',
  vehicle: 'heli',
  size: { w: 244, d: 160 },
  edge: 'wall',
  width: 12.5,
  offMult: 0.7,
  color: '#8ac926',
  minLap: 10800,
  path: [
    [-52, 58], [0, 60], [53, 57], [92, 39], [103, 5], [89, -33], [56, -49], [24, -38],
    [14, -9], [-13, 4], [-39, -11], [-52, -41], [-80, -53], [-103, -33], [-104, 6], [-91, 39],
  ],
  shapes: {
    gdnPot: { shape: 'circle', r: 3.4 },
    gdnSunflower: { shape: 'circle', r: 2.1 },
    gdnGnome: { shape: 'circle', r: 2.5 },
    gdnWateringCan: { shape: 'box', hw: 5, hd: 3.2 },
    gdnBirdBath: { shape: 'circle', r: 5 },
    gdnTree: { shape: 'circle', r: 6 },
    gdnShrub: { shape: 'circle', r: 3.7 },
    gdnPole: { shape: 'circle', r: 1.3 },
    gdnWheelbarrow: { shape: 'box', hw: 3.8, hd: 6.2 },
    gdnShed: { shape: 'box', hw: 10, hd: 6.5 },
    gdnBee: { shape: 'circle', r: 2.3 },
    gdnButterfly: { shape: 'circle', r: 2.2 },
    gdnLaundry: { shape: 'none' },
    gdnPond: { shape: 'none' },
    gdnDaisies: { shape: 'none' },
    gdnHose: { shape: 'none' },
    gdnStone: { shape: 'none' },
  },
  props: [
    { m: 'gdnShed', x: 49, z: -69 },
    { m: 'gdnWheelbarrow', x: 77, z: -62, rot: 0.3 },
    { m: 'gdnWateringCan', x: 36, z: -61, rot: -0.4 },
    { m: 'gdnPot', x: 64, z: -67, c: '#e77a9a' },
    { m: 'gdnPot', x: 25, z: -64, c: '#b4a1ed' },
    { m: 'gdnHose', x: 80, z: 16, rot: -0.3 },
    { m: 'gdnWateringCan', x: 83, z: 27, rot: 0.6 },
    { m: 'gdnBirdBath', x: 49, z: 17 },
    { m: 'gdnPond', x: 56, z: -5, rot: 0.3 },
    { m: 'gdnTree', x: 66, z: -22 },
    { m: 'gdnGnome', x: 33, z: 31, rot: -0.4 },
    { m: 'gdnTree', x: -64, z: 20 },
    { m: 'gdnGnome', x: -47, z: 29, rot: 0.6 },
    { m: 'gdnBirdBath', x: -27, z: 32 },
    { m: 'gdnPot', x: -10, z: 22, c: '#ffcf55' },
    { m: 'gdnPot', x: 8, z: 31, c: '#e77a9a' },
    { m: 'gdnPole', x: -15, z: -38 },
    { m: 'gdnPole', x: 11, z: -38 },
    { m: 'gdnLaundry', x: -2, z: -38 },
    { m: 'gdnPot', x: -21, z: -43, c: '#b4a1ed' },
    // These stand just off the path; helicopters cannot fly through their tops.
    { m: 'gdnPot', at: [0.18, 10.4], c: '#b4a1ed' },
    { m: 'gdnPot', at: [0.32, -10.4], c: '#ffcf55' },
    { m: 'gdnGnome', at: [0.58, 10.5], rot: 0.5 },
    { m: 'gdnPot', at: [0.92, -10.4], c: '#e77a9a' },
    // Staggered pairs leave a narrow, weaving lane through the sunflower bed.
    ...[[-61, -25], [-69, -32], [-72, -18], [-81, -26], [-85, -7], [-94, -14]].map(([x, z]) => (
      { m: 'gdnSunflower', x, z })),
    ...[[-57, -16], [-64, -12], [-70, -8], [-77, -3], [-83, 3]].map(([x, z]) => (
      { m: 'gdnSunflower', x, z, rot: 0.4 })),
    ...[[-111, -64], [-99, -67], [-85, -70], [-70, -69], [95, -64], [111, -57],
      [-111, 60], [-98, 67], [-84, 70], [103, 64], [114, 54], [114, 40]].map(([x, z]) => (
      { m: 'gdnShrub', x, z })),
    ...[[-40, -64], [-25, -65], [-10, -65], [5, -65], [-78, 8], [-46, 17], [-20, 18],
      [12, 45], [30, 10], [73, 1], [70, 34], [-3, 73], [20, 72], [-48, 73]].map(([x, z], i) => (
      { m: 'gdnDaisies', x, z, rot: i * 0.7, c: i % 3 ? '#fff8dc' : '#f4b2cf' })),
    ...[[44, -59], [49, -57], [54, -57], [34, 22], [37, 19], [40, 17], [-54, 35], [-49, 39]].map(([x, z], i) => (
      { m: 'gdnStone', x, z, rot: i * 0.8 })),
  ],
  movers: [
    { m: 'gdnBee', kind: 'line', a: [71, 33], b: [96, 67], period: 6.2, phase: 0.15 },
    { m: 'gdnButterfly', kind: 'line', a: [-19, -24], b: [-43, 18], period: 7.3, phase: 0.6 },
  ],
  cuts: [{ path: [[-52, -41], [-66, -26], [-79, -19], [-90, -6], [-104, 6]], width: 5.2 }],
  boxes: [row(0.09), row(0.31), row(0.54), row(0.82)],
  pads: [[0.14, 0], [0.46, 0], [0.94, 0]],
};
