// Phone-as-controller for a big-screen party: steering, brake, power-up and
// horn buttons, and a line of status. The race itself is drawn on the shared screen.

import { bindPad } from './input.js';
import { ITEMS, SHELL } from '../shared/items.js';
import { COLORS, LIGHTS } from '../shared/room.js';
import { ordinal } from './store.js';

export class Pad {
  constructor(root, conn, { you, car, onLeave, click }) {
    Object.assign(this, { root, conn, you, car });
    this.state = { s: 0, b: 0, u: 0 };
    this.phase = 'lobby'; this.canStart = false;
    root.className = 'on padui';
    root.innerHTML = `
      <div class="pad">
        <header><i></i><b class="who"></b><span class="st"></span><button class="btn back" data-leave>✕</button></header>
        <div class="msg"><p></p><button class="btn primary big" data-start hidden>START ▶</button></div>
        <div class="steer" data-pad="steer"><span class="arrow l">◀</span><span class="arrow r">▶</span></div>
        <div class="tb brake" data-pad="brake">BRAKE</div>
        <div class="tb horn" data-pad="horn">HORN</div>
        <div class="tb item" data-pad="item"><span class="glyph"></span></div>
      </div>`;
    const q = (s) => root.querySelector(s);
    this.el = { dot: q('header i'), who: q('.who'), st: q('.st'), msg: q('.msg p'), start: q('[data-start]'), item: q('.item'), glyph: q('.item .glyph'), pad: q('.pad') };
    q('[data-leave]').addEventListener('click', onLeave);
    this.el.start.addEventListener('click', () => { click(); conn.send({ t: 'start' }); });
    bindPad(root, {
      steer: (dir) => { this.state.s = dir; this.push(); },
      brake: (on) => { this.state.b = on ? 1 : 0; this.push(); },
      item: () => { this.state.u++; this.push(); navigator.vibrate?.(15); },
      horn: () => { if (this.phase === 'racing') conn.send({ t: 'horn' }); },
    });
    // Repeat the state so a lost packet or a dozing phone cannot leave a car stuck turning.
    this.timer = setInterval(() => this.push(), 100);
  }

  push() {
    if (this.phase === 'countdown' || this.phase === 'racing') this.conn.send({ t: 'pad', ...this.state });
  }

  destroy() { clearInterval(this.timer); this.root.className = ''; this.root.innerHTML = ''; }

  onMessage(m) {
    const el = this.el;
    switch (m.t) {
      case 'joined': case 'room': {
        this.phase = m.phase;
        const mine = m.cars.find((c) => c.id === this.car);
        if (mine) { el.who.textContent = mine.name; el.dot.style.background = COLORS[mine.color] || COLORS[0]; el.pad.style.setProperty('--c', COLORS[mine.color] || COLORS[0]); }
        this.canStart = m.cars.find((c) => c.pad)?.pad === this.you;
        if (m.phase === 'lobby') { this.say(this.canStart ? 'EVERYONE IN? YOU START THE RACE.' : 'YOU ARE IN. WATCH THE BIG SCREEN.'); el.st.textContent = `${m.cars.filter((c) => !c.bot).length} PLAYERS`; this.setItem(null); }
        else if (mine && mine.waiting) this.say(mine.lives === 0 ? 'NO LIVES LEFT. CHEER FROM THE SOFA.' : 'RACE UNDER WAY. YOU JOIN THE NEXT ONE.');
        el.start.hidden = !(this.canStart && (m.phase === 'lobby' || m.phase === 'results'));
        el.start.textContent = m.phase !== 'results' ? 'START ▶' : m.cup && !m.cup.done ? 'NEXT ROOM ▶' : 'RACE AGAIN ▶';
        break;
      }
      case 'race': case 'regrid': this.phase = 'countdown'; this.say(''); el.start.hidden = true; break;
      case 'padst':
        this.phase = 'racing';
        el.st.textContent = m.mode === 'elim' ? `${ordinal(m.pos)} · ${m.lights ?? LIGHTS.start}/${LIGHTS.total} LIGHTS`
          : `${ordinal(m.pos)}/${m.of} · LAP ${m.lap}/${m.laps}${m.lives !== undefined ? ` · ${m.lives} ${m.lives === 1 ? 'LIFE' : 'LIVES'}` : ''}`;
        this.setItem(m.item);
        if (m.out) this.say('OUT! BACK NEXT ROUND.'); else if (m.fin) this.say('FINISHED!'); else this.say('');
        break;
      case 'results': {
        this.phase = 'results';
        const i = m.order.findIndex((c) => c.id === this.car);
        const c = m.order[i], champ = m.cup && m.cup.done && m.cup.champion === this.car;
        this.say(i < 0 ? 'RACE OVER' : champ ? 'YOU WIN THE CUP!' : `YOU FINISHED ${ordinal(i + 1)}${c.gained ? `  +${c.gained} PTS` : ''}${m.cup && c.lost ? (c.lives > 0 ? '  ONE LIFE LOST' : '  NO LIVES LEFT') : ''}`);
        this.setItem(null);
        navigator.vibrate?.(i === 0 ? [60, 60, 60, 60, 200] : 80);
        break;
      }
      default:
    }
    el.msg.parentElement.classList.toggle('on', !!el.msg._t || !el.start.hidden);
  }

  say(text) { if (this.el.msg._t !== text) { this.el.msg._t = text; this.el.msg.textContent = text; } }

  setItem(item) {
    if (this.item === item) return;
    this.item = item;
    const info = item === 'shell' ? SHELL : item ? ITEMS[item] : null;
    this.el.glyph.textContent = info ? info.glyph : '';
    this.el.item.classList.toggle('has', !!info);
    this.el.item.style.setProperty('--c', info ? info.color : '');
    if (info && item !== 'shell') navigator.vibrate?.(25);
  }
}
