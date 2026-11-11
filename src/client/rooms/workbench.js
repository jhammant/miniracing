// Garage Workbench: scarred timber, masking tape and a bench full of tools.

import { kit } from '../models.js';
import { mapper, seeded, speckle } from './paint.js';

const { THREE, HALF, TAU, box, cyl, torus, disc, ring, plan, slab, wedge, rounded, blobGeo, mat, add, lay, sized, scatter } = kit;
const STEEL = '#c3cbd0', DARK = '#454b50', BLUE = '#237e96', RED = '#d9573b', WOOD = '#c79252';

function drawWood(world) {
  return (g, w, h) => {
    const { k, X, Z } = mapper(world, w), rnd = seeded(19);
    const planks = ['#b98248', '#c18c50', '#ae7844', '#c38e52', '#b68046', '#c69559', '#b78049'];
    for (let i = 0; i < planks.length; i++) {
      const z = i * h / planks.length;
      g.fillStyle = planks[i]; g.fillRect(0, z, w, h / planks.length);
      g.fillStyle = '#785130'; g.fillRect(0, z, w, 1.7);
      g.fillStyle = 'rgba(255,225,168,0.28)'; g.fillRect(0, z + 2, w, 1);
    }
    for (let i = 0; i < 1100; i++) {
      const x = rnd() * w, z = rnd() * h, len = 18 + rnd() * 190;
      g.strokeStyle = i % 3 ? 'rgba(83,48,22,0.12)' : 'rgba(255,225,169,0.19)'; g.lineWidth = 0.5 + rnd();
      g.beginPath(); g.moveTo(x, z); g.bezierCurveTo(x + len * 0.3, z - 3, x + len * 0.7, z + 3, x + len, z); g.stroke();
    }
    for (const [x, z] of [[-98, 56], [-7, -22], [37, 40], [90, -48], [-53, -64]]) {
      for (let r = 1; r < 6; r++) {
        g.strokeStyle = `rgba(89,53,26,${0.32 - r * 0.035})`; g.lineWidth = 1;
        g.beginPath(); g.ellipse(X(x), Z(z), r * 2.3 * k, r * 0.48 * k, 0, 0, TAU); g.stroke();
      }
    }
    // Old paint tins, saw cuts and pencil measurements left in the timber.
    for (const [x, z, r, color] of [[-72, 22, 6.3, '#c74732'], [93, -63, 6.5, '#287c87'], [35, -20, 5.8, '#e3c77c']]) {
      g.strokeStyle = color; g.lineWidth = 1.2 * k;
      g.beginPath(); g.arc(X(x), Z(z), r * k, 0.35, 6.15); g.stroke();
      for (let i = 0; i < 12; i++) {
        g.fillStyle = color; g.beginPath(); g.arc(X(x + (rnd() - 0.5) * 17), Z(z + (rnd() - 0.5) * 16), (0.1 + rnd() * 0.45) * k, 0, TAU); g.fill();
      }
    }
    g.lineWidth = 0.35 * k;
    for (let i = 0; i < 8; i++) {
      const x = 25 + i * 3.3, z = -36 + rnd() * 3;
      g.strokeStyle = 'rgba(65,41,22,0.6)'; g.beginPath(); g.moveTo(X(x), Z(z)); g.lineTo(X(x + 11), Z(z - 13)); g.stroke();
    }
    g.strokeStyle = 'rgba(54,58,57,0.6)'; g.lineWidth = 0.22 * k;
    g.beginPath(); g.moveTo(X(-19), Z(19)); g.lineTo(X(20), Z(19)); g.stroke();
    for (let i = 0; i < 14; i++) {
      const x = -19 + i * 3;
      g.beginPath(); g.moveTo(X(x), Z(18)); g.lineTo(X(x), Z(i % 3 ? 20 : 22)); g.stroke();
    }
    g.font = `${2.8 * k}px monospace`; g.fillStyle = '#60533b'; g.fillText('39 cm', X(-5), Z(25));
    for (const z of [-70, 70]) for (const x of [-110, -55, 0, 55, 110]) {
      g.fillStyle = '#62533d'; g.beginPath(); g.arc(X(x), Z(z), 0.65 * k, 0, TAU); g.fill();
      g.strokeStyle = '#b5a47e'; g.beginPath(); g.moveTo(X(x - 0.4), Z(z)); g.lineTo(X(x + 0.4), Z(z)); g.stroke();
    }
  };
}

