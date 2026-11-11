// Canvas painting shared by the rooms: surfaces are drawn in code, not loaded.
// Nothing here touches the DOM until it is called, so the room modules also load in Node.

import * as THREE from 'three';

export function canvasTex(w, h, draw, { repeat, aniso = 1, clampEdge = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  if (!clampEdge) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; }
  if (repeat) tex.repeat.set(repeat[0], repeat[1]);
  return tex;
}

// n specks of `size` pixels in the given colours.
export function speckle(g, w, h, n, colors, size = 1) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[i % colors.length];
    g.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
}

// Two-colour chequered tiles with grout lines. Returns a painter.
export const drawTiles = (a, b, grout) => (g, w, h) => {
  const t = w / 2;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? a : b; g.fillRect(i * t, j * t, t, t); }
  speckle(g, w, h, 900, ['rgba(255,255,255,0.10)', 'rgba(0,0,0,0.05)'], 2);
  g.fillStyle = grout;
  for (let i = 0; i < 2; i++) { g.fillRect(i * t - 2, 0, 4, h); g.fillRect(0, i * t - 2, w, 4); }
  g.fillRect(w - 2, 0, 2, h); g.fillRect(0, h - 2, w, 2);
};

// The same numbers every time for a given seed: use it for anything scattered.
export const seeded = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// Painters that draw over the whole surface work in pixels: these turn world
// metres into canvas pixels for a canvas w wide covering the room.
export function mapper(world, w) {
  const k = w / (world.hx * 2);
  return { k, X: (x) => (x + world.hx) * k, Z: (z) => (z + world.hz) * k };
}
