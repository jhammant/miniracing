// Garden Path: warm flagstones, striped lawn and a busy potting corner.

import { kit } from '../models.js';
import { mapper, seeded, speckle } from './paint.js';

const { THREE, HALF, TAU, box, cyl, sphere, torus, disc, ring, lathe, gable, blobGeo, mat, add, lay, sized } = kit;
const LEAF = '#3e813d', DARK = '#286038', SOIL = '#674635', CLAY = '#bc6243', CREAM = '#fff4cf';

function flower(g, x, y, z, color, r = 0.7) {
  for (let i = 0; i < 6; i++) {
    const a = i * TAU / 6;
    sized(add(g, sphere(r * 0.55, 6, 4), mat(color), x + Math.cos(a) * r * 0.7, y, z + Math.sin(a) * r * 0.7), 1, 0.45, 1);
  }
  add(g, cyl(r * 0.35, r * 0.35, 0.15, 8), mat('#f3bb38'), x, y + 0.1, z);
}

function drawLawn(world) {
  return (g, w, h) => {
    const { X, Z, k } = mapper(world, w), rnd = seeded(23);
    g.fillStyle = '#609744'; g.fillRect(0, 0, w, h);
    for (let x = -world.hx; x < world.hx; x += 24) {
      g.fillStyle = '#6ba14a'; g.fillRect(X(x), 0, 12 * k, h);
    }
    speckle(g, w, h, 14000, ['rgba(235,255,170,0.10)', 'rgba(28,77,25,0.10)'], 1.5);
    // Soil follows the flower beds; it never muddies the stone racing line.
    const soil = (pts) => {
      g.beginPath(); pts.forEach(([x, z], i) => i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)));
      g.closePath(); g.fillStyle = '#78543b'; g.fill();
      g.strokeStyle = '#b18a59'; g.lineWidth = 1.2 * k; g.stroke();
    };
    soil([[-72, -38], [-92, -24], [-99, -8], [-84, 9], [-72, -3], [-51, -17], [-56, -28]]);
    soil([[-48, -73], [13, -73], [13, -58], [-43, -57]]);
    soil([[20, -77], [91, -77], [88, -56], [21, -57]]);
    for (const p of world.props) {
      if (!['gdnTree', 'gdnShrub', 'gdnPot', 'gdnBirdBath'].includes(p.m)) continue;
      g.fillStyle = '#7d5a3b'; g.beginPath(); g.ellipse(X(p.x), Z(p.z), (p.spec.r + 0.7) * k, (p.spec.r + 0.7) * k, 0, 0, TAU); g.fill();
    }
    for (let i = 0; i < 500; i++) {
      const x = (rnd() * 2 - 1) * (world.hx - 6), z = (rnd() * 2 - 1) * (world.hz - 6);
      const j = world.track.locate(x, z);
      if (Math.hypot(x - world.track.sx[j], z - world.track.sz[j]) < world.track.hw + 3) continue;
      g.fillStyle = i % 4 ? '#80b75b' : '#d9df9e';
      g.fillRect(X(x), Z(z), k * 0.35, k * 0.65);
    }
  };
}