const polygon = (r, n) => Array.from({ length: n }, (_, i) => [Math.sin(i * TAU / n) * r, Math.cos(i * TAU / n) * r]);

export default {
  theme: { bg: '#343c40', sky: '#f6efd9', ground: '#8c704c', sun: '#fff1d0', dust: '#e6c58a' },

  ribbon(g, w, h) {
    g.fillStyle = 'rgba(65,43,25,0.3)'; g.fillRect(0, 0, w, h);
    const rnd = seeded(13);
    for (const x of [1, w - 11]) {
      g.fillStyle = '#f5e7bb'; g.fillRect(x, 0, 10, h);
      g.fillStyle = '#fff4d3'; g.fillRect(x + 1, 0, 2, h);
      g.fillStyle = 'rgba(135,111,66,0.25)';
      for (let i = 0; i < 35; i++) g.fillRect(x + rnd() * 8, rnd() * h, 1, 3 + rnd() * 9);
      g.fillRect(x, h - 8, 10, 2);
    }
  },

  cut(g, w, h) {
    g.fillStyle = 'rgba(228,192,124,0.42)'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 180, ['#d0a166', '#e5c58d', '#b88a4e'], 2);
    g.fillStyle = '#f5e7bb';
    for (let y = 0; y < h; y += 32) { g.fillRect(2, y, 5, 17); g.fillRect(w - 7, y, 5, 17); }
  },

  models: {
    benchVice() {
      const g = new THREE.Group(), paint = mat(BLUE), iron = mat(DARK), steel = mat(STEEL, { gloss: 70 });
      add(g, rounded(12.5, 10.6, 1.2, 1.1), paint);
      add(g, box(8, 4, 7.2), paint, 0, 3, 0);
      for (const x of [-4.8, 4.8]) {
        add(g, box(3, 5.8, 8.8), paint, x, 4.2, -0.2);
        add(g, box(1, 1.8, 9.4), steel, x + (x < 0 ? 1 : -1), 7.7, -0.2);
        for (const z of [-3, -1.5, 0, 1.5, 3]) add(g, box(0.07, 1.3, 0.12), iron, x + (x < 0 ? 1.51 : -1.51), 7.7, z);
      }
      add(g, cyl(0.65, 0.65, 14, 10), steel, 0, 3.2, 0, 0, 0, HALF);
      add(g, cyl(1, 1, 1.2, 10), iron, 7.6, 3.2, 0, 0, 0, HALF);
      add(g, cyl(0.25, 0.25, 9.8, 8), steel, 7.8, 3.2, 0, HALF);
      for (const z of [-5, 5]) add(g, cyl(0.48, 0.48, 0.5, 8), steel, 7.8, 3.2, z, HALF);
      for (const x of [-4.8, 4.8]) for (const z of [-4, 4]) add(g, cyl(0.65, 0.65, 0.3, 6), steel, x, 1.2, z);
      return g;
    },

    benchHammer() {
      const g = new THREE.Group(), steel = mat(STEEL, { gloss: 70 });
      add(g, box(1.5, 1.4, 14), mat(WOOD), 0, 0.8, 1.6);
      add(g, box(1.8, 1.6, 4.5), mat(RED), 0, 0.8, 6.1);
      add(g, box(7.5, 2.4, 3), steel, 0, 1.2, -5.9);
      add(g, box(1.5, 2.8, 3.6), mat(DARK), -3.7, 1.4, -5.9);
      for (const z of [-6.8, -5.1]) add(g, box(2.4, 1.4, 0.7), steel, 3.3, 0.9, z);
      for (let i = 0; i < 4; i++) add(g, box(1.83, 0.08, 0.16), mat('#ae3e2a'), 0, 1.65, 4.7 + i * 0.8);
      return g;
    },

    benchSpanner() {
      const g = new THREE.Group(), steel = mat(STEEL, { gloss: 80 });
      add(g, box(1.5, 0.65, 11.5), steel, 0, 0.38, -0.2);
      add(g, torus(1.95, 0.55, 4, 6), steel, 0, 0.55, -6.5, HALF);
      add(g, slab(plan([[-2.5, 4.5], [-2.5, 8.3], [-0.95, 9], [-0.95, 6], [0.95, 6], [0.95, 9], [2.5, 8.3], [2.5, 4.5]]), 0.7), steel);
      add(g, box(0.5, 0.05, 7), mat('#87949a'), 0, 0.73, -0.5);
      return g;
    },

    benchScrewdriver({ color = RED } = {}) {
      const g = new THREE.Group(), steel = mat(STEEL, { gloss: 80 });
      add(g, cyl(1.35, 1.15, 7, 10), mat(color), 0, 1.35, -4.5, HALF);
      for (const x of [-0.7, 0.7]) add(g, box(0.35, 0.22, 4.8), mat(DARK), x, 2.48, -4.5);
      add(g, cyl(0.32, 0.32, 7.5, 8), steel, 0, 1.35, 2.75, HALF);
      add(g, box(1, 0.35, 1.9), steel, 0, 1.35, 7.45);
      return g;
    },

    benchSaw() {
      const g = new THREE.Group(), steel = mat(STEEL, { gloss: 40 });
      const teeth = Array.from({ length: 25 }, (_, i) => [i % 2 ? 4.4 : 3.6, 11.5 - i * 0.72]);
      add(g, slab(plan([[-3.4, -6], [-2.1, 12], [3.6, 12], ...teeth]), 0.35), steel, 0, 0.1, 0);
      add(g, slab(plan([[-4.4, -11.8], [4.4, -11.8], [4, -5.2], [-3.8, -5.2]],
        [[[-2.3, -10.3], [-2, -7], [2, -7], [2.3, -10.3]]]), 1.3), mat(RED));
      for (const x of [-2.7, 2.7]) add(g, cyl(0.38, 0.38, 0.12, 8), steel, x, 1.35, -6.2);
      add(g, box(0.15, 0.04, 13), mat('#85939a'), -1.5, 0.48, 3);
      return g;
    },

    benchTape() {
      const g = new THREE.Group(), ink = mat(DARK);
      add(g, rounded(6.5, 6, 1, 3.6), ink, 0, 0, -3);
      add(g, rounded(5.9, 5.4, 0.9, 0.5), mat('#f0b631'), 0, 3.6, -3);
      lay(g, disc(1.6, 12), mat('#fff0bf'), 0, 4.12, -3);
      lay(g, ring(1.1, 1.3, 12), ink, 0, 4.14, -3);
      add(g, box(1.9, 0.12, 6.7), mat('#f4d471'), 0, 0.15, 3.15);
      for (let i = 0; i < 12; i++) add(g, box(i % 3 ? 0.55 : 1, 0.03, 0.08), ink, 0.4, 0.23, i * 0.5 + 0.3);
      add(g, box(2.1, 0.9, 0.25), mat(STEEL), 0, 0.5, 6.4);
      return g;
    },

    benchJar() {
      const g = new THREE.Group(), steel = mat('#98a8ae', { gloss: 60 }), rnd = seeded(7);
      add(g, cyl(3, 2.9, 6.4, 16, true), mat('#bfdad4', { see: 0.32, gloss: 65 }), 0, 3.5, 0);
      lay(g, disc(2.9, 16), mat('#9cbdb5'), 0, 0.15);
      for (let i = 0; i < 9; i++) {
        const x = (rnd() - 0.5) * 3.1, z = (rnd() - 0.5) * 3.1, y = 1.1 + rnd() * 2.8;
        add(g, cyl(0.22, 0.22, 2.2, 6), steel, x, y, z, 0.4, 0, rnd());
        add(g, cyl(0.55, 0.55, 0.3, 6), steel, x, y + 1.1, z);
      }
      add(g, cyl(3.2, 3.2, 0.75, 16), mat('#cdb45f'), 0, 7.1, 0);
      lay(g, ring(2.5, 2.75, 16), mat('#897e43'), 0, 7.49);
      add(g, box(3.4, 2.3, 0.08), mat('#f4e9ca'), 0, 3.7, 2.95);
      for (const y of [3.3, 3.9]) add(g, box(2.2, 0.16, 0.09), mat(DARK), 0, y, 3);
      return g;
    },

    benchNut() {
      const g = new THREE.Group();
      add(g, slab(plan(polygon(1.25, 6), [polygon(0.57, 8)]), 1.1), mat(STEEL, { gloss: 70 }));
      lay(g, ring(0.58, 0.7, 8), mat(DARK), 0, 1.12);
      return g;
    },

    benchBolt() {
      const g = new THREE.Group(), steel = mat('#adb9bf', { gloss: 70 });
      add(g, cyl(0.42, 0.42, 3.7, 8), steel, 0, 0.95, 0.6, HALF);
      add(g, cyl(0.95, 0.95, 0.65, 6), steel, 0, 0.95, -1.6, HALF);
      for (let i = 0; i < 5; i++) add(g, torus(0.43, 0.08, 3, 8), mat(DARK), 0, 0.95, i * 0.45 + 0.25);
      return g;
    },

    benchWasher() {
      const g = new THREE.Group();
      add(g, slab(plan(polygon(1.45, 16), [polygon(0.73, 12)]), 0.3), mat('#c0c9ca', { gloss: 65 }));
      lay(g, ring(1.21, 1.33, 16), mat('#8b989d'), 0, 0.32);
      return g;
    },

    benchPaint({ color = RED } = {}) {
      const g = new THREE.Group(), steel = mat(STEEL, { gloss: 65 }), paint = mat(color, { gloss: 45 });
      add(g, cyl(5.1, 4.9, 7.8, 20), steel, 0, 4, 0);
      add(g, cyl(5.15, 5.02, 4.8, 20, true), mat('#efe0b8'), 0, 3.8, 0);
      add(g, cyl(5.17, 5.1, 1.9, 20, true), paint, 0, 3.4, 0);
      lay(g, disc(4.9, 20), paint, 0, 7.94);
      add(g, torus(5.02, 0.24, 4, 20), steel, 0, 8.05, 0, HALF);
      add(g, torus(5.25, 0.16, 4, 16, Math.PI), mat(DARK), 0, 6.6, 0, 1.45);
      add(g, box(1.1, 2.6, 0.18), paint, 0.8, 6.5, 5.08);
      add(g, box(0.6, 1.7, 0.2), paint, -1, 7, 5.05);
      return g;
    },

    benchGlueBottle() {
      const g = new THREE.Group();
      add(g, cyl(1.9, 2.4, 5.8, 12), mat('#f6e9bf'), 0, 2.9, 0);
      add(g, cyl(1.6, 1.9, 0.8, 12), mat('#e5a72b'), 0, 6.2, 0);
      add(g, cyl(0.2, 1.25, 2.1, 12), mat(RED), 0, 7.65, 0);
      add(g, cyl(2.15, 2.3, 2.4, 12, true), mat(BLUE), 0, 2.9, 0);
      return g;
    },

    benchGlue() {
      const g = new THREE.Group();
      lay(g, blobGeo(4.1, 9, 0.1), mat('#dbac4b', { gloss: 45, decal: 1 }), 0, 0.07);
      lay(g, blobGeo(3.4, 9), mat('#f3d695', { gloss: 50, decal: 2 }), -0.1, 0.19, 0.1);
      sized(lay(g, disc(0.8, 10), mat('#fff1c5', { decal: 3 }), -1.2, 0.2, -0.9), 1.7, 1, 0.45);
      return g;
    },

    benchOil() {
      const g = new THREE.Group();
      lay(g, blobGeo(4.4, 4), mat('#343b41', { gloss: 90, decal: 1 }), 0, 0.08);
      sized(lay(g, ring(1.7, 2.15, 20), mat('#77657f', { decal: 2 }), 0.3, 0.09, 0), 1.35, 1, 0.75);
      sized(lay(g, ring(1, 1.2, 16), mat('#5a9995', { decal: 3 }), 0.3, 0.1, 0), 1.5, 1, 0.7);
      sized(lay(g, disc(0.65, 10), mat('#adb5ad', { decal: 4 }), -1.4, 0.11, -1), 1.8, 1, 0.3);
      return g;
    },

    benchSawdust() {
      const g = new THREE.Group();
      lay(g, blobGeo(6.7, 12), mat('#d8ad70', { see: 0.4, decal: 1 }), 0, 0.035);
      scatter(g, 23, 35, 6.5, (r) => [0.25 + r() * 0.35, 0.08, 0.5 + r() * 0.8], ['#e1c08b', '#c8985e', '#edcc95'], 0.06, 0.15);
      return g;
    },

    benchPlank() {
      const g = new THREE.Group(), grain = mat('#9b713f');
      add(g, wedge(9.2, 9.6, 1.35), mat('#d8ae70'));
      const top = new THREE.Group(); top.position.z = -4.8; top.rotation.x = -Math.atan2(1.35, 9.6); g.add(top);
      for (const x of [-3.7, -1.4, 0.4, 2.8]) add(top, box(0.09, 0.025, 8.8), grain, x, 0.025, 4.8);
      for (const x of [-3.6, 3.6]) lay(top, disc(0.2, 6), mat(DARK), x, 0.045, 8.7);
      add(g, box(7.5, 1.2, 0.8), mat('#795739'), 0, 0.6, 4.3);
      return g;
    },

    benchDrill() {
      const g = new THREE.Group(), yellow = mat('#eeb332'), rubber = mat(DARK), steel = mat(STEEL, { gloss: 70 });
      add(g, rounded(4.5, 9, 0.8, 3.5), yellow, -1.8, 0.2, -2);
      add(g, box(5.6, 2.6, 3.2), yellow, 2, 1.5, -3.5);
      add(g, rounded(3.1, 5.7, 0.5, 3.3), rubber, 4.8, 0, -3.5);
      add(g, box(2.1, 0.4, 4.5), yellow, 4.8, 3.5, -3.5);
      add(g, cyl(1.6, 1.8, 2.3, 12), rubber, -1.8, 1.95, 3.4, HALF);
      add(g, cyl(0.42, 0.42, 4.6, 8), steel, -1.8, 1.95, 6.8, HALF);
      for (let i = 0; i < 5; i++) {
        add(g, box(2.7, 0.06, 0.28), rubber, -1.8, 3.75, -5.2 + i * 0.7);
        add(g, torus(0.44, 0.1, 3, 8), mat('#78878e'), -1.8, 1.95, 5.3 + i * 0.7);
      }
      add(g, box(0.8, 0.6, 1.4), rubber, 1, 2.4, -0.9);
      return g;
    },

    benchSocket() {
      const g = new THREE.Group(), steel = mat(STEEL, { gloss: 85 });
      add(g, cyl(2.1, 2.1, 3.4, 12, true), steel, 0, 2.1, 0, 0, 0, HALF);
      for (const x of [-1.72, 1.72]) {
        add(g, torus(1.65, 0.43, 4, 6), steel, x, 2.1, 0, 0, HALF);
        add(g, cyl(1.3, 1.3, 0.05, 6), mat(DARK), x * 0.95, 2.1, 0, 0, 0, HALF);
      }
      add(g, cyl(2.13, 2.13, 0.35, 12, true), mat('#87969e'), 0, 2.1, 0, 0, 0, HALF);
      return g;
    },
  },

  build({ THREE, g, own, plane, box, lam, tex, world, w, d, hx, hz }) {
    plane(w, d, 0, lam({ map: tex(1024, Math.round(1024 * d / w), drawWood(world), { clampEdge: true }) }));
    const edge = lam({ color: '#8c6038' }), end = lam({ color: '#ad7b47' }), frame = lam({ color: '#386368' });
    box(w, 7, d, 0, -3.6, 0, edge, false);
    for (const z of [-hz, hz]) {
      box(w, 1, 0.3, 0, -0.7, z, end, false);
      for (const y of [-2.3, -4.8]) box(w, 0.16, 0.35, 0, y, z, end, false);
      box(w - 15, 8, 3, 0, -13, z * 0.84, frame, false);
    }
    for (const x of [-hx + 15, hx - 15]) for (const z of [-hz + 13, hz - 13]) box(6, 57, 6, x, -36, z, frame, false);
    const floor = plane(1600, 1600, -66, lam({ map: tex(256, 256, (ctx, wd, ht) => {
      ctx.fillStyle = '#6e7775'; ctx.fillRect(0, 0, wd, ht);
      speckle(ctx, wd, ht, 2000, ['#747c79', '#646d6a', '#858b84'], 2);
      ctx.fillStyle = '#535d5b'; ctx.fillRect(0, 0, wd, 2); ctx.fillRect(0, 0, 2, ht);
    }, { repeat: [18, 18] }) }));
    floor.receiveShadow = false;
    // Pegboard stands beyond the back edge, with a visible drop before it.
    const pegboard = new THREE.Mesh(own(new THREE.PlaneGeometry(w + 40, 75)), lam({ map: tex(1024, 288, (ctx, wd, ht) => {
      ctx.fillStyle = '#727564'; ctx.fillRect(0, 0, wd, ht);
      for (let x = 10; x < wd; x += 18) for (let y = 10; y < ht; y += 18) {
        ctx.fillStyle = '#414b44'; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, TAU); ctx.fill();
        ctx.fillStyle = '#9b9b7c'; ctx.fillRect(x - 2, y + 2, 4, 1);
      }
    }, { clampEdge: true }) }));
    pegboard.position.set(0, -23, -hz - 35); g.add(pegboard);
    box(w + 44, 3, 3, 0, 15, -hz - 35, frame, false);
    box(w + 44, 3, 3, 0, -61, -hz - 35, frame, false);
  },
};
