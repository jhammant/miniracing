// Everything drawn in 3D: the room, the track painted on its surface, props,
// cars and the cameras. The game state lives in game.js; this file only looks.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildProp, buildCar, buildItemBox, buildBoostPad, buildShield } from './models.js';
import { wrapAngle } from '../shared/track.js';
import { isTouch } from './store.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
const FONT = '"Press Start 2P", monospace';

const THEMES = {
  breakfast: { bg: '#3a211b', sky: '#fff3dc', ground: '#a9805c', sun: '#fff1d6', dust: '#f3e3c2' },
  snooker: { bg: '#1c1016', sky: '#f4f1e4', ground: '#1d4a30', sun: '#fff6e0', dust: '#d6f0e0' },
  kitchen: { bg: '#27323a', sky: '#f3fbff', ground: '#8a9aa3', sun: '#ffffff', dust: '#e6edf0' },
  bedroom: { bg: '#2b2440', sky: '#fff0f6', ground: '#6e7fb0', sun: '#fff2e2', dust: '#e9e2f5' },
};

// ---- canvas textures --------------------------------------------------------

function canvasTex(w, h, draw, { repeat, aniso = 1, clampEdge = false } = {}) {
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

function speckle(g, w, h, n, colors, size = 1) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[i % colors.length];
    g.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
}

const drawGingham = (g, w, h) => {
  g.fillStyle = '#f8f1e3'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(211, 62, 52, 0.5)';
  g.fillRect(0, 0, w / 2, h); g.fillRect(0, 0, w, h / 2);
  g.fillStyle = 'rgba(255,255,255,0.10)';
  for (let i = 0; i < w; i += 4) { g.fillRect(i, 0, 1, h); g.fillRect(0, i, w, 1); }
};

const drawTiles = (a, b, grout) => (g, w, h) => {
  const t = w / 2;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? a : b; g.fillRect(i * t, j * t, t, t); }
  speckle(g, w, h, 900, ['rgba(255,255,255,0.10)', 'rgba(0,0,0,0.05)'], 2);
  g.fillStyle = grout;
  for (let i = 0; i < 2; i++) { g.fillRect(i * t - 2, 0, 4, h); g.fillRect(0, i * t - 2, w, 4); }
  g.fillRect(w - 2, 0, 2, h); g.fillRect(0, h - 2, w, 2);
};

function drawBaize(world) {
  return (g, w, h) => {
    const sx = w / (world.hx * 2), X = (x) => (x + world.hx) * sx, Z = (z) => (z + world.hz) * sx;
    g.fillStyle = '#1b8a4a'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 16000, ['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.07)', 'rgba(120,255,170,0.05)'], 2);
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(X(-58), 0); g.lineTo(X(-58), h); g.stroke();
    g.beginPath(); g.arc(X(-58), Z(0), 13 * sx, Math.PI / 2, -Math.PI / 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.6)';
    for (const x of [0, 45, 80]) { g.beginPath(); g.arc(X(x), Z(0), 3, 0, 7); g.fill(); }
  };
}

