// Short-lived things: dust, flames, sparks, confetti, shockwave rings, and the
// rockets and oil slicks that live on the track for a while.

import * as THREE from 'three';
import { buildRocket, buildOil } from './models.js';
import { rocketPos, TUNING } from '../shared/items.js';

const MAX = 520, RINGS = 10;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[(Math.random() * list.length) | 0];
const CONFETTI = ['#e63946', '#3a86ff', '#ffbe0b', '#2ec4b6', '#f72585', '#8ac926', '#ffffff'];
const FIRE = ['#fff3b0', '#ffbe0b', '#fb5607', '#e63946'];
const SMOKE = ['#f5f5f5', '#d9d9d9', '#bdbdbd'];

export class Fx {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ fog: false }), MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color('#fff'));
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.renderOrder = 4;
    scene.root.add(this.mesh);
    const ringGeo = new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2);
    this.rings = Array.from({ length: RINGS }, () => {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false; m.renderOrder = 4;
      scene.root.add(m);
      return { m, t: 0, life: 0, r: 1 };
    });
    this.hazards = new Map();
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler();
    this.v = new THREE.Vector3(); this.s = new THREE.Vector3(); this.c = new THREE.Color();
  }

  clear() {
    this.parts.length = 0;
    for (const h of this.hazards.values()) this.scene.root.remove(h.mesh);
    this.hazards.clear();
    for (const r of this.rings) r.m.visible = false;
  }

  // ---- emitters -------------------------------------------------------------

  spawn(x, y, z, vx, vy, vz, life, size, color, grav = 0, drag = 0, grow = 0) {
    if (this.parts.length >= MAX) this.parts.shift();
    this.parts.push({ x, y, z, vx, vy, vz, t: 0, life, size, color, grav, drag, grow, rot: Math.random() * 6, spin: rand(-8, 8) });
  }

  burst(x, y, z, { n = 12, colors = SMOKE, speed = 8, up = 6, life = 0.6, size = 0.35, grav = 18, drag = 1.5, grow = 0 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = speed * rand(0.35, 1);
      this.spawn(x, y, z, Math.cos(a) * sp, up * rand(0.3, 1), Math.sin(a) * sp, life * rand(0.6, 1.2), size * rand(0.7, 1.3), pick(colors), grav, drag, grow);
    }
  }

  ring(x, z, color, radius, life = 0.5) {
    const r = this.rings.reduce((a, b) => (!b.m.visible || b.t / b.life > a.t / a.life ? b : a));
    r.m.visible = true; r.m.material.color.set(color); r.m.position.set(x, 0.25, z);
    r.t = 0; r.life = life; r.r = radius;
  }

  confetti(x, z, n = 60) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(2, 9);
      this.spawn(x, 1, z, Math.cos(a) * sp, rand(9, 17), Math.sin(a) * sp, rand(1.2, 2.2), rand(0.25, 0.4), pick(CONFETTI), 14, 1.2);
    }
  }

  // ---- game events ----------------------------------------------------------

  on(type, d) {
    const car = d && d.car, dust = [this.scene.theme?.dust || '#eee', '#fff'];
    switch (type) {
      case 'pickup': this.burst(car.x, 1.2, car.z, { n: 14, colors: ['#ffe066', '#fff', '#ffbe0b'], speed: 7, up: 7, life: 0.5, size: 0.3 }); break;
      case 'use':
        if (d.kind === 'boost') this.burst(d.x, 0.5, d.z, { n: 16, colors: FIRE, speed: 6, up: 3, life: 0.4, size: 0.4, grav: 0 });
        else if (d.kind === 'mallet') {
          this.ring(d.x, d.z, '#fff', TUNING.malletR, 0.45); this.ring(d.x, d.z, '#ffbe0b', TUNING.malletR * 0.7, 0.6);
          this.burst(d.x, 0.3, d.z, { n: 34, colors: dust, speed: 22, up: 5, life: 0.6, size: 0.5, drag: 4 });
        } else if (d.kind === 'zap') {
          this.ring(d.x, d.z, '#b388ff', 46, 0.7);
          for (const id of d.targets || []) { const t = this.gameCar?.(id); if (t) this.burst(t.x, 1, t.z, { n: 12, colors: ['#b388ff', '#fff', '#7b2cbf'], speed: 6, up: 8, life: 0.5, size: 0.28 }); }
        } else if (d.kind === 'shield') this.ring(d.x, d.z, '#4cc9f0', 4, 0.4);
        break;
      case 'hit':
        if (d.blocked) this.burst(car.x, 1, car.z, { n: 16, colors: ['#4cc9f0', '#fff'], speed: 10, up: 6, life: 0.4, size: 0.3 });
        else if (d.kind === 'rocket') {
          this.burst(car.x, 0.8, car.z, { n: 30, colors: FIRE, speed: 13, up: 10, life: 0.55, size: 0.55, grav: 10 });
          this.burst(car.x, 1, car.z, { n: 12, colors: ['#555', '#777', '#333'], speed: 5, up: 7, life: 1, size: 0.7, grav: -2, grow: 1.2 });
          this.ring(car.x, car.z, '#ffbe0b', 6, 0.35);
        } else this.burst(car.x, 0.3, car.z, { n: 16, colors: ['#1b1b24', '#3b3355'], speed: 8, up: 6, life: 0.5, size: 0.35 });
        break;
      case 'shieldPop': this.burst(car.x, 1, car.z, { n: 20, colors: ['#4cc9f0', '#caf0f8', '#fff'], speed: 11, up: 7, life: 0.45, size: 0.3 }); break;
      case 'squashed': this.burst(car.x, 0.3, car.z, { n: 12, colors: dust, speed: 9, up: 2, life: 0.4, size: 0.4, drag: 4 }); break;
      case 'hazardGone': {
        const h = this.hazards.get(d.hz.id);
        if (h && d.fizzle) this.burst(h.mesh.position.x, 0.6, h.mesh.position.z, { n: 8, colors: SMOKE, speed: 3, up: 3, life: 0.5, size: 0.35, grav: 0 });
        break;
      }
      case 'respawn': this.burst(car.x, 1, car.z, { n: 14, colors: ['#fff', '#ffe066', '#caf0f8'], speed: 5, up: 9, life: 0.6, size: 0.26, grav: 6 }); break;
      case 'land': this.burst(car.x, 0.2, car.z, { n: 8, colors: dust, speed: 6, up: 2, life: 0.35, size: 0.35, drag: 4 }); break;
      case 'bump': if ((d.data ?? 1) > 0.35) this.burst(car.x, 0.6, car.z, { n: 5, colors: ['#fff', '#ffe066'], speed: 6, up: 4, life: 0.25, size: 0.18 }); break;
      case 'pad': this.burst(car.x, 0.4, car.z, { n: 10, colors: ['#ffe066', '#ff9f1c'], speed: 5, up: 5, life: 0.35, size: 0.28 }); break;
      case 'finish': this.confetti(car.x, car.z, car.finPos === 1 ? 90 : 30); break;
      case 'out':
        this.burst(car.x, 0.8, car.z, { n: 18, colors: ['#555', '#888', '#fff'], speed: 7, up: 8, life: 0.8, size: 0.6, grav: -1, grow: 1 });
        this.ring(car.x, car.z, '#e63946', 5, 0.4);
        break;
      default:
    }
  }

  // ---- per frame ------------------------------------------------------------

  update(game, dt) {
    if (game && game.world) { this.gameCar = (id) => game.cars.get(id); this.trails(game, dt); this.syncHazards(game, dt); }
    const { parts, mesh, m4, q, e, v, s, c } = this;
    let n = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.t += dt;
      if (p.t >= p.life) continue;
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k; p.vz *= k; p.vy = p.vy * k - p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.08 && p.vy < 0) { p.y = 0.08; p.vy *= -0.35; p.vx *= 0.6; p.vz *= 0.6; }
      p.rot += p.spin * dt;
      const f = p.t / p.life, size = p.size * (1 + p.grow * f) * (f > 0.6 ? (1 - f) / 0.4 : 1);
      m4.compose(v.set(p.x, p.y, p.z), q.setFromEuler(e.set(p.rot, p.rot * 0.7, 0)), s.set(size, size, size));
      mesh.setMatrixAt(n, m4);
      mesh.setColorAt(n, c.set(p.color));
      parts[n++] = p;
    }
    parts.length = n;
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    for (const r of this.rings) {
      if (!r.m.visible) continue;
      r.t += dt;
      const f = r.t / r.life;
      if (f >= 1) { r.m.visible = false; continue; }
      const rad = r.r * (1 - (1 - f) * (1 - f));
      r.m.scale.set(rad, 1, rad);
      r.m.material.opacity = (1 - f) * 0.85;
    }
  }

  // Flames behind boosting cars, dust from sliding and off-road wheels.
  trails(game, dt) {
    const dust = this.scene.theme?.dust || '#eee';
    for (const car of game.cars.values()) {
      if (!car.active || car.out || car.waiting || car.fallT > 0) continue;
      const sh = Math.sin(car.h), ch = Math.cos(car.h), sp = Math.hypot(car.vx, car.vz);
      const bx = car.x - sh * 1.0, bz = car.z - ch * 1.0;
      if (car.boostT > 0 && Math.random() < dt * 70) {
        this.spawn(bx + rand(-0.3, 0.3), 0.45, bz + rand(-0.3, 0.3), -sh * 5 + car.vx * 0.3, rand(0, 2), -ch * 5 + car.vz * 0.3, rand(0.18, 0.32), rand(0.3, 0.5), pick(FIRE));
      }
      if (car.y > 0.05) continue;
      const slide = Math.abs(car.vx * ch - car.vz * sh);
      if ((slide > 7 || (car.offT > 0 && sp > 9) || car.spinT > 0) && Math.random() < dt * 34) {
        const side = Math.random() < 0.5 ? -0.5 : 0.5;
        this.spawn(bx + ch * side, 0.15, bz - sh * side, rand(-1, 1), rand(1, 2.5), rand(-1, 1), rand(0.35, 0.6), rand(0.3, 0.45), dust, -1, 1, 1.4);
      }
    }
  }

  syncHazards(game, dt) {
    const now = game.conn.now(), track = game.world.track;
    for (const [id, h] of this.hazards) {
      if (!game.hazards.has(id)) { this.scene.root.remove(h.mesh); this.hazards.delete(id); }
    }
    for (const hz of game.hazards.values()) {
      let h = this.hazards.get(hz.id);
      if (!h) {
        const mesh = hz.kind === 'rocket' ? buildRocket() : buildOil();
        if (hz.kind === 'oil') { mesh.position.set(hz.x, 0.02, hz.z); mesh.rotation.y = hz.id * 2.4; mesh.renderOrder = 2; }
        this.scene.root.add(mesh);
        h = { mesh, t: 0 };
        this.hazards.set(hz.id, h);
      }
      h.t += dt;
      if (hz.kind === 'rocket') {
        const p = rocketPos(track, hz, Math.max(0, (now - hz.t0) / 1000));
        h.mesh.position.set(p.x, 0, p.z); h.mesh.rotation.y = p.h;
        if (Math.random() < dt * 60) this.spawn(p.x - Math.sin(p.h) * 0.9, 0.7, p.z - Math.cos(p.h) * 0.9, rand(-1, 1), rand(0, 1.5), rand(-1, 1), rand(0.3, 0.5), rand(0.25, 0.4), pick(Math.random() < 0.3 ? FIRE : SMOKE), -1, 1, 1.5);
      } else {
        const k = Math.min(1, h.t * 5), fade = Math.min(1, Math.max(0, (hz.until - now) / 800));
        h.mesh.scale.setScalar(Math.max(0.01, k * fade));
      }
    }
  }
}
