// Driving input from keyboard, touch buttons and gamepads, merged into one
// { steer, throttle, brake } reading plus "item" and "horn" taps.

const keys = new Set();
const touch = { left: false, right: false, brake: false };
let itemTaps = 0, pauseTaps = 0, hornTaps = 0, padItemHeld = false, padHornHeld = false;

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake',
};
const ITEM_KEYS = new Set(['Space', 'ShiftLeft', 'ShiftRight', 'KeyX', 'Enter']);

export function initInput(root) {
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); e.preventDefault(); }
    else if (ITEM_KEYS.has(e.code) && !e.repeat) { itemTaps++; e.preventDefault(); }
    else if (e.code === 'KeyH' && !e.repeat) hornTaps++;
    else if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) pauseTaps++;
  });
  addEventListener('keyup', (e) => keys.delete(KEYMAP[e.code]));
  addEventListener('blur', () => { keys.clear(); touch.left = touch.right = touch.brake = false; });

  root.innerHTML = `
    <div class="steer" data-pad="steer"><span class="arrow l">◀</span><span class="arrow r">▶</span></div>
    <div class="tb brake" data-pad="brake">BRAKE</div>
    <div class="tb item" data-pad="item"><span class="glyph"></span></div>
    <div class="tb horn" data-pad="horn">HORN</div>`;
  bindPad(root, {
    steer: (dir) => { touch.left = dir < 0; touch.right = dir > 0; },
    brake: (on) => { touch.brake = on; },
    item: () => { itemTaps++; },
    horn: () => { hornTaps++; },
  });
}

// iOS Safari zooms the page on a double tap or a pinch whatever the viewport tag
// and touch-action say, and a zoomed game cannot be played or zoomed back out.
// So: refuse the gestures, and if the page ends up zoomed anyway, undo it.
export function stopZoom() {
  const opts = { passive: false }, stop = (e) => e.preventDefault();
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, stop, opts);
  let x = 0, y = 0, lastEnd = 0;
  document.addEventListener('touchstart', (e) => {
    ({ clientX: x, clientY: y } = e.touches[0]);
    if (e.target.closest?.('canvas, [data-pad]')) e.preventDefault(); // nothing here needs a click
  }, opts);
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, opts);
  // The second tap of a quick pair is the one that zooms. Swallow it, and press
  // the button under it ourselves so fast taps on a menu still count.
  document.addEventListener('touchend', (e) => {
    const quick = e.timeStamp - lastEnd < 400, t = e.changedTouches[0];
    lastEnd = e.timeStamp;
    if (!quick || !e.cancelable || e.target.closest?.('input')) return;
    e.preventDefault();
    if (Math.hypot(t.clientX - x, t.clientY - y) < 12) e.target.closest?.('button')?.click();
  }, opts);
  fitToView();
}

// Shrinks the page back to what is visible, so a zoom that gets through shows nothing odd.
function fitToView() {
  const vv = window.visualViewport;
  if (!vv) return;
  const fit = () => {
    const on = vv.scale > 1.01, { style } = document.body;
    style.transformOrigin = on ? '0 0' : '';
    style.transform = on ? `translate(${vv.offsetLeft}px, ${vv.offsetTop}px) scale(${1 / vv.scale})` : '';
  };
  vv.addEventListener('resize', fit);
  vv.addEventListener('scroll', fit);
}

// Touch pad wiring, shared with the phone-controller page. `steer` gets -1/0/1
// from which half of the pad the finger is on, so sliding across flips sides.
export function bindPad(root, { steer, brake, item, horn }) {
  const steerEl = root.querySelector('[data-pad=steer]'), brakeEl = root.querySelector('[data-pad=brake]'), itemEl = root.querySelector('[data-pad=item]');
  const fingers = new Map();
  const update = () => {
    let dir = 0;
    for (const d of fingers.values()) dir = d; // the newest finger wins
    steerEl.classList.toggle('l', dir < 0); steerEl.classList.toggle('r', dir > 0);
    steer(dir);
  };
  const side = (e) => { const r = steerEl.getBoundingClientRect(); return e.clientX < r.left + r.width / 2 ? -1 : 1; };
  steerEl.addEventListener('pointerdown', (e) => { e.preventDefault(); steerEl.setPointerCapture(e.pointerId); fingers.set(e.pointerId, side(e)); update(); });
  steerEl.addEventListener('pointermove', (e) => { if (fingers.has(e.pointerId)) { fingers.set(e.pointerId, side(e)); update(); } });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) steerEl.addEventListener(ev, (e) => { fingers.delete(e.pointerId); update(); });

  const hold = (el, fn) => {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('on'); fn(true); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, () => { el.classList.remove('on'); fn(false); });
  };
  hold(brakeEl, brake);
  hold(itemEl, (on) => { if (on) item(); });
  hold(root.querySelector('[data-pad=horn]'), (on) => { if (on) horn(); });
  root.addEventListener('contextmenu', (e) => e.preventDefault());
}

// One reading per physics step. With auto-gas the car drives itself forward
// and you only steer and brake, which is what works on a phone.
export function readInput(autoGas, out) {
  let steer = (keys.has('right') || touch.right ? 1 : 0) - (keys.has('left') || touch.left ? 1 : 0);
  let gas = keys.has('gas') ? 1 : 0, brake = keys.has('brake') || touch.brake ? 1 : 0;
  for (const gp of (navigator.getGamepads?.() || [])) {
    if (!gp || !gp.connected) continue;
    const b = (i) => gp.buttons[i]?.value || 0;
    if (Math.abs(gp.axes[0]) > 0.15) steer = gp.axes[0];
    if (b(14)) steer = -1; else if (b(15)) steer = 1;
    gas = Math.max(gas, b(7), b(0)); brake = Math.max(brake, b(6), b(1));
    const held = b(2) > 0.5 || b(3) > 0.5 || b(5) > 0.5;
    if (held && !padItemHeld) itemTaps++;
    padItemHeld = held;
    const honk = b(4) > 0.5 || b(10) > 0.5;
    if (honk && !padHornHeld) hornTaps++;
    padHornHeld = honk;
    if (b(9) > 0.5 && !gp.pauseHeld) pauseTaps++;
    gp.pauseHeld = b(9) > 0.5;
    break;
  }
  out.steer = Math.max(-1, Math.min(1, steer));
  out.throttle = brake ? 0 : autoGas ? 1 : gas;
  out.brake = brake;
  return out;
}

export function takeItemTap() { const n = itemTaps; itemTaps = 0; return n > 0; }
export function takeHornTap() { const n = hornTaps; hornTaps = 0; return n > 0; }
export function takePauseTap() { const n = pauseTaps; pauseTaps = 0; return n > 0; }
