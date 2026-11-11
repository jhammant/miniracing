// Everything drawn in 3D: the room, the track painted on its surface, props,
// cars and the cameras. The game state lives in game.js; this file only looks.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildProp, buildVehicle, buildItemBox, buildBoostPad, buildShield } from './models.js';
import { lookOf } from './rooms/index.js';
import { canvasTex } from './rooms/paint.js';
import { wrapAngle } from '../shared/track.js';
import { isTouch } from './store.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
const FONT = '"Press Start 2P", monospace';

// A shortcut's surface unless the room paints its own: a faint strip, dashed edges.
const drawCut = (g, w, h) => {
  g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.8)';
  for (const x of [3, w - 9]) for (let y = 0; y < h; y += 32) g.fillRect(x, y, 6, 16);
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
    // Another room can mean another kind of vehicle, so the old ones go.
    for (const id of [...this.cars.keys()]) this.dropCar(id);
    const look = this.look = lookOf(world.def.id), theme = this.theme = look.theme;
    this.root.background = new THREE.Color(theme.bg);
    this.root.fog.color.set(theme.bg);
    this.hemi.color.set(theme.sky); this.hemi.groundColor.set(theme.ground);
    this.sun.color.set(theme.sun);

    const g = this.worldGroup = new THREE.Group(), room = this.roomKit(g, world);
    look.build(room);
    this.buildTrack(g, world);
    look.dress?.(room);

    const props = new THREE.Group();
    for (const p of world.props) {
      const m = buildProp(p.m, { color: p.c });
      m.position.set(p.x, 0, p.z); m.rotation.y = p.rot;
      props.add(m);
    }
    g.add(mergeStatic(props));

    this.movers = world.movers.map((mv) => {
      const holder = new THREE.Group(), roll = new THREE.Group(), model = buildProp(mv.m, { color: mv.c });
      const pop = mv.kind === 'pop', rolls = !pop && (mv.roll ?? (mv.m === 'ball' || mv.m === 'toyBall'));
      if (rolls) { roll.position.y = mv.r; model.position.y = -mv.r; }
      roll.add(model); holder.add(roll); g.add(holder);
      let mark = null;
      if (pop) {
        // Where it comes down: a faint ring all the time, a closing red one while it is in the air.
        mark = new THREE.Mesh(this.own(new THREE.RingGeometry(mv.r * 0.8, mv.r, 28).rotateX(-Math.PI / 2)),
          this.own(new THREE.MeshBasicMaterial({ color: '#ff3b3b', transparent: true, opacity: 0.2, depthWrite: false })));
        mark.position.set(mv.to[0], 0.08, mv.to[1]); mark.renderOrder = 2;
        g.add(mark);
      }
      return { mv, holder, roll, rolls, pop, mark, lx: mv.x, lz: mv.z };
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

  // What a room's look builds with (see rooms/index.js).
  roomKit(g, world) {
    const { hx, hz } = world, own = (x) => this.own(x);
    const lam = (opts) => own(new THREE.MeshLambertMaterial(opts));
    const box = (sx, sy, sz, x, y, z, mat, shadow = true) => {
      const m = new THREE.Mesh(own(new THREE.BoxGeometry(sx, sy, sz)), mat);
      m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix();
      g.add(m);
      return m;
    };
    const plane = (sx, sz, y, mat) => {
      const m = new THREE.Mesh(own(new THREE.PlaneGeometry(sx, sz).rotateX(-Math.PI / 2)), mat);
      m.position.y = y; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix();
      g.add(m);
      return m;
    };
    const tex = (wd, ht, draw, opts) => own(canvasTex(wd, ht, draw, { aniso: this.aniso, ...opts }));
    return { THREE, g, world, w: hx * 2, d: hz * 2, hx, hz, theme: this.theme, own, lam, box, plane, tex };
  }

  // A painted strip along a line of { x, z, nx, nz, u } points: u runs across it, v along.
  strip(g, pts, half, y, paint, reps) {
    const pos = [], uv = [], idx = [], n = pts.length - 1;
    pts.forEach((p, i) => {
      pos.push(p.x + p.nx * half, y, p.z + p.nz * half, p.x - p.nx * half, y, p.z - p.nz * half);
      uv.push(p.u, (i / n) * reps, 1 - p.u, (i / n) * reps);
      if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    });
    const geo = this.own(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const map = this.own(canvasTex(128, 128, paint, { aniso: this.aniso }));
    const mesh = new THREE.Mesh(geo, this.own(new THREE.MeshLambertMaterial({ map, transparent: true, depthWrite: false, side: THREE.DoubleSide })));
    mesh.receiveShadow = true; mesh.renderOrder = 1;
    g.add(mesh);
    return mesh;
  }

  buildTrack(g, world) {
    const { track } = world, n = track.n, half = track.hw + 0.55;
    // Where the lap crosses itself, skip the edge lines so the junction reads as open road.
    const crossing = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j += 2) {
        const gap = Math.abs(i - j);
        if (Math.min(gap, n - gap) < 40) continue;
        if (Math.hypot(track.sx[i] - track.sx[j], track.sz[i] - track.sz[j]) < track.hw * 1.5) { crossing[i] = 1; break; }
      }
    }
    // Shortcuts go down first so the road is painted over where they join it.
    for (const c of world.cuts) {
      const pts = [];
      for (let i = 0; i < c.n; i++) {
        const a = Math.max(0, i - 1), b = Math.min(c.n - 1, i + 1), dx = c.x[b] - c.x[a], dz = c.z[b] - c.z[a], l = Math.hypot(dx, dz) || 1;
        pts.push({ x: c.x[i], z: c.z[i], nx: dz / l, nz: -dx / l, u: 0 });
      }
      this.strip(g, pts, c.hw, 0.04, this.look.cut || drawCut, Math.max(1, Math.round(c.n / 9)));
    }
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const k = i % n;
      pts.push({ x: track.sx[k], z: track.sz[k], nx: track.nx[k], nz: track.nz[k], u: crossing[k] ? 0.2 : 0 });
    }
    this.strip(g, pts, half, 0.05, this.look.ribbon, Math.max(1, Math.round(track.len / 9)));

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
  }

  // ---- cars -----------------------------------------------------------------

  carVis(car, myCar) {
    let v = this.cars.get(car.id);
    if (!v) {
      const group = new THREE.Group(), body = buildVehicle(this.world ? this.world.def.vehicle : 'car', car.color, car.id % 4);
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
    const a = game.alpha, blink = Math.floor(this.t * 12) % 2 === 0, V = game.world.veh;
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
      // A little body roll into corners and nose-up in the air. Helicopters hang
      // above the surface (a flattened one is knocked down) and bank; boats bob and lean.
      const sp = Math.hypot(car.vx, car.vz), ud = v.body.userData;
      const up = V.hover * clamp((v.flat - 0.28) / 0.72, 0, 1);
      v.body.position.y = up + (V.hover ? Math.sin(this.t * 3 + car.id) * 0.12 : ud.bob ? Math.sin(this.t * 4 + car.id * 1.7) * 0.05 : 0);
      v.roll = lerp(v.roll, car.steer * Math.min(1, sp / 20) * (V.hover ? 0.3 : ud.bob ? 0.2 : 0.09), k);
      v.body.rotation.z = v.roll;
      v.body.rotation.x = car.fallT > 0 ? car.spin * 0.7 : V.hover ? 0.16 * Math.min(1, sp / V.maxSpeed) : -clamp(y * 0.12, 0, 0.3);
      if (ud.wheels) { ud.wheels[0].rotation.y = ud.wheels[1].rotation.y = -car.steer * 0.45; }
      if (ud.turret) ud.turret.rotation.y = lerp(ud.turret.rotation.y, -car.steer * 0.5, k);
      if (ud.spin) for (const s of ud.spin) s.o.rotation[s.axis] += s.rate * dt;
      if (car.shieldT > 0 && !v.shield) { v.shield = buildShield(); v.group.add(v.shield); }
      if (v.shield) {
        v.shield.visible = car.shieldT > 0;
        const pulse = 1 + Math.sin(this.t * 9) * 0.05;
        v.shield.scale.setScalar(pulse * v.scale);
        v.shield.position.y = up;
      }
      if (v.tag) { v.tag.visible = car.fallT <= 0; v.tag.position.y = 2.2 + up; }
      const lift = clamp(1 - (y + up) / 9, 0.35, 1) * v.scale;
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
      mo.holder.position.set(mv.x, mv.y, mv.z);
      mo.holder.visible = !mv.hidden;
      if (mo.pop) {
        const flying = !mv.hidden && mv.fly < 1;
        mo.roll.rotation.x = mv.fly * Math.PI * 4;
        mo.mark.material.opacity = flying ? 0.55 + 0.4 * Math.sin(t * 30) : 0.2;
        mo.mark.scale.setScalar(flying ? 2.2 - mv.fly * 1.2 : 1);
      } else if (mo.rolls) {
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