function drawRug(world) {
  return (g, w, h) => {
    const sx = w / (world.hx * 2), { track } = world;
    g.fillStyle = '#7f93c9'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 9000, ['rgba(255,255,255,0.06)', 'rgba(0,0,40,0.07)'], 2);
    const m = 5 * sx, r = 10 * sx;
    const rr = (inset, fill) => { g.fillStyle = fill; g.beginPath(); g.roundRect(m + inset, m + inset, w - 2 * (m + inset), h - 2 * (m + inset), r); g.fill(); };
    // Fringe, border, then the printed town.
    g.strokeStyle = '#f3e7c9'; g.lineWidth = 2;
    for (let y = m + r; y < h - m - r; y += 5) { g.beginPath(); g.moveTo(m - 9, y); g.lineTo(m, y); g.moveTo(w - m, y); g.lineTo(w - m + 9, y); g.stroke(); }
    rr(0, '#f3e7c9'); rr(7, '#e8503a'); rr(12, '#f3e7c9'); rr(16, '#78c462');
    speckle(g, w, h, 5000, ['rgba(255,255,255,0.05)', 'rgba(0,60,0,0.06)'], 2);
    // Printed trees and flowers, kept clear of the road.
    const rnd = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    for (let i = 0; i < 260; i++) {
      const x = (rnd() * 2 - 1) * (world.hx - 12), z = (rnd() * 2 - 1) * (world.hz - 12);
      const j = track.locate(x, z);
      if (Math.hypot(x - track.sx[j], z - track.sz[j]) < track.hw + 4) continue;
      const px = (x + world.hx) * sx, pz = (z + world.hz) * sx;
      if (i % 3 === 0) {
        g.fillStyle = '#3f9a4b'; g.beginPath(); g.arc(px, pz, 9, 0, 7); g.fill();
        g.fillStyle = '#5cb85c'; g.beginPath(); g.arc(px - 2, pz - 2, 5, 0, 7); g.fill();
      } else {
        g.fillStyle = ['#fff', '#ffd23f', '#ff8fab'][i % 3]; g.beginPath(); g.arc(px, pz, 2.5, 0, 7); g.fill();
      }
    }
  };
}

// The road surface: u runs across the track, v along it.
const RIBBON = {
  breakfast: (g, w, h) => {
    g.fillStyle = 'rgba(255,250,235,0.34)'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 260, ['rgba(255,255,255,0.35)', 'rgba(190,150,90,0.25)'], 2);
  },
  snooker: (g, w, h) => {
    g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(0, 0, w, h);
    for (const x of [1, w - 9]) {
      g.fillStyle = 'rgba(240,250,255,0.85)'; g.fillRect(x, 0, 8, h);
      for (let i = 0; i < 60; i++) { g.clearRect(x + Math.random() * 8, Math.random() * h, 2, 2); }
    }
  },
  kitchen: (g, w, h) => {
    g.fillStyle = 'rgba(40,70,100,0.16)'; g.fillRect(0, 0, w, h);
    for (const x of [0, w - 10]) {
      g.fillStyle = '#ffd23f'; g.fillRect(x, 0, 10, h);
      g.fillStyle = '#2b2b2b';
      for (let y = -16; y < h; y += 32) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 10, y + 10); g.lineTo(x + 10, y + 26); g.lineTo(x, y + 16); g.fill(); }
    }
  },
  bedroom: (g, w, h) => {
    g.fillStyle = '#5d6373'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 500, ['rgba(255,255,255,0.06)', 'rgba(0,0,0,0.08)'], 2);
    g.fillStyle = '#f5f5f5'; g.fillRect(3, 0, 5, h); g.fillRect(w - 8, 0, 5, h);
    g.fillStyle = '#ffd23f'; g.fillRect(w / 2 - 2, 0, 4, h / 2);
  },
};

// ---- helpers ----------------------------------------------------------------

// Fold every static mesh under `root` into one mesh per material, so a room
// full of props costs a few dozen draw calls instead of several hundred.
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const groups = new Map(), done = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || o.material.map || o.material.vertexColors) return;
    if (!o.geometry.attributes.position) return;
    let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    if (!geo.attributes.normal) geo.computeVertexNormals();
    for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
    geo.morphAttributes = {};
    geo.applyMatrix4(o.matrixWorld);
    if (o.matrixWorld.determinant() < 0) {
      // A mirrored part: swap two corners of every triangle so it faces out again.
      for (const attr of [geo.attributes.position, geo.attributes.normal]) {
        const a = attr.array;
        for (let i = 0; i < a.length; i += 9) for (let k = 0; k < 3; k++) { const t = a[i + 3 + k]; a[i + 3 + k] = a[i + 6 + k]; a[i + 6 + k] = t; }
      }
    }
    const key = `${o.material.uuid}:${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}`;
    if (!groups.has(key)) groups.set(key, { mat: o.material, cast: o.castShadow, receive: o.receiveShadow, geos: [] });
    groups.get(key).geos.push(geo);
    done.push(o);
  });
  for (const o of done) o.parent.remove(o);
  const out = new THREE.Group();
  for (const g of groups.values()) {
    const geo = mergeGeometries(g.geos, false);
    for (const x of g.geos) x.dispose();
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, g.mat);
    mesh.castShadow = g.cast; mesh.receiveShadow = g.receive;
    mesh.renderOrder = g.mat.transparent ? 2 : 0;
    mesh.matrixAutoUpdate = false;
    out.add(mesh);
  }
  out.add(root); // whatever could not be merged stays as it was
  return out;
}