export default {
  theme: { bg: '#344e39', sky: '#eaf7e8', ground: '#60733f', sun: '#fff2cd', dust: '#e4d8ae' },

  ribbon(g, w, h) {
    g.fillStyle = '#ad9c7c'; g.fillRect(0, 0, w, h);
    const colors = ['#e9dec1', '#e2d5b5', '#f0e4c9', '#dfd3b7'];
    for (let y = 0; y < 4; y++) for (let x = -1; x < 3; x++) {
      g.fillStyle = colors[(x + y + 5) % colors.length];
      g.fillRect(9 + x * 55 + (y % 2) * 27.5, y * 32 + 1.5, 52, 29);
    }
    for (const x of [0, w - 8]) {
      g.fillStyle = '#85513c'; g.fillRect(x, 0, 8, h);
      for (let y = 0; y < h; y += 16) { g.fillStyle = '#bd7b55'; g.fillRect(x + 1, y + 1, 6, 14); }
    }
    speckle(g, w, h, 160, ['rgba(255,255,255,0.14)', 'rgba(99,75,45,0.08)'], 1);
  },

  cut(g, w, h) {
    g.fillStyle = 'rgba(183,147,91,0.75)'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 42) {
      g.fillStyle = '#e5d6b5'; g.beginPath(); g.roundRect(20, y + 4, w - 40, 32, 7); g.fill();
    }
    g.fillStyle = '#e5bb59'; g.fillRect(3, 0, 4, h); g.fillRect(w - 7, 0, 4, h);
  },

  models: {
    gdnPot({ color = '#e77a9a' }) {
      const g = new THREE.Group();
      add(g, lathe('gdnPot', [[0, 0], [2.4, 0], [3.15, 4.6], [3.4, 4.7], [3.4, 5.2], [2.95, 5.2], [2.95, 4.7]], 12), mat(CLAY));
      lay(g, disc(2.95, 12), mat(SOIL), 0, 4.8);
      for (const [x, z, h] of [[-1.3, -0.7, 6.4], [1.2, -0.5, 6.8], [0, 1.3, 6.1]]) {
        add(g, cyl(0.15, 0.15, h - 4.8, 6), mat(LEAF), x, (h + 4.8) / 2, z);
        flower(g, x, h, z, color, 1.05);
      }
      return g;
    },

    gdnSunflower() {
      const g = new THREE.Group();
      add(g, cyl(0.27, 0.4, 7.4, 7), mat(LEAF), 0, 3.7, 0);
      for (const s of [-1, 1]) sized(add(g, sphere(1, 8, 4), mat(LEAF), s * 0.9, 3.4 + s * 0.7, 0, 0, s * 0.4, s * -0.4), 1.3, 0.2, 0.65);
      for (let i = 0; i < 10; i++) {
        const a = i * TAU / 10;
        sized(add(g, sphere(0.75, 8, 4), mat(i % 2 ? '#ffc93d' : '#ffdf64'), Math.sin(a) * 1.55, 7.55, Math.cos(a) * 1.55, 0, a), 0.6, 0.35, 1.1);
      }
      add(g, cyl(1.05, 1.15, 0.5, 12), mat('#6c4525'), 0, 7.6, 0);
      for (let i = 0; i < 7; i++) {
        const a = i * TAU / 7;
        add(g, cyl(0.12, 0.12, 0.06, 5), mat('#b88a43'), Math.sin(a) * 0.62, 7.88, Math.cos(a) * 0.62);
      }
      return g;
    },

    gdnGnome() {
      const g = new THREE.Group();
      for (const s of [-1, 1]) sized(add(g, sphere(1, 8, 6), mat('#4d3731'), s * 1.05, 0.65, 0.55), 1, 0.65, 1.45);
      add(g, cyl(1.35, 2.1, 3.3, 10), mat('#3b80a0'), 0, 2.3, 0);
      add(g, sphere(1.45, 10, 6), mat('#efc59a'), 0, 4.6, 0);
      sized(add(g, sphere(1.3, 8, 6), mat(CREAM), 0, 3.9, 0.95), 0.85, 1.2, 0.5);
      add(g, sphere(0.43, 8, 6), mat('#e8ad83'), 0, 4.7, 1.4);
      for (const s of [-1, 1]) add(g, sphere(0.13, 6, 4), mat('#292c37'), s * 0.52, 5.1, 1.21);
      add(g, cyl(0, 1.65, 3.1, 10), mat('#d94742'), 0, 7, 0);
      return g;
    },

    gdnWateringCan() {
      const g = new THREE.Group(), enamel = mat('#4e9fa3', { gloss: 24 });
      add(g, cyl(2.75, 2.5, 4.8, 12), enamel, -1.1, 2.5, 0);
      add(g, torus(2, 0.3, 5, 12), enamel, -1.1, 5, 0);
      add(g, cyl(0.58, 0.95, 4.7, 8), enamel, 2.45, 3.9, 0, 0, 0, -0.75);
      add(g, cyl(1.25, 0.65, 0.6, 10), mat('#e7cf98'), 4.2, 5.5, 0, 0, 0, -0.75);
      for (let i = -1; i <= 1; i++) add(g, sphere(0.1, 6, 4), mat('#49656c'), 4.5, 5.8, i * 0.55);
      return g;
    },

    gdnBirdBath() {
      const g = new THREE.Group(), stone = mat('#d6ccae');
      add(g, cyl(2.4, 3, 0.6, 12), stone, 0, 0.3, 0);
      add(g, cyl(1.1, 1.6, 3.7, 10), stone, 0, 2.2, 0);
      add(g, lathe('gdnBirdBath', [[0, 3.8], [2.1, 3.8], [4.9, 5.2], [4.9, 5.6], [4.5, 5.6], [3.4, 4.8], [0, 4.8]], 16), stone);
      lay(g, disc(3.9, 20), mat('#74bfca', { gloss: 60 }), 0, 5.05);
      lay(g, ring(1.7, 1.8, 20), mat('#c3e8dd'), 0, 5.07);
      sized(add(g, sphere(0.65, 8, 6), mat('#7794aa'), 3.7, 6, 1.3), 0.75, 0.8, 1);
      add(g, sphere(0.38, 8, 6), mat('#abc7d5'), 3.7, 6.6, 1.6);
      add(g, cyl(0, 0.17, 0.5, 5), mat('#e7af4f'), 3.7, 6.5, 2, HALF);
      return g;
    },

    gdnTree() {
      const g = new THREE.Group();
      add(g, cyl(0.8, 1.3, 5, 8), mat('#886041'), 0, 2.5, 0);
      for (const [x, y, z, r] of [[-2.7, 6, 0, 3], [2.4, 6.4, 0.8, 3.2], [0, 6.9, -2.5, 3], [0, 7, 1.8, 3.4]]) {
        sized(add(g, sphere(r, 8, 6), mat(x > 0 ? '#6fa145' : '#508d40'), x, y, z), 1, 0.7, 1);
      }
      for (const [x, y, z] of [[-3, 5.5, 2.4], [2.5, 5.5, 3], [3.5, 7.2, 0], [-1, 7.8, -2]]) add(g, sphere(0.55, 8, 6), mat('#df6550'), x, y, z);
      return g;
    },

    gdnShrub() {
      const g = new THREE.Group();
      for (const [x, z, r] of [[-1.5, 0, 2], [1.3, 0.7, 2.3], [0, -1.3, 2.3]]) {
        sized(add(g, sphere(r, 8, 6), mat(x < 0 ? DARK : LEAF), x, 2.6, z), 1, 1.1, 1);
      }
      for (const [x, z] of [[-1.5, 0.6], [1.5, 1.2], [0, -1.5]]) flower(g, x, 4.3, z, '#d5a4c9', 0.55);
      return g;
    },

    gdnPole() {
      const g = new THREE.Group();
      add(g, cyl(1.3, 1.3, 0.4, 10), mat('#a59e88'), 0, 0.2, 0);
      add(g, cyl(0.32, 0.42, 8.5, 8), mat('#7b928a'), 0, 4.25, 0);
      add(g, box(0.4, 0.4, 2.6), mat('#ccdbbd'), 0, 8, 0);
      add(g, sphere(0.5, 8, 4), mat('#eee4bc'), 0, 8.7, 0);
      return g;
    },

    gdnLaundry() {
      const g = new THREE.Group();
      for (const z of [-0.9, 0.9]) {
        add(g, box(26, 0.07, 0.07), mat('#e5dcc1'), 0, 7.9, z);
        for (let i = 0; i < 4; i++) {
          const x = -8.7 + i * 5.6, color = ['#e5afac', '#eee6cf', '#82b8c4', '#ead17d'][i];
          add(g, box(3.5, 3.2, 0.12), mat(color), x, 6.2, z);
          for (const s of [-1, 1]) add(g, box(0.22, 0.55, 0.25), mat(CLAY), x + s * 1.2, 7.8, z);
          add(g, box(3.5, 0.22, 0.15), mat(CREAM), x, 5, z);
        }
      }
      return g;
    },

    gdnWheelbarrow() {
      const g = new THREE.Group(), steel = mat('#647b70'), green = mat('#78a068');
      add(g, cyl(1.5, 1.5, 0.8, 12), mat('#363b34'), 0, 1.5, 4.4, 0, 0, HALF);
      add(g, cyl(0.6, 0.6, 0.84, 8), mat('#d6b87a'), 0, 1.5, 4.4, 0, 0, HALF);
      add(g, box(6.4, 0.5, 6), green, 0, 2.6, 0);
      for (const s of [-1, 1]) {
        add(g, box(0.4, 2.3, 6.3), green, s * 3.1, 3.7, 0, 0, 0, -s * 0.1);
        add(g, box(0.35, 0.35, 9.4), steel, s * 2, 1.8, -1.1, -0.12);
        add(g, box(0.6, 0.6, 1.8), mat('#d2b07c'), s * 2, 2.35, -5.1);
        add(g, box(0.4, 2.7, 0.4), steel, s * 2.4, 1.35, -2.1);
        add(g, box(6.6, 2.3, 0.4), green, 0, 3.7, s * 3);
      }
      add(g, sphere(2.3, 8, 4), mat(SOIL), 0, 2.8, 0);
      return g;
    },

    gdnShed() {
      const g = new THREE.Group(), wood = mat('#839a82'), trim = mat('#eee2bd');
      add(g, box(19, 6.6, 12), wood, 0, 3.3, 0);
      for (let x = -9; x <= 9; x += 2) add(g, box(0.13, 6.6, 0.08), mat('#657b64'), x, 3.3, 6.04);
      add(g, gable(20, 2.5, 13), mat('#596f62'), 0, 6.6, 0);
      add(g, box(5.6, 6, 0.25), trim, -3.8, 3, 6.1);
      add(g, box(4.8, 5.5, 0.3), mat('#9b6f49'), -3.8, 2.9, 6.2);
      add(g, sphere(0.25, 6, 4), mat('#d8b357'), -2.3, 3, 6.45);
      add(g, box(4, 3.4, 0.2), trim, 4.5, 4, 6.1);
      add(g, box(3.4, 2.8, 0.2), mat('#99c8cb'), 4.5, 4, 6.25);
      add(g, box(0.2, 2.8, 0.25), trim, 4.5, 4, 6.3);
      add(g, box(3.4, 0.2, 0.25), trim, 4.5, 4, 6.3);
      return g;
    },

    gdnBee() {
      const g = new THREE.Group();
      sized(add(g, sphere(1.55, 10, 6), mat('#f4c747'), 0, 3.1, 0), 0.85, 0.85, 1.35);
      for (const z of [-0.8, 0.3]) add(g, torus(1.3, 0.23, 5, 12), mat('#403b33'), 0, 3.1, z);
      add(g, sphere(0.85, 10, 6), mat('#403b33'), 0, 3.1, 1.55);
      for (const s of [-1, 1]) {
        sized(add(g, sphere(1, 8, 4), mat('#effaf2', { see: 0.8 }), s * 1.45, 4.35, -0.1, 0, s * 0.4), 0.95, 0.18, 1.5);
        add(g, sphere(0.22, 6, 4), mat(CREAM), s * 0.37, 3.45, 2.25);
      }
      return g;
    },

    gdnButterfly() {
      const g = new THREE.Group();
      sized(add(g, sphere(0.45, 8, 6), mat('#624455'), 0, 2.7, 0), 0.7, 0.7, 3.8);
      for (const s of [-1, 1]) for (const z of [-0.8, 0.8]) {
        sized(add(g, sphere(1, 8, 6), mat(z > 0 ? '#dc8bcb' : '#ac7bc2'), s * 1.2, 3, z, 0, s * 0.3, s * 0.25), 1.15, 0.18, 0.95);
        add(g, cyl(0.3, 0.3, 0.08, 8), mat('#ffe8a7'), s * 1.5, 3.3, z);
      }
      return g;
    },

    gdnPond() {
      const g = new THREE.Group();
      sized(lay(g, blobGeo(10.5, 31), mat('#b1a082')), 1, 1, 0.72);
      sized(lay(g, blobGeo(9.2, 31), mat('#468f99', { gloss: 70 }), 0, 0.04), 1, 1, 0.72);
      for (const [x, z, r] of [[-4, 1, 1.5], [-1.5, 2.5, 1.2], [4, -1.7, 1.4]]) {
        lay(g, disc(r, 10), mat('#85b453'), x, 0.08, z);
        add(g, box(0.07, 0.02, r), mat('#c2d785'), x, 0.1, z - r / 2);
      }
      flower(g, -4, 0.2, 1, '#f4b2cf', 0.65);
      return g;
    },

    gdnDaisies({ color = CREAM }) {
      const g = new THREE.Group();
      for (const [x, z] of [[-2, 0], [0, 1.5], [2, -0.6], [0, -2]]) {
        add(g, cyl(0.09, 0.09, 0.65, 5), mat(LEAF), x, 0.32, z);
        flower(g, x, 0.7, z, color, 0.65);
      }
      return g;
    },

    gdnHose() {
      const g = new THREE.Group(), rubber = mat('#cfad54');
      for (const r of [2.8, 3.5, 4.2]) add(g, torus(r, 0.28, 5, 20), rubber, 0, 0.3, 0, HALF);
      add(g, cyl(0.28, 0.28, 5.8, 7), rubber, 3.9, 0.3, 2.8, HALF, 0, -0.6);
      add(g, box(0.9, 0.7, 1.8), mat('#677c6e'), 5.6, 0.4, 5.2, 0, -0.6);
      return g;
    },

    gdnStone() {
      const g = new THREE.Group();
      sized(add(g, cyl(1.7, 2, 0.25, 6), mat('#c9bfa6'), 0, 0.13, 0), 1, 1, 0.7);
      return g;
    },
  },

  build({ plane, box, lam, tex, world, w, d, hx, hz }) {
    plane(w, d, 0, lam({ map: tex(1536, Math.round(1536 * d / w), drawLawn(world), { clampEdge: true }) }));
    const fence = lam({ color: '#b99868' }), rail = lam({ color: '#947747' });
    for (const s of [-1, 1]) {
      for (const y of [2.2, 5.2]) {
        box(w + 4, 0.8, 0.7, 0, y, s * (hz + 1), rail);
        box(0.7, 0.8, d, s * (hx + 1), y, 0, rail);
      }
      for (let x = -hx; x <= hx; x += 4) box(2.8, 6.4, 0.65, x, 3.2, s * (hz + 1.4), fence);
      for (let z = -hz; z <= hz; z += 4) box(0.65, 6.4, 2.8, s * (hx + 1.4), 3.2, z, fence);
    }
    plane(1600, 1600, -0.4, lam({ color: '#405c38' })).receiveShadow = false;
  },
};
