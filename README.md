# Mini Racing

Miniature cars racing round a house. A top-down 3D racer in the spirit of the
16-bit classics, for up to 16 players, in the browser and built for phones.

Play it at <https://miniracing.hammantlabs.com>.

## What's in it

- **Nine rooms**, each with its own vehicle and its own way of handling:

  | Room | You drive | Watch out for |
  |---|---|---|
  | Breakfast table | cars | the milk, the table edge, a risky cut across the cereal |
  | Snooker table | cars | a figure of eight with snooker balls rolling across it |
  | Kitchen floor | cars | a toaster that pops, a rolling tin |
  | Bedroom rug | cars | a book ramp and a toy train with right of way |
  | Bathtub | boats | rubber ducks, a submarine, a cut past the soap |
  | Garden path | helicopters | they float over the bumps and take the corners wide |
  | Garage workbench | cars | a plank jump and a long drop off the bench |
  | School desk | tanks | each other's shells, ruler jumps, rolling pencils, a cut across the exercise book |
  | Pool table | cars | pool balls on the move |

- **Up to 16 vehicles** in a race. Bots fill the grid if you want them.
- **Powerslides**: tap the brake with the wheel hard over and the tail steps
  out. The car turns tighter than it can by gripping, leaves rubber on the
  floor, and if you hold the slide for half a second it pays you a short push
  when you straighten up. Boats do a gentler version; tanks and helicopters
  do not slide.
- **Tanks shoot**: on the school desk the power-up button fires a shell from
  the turret whenever you are not holding a power-up. A hit spins the other
  tank round; a shield stops it.
- **Twelve drivers** to pick from. Your driver's face is on the lobby list and
  the podium (pleased if they won, less so if they did not), and each one has
  their own horn.
- **Four ways to play**
  - *Solo*: you against seven bots, no connection needed once the page has loaded.
  - *Play online*: one button puts you in an open race with whoever else is
    about. Nobody hosts it: bots make the grid up to eight, races start on a
    timer, the track changes after each one, and you can still bring a friend
    in with the room's code.
  - *Online room*: start a private room, share the four-letter code or the QR
    code, and everyone races on their own device.
  - *Big screen party*: put the race on a TV or laptop and everyone uses their
    phone as a controller.
- **Four modes**
  - *Race*: laps, with a camera on your own car.
  - *Elimination*: everyone shares one camera and falling off the back of the
    screen puts you out of the round. Scoring is the classic eight lights:
    everyone starts with four, the round winner takes one from each of the
    others, and a full set of eight (or being the last one with any) wins.
  - *Cup*: all nine rooms in a row. Everyone has three lives and loses one for
    finishing in the bottom half. Run out and you are out of the cup.
  - *Time trial* (solo): you, the clock and a ghost of your own best lap or of
    the record holder's.
- **Hazards and short cuts**: things that move (snooker balls, ducks, a train),
  things that go off (the toaster), jumps (rulers, a plank, a book) and a risky
  short cut in most rooms that saves time if you get it right.
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
| Powerslide | tap brake while steering | tap BRAKE while steering |
| Use power-up, or fire a tank's gun | Space, Shift, X or Enter | the round button beside BRAKE |
| Horn | H | HORN |
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
| `DATA_DIR` | `./data` | Where `records.json` (the lap-record board) and `ghosts.json` (the record holder's ghost lap for each room) are kept |
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
an elimination game, the first two rooms of a cup, a time trial against a
ghost, a full 16-player room, a late joiner, a big-screen party with two phones
as pads, and two strangers matched into an open race.
Screenshots land in `test/e2e/shots/`.

Two more tools: `npm run sim` races bots headlessly and prints lap times, and
`npm run map` draws each track as an SVG.

## How it fits together

```text
src/shared/   track geometry, vehicle physics, bot driving, power-ups and the room
              rules. Plain JavaScript with no DOM, used by client and server alike.
src/client/   Three.js scene, procedural models, WebAudio sound, HUD, menus,
              touch controls and the phone-pad screen.
server/       static files, the WebSocket rooms, the record board and the ghosts.
```

Each device simulates the cars it owns (your own car; the host also runs the
bots; a big screen runs the cars of its phone pads) and sends their state 15
times a second. The server relays, keeps the room and the race clock, decides
lap counts and results, and other players' cars are smoothed between updates.
A solo game uses the same room code in the page, with no server involved.

A room (the place you race, not the online kind) is two files with the same
name: `src/shared/rooms/<id>.js` has the track, the vehicle, the hazards and
the short cuts; `src/client/rooms/<id>.js` has what it looks like. To add one,
write both and list it in `src/shared/tracks.js` and
`src/client/rooms/index.js`.

Everything you see and hear is generated in code: there are no model, texture
or audio files.

The server keeps no accounts and no personal data. A lap record is a name of up
to twelve characters, a time and a date; a ghost is a name, a time and the
path the lap took. There is no chat: the only thing
players see of each other is that name, which is cut down to letters, digits
and a little punctuation before anyone else gets it.

## Licence

MIT. See [LICENSE](LICENSE).
