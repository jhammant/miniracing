// Bedroom Rug: a play rug with a town printed on it and a proper tarmac road.

import { speckle, seeded, mapper } from './paint.js';
import { skirting } from './shell.js';

function drawRug(world) {
  return (g, w, h) => {
    const { k, X, Z } = mapper(world, w), { track } = world;
    g.fillStyle = '#7f93c9'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 9000, ['rgba(255,255,255,0.06)', 'rgba(0,0,40,0.07)'], 2);
    const m = 5 * k, r = 10 * k;
    const rr = (inset, fill) => { g.fillStyle = fill; g.beginPath(); g.roundRect(m + inset, m + inset, w - 2 * (m + inset), h - 2 * (m + inset), r); g.fill(); };
    // Fringe, border, then the printed town.
    g.strokeStyle = '#f3e7c9'; g.lineWidth = 2;
    for (let y = m + r; y < h - m - r; y += 5) { g.beginPath(); g.moveTo(m - 9, y); g.lineTo(m, y); g.moveTo(w - m, y); g.lineTo(w - m + 9, y); g.stroke(); }
    rr(0, '#f3e7c9'); rr(7, '#e8503a'); rr(12, '#f3e7c9'); rr(16, '#78c462');
    speckle(g, w, h, 5000, ['rgba(255,255,255,0.05)', 'rgba(0,60,0,0.06)'], 2);
    // Printed trees and flowers, kept clear of the road.
    const rnd = seeded(7);
    for (let i = 0; i < 260; i++) {
      const x = (rnd() * 2 - 1) * (world.hx - 12), z = (rnd() * 2 - 1) * (world.hz - 12);
      const j = track.locate(x, z);
      if (Math.hypot(x - track.sx[j], z - track.sz[j]) < track.hw + 4) continue;
      const px = X(x), pz = Z(z);
      if (i % 3 === 0) {
        g.fillStyle = '#3f9a4b'; g.beginPath(); g.arc(px, pz, 9, 0, 7); g.fill();
        g.fillStyle = '#5cb85c'; g.beginPath(); g.arc(px - 2, pz - 2, 5, 0, 7); g.fill();
      } else {
        g.fillStyle = ['#fff', '#ffd23f', '#ff8fab'][i % 3]; g.beginPath(); g.arc(px, pz, 2.5, 0, 7); g.fill();
      }
    }
  };
}

export default {
  theme: { bg: '#2b2440', sky: '#fff0f6', ground: '#6e7fb0', sun: '#fff2e2', dust: '#e9e2f5' },

  ribbon(g, w, h) {
    g.fillStyle = '#5d6373'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 500, ['rgba(255,255,255,0.06)', 'rgba(0,0,0,0.08)'], 2);
    g.fillStyle = '#f5f5f5'; g.fillRect(3, 0, 5, h); g.fillRect(w - 8, 0, 5, h);
    g.fillStyle = '#ffd23f'; g.fillRect(w / 2 - 2, 0, 4, h / 2);
  },

  models: {},

  build(kit) {
    const { plane, lam, tex, world, w, d } = kit;
    plane(w, d, 0, lam({ map: tex(1024, Math.round(1024 * d / w), drawRug(world), { clampEdge: true }) }));
    skirting(kit, { skirt: '#fff6ea', wall: '#f6c9d8' });
  },
};
