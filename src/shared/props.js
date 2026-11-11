// Prop catalogue: what each named model does to a car. The renderer has a mesh
// builder for every name here (client/themes.js); this side only knows shapes.
//   circle {r}            solid, round
//   box {hw, hd}          solid, half extents before rotation
//   zone {kind, r|hw,hd}  slick | sticky | hole | jump
//   none                  decoration only
// `low: true` solids are cleared by a car that is in the air.

export const PROPS = {
  // Breakfast table
  cerealBox: { shape: 'box', hw: 7, hd: 2.4 },
  milkCarton: { shape: 'box', hw: 2.6, hd: 2.6 },
  mug: { shape: 'circle', r: 3.2 },
  glass: { shape: 'circle', r: 2.4 },
  plate: { shape: 'circle', r: 7.5 },
  bowl: { shape: 'circle', r: 6.5 },
  toast: { shape: 'box', hw: 3, hd: 3, low: true },
  butter: { shape: 'box', hw: 3.2, hd: 1.9 },
  jamJar: { shape: 'circle', r: 2.7 },
  teapot: { shape: 'circle', r: 5.2 },
  orange: { shape: 'circle', r: 2.6 },
  sugarCube: { shape: 'box', hw: 0.9, hd: 0.9, low: true },
  spoon: { shape: 'box', hw: 0.9, hd: 6.5, low: true },
  milkPuddle: { shape: 'zone', kind: 'slick', r: 5 },
  jamBlob: { shape: 'zone', kind: 'sticky', r: 3.6 },
  crumbs: { shape: 'none' },

  // Snooker table
  ball: { shape: 'circle', r: 2 },
  chalk: { shape: 'box', hw: 1.2, hd: 1.2 },
  cue: { shape: 'box', hw: 0.7, hd: 34 },
  rack: { shape: 'none' },
  pocket: { shape: 'zone', kind: 'hole', r: 5.2 },
  chalkDust: { shape: 'zone', kind: 'slick', r: 4.5 },

  // Kitchen floor
  tableLeg: { shape: 'box', hw: 2.6, hd: 2.6 },
  chairLeg: { shape: 'circle', r: 1.5 },
  petBowl: { shape: 'circle', r: 6 },
  bucket: { shape: 'circle', r: 8 },
  sponge: { shape: 'box', hw: 3.4, hd: 2.2 },
  bottleCap: { shape: 'circle', r: 1.2, low: true },
  tin: { shape: 'circle', r: 3.4 },
  broom: { shape: 'box', hw: 0.8, hd: 22 },
  waterPuddle: { shape: 'zone', kind: 'slick', r: 5.5 },
  cerealSpill: { shape: 'zone', kind: 'sticky', r: 5 },
  dustpan: { shape: 'zone', kind: 'jump', hw: 4.2, hd: 3 },
  magnet: { shape: 'none' },
  rugMat: { shape: 'none' },

  // Bedroom rug
  block: { shape: 'box', hw: 2.4, hd: 2.4 },
  brick: { shape: 'box', hw: 3.2, hd: 1.6, low: true },
  crayon: { shape: 'box', hw: 0.7, hd: 5, low: true },
  teddy: { shape: 'circle', r: 7 },
  toyBall: { shape: 'circle', r: 4 },
  marble: { shape: 'circle', r: 1.3 },
  robot: { shape: 'circle', r: 3 },
  bookRamp: { shape: 'zone', kind: 'jump', hw: 4.6, hd: 3.4 },
  book: { shape: 'box', hw: 6, hd: 4.4 },
  toyTrain: { shape: 'circle', r: 2.4 },
  pond: { shape: 'zone', kind: 'sticky', r: 5 },
  house: { shape: 'box', hw: 2.5, hd: 2.5 },
};
