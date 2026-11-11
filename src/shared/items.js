// Power-ups. Weights depend on where you are in the field: the leader mostly
// gets things to defend with, the back of the pack gets things to catch up with.

export const ITEMS = {
  boost: { name: 'TURBO', color: '#ff9f1c', glyph: '»' },
  rocket: { name: 'ROCKET', color: '#e63946', glyph: '➤' },
  oil: { name: 'OIL', color: '#3b3355', glyph: '●' },
  shield: { name: 'SHIELD', color: '#4cc9f0', glyph: '◯' },
  mallet: { name: 'MALLET', color: '#b5651d', glyph: '▼' },
  zap: { name: 'SHRINK RAY', color: '#b388ff', glyph: 'ϟ' },
};

export const ITEM_IDS = Object.keys(ITEMS);

// r = 0 for the leader, 1 for last place.
export function itemWeights(r, fieldSize) {
  if (fieldSize <= 1) return { boost: 5, shield: 1, oil: 1, rocket: 0, mallet: 0, zap: 0 };
  return {
    boost: 1 + 3.2 * r,
    rocket: r === 0 ? 0.3 : 1 + 2.2 * r,
    oil: 0.5 + 3 * (1 - r),
    shield: 0.5 + 2.4 * (1 - r),
    mallet: 0.8 + 1.6 * (1 - Math.abs(2 * r - 1)),
    zap: r > 0.5 ? 4.5 * (r - 0.5) : 0,
  };
}

export function rollItem(r, fieldSize, rnd = Math.random) {
  const w = itemWeights(r, fieldSize);
  let total = 0;
  for (const k of ITEM_IDS) total += w[k];
  let x = rnd() * total;
  for (const k of ITEM_IDS) { x -= w[k]; if (x <= 0) return k; }
  return 'boost';
}

export const TUNING = {
  boostT: 1.7, shieldT: 7, spinT: 1.1, oilSpinT: 0.9, squashT: 2.6, shrinkT: 3.5,
  rocketSpeed: 56, rocketLife: 4, oilLife: 25, malletR: 9.5, boxRespawn: 5,
};

// Where a rocket is `age` seconds after launch. It rides the lap at a fixed
// lateral offset, so every client computes the same path from the launch event.
export function rocketPos(track, hz, age) {
  return track.pointAt(hz.s + TUNING.rocketSpeed * age, hz.lat);
}

// What a tank fires. A shell flies dead straight from the barrel for `life`
// seconds, so its path is known from the shot alone. `reload` is seconds
// between shots; a hit spins the tank for `spinT` and leaves it `slow` of its speed.
export const SHELL = { name: 'SHELL', color: '#7d8f3c', glyph: '◉', speed: 60, life: 0.9, reload: 1.4, spinT: 0.6, slow: 0.5, reach: 2.1 };

export function shellPos(hz, age, out = {}) {
  out.x = hz.x + Math.sin(hz.h) * SHELL.speed * age;
  out.z = hz.z + Math.cos(hz.h) * SHELL.speed * age;
  return out;
}