function nameTag(name, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 72;
  const g = c.getContext('2d');
  g.font = `22px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 7; g.strokeStyle = '#14101f'; g.lineJoin = 'round';
  g.strokeText(name, 128, 26); g.fillStyle = '#fff'; g.fillText(name, 128, 26);
  g.fillStyle = color; g.strokeStyle = '#14101f'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(114, 46); g.lineTo(142, 46); g.lineTo(128, 66); g.closePath(); g.stroke(); g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(9, 2.53, 1); sprite.center.set(0.5, 0);
  sprite.renderOrder = 10;
  return sprite;
}

// ---- the scene --------------------------------------------------------------

export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch || devicePixelRatio < 2, powerPreference: 'high-performance' });
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.shadowMap.enabled = true;
    this.aniso = Math.min(8, r.capabilities.getMaxAnisotropy());
    this.root = new THREE.Scene();
    this.root.fog = new THREE.Fog('#000', 100, 400);
    this.camera = new THREE.PerspectiveCamera(55, 1, 1, 1200);
    this.hemi = new THREE.HemisphereLight('#fff', '#888', 1.5);
    this.sun = new THREE.DirectionalLight('#fff', 2.2);
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 10, far: 420 });
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.04;
    this.root.add(this.hemi, this.sun, this.sun.target);
    this.worldGroup = null;
    this.carLayer = new THREE.Group();
    this.root.add(this.carLayer);
    this.cars = new Map();
    this.blobGeo = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2);
    this.blobMat = new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.28, depthWrite: false });
    this.owned = [];
    this.boxes = []; this.pads = []; this.movers = [];
    this.cam = { x: 0, y: 80, z: 60, tx: 0, tz: 0, h: 0, fov: 55, snap: true, shake: 0 };
    this.t = 0; this.slowT = 0; this.fastT = 0;
    this.quality = 'high'; this.scale = 1; this.retro = false; this.tagAll = false;
    this.world = null;
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  // quality: auto | high | medium | low.  Auto starts high and steps down if
  // frames run slow; retro renders at a 16-bit console's resolution.
  setOptions({ quality, retro }) {
    this.auto = quality === 'auto';
    this.quality = this.auto ? (isTouch ? 'medium' : 'high') : quality;
    this.retro = retro;
    this.applyQuality();
  }

  applyQuality() {
    const q = this.quality, dpr = Math.min(devicePixelRatio || 1, 2);
    this.scale = q === 'high' ? dpr : q === 'medium' ? Math.min(dpr, 1.5) : 1;
    const shadows = q !== 'low';
    if (this.sun.castShadow !== shadows) this.sun.castShadow = shadows;
    const size = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) { this.sun.shadow.mapSize.set(size, size); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
    this.canvas.style.imageRendering = this.retro ? 'pixelated' : '';
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    const s = this.retro ? Math.min(1, 270 / Math.min(w, h)) : this.scale;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(Math.max(2, Math.round(w * s)), Math.max(2, Math.round(h * s)), false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Called with each frame's duration; drops a quality level if they stay slow.
  watchPerf(dt) {
    if (!this.auto || this.retro || document.hidden) return;
    this.slowT = dt > 1 / 40 ? this.slowT + dt : Math.max(0, this.slowT - dt * 2);
    if (this.slowT > 2.5 && this.quality !== 'low') {
      this.quality = this.quality === 'high' ? 'medium' : 'low';
      this.slowT = 0;
      this.applyQuality();
    }
  }

  // ---- building a room ------------------------------------------------------

  own(x) { this.owned.push(x); return x; }

  setWorld(world) {
    if (this.world === world) return;
    this.world = world;
    if (this.worldGroup) this.root.remove(this.worldGroup);
    for (const x of this.owned) x.dispose();
    this.owned = [];
    const theme = this.theme = THEMES[world.def.id] || THEMES.kitchen;
    this.root.background = new THREE.Color(theme.bg);
    this.root.fog.color.set(theme.bg);
    this.hemi.color.set(theme.sky); this.hemi.groundColor.set(theme.ground);
    this.sun.color.set(theme.sun);

    const g = this.worldGroup = new THREE.Group();
    this.buildRoom(g, world);
    this.buildTrack(g, world);

    const props = new THREE.Group();
    for (const p of world.props) {
      const m = buildProp(p.m, { color: p.c });
      m.position.set(p.x, 0, p.z); m.rotation.y = p.rot;
      props.add(m);
    }
    g.add(mergeStatic(props));

    this.movers = world.movers.map((mv) => {
      const holder = new THREE.Group(), roll = new THREE.Group(), model = buildProp(mv.m, { color: mv.c });
      const rolls = mv.m === 'ball' || mv.m === 'toyBall';
      if (rolls) { roll.position.y = mv.r; model.position.y = -mv.r; }
      roll.add(model); holder.add(roll); g.add(holder);
      return { mv, holder, roll, rolls, lx: mv.x, lz: mv.z };
    });
    this.pads = world.pads.map((p) => {
      const m = buildBoostPad();
      m.position.set(p.x, 0.02, p.z); m.rotation.y = p.h;
      g.add(m);
      return m;
    });
    this.boxes = world.boxes.map((b) => {
      const m = buildItemBox();
      m.position.set(b.x, 0, b.z);
      g.add(m);
      return { m, s: 1, on: true };
    });
    this.root.add(g);
    this.cam.snap = true;
  }

  buildRoom(g, world) {
    const { def, hx, hz } = world, w = hx * 2, d = hz * 2, id = def.id;
    const lam = (opts) => this.own(new THREE.MeshLambertMaterial(opts));
    const box = (sx, sy, sz, x, y, z, mat, shadow = true) => {
      const m = new THREE.Mesh(this.own(new THREE.BoxGeometry(sx, sy, sz)), mat);
      m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix();
      g.add(m);
      return m;
    };
    const plane = (sx, sz, y, mat) => {
      const m = new THREE.Mesh(this.own(new THREE.PlaneGeometry(sx, sz).rotateX(-Math.PI / 2)), mat);
      m.position.y = y; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix();
      g.add(m);
      return m;
    };
    const tex = (wd, ht, draw, opts) => this.own(canvasTex(wd, ht, draw, { aniso: this.aniso, ...opts }));

    if (id === 'breakfast') {
      plane(w, d, 0, lam({ map: tex(64, 64, drawGingham, { repeat: [w / 20, d / 20] }) }));
      // The cloth hangs over the edge; the kitchen floor is a long way down.
      const cloth = lam({ color: '#f1e6d2' });
      box(w, 14, 0.6, 0, -7, hz + 0.3, cloth, false); box(w, 14, 0.6, 0, -7, -hz - 0.3, cloth, false);
      box(0.6, 14, d, hx + 0.3, -7, 0, cloth, false); box(0.6, 14, d, -hx - 0.3, -7, 0, cloth, false);
      box(w - 6, 4, d - 6, 0, -2.1, 0, lam({ color: '#8a5a33' }), false);
      const floor = plane(1600, 1600, -95, lam({ color: '#b98a6a', map: tex(256, 256, drawTiles('#e9d9c2', '#c98f6b', '#8f7a66'), { repeat: [22, 22] }) }));
      floor.receiveShadow = false;
    } else if (id === 'snooker') {
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
    } else {
      const kitchen = id === 'kitchen';
      plane(w, d, 0, lam({
        map: kitchen
          ? tex(256, 256, drawTiles('#f2ead9', '#a9c9cf', '#b3a892'), { repeat: [w / 44, d / 44] })
          : tex(1024, Math.round(1024 * d / w), drawRug(world), { clampEdge: true }),
      }));
      const skirting = lam({ color: kitchen ? '#fbfbf6' : '#fff6ea' }), wall = lam({ color: kitchen ? '#cfe6ea' : '#f6c9d8' });
      for (const s of [-1, 1]) {
        box(w + 8, 7, 4, 0, 3.5, s * (hz + 2), skirting); box(4, 7, d, s * (hx + 2), 3.5, 0, skirting);
        box(w + 8, 0.5, 5, 0, 7.2, s * (hz + 2.5), wall, false); box(5, 0.5, d, s * (hx + 2.5), 7.2, 0, wall, false);
      }
      plane(1600, 1600, -0.5, lam({ color: this.theme.bg })).receiveShadow = false;
    }
  }

  buildTrack(g, world) {
    const { track, def } = world, n = track.n, half = track.hw + 0.55;
    // Where the lap crosses itself, skip the edge lines so the junction reads as open road.
    const crossing = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j += 2) {
        const gap = Math.abs(i - j);
        if (Math.min(gap, n - gap) < 40) continue;
        if (Math.hypot(track.sx[i] - track.sx[j], track.sz[i] - track.sz[j]) < track.hw * 1.5) { crossing[i] = 1; break; }
      }
    }
    const reps = Math.max(1, Math.round(track.len / 9));
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const k = i % n, x = track.sx[k], z = track.sz[k], nx = track.nx[k], nz = track.nz[k];
      const u = crossing[k] ? 0.2 : 0;
      pos.push(x + nx * half, 0.05, z + nz * half, x - nx * half, 0.05, z - nz * half);
      uv.push(u, (i / n) * reps, 1 - u, (i / n) * reps);
      if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geo = this.own(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const map = this.own(canvasTex(128, 128, RIBBON[def.id] || RIBBON.kitchen, { aniso: this.aniso }));
    const ribbon = new THREE.Mesh(geo, this.own(new THREE.MeshLambertMaterial({ map, transparent: true, depthWrite: false, side: THREE.DoubleSide })));
    ribbon.receiveShadow = true; ribbon.renderOrder = 1;
    g.add(ribbon);

    // Start line: a chequered strip, with a flag post either side.
    const p0 = track.pointAt(0, 0);
    const chk = this.own(canvasTex(64, 16, (c, w, h) => {
      for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { c.fillStyle = (i + j) % 2 ? '#111' : '#fff'; c.fillRect(i * 4, j * 4, 4, 4); }
    }));
    chk.magFilter = THREE.NearestFilter;
    const line = new THREE.Mesh(this.own(new THREE.PlaneGeometry(track.width, 2.6).rotateX(-Math.PI / 2)),
      this.own(new THREE.MeshLambertMaterial({ map: chk, transparent: true, opacity: 0.92, depthWrite: false })));
    line.position.set(p0.x, 0.07, p0.z); line.rotation.y = p0.h; line.renderOrder = 1; line.receiveShadow = true;
    g.add(line);
    const postMat = this.own(new THREE.MeshLambertMaterial({ color: '#f5f1e6' })), flagMat = this.own(new THREE.MeshLambertMaterial({ map: chk, side: THREE.DoubleSide }));
    for (const s of [-1, 1]) {
      const q = track.pointAt(0, s * (track.hw + 1.6));
      const post = new THREE.Mesh(this.own(new THREE.CylinderGeometry(0.18, 0.18, 5, 6)), postMat);
      post.position.set(q.x, 2.5, q.z); post.castShadow = true;
      const flag = new THREE.Mesh(this.own(new THREE.PlaneGeometry(2.4, 1.5)), flagMat);
      flag.position.set(q.x - Math.cos(p0.h) * 1.2 * s, 4.2, q.z + Math.sin(p0.h) * 1.2 * s); flag.rotation.y = p0.h;
      g.add(post, flag);
    }

    // Breakfast: the road is marked out with cereal hoops.
    if (def.id === 'breakfast') {
      const gap = 2.1, count = Math.floor(track.len / gap) * 2;
      const hoops = new THREE.InstancedMesh(this.own(new THREE.TorusGeometry(0.52, 0.22, 5, 9).rotateX(Math.PI / 2)),
        this.own(new THREE.MeshLambertMaterial({ color: '#e0a94a' })), count);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
      let rs = 3;
      const rnd = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
      for (let i = 0; i < count; i++) {
        const side = i % 2 ? 1 : -1, p = track.pointAt(Math.floor(i / 2) * gap + rnd() * 0.5, side * (track.hw + 0.35 + rnd() * 0.35));
        e.set((rnd() - 0.5) * 0.3, rnd() * 6.3, (rnd() - 0.5) * 0.3);
        m.compose(v.set(p.x, 0.22, p.z), q.setFromEuler(e), one);
        hoops.setMatrixAt(i, m);
      }
      hoops.castShadow = true; hoops.receiveShadow = true;
      g.add(hoops);
    }
  }

  // ---- cars -----------------------------------------------------------------

  carVis(car, myCar) {
    let v = this.cars.get(car.id);
    if (!v) {
      const group = new THREE.Group(), body = buildCar(car.color, car.id % 4);
      body.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      const blob = new THREE.Mesh(this.blobGeo, this.blobMat);
      blob.renderOrder = 3;
      group.add(body);
      this.carLayer.add(group, blob);
      v = { group, body, blob, color: car.color, name: null, tag: null, shield: null, scale: 1, flat: 1, roll: 0 };
      this.cars.set(car.id, v);
    }
    if (v.color !== car.color) { v.color = car.color; v.body.userData.setColor?.(car.color); if (v.tag) v.name = null; }
    const wantTag = !car.bot && (this.tagAll || car.id !== myCar);
    if (wantTag && v.name !== car.name) {
      if (v.tag) { v.group.remove(v.tag); v.tag.material.map.dispose(); v.tag.material.dispose(); }
      v.tag = nameTag(car.name, car.color); v.name = car.name;
      v.tag.position.y = 2.2;
      v.group.add(v.tag);
    } else if (!wantTag && v.tag) { v.group.remove(v.tag); v.tag.material.map.dispose(); v.tag.material.dispose(); v.tag = null; v.name = null; }
    return v;
  }

  dropCar(id) {
    const v = this.cars.get(id);
    if (!v) return;
    this.carLayer.remove(v.group, v.blob);
    if (v.tag) { v.tag.material.map.dispose(); v.tag.material.dispose(); }
    this.cars.delete(id);
  }

  syncCars(game, dt) {
    const a = game.alpha, blink = Math.floor(this.t * 12) % 2 === 0;
    for (const id of this.cars.keys()) if (!game.cars.has(id)) this.dropCar(id);
    for (const car of game.cars.values()) {
      const v = this.carVis(car, game.myCar);
      const x = lerp(car.px, car.x, a), z = lerp(car.pz, car.z, a), y = lerp(car.py, car.y, a);
      const h = car.ph + wrapAngle(car.h - car.ph) * a;
      car.rx = x; car.rz = z; car.ry = y; car.rh = h; // where the car is drawn this frame
      const show = car.active && !car.out && !car.waiting;
      v.group.visible = show && (car.invT <= 0 || blink || car.fallT > 0);
      v.blob.visible = show && car.fallT <= 0;
      if (!show) continue;
      v.group.position.set(x, y, z);
      v.group.rotation.y = h + car.spin;
      const k = ease(12, dt);
      v.scale = lerp(v.scale, car.shrinkT > 0 ? 0.6 : 1, k);
      v.flat = lerp(v.flat, car.squashT > 0 ? 0.28 : 1, k);
      const wide = v.scale * (1 + (1 - v.flat) * 0.5);
      v.body.scale.set(wide, v.scale * v.flat, wide);
      // A little body roll into corners and nose-up in the air.
      const sp = Math.hypot(car.vx, car.vz);
      v.roll = lerp(v.roll, car.steer * Math.min(1, sp / 20) * 0.09, k);
      v.body.rotation.z = v.roll;
      v.body.rotation.x = car.fallT > 0 ? car.spin * 0.7 : -clamp(y * 0.12, 0, 0.3);
      const wheels = v.body.userData.wheels;
      if (wheels) { wheels[0].rotation.y = wheels[1].rotation.y = -car.steer * 0.45; }
      if (car.shieldT > 0 && !v.shield) { v.shield = buildShield(); v.group.add(v.shield); }
      if (v.shield) {
        v.shield.visible = car.shieldT > 0;
        const pulse = 1 + Math.sin(this.t * 9) * 0.05;
        v.shield.scale.setScalar(pulse * v.scale);
      }
      if (v.tag) v.tag.visible = car.fallT <= 0;
      const lift = clamp(1 - y / 9, 0.35, 1) * v.scale;
      v.blob.position.set(x, 0.09, z);
      v.blob.scale.set(1.05 * lift, 1, 1.3 * lift);
      v.blob.rotation.y = h;
    }
  }

  // ---- per frame ------------------------------------------------------------

  // view: { mode: 'chase' | 'classic' | 'overview' | 'orbit', focus: car | null }
  update(game, dt, view) {
    this.t += dt;
    const t = this.t;
    if (game) this.syncCars(game, dt);
    else for (const v of this.cars.values()) { v.group.visible = false; v.blob.visible = false; }
    for (const mo of this.movers) {
      const { mv } = mo;
      mo.holder.position.set(mv.x, 0, mv.z);
      if (mo.rolls) {
        const dx = mv.x - mo.lx, dz = mv.z - mo.lz, dist = Math.hypot(dx, dz);
        if (dist > 1e-4) mo.roll.rotateOnWorldAxis(new THREE.Vector3(dz / dist, 0, -dx / dist), dist / mv.r);
      } else mo.holder.rotation.y = mv.h;
      mo.lx = mv.x; mo.lz = mv.z;
    }
    this.boxes.forEach((b, i) => {
      const on = game ? game.boxes[i] !== false : true;
      b.s = lerp(b.s, on ? 1 : 0, ease(on ? 6 : 16, dt));
      b.m.visible = b.s > 0.03;
      b.m.scale.setScalar(b.s);
      b.m.rotation.y = t * 1.6 + i;
      b.m.position.y = Math.sin(t * 2.4 + i * 1.7) * 0.25;
    });
    for (const pad of this.pads) {
      const ch = pad.userData.chevrons;
      if (!ch) continue;
      ch.forEach((c, i) => { const s = 0.75 + 0.25 * Math.sin(t * 9 - i * 1.1); c.scale.set(s, 1, s); });
    }
    this.updateCamera(game, dt, view);
  }

  shake(amount) { this.cam.shake = Math.max(this.cam.shake, amount); }

  updateCamera(game, dt, view) {
    const c = this.cam, cam = this.camera, world = this.world;
    if (!world) return;
    const aspect = cam.aspect, tall = aspect < 1 ? 1 + (1 - aspect) * 0.75 : 1;
    const tanV = Math.tan((c.fov * Math.PI) / 360);
    let px, py, pz, tx, tz, fov = 55;
    const f = view.focus;
    if (view.mode === 'chase' && f) {
      const sp = Math.hypot(f.vx, f.vz);
      c.h = c.snap ? f.rh : wrapAngle(c.h + wrapAngle(f.rh - c.h) * ease(f.spinT > 0 ? 0.5 : 3.2, dt));
      const fx = Math.sin(c.h), fz = Math.cos(c.h), ahead = 5 + sp * 0.16;
      tx = f.rx + fx * ahead; tz = f.rz + fz * ahead;
      px = f.rx - fx * 12.5 * tall; pz = f.rz - fz * 12.5 * tall; py = 21.5 * tall;
      fov = 55 + (f.boostT > 0 ? 7 : 0) + Math.min(5, sp * 0.12);
    } else if (view.mode === 'classic' && f) {
      tx = f.rx + f.vx * 0.3; tz = f.rz + f.vz * 0.3;
      px = tx; pz = tz + 12 * tall; py = 36 * tall;
    } else if (view.mode === 'overview' && game && game.order.length) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, any = false;
      for (const car of game.order) {
        if (car.out || car.fallT > 0) continue;
        any = true;
        x0 = Math.min(x0, car.x); x1 = Math.max(x1, car.x); z0 = Math.min(z0, car.z); z1 = Math.max(z1, car.z);
      }
      if (!any) { x0 = x1 = c.tx; z0 = z1 = c.tz; }
      tx = (x0 + x1) / 2; tz = (z0 + z1) / 2;
      const m = 16, full = Math.max((world.hz + 10) / tanV, (world.hx + 10) / (tanV * aspect));
      py = clamp(Math.max(((z1 - z0) / 2 + m) / tanV, ((x1 - x0) / 2 + m) / (tanV * aspect)), 62, full);
      px = tx; pz = tz + py * 0.3;
    } else {
      // Slow orbit of the whole room: menus, lobby and results.
      const rad = Math.max(world.hx, world.hz) * 0.85, a = this.t * 0.07;
      tx = 0; tz = 0;
      px = Math.sin(a) * rad; pz = Math.cos(a) * rad * 0.75 + 20; py = 78 * tall;
    }
    const k = c.snap ? 1 : ease(view.mode === 'overview' ? 2.2 : view.mode === 'orbit' ? 1.5 : 9, dt);
    c.x = lerp(c.x, px, k); c.y = lerp(c.y, py, k); c.z = lerp(c.z, pz, k);
    c.tx = lerp(c.tx, tx, k); c.tz = lerp(c.tz, tz, k);
    c.fov = lerp(c.fov, fov, c.snap ? 1 : ease(4, dt));
    c.snap = false;
    c.shake = Math.max(0, c.shake - dt * 2.2);
    const sh = c.shake * c.shake * 1.6;
    cam.position.set(c.x + (Math.random() - 0.5) * sh, c.y + (Math.random() - 0.5) * sh, c.z + (Math.random() - 0.5) * sh);
    if (Math.abs(cam.fov - c.fov) > 0.05) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
    cam.lookAt(c.tx, 0, c.tz);

    // Fog and shadows follow the camera, so a high overview isn't fogged out.
    const dist = Math.hypot(c.x - c.tx, c.y, c.z - c.tz);
    this.root.fog.near = dist + 70; this.root.fog.far = dist + 330;
    const span = clamp(dist * 1.15, 60, 190), sc = this.sun.shadow.camera;
    if (Math.abs(sc.right - span) > 4) { sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.updateProjectionMatrix(); }
    this.sun.target.position.set(c.tx, 0, c.tz);
    this.sun.position.set(c.tx - 70, 150, c.tz - 55);
  }

  render() { this.renderer.render(this.root, this.camera); }
}
