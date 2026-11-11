# Mini Racing

Miniature cars racing round a house. A top-down 3D racer in the spirit of the
16-bit classics, for up to 16 players, in the browser and built for phones.

Play it at <https://miniracing.hammantlabs.com>.

## What's in it

- **Four rooms**: the breakfast table (mind the milk, and the edge), a figure of
  eight on the snooker table, the kitchen floor and the bedroom road rug.
- **Up to 16 cars** in a race. Bots fill the grid if you want them.
- **Three ways to play**
  - *Solo*: you against seven bots, no connection needed once the page has loaded.
  - *Online room*: start a room, share the four-letter code or the QR code, and
    everyone races on their own device.
  - *Big screen party*: put the race on a TV or laptop and everyone uses their
    phone as a controller.
- **Two modes**: a lap race with a camera on your own car, or elimination, where
  everyone shares one camera and falling off the back of the screen puts you out.
- **Power-ups** in boxes on the track: turbo, rocket, oil, shield, mallet and
  shrink ray. The leaders get things to defend with, the back of the pack gets
  things to catch up with.
- **Catch-up**: cars at the back get a little extra top speed and bots ease off
  when they are well clear. Switch it off in the lobby for a straight fight.
- **Lap records**: your own best per track is kept on your device, and there is a
  public top ten per track.
- A **16-bit look** switch and a classic fixed-north camera in the settings.

## Controls

| | Keyboard | Phone |
|---|---|---|
| Steer | ◀ ▶ or A D | left and right pads |
| Accelerate | ▲ or W | automatic (can be turned off in settings) |
| Brake / reverse | ▼ or S | BRAKE |
| Use power-up | Space, Shift, X or Enter | the round button above BRAKE |
| Menu | Esc or P | the pause button |

Gamepads work too.

## Run it yourself

Needs Node 22 or newer.

```bash
npm install
npm run dev        # game server on :8080, Vite on http://localhost:5173
```

For a production-style run:

```bash
npm run build
npm start          # serves dist/ and the rooms on $PORT (default 8080)
```

Or with Docker:

```bash
docker build -t miniracing .
docker run -p 8080:8080 -v miniracing-data:/data miniracing
```

### Settings

All by environment variable, none of them secret.

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `8080` | Port to listen on |
| `DATA_DIR` | `./data` | Where `records.json` (the lap-record board) is kept |
| `ALLOWED_ORIGINS` | none | Extra `host[:port]` values allowed to open a socket, comma-separated. The page's own host is always allowed |
| `TRUST_PROXY` | off | Set to `1` behind a reverse proxy so per-address limits use `X-Forwarded-For` |

## Tests

```bash
npm test             # race simulation, room rules and server, no browser
npm run build && npm run test:e2e
BASE_URL=https://your.host node test/e2e/live.js   # smoke test of a deployed copy
```

The end-to-end run drives real Chrome (through `playwright-core`, using the
Chrome already on your machine) against a real server: a solo race to the flag,
an elimination game, a full 16-player room, a late joiner and a big-screen party
with two phones as pads. Screenshots land in `test/e2e/shots/`.

Two more tools: `npm run sim` races bots headlessly and prints lap times, and
`npm run map` draws each track as an SVG.

## How it fits together

```text
src/shared/   track geometry, car physics, bot driving, power-ups and the room
              rules. Plain JavaScript with no DOM, used by client and server alike.
src/client/   Three.js scene, procedural models, WebAudio sound, HUD, menus,
              touch controls and the phone-pad screen.
server/       static files, the WebSocket rooms and the record board.
```

Each device simulates the cars it owns (your own car; the host also runs the
bots; a big screen runs the cars of its phone pads) and sends their state 15
times a second. The server relays, keeps the room and the race clock, decides
lap counts and results, and other players' cars are smoothed between updates.
A solo game uses the same room code in the page, with no server involved.

Everything you see and hear is generated in code: there are no model, texture
or audio files.

The server keeps no accounts and no personal data. A lap record is a name of up
to ten characters, a time and a date.

## Licence

MIT. See [LICENSE](LICENSE).
