// Snooker Table: baize, cushions, brass pocket corners.

import { speckle, mapper } from './paint.js';

function drawBaize(world) {
  return (g, w, h) => {
    const { k, X, Z } = mapper(world, w);
    g.fillStyle = '#1b8a4a'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 16000, ['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.07)', 'rgba(120,255,170,0.05)'], 2);
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(X(-58), 0); g.lineTo(X(-58), h); g.stroke();
    g.beginPath(); g.arc(X(-58), Z(0), 13 * k, Math.PI / 2, -Math.PI / 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.6)';
    for (const x of [0, 45, 80]) { g.beginPath(); g.arc(X(x), Z(0), 3, 0, 7); g.fill(); }
  };
}

export default {
  theme: { bg: '#1c1016', sky: '#f4f1e4', ground: '#1d4a30', sun: '#fff6e0', dust: '#d6f0e0' },

  // Chalk lines down each side.
  ribbon(g, w, h) {
    g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(0, 0, w, h);
    for (const x of [1, w - 9]) {
      g.fillStyle = 'rgba(240,250,255,0.85)'; g.fillRect(x, 0, 8, h);
      for (let i = 0; i < 60; i++) { g.clearRect(x + Math.random() * 8, Math.random() * h, 2, 2); }
    }
  },

  models: {},

  build({ plane, box, lam, tex, world, w, d, hx, hz }) {
    plane(w, d, 0, lam({ map: tex(1024, 512, drawBaize(world), { clampEdge: true }) }));
    const cushion = lam({ color: '#157a3f' }), wood = lam({ color: '#6b3a1c' }), brass = lam({ color: '#c9a23f' });
    const gap = 8, cw = 5, ch = 2.4;
    for (const sz of [-1, 1]) {
      for (const sx of [-1, 1]) box(hx - gap * 1.5, ch, cw, sx * (hx + gap * 0.5) / 2 + sx * 0.25 * gap, ch / 2, sz * (hz + cw / 2), cushion);
      box(w + 34, 3.4, 12, 0, 1.7, sz * (hz + cw + 6), wood);
    }
    for (const sx of [-1, 1]) {
      box(cw, ch, d - gap * 2, sx * (hx + cw / 2), ch / 2, 0, cushion);
      box(12, 3.4, d + 10, sx * (hx + cw + 6), 1.7, 0, wood);
      for (const sz of [-1, 1]) box(9, 3.6, 9, sx * (hx + 3), 1.8, sz * (hz + 3), brass);
    }
    box(w + 20, 30, d + 20, 0, -15.2, 0, wood, false);
    plane(1600, 1600, -70, lam({ color: '#4a2733' })).receiveShadow = false;
  },
};
