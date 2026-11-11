// School Desk: worn oak, an open exercise book and a biro circuit.

import { kit } from '../models.js';
import { drawTiles, mapper, seeded } from './paint.js';

const { THREE, HALF, INK, STEEL, memo, geos, box, cyl, sphere, torus, disc, ring, quad, plan, slab,
  rounded, blobGeo, mat, add, lay, sized } = kit;

function pencil(color = '#e2ad32') {
  const g = new THREE.Group();
  add(g, cyl(0.75, 0.75, 15, 6), mat(color), 0, 0.8, -0.7, HALF);
  add(g, cyl(0, 0.75, 2, 6), mat('#e9c79b'), 0, 0.8, 7.7, HALF);
  add(g, cyl(0, 0.23, 0.6, 6), mat(INK), 0, 0.8, 8.7, HALF);
  add(g, cyl(0.78, 0.78, 1.2, 8), mat(STEEL, { gloss: 50 }), 0, 0.8, -7.8, HALF);
  add(g, cyl(0.76, 0.76, 1.1, 8), mat('#e99c9c'), 0, 0.8, -8.4, HALF);
  sized(lay(g, quad(), mat('#efd9a0'), 0, 1.46, -1.4), 0.2, 1, 5.8);
  return g;
}

function drawDesk(world) {
  return (g, w, h) => {
    const { k, X, Z } = mapper(world, w), rnd = seeded(17);
    g.fillStyle = '#bd925e'; g.fillRect(0, 0, w, h);
    g.save(); g.translate(X(0), Z(0)); g.scale(k, k);
    // Long grain, knots and old varnish scratches run along the desk.
    for (let i = 0; i < 180; i++) {
      const z = rnd() * 140 - 70, bend = rnd() * 1.6, start = rnd() * 70 - 110;
      g.strokeStyle = i % 3 ? 'rgba(99,60,30,0.13)' : 'rgba(255,224,168,0.26)';
      g.lineWidth = 0.1 + rnd() * 0.2; g.beginPath(); g.moveTo(start, z);
      g.bezierCurveTo(-25, z + bend, 30, z - bend, 110, z + bend); g.stroke();
    }
    for (const z of [-35, 0, 35]) {
      g.fillStyle = 'rgba(83,48,25,0.18)'; g.fillRect(-110, z, 220, 0.22);
      g.fillStyle = 'rgba(255,220,163,0.2)'; g.fillRect(-110, z + 0.22, 220, 0.18);
    }
    for (const [x, z] of [[-8, 16], [76, -29], [-72, 58], [4, -47]]) {
      for (let r = 1; r < 5; r++) {
        g.strokeStyle = 'rgba(91,55,27,0.17)'; g.lineWidth = 0.17;
        g.beginPath(); g.ellipse(x, z, r * 1.7, r * 0.35, 0, 0, Math.PI * 2); g.stroke();
      }
    }
    g.strokeStyle = '#825a34'; g.lineWidth = 0.8; g.strokeRect(-109, -69, 218, 138);
    g.strokeStyle = '#e1b47a'; g.lineWidth = 0.3; g.strokeRect(-108.3, -68.3, 216.6, 136.6);
    for (const x of [-105, 105]) for (const z of [-65, 65]) {
      g.fillStyle = '#7e6c49'; g.beginPath(); g.arc(x, z, 0.75, 0, 7); g.fill();
      g.strokeStyle = '#463e31'; g.lineWidth = 0.2; g.beginPath(); g.moveTo(x - 0.45, z + 0.25); g.lineTo(x + 0.45, z - 0.25); g.stroke();
    }
    // The pencil groove is a recess in the wood, not an extra barrier.
    g.fillStyle = '#8c6037'; g.beginPath(); g.roundRect(-61, -65, 63, 4.1, 2); g.fill();
    g.strokeStyle = '#e2b781'; g.lineWidth = 0.45; g.beginPath(); g.moveTo(-59, -60.8); g.lineTo(0, -60.8); g.stroke();
    g.font = 'italic 3.5px serif';
    g.fillStyle = '#ebc58f'; g.fillText('A.J.  +  M.R.', -22.7, -46.7);
    g.fillStyle = '#80542e'; g.fillText('A.J.  +  M.R.', -23, -47);
    g.font = 'bold 2px monospace'; g.fillStyle = '#6e4b2e'; g.fillText('CLASS 4   /   DESK 07', 56, 62);

    // Both pages stay flat so the road and the risky shortcut can cross them.
    g.translate(-62, -1);
    g.fillStyle = 'rgba(55,36,19,0.22)'; g.fillRect(-34, -32, 71, 66);
    g.fillStyle = '#395e55'; g.fillRect(-35, -33, 70, 66);
    g.fillStyle = '#d8d0b6'; g.fillRect(-34.5, -32.5, 69, 64.8);
    g.fillStyle = '#f5efd9'; g.fillRect(-34, -32, 34, 63.5);
    g.fillStyle = '#fff8e4'; g.fillRect(0, -32, 34, 63.5);
    g.strokeStyle = '#bdb99e'; g.lineWidth = 0.2;
    for (const z of [31.5, 32, 32.5]) { g.beginPath(); g.moveTo(-34, z); g.lineTo(34, z); g.stroke(); }
    g.strokeStyle = 'rgba(81,142,186,0.38)'; g.lineWidth = 0.18;
    for (let z = -21; z < 29; z += 4.5) {
      for (const x of [-33, 1]) { g.beginPath(); g.moveTo(x, z); g.lineTo(x + 32, z); g.stroke(); }
    }
    g.strokeStyle = 'rgba(196,76,79,0.68)';
    for (const x of [-27, 7]) { g.beginPath(); g.moveTo(x, -31); g.lineTo(x, 30); g.stroke(); }
    const fold = g.createLinearGradient(-2, 0, 2, 0);
    fold.addColorStop(0, 'rgba(93,77,49,0)'); fold.addColorStop(0.5, 'rgba(93,77,49,0.2)'); fold.addColorStop(1, 'rgba(93,77,49,0)');
    g.fillStyle = fold; g.fillRect(-2, -32, 4, 63.5);
    g.font = 'bold 2px monospace'; g.fillStyle = '#46698d'; g.fillText('EXERCISE BOOK', -30, -26);
    g.font = 'italic 2.4px cursive'; g.fillText('4 x 4 = 16', 10, -23); g.fillText('Tank club', -24, 26);
    g.strokeStyle = '#c96d5a'; g.lineWidth = 0.3; g.beginPath(); g.moveTo(10, -18); g.lineTo(13, -16); g.lineTo(18, -21); g.stroke();
    g.strokeStyle = '#607f9b'; g.strokeRect(14, 18, 9, 6); g.strokeRect(16, 19.5, 5, 3);
    g.beginPath(); g.moveTo(18.5, 19.5); g.lineTo(18.5, 15); g.stroke();
    g.restore();
  };
}

