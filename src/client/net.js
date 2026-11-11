// Two ways to reach a race room, with the same interface: over a WebSocket to
// the server, or straight to a Room running in this tab (solo play, offline).

import { Room } from '../shared/room.js';

export class WsConn {
  constructor() {
    this.onmsg = () => {}; this.onclose = () => {};
    this.offset = 0; this.bestRtt = Infinity; this.open = false;
  }

  connect() {
    return new Promise((ok, fail) => {
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      this.ws = ws;
      ws.onopen = () => { this.open = true; this.pinger = setInterval(() => this.send({ t: 'ping', c: Date.now() }), 2000); ok(this); };
      ws.onerror = () => fail(new Error('Could not reach the race server'));
      ws.onclose = () => { clearInterval(this.pinger); const was = this.open; this.open = false; if (was) this.onclose(); };
      ws.onmessage = (e) => {
        let m;
        try { m = JSON.parse(e.data); } catch { return; }
        if (m.t === 'pong') {
          // Keep the clock offset from the quickest round trip seen so far.
          const rtt = Date.now() - m.c;
          if (rtt < this.bestRtt) { this.bestRtt = rtt; this.offset = m.now + rtt / 2 - Date.now(); }
          this.rtt = rtt;
          return;
        }
        if (m.t === 'joined' && this.bestRtt === Infinity) this.offset = m.now - Date.now();
        this.onmsg(m);
      };
    });
  }

  now() { return Date.now() + this.offset; }
  send(m) { if (this.open) this.ws.send(JSON.stringify(m)); }
  close() { this.open = false; clearInterval(this.pinger); this.ws?.close(); }
}

export class LocalConn {
  constructor({ name, color, bots, kind = 'solo' }) {
    this.onmsg = () => {}; this.onclose = () => {};
    this.open = true; this.rtt = 0;
    // Solo laps still count for the global board when the server is reachable.
    const records = {
      submit: (track, who, ms) => fetch('/api/records', { method: 'POST', body: JSON.stringify({ track, name: who, ms }) })
        .then((r) => r.json()).catch(() => ({})),
    };
    this.room = new Room({ kind, records, send: (id, m) => queueMicrotask(() => this.open && this.onmsg(m)) });
    if (bots !== undefined) this.room.settings.bots = bots;
    this.timer = setInterval(() => this.room.tick(1 / 15), 1000 / 15);
    queueMicrotask(() => this.room.addClient('me', { name, color }));
  }

  now() { return Date.now(); }
  send(m) { if (this.open) queueMicrotask(() => this.open && this.room.onMessage('me', m)); }
  close() { this.open = false; clearInterval(this.timer); }
}
