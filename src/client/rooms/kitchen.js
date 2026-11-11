// Kitchen Floor: chequered tiles and hazard tape down the road.

import { drawTiles } from './paint.js';
import { skirting } from './shell.js';

export default {
  theme: { bg: '#27323a', sky: '#f3fbff', ground: '#8a9aa3', sun: '#ffffff', dust: '#e6edf0' },

  ribbon(g, w, h) {
    g.fillStyle = 'rgba(40,70,100,0.16)'; g.fillRect(0, 0, w, h);
    for (const x of [0, w - 10]) {
      g.fillStyle = '#ffd23f'; g.fillRect(x, 0, 10, h);
      g.fillStyle = '#2b2b2b';
      for (let y = -16; y < h; y += 32) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 10, y + 10); g.lineTo(x + 10, y + 26); g.lineTo(x, y + 16); g.fill(); }
    }
  },

  models: {},

  build(kit) {
    const { plane, lam, tex, w, d } = kit;
    plane(w, d, 0, lam({ map: tex(256, 256, drawTiles('#f2ead9', '#a9c9cf', '#b3a892'), { repeat: [w / 44, d / 44] }) }));
    skirting(kit, { skirt: '#fbfbf6', wall: '#cfe6ea' });
  },
};