export default {
  theme: { bg: '#3c392f', sky: '#fff2d8', ground: '#9d835f', sun: '#fff2d5', dust: '#d7bd8c' },

  ribbon(g, w, h) {
    g.fillStyle = 'rgba(247,240,215,0.7)'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#355889'; g.fillRect(3, 0, 5, h); g.fillRect(w - 8, 0, 5, h);
    g.fillStyle = 'rgba(53,88,137,0.4)'; g.fillRect(11, 0, 1.5, h); g.fillRect(w - 12.5, 0, 1.5, h);
    g.fillRect(w / 2 - 1, 10, 2, h / 3);
  },

  cut(g, w, h) {
    g.fillStyle = 'rgba(246,208,83,0.35)'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#bd6956';
    for (const x of [3, w - 7]) for (let y = 0; y < h; y += 32) g.fillRect(x, y, 4, 18);
  },

  models: {
    deskPencil(o) { return pencil(o.color); },

    // A well-used stub fits the round colliders supported by moving hazards.
    deskPencilStub() {
      const g = new THREE.Group(), p = pencil('#d6a431');
      p.scale.set(1.75, 1.75, 0.33); p.rotation.y = -Math.PI / 4; g.add(p);
      return g;
    },

    deskEraser() {
      const g = new THREE.Group();
      add(g, rounded(6, 3.6, 0.5, 1.6), mat('#e7a7a0'));
      add(g, box(3.4, 1.66, 3.65), mat('#f1ead7'), -0.5, 0.83);
      sized(lay(g, quad(), mat('#3c6e8b'), -0.5, 1.67, -0.6), 2.6, 1, 0.5);
      sized(lay(g, quad(), mat('#a7b9b1'), -0.5, 1.67, 0.3), 1.8, 1, 0.22);
      return g;
    },

    deskSharpener() {
      const g = new THREE.Group(), metal = mat('#9ba9ae', { gloss: 65 });
      add(g, box(4.6, 2.8, 5.6), metal, 0, 1.4);
      add(g, box(3.4, 0.12, 4.7), mat('#dde4de', { gloss: 90 }), 0.25, 2.87);
      add(g, box(0.28, 0.14, 4.4), mat('#4f5c63'), -0.5, 2.9);
      add(g, cyl(0.48, 0.48, 0.12, 10), metal, 0.55, 3, 0.3);
      add(g, box(0.65, 0.03, 0.11), mat('#40515a'), 0.55, 3.07, 0.3);
      add(g, disc(1.05, 12), mat('#30383b'), 0, 1.35, 2.81, HALF);
      add(g, torus(1.05, 0.13, 4, 12), mat('#e6d0a6'), 0, 1.35, 2.85);
      for (const x of [-2.31, 2.31]) for (let z = -1.8; z <= 1.8; z += 0.6) add(g, box(0.04, 1.4, 0.12), mat('#64767d'), x, 1.4, z);
      return g;
    },

    deskShavings() {
      const g = new THREE.Group(), rnd = seeded(29);
      for (let i = 0; i < 9; i++) {
        const x = (rnd() - 0.5) * 7, z = (rnd() - 0.5) * 6;
        add(g, torus(0.55 + rnd() * 0.35, 0.13, 3, 8, Math.PI * 1.5), mat(i % 3 ? '#e4bd80' : '#c89b36'), x, 0.25, z, HALF, 0, rnd() * 6.3);
        add(g, box(0.2, 0.1, 0.35), mat('#5e5344'), x + 0.3, 0.08, z + 0.4);
      }
      return g;
    },

    deskCase() {
      const g = new THREE.Group();
      add(g, rounded(24, 9, 2, 3.5), mat('#376c72'));
      add(g, rounded(22.8, 7.8, 1.7, 0.5), mat('#4b8486'), 0, 3.5);
      add(g, box(21, 0.12, 0.48), mat('#263e45'), 0, 4.05);
      for (let x = -10; x <= 10; x += 0.7) add(g, box(0.22, 0.14, 0.55), mat('#d7bd77'), x, 4.12);
      lay(g, rounded(5.4, 2.3, 0.3), mat('#eee4c9'), -4.5, 4.02, 2.3);
      for (let i = 0; i < 3; i++) sized(lay(g, quad(), mat('#637b80'), -4.5, 4.04, 1.7 + i * 0.5), 3.4 - i * 0.5, 1, 0.16);
      add(g, torus(0.65, 0.15, 4, 10), mat(STEEL, { gloss: 70 }), 10.6, 4.25, 0.6, HALF);
      return g;
    },

    deskProtractor() {
      const g = new THREE.Group();
      const outline = [[-7, 3.5], [7, 3.5], ...Array.from({ length: 25 }, (_, i) => [7 * Math.cos(i * Math.PI / 24), 3.5 - 7 * Math.sin(i * Math.PI / 24)])];
      lay(g, memo(geos, 'deskProtractor', () => slab(plan(outline), 0.22)), mat('#c1d6d5', { see: 0.7 }), 0, 0);
      add(g, box(14, 0.25, 0.3), mat('#79a7ae'), 0, 0.13, 3.35);
      for (let i = 0; i <= 18; i++) {
        const a = i * Math.PI / 18, r = 6.4;
        sized(lay(g, quad(), mat('#3b6778'), Math.cos(a) * r, 0.25, 3.5 - Math.sin(a) * r, a - HALF), 0.1, 1, i % 3 ? 0.55 : 1);
      }
      lay(g, ring(0.3, 0.45, 12), mat('#3b6778'), 0, 0.26, 2.8);
      return g;
    },

    deskSetSquare() {
      const g = new THREE.Group();
      const shape = memo(geos, 'deskSetSquare', () => slab(plan([[-5, -6], [-5, 6], [5, 6]], [[[-3.5, -1.7], [1.5, 4.5], [-3.5, 4.5]]]), 0.3));
      add(g, shape, mat('#e2bf63', { see: 0.8 }));
      for (let i = 0; i < 11; i++) sized(lay(g, quad(), mat('#806732'), -4.5, 0.31, -4.5 + i * 0.9), i % 2 ? 0.45 : 0.85, 1, 0.1);
      return g;
    },

    deskCompass() {
      const g = new THREE.Group();
      for (const s of [-1, 1]) {
        add(g, box(0.5, 0.35, 10.8), mat(s < 0 ? '#aeb9bb' : '#3c6584', { gloss: 45 }), s * 1.3, 0.4, 0.1, 0, s * 0.25);
        add(g, cyl(0, 0.3, 1.4, 6), mat('#64727b'), s * 2.65, 0.4, 5.4, HALF);
      }
      add(g, cyl(0.7, 0.7, 0.5, 12), mat('#d5dbd1', { gloss: 60 }), 0, 0.5, -5.1);
      add(g, box(0.7, 0.5, 1.2), mat('#3c6584'), 0, 0.6, -5.7);
      return g;
    },

    deskGlue() {
      const g = new THREE.Group();
      add(g, cyl(2.1, 2.1, 6.2, 14), mat('#efe7cb'), 0, 3.1);
      add(g, cyl(2.2, 2.2, 1.1, 14), mat('#d65a40'), 0, 0.55);
      add(g, cyl(2.15, 2.15, 1.6, 14), mat('#d65a40'), 0, 6.8);
      add(g, cyl(2.12, 2.12, 1.8, 14, true), mat('#e5b83d'), 0, 3.5);
      lay(g, disc(1.6, 14), mat('#e57b59'), 0, 7.61);
      return g;
    },

    deskApple() {
      const g = new THREE.Group();
      sized(add(g, sphere(4, 12, 10), mat('#c9513b'), 0, 3.7), 1, 0.92, 0.94);
      sized(add(g, sphere(1, 8, 6), mat('#e98151'), -1.25, 6.3, 1), 1, 0.45, 0.7);
      add(g, cyl(0.2, 0.3, 1.4, 6), mat('#765033'), 0, 7.3, 0, 0.25);
      const leaf = memo(geos, 'deskAppleLeaf', () => slab(plan([[0, 0], [1.1, -1], [2.6, -0.8], [1.6, 0.4]]), 0.06));
      add(g, leaf, mat('#66814a'), 0, 7.6);
      return g;
    },

    deskInk() {
      const g = new THREE.Group();
      lay(g, blobGeo(4.2, 15, 0.025, 22, 0.18), mat('#252e56', { gloss: 80 }), 0, 0.02);
      lay(g, blobGeo(1.6, 8, 0, 12, 0.15), mat('#495686', { gloss: 100, decal: 2 }), -0.7, 0.05, -0.7);
      for (const [x, z, r] of [[4.4, 1.5, 0.4], [-3.8, -2.6, 0.55], [2.1, -4.2, 0.3]]) lay(g, disc(r, 8), mat('#252e56'), x, 0.04, z);
      return g;
    },

    deskTape() {
      const g = new THREE.Group();
      lay(g, rounded(4, 10, 0.12, 0.04), mat('#d8bc79', { gloss: 60, see: 0.78 }), 0, 0.02);
      for (const x of [-1.8, 1.8]) sized(lay(g, quad(), mat('#f4dfaa', { decal: 1 }), x, 0.07), 0.13, 1, 9.8);
      for (let z = -4; z <= 4; z += 2) sized(lay(g, quad(), mat('#f6e8bc', { see: 0.45 }), -0.5, 0.075, z, 0.3), 0.8, 1, 0.16);
      return g;
    },

    deskClip() {
      const g = new THREE.Group(), wire = mat('#a8b8bd', { gloss: 80 });
      for (const [r, z, a] of [[0.7, -1, Math.PI], [0.7, 1, 0], [0.4, -0.65, Math.PI]]) add(g, torus(r, 0.12, 4, 10, Math.PI), wire, 0, 0.16, z, HALF, 0, a);
      for (const [x, length, z] of [[-0.7, 2, 0], [0.7, 2, 0], [-0.4, 1.5, 0.1], [0.4, 1.2, -0.1]]) add(g, cyl(0.12, 0.12, length, 6), wire, x, 0.16, z, HALF);
      return g;
    },

    deskPin(o) {
      const g = new THREE.Group();
      add(g, cyl(0.08, 0.08, 0.55, 6), mat(STEEL), 0, 0.28);
      add(g, cyl(0.9, 0.8, 0.25, 12), mat(o.color || '#d35848', { gloss: 60 }), 0, 0.65);
      lay(g, disc(0.27, 8), mat('#f1c7a4'), -0.25, 0.79, -0.25);
      return g;
    },

    deskInkwell() {
      const g = new THREE.Group();
      lay(g, disc(4.2, 24), mat('#171d2b'), 0, 0.025);
      lay(g, ring(4, 4.6, 24), mat('#806c4c', { gloss: 45 }), 0, 0.04);
      lay(g, ring(4.55, 4.8, 24), mat('#dbc99b'), 0, 0.045);
      lay(g, disc(2.3, 20), mat('#28344b', { gloss: 90 }), 0.4, 0.035, 0.5);
      return g;
    },
  },

  build({ plane, box, lam, tex, world, w, d, hx, hz }) {
    plane(w, d, 0, lam({ map: tex(1536, Math.round(1536 * d / w), drawDesk(world), { clampEdge: true }) }));
    const oak = lam({ color: '#916238' }), edge = lam({ color: '#b3844f' }), steel = lam({ color: '#425452' });
    box(w + 0.4, 4, d + 0.4, 0, -2.1, 0, edge, false);
    box(w - 6, 12, 3, 0, -10, -hz + 5, oak);
    for (const x of [-hx + 5, hx - 5]) box(3, 12, d - 10, x, -10, 0, oak);
    for (const x of [-hx + 12, hx - 12]) for (const z of [-hz + 14, hz - 14]) box(4, 70, 4, x, -40, z, steel, false);
    // The chair and classroom tiles sit below the drop on every side.
    box(62, 3, 46, 0, -36, hz + 45, oak, false);
    for (const x of [-25, 25]) for (const z of [hz + 27, hz + 63]) box(3, 36, 3, x, -56, z, steel, false);
    plane(1600, 1600, -76, lam({ map: tex(256, 256, drawTiles('#999b88', '#b7b49b', '#7c8176'), { repeat: [32, 32] }) })).receiveShadow = false;
  },
};
