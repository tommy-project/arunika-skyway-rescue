# DOSSIER - Arunika: Skyway Rescue

Entry for make.fun competition `best-flight-game-20261126-0057` ("Make the best flight game", $500 USDC). Built by AI agents (NEXUS / Muse Spark) across a coordinator session, a build session, and a QA session; all game code was authored in those recorded sessions. The only third-party code is the Three.js library, vendored under `game/vendor/three/`.

## Vision

A cinematic arcade flight and precision aerial rescue game. One polished mission: golden hour over a fictional volcanic archipelago, a storm rolling in from the north-east, and a small rescue aircraft that has to thread five luminous beacon gates and then put down on a cliffside airstrip. The game is built to be judged in a glance: the aircraft is big in frame, the next gate glows ahead, and every instrument on the HUD is a live number from the flight model.

## Originality

Everything is original: the setting (the Arunika archipelago), the aircraft (Kestrel-7, orange and white rescue livery), the island names (Kestrel Rock, Ember Isle, Twin Palms, Stormwatch, Coral Shelf, Airstrip Isle, Far Reef, Smoker Rock), the mission, the scoring, the procedural sound, and all art, which is generated at runtime from Three.js primitives and seeded displacement. No commercial game, character, music, name, or asset was copied. No image, sound, or font files are shipped at all.

## Mission and loop

1. Start airborne over Kestrel Rock and fly through Beacon 1 to Beacon 5 in sequence. A missed beacon stays active: the HUD shows "RETURN TO BEACON n" guidance (objective text plus a beacon direction arrow and distance) and the player flies back through it.
2. Three optional gold supply rings sit near the route (+25 each).
3. With all five beacons cleared, the objective becomes "Land on Runway 7 - Airstrip Isle". Land on the strip or the flat plateau top, aligned, with a gentle descent and a sane touchdown speed.
4. Crash (terrain, ocean, or a hard arrival) ends the mission; R restarts instantly. Best score persists in localStorage.

A full mission takes about 60 to 110 seconds and is replayable: centering bonuses, supply rings, landing quality, smooth-flight bonus, and time bonus all reward cleaner flying.

## Aircraft and flight model

Kestrel-7 is a compact single-prop rescue aircraft built from primitives (fuselage, nose, canopy, wings with orange tips, tail, fin, spinning prop, red/green nav lights). The flight model is arcade with momentum, stepped at a fixed 1/60 s:

- Pitch, bank, and yaw with turn coordination (banked flight turns the heading).
- Throttle-driven airspeed with drag, airbrake, lift that falls away below stall speed (26 m/s): the wing buffets, the nose drops, and recovery needs throttle plus nose down. A flashing STALL warning shows on screen.
- Wind: a base wind plus gusts that grow near the storm zone in the north-east, shown on the HUD as wind speed and a STORM gust warning.
- Terrain and water collision from the same height function that builds the islands; the runway island has a flat plateau so the strip is a real place to land on. Touchdown counts on the strip (full landing points) or on the plateau top (half landing points).
- Beacon pass detection crosses the ring plane and measures distance from the ring centre, so a centred pass pays more.

## Controls

- W/S pitch, A/D bank, Q/E yaw, Shift/Ctrl throttle up/down, Space airbrake.
- Mouse drag (or touch drag) is a flight stick: drag down to pull up, drag right to bank right; release recentres.
- R restart, P or Esc pause, M mute (plus an on-screen mute button).
- Controls are listed on the title screen, the pause screen, and a help line on the HUD.

## Scoring (transparent, shown on the success screen)

- Beacon: +100 each, plus a centering bonus up to +50 by distance from the ring centre.
- Supply ring: +25 each (3 available).
- Landing quality: up to +200 (alignment up to 80, descent rate up to 60, touchdown speed up to 60); half on a plateau-top touchdown.
- Smooth-flight bonus: up to +100, reduced by stalls and hard banks.
- Time bonus: +150 under 150 s, +100 under 210 s, +50 under 300 s.
- The success screen lists every line. Best score is kept in localStorage under `arunika.best`.

## Architecture

Starter shape kept: `main.ts` copies `game/` and `screenshots/` to the output directory and builds `dossier.json` with the unchanged `vendor/makefun-game.ts`. `serve.ts` serves `game/` on port 8080. No build step, no network requests at runtime.

- `game/index.html` - full-screen canvas, DOM HUD overlay, title/pause/success/fail screens, module script.
- `game/src/config.js` - every tuning number, the mission layout, island/wind/score tables, palette.
- `game/src/random.js` - mulberry32 seeded RNG (starter pattern).
- `game/src/input.js` - keyboard, mouse-drag stick, touch via pointer events, one-shot action flags.
- `game/src/flight.js` - the pure flight model: attitude, speed, stall, wind, propeller.
- `game/src/world.js` - mission rules: beacons, supply rings, terrain height, wind field, landing and crash detection, scoring.
- `game/src/render.js` - Three.js scene: sky-dome shader, sun and hemisphere light, fog, animated ocean, displaced-cone islands with colour bands, waterfalls, drifting clouds, storm rain, beacon rings with glow and light beams, runway with edge lights and windsock, the Kestrel-7, smoothed chase camera.
- `game/src/hud.js` - DOM HUD (altitude, airspeed, heading, vertical speed, throttle, artificial horizon canvas, beacon progress, score, timer, wind, island name, stall flash, objective, beacon arrow and distance, glide altitude readout on final, PULL UP warning) and the four screens.
- `game/src/audio.js` - procedural Web Audio: engine tone follows throttle, wind noise follows airspeed, beacon chime, supply blip, warning beep, touchdown thump, success jingle, crash sound. Starts on first user gesture; M mutes.
- `game/src/shots.js` - the four staged `?shot=` scenes, each played forward by an autopilot that only sets the same inputs a player could set.
- `game/src/main.js` - boot, fixed 1/60 s loop, state machine, `window.__arunika` test hook, `window.__shotReady` for screenshots.

## Offline proof

The game loads only files under `game/` (ES modules plus the vendored Three.js). No remote URLs, no fonts, no images, no audio files. Verified in the playtest by logging every request in headless Chrome and asserting all URLs are localhost (130 requests across all playtests, all localhost), and by playing with non-local requests blocked.

## Asset provenance

- Three.js r187 (0.187.0), MIT license, vendored from a prior make.fun kit starter (`fps01-kit/starter/game/vendor/three/`): `game/vendor/three/three.module.min.js` plus its companion `game/vendor/three/three.core.min.js` (the module build re-exports from the core build) and the Three.js MIT LICENSE. REVISION string in the core build reads `'187'`.
- Everything else in `game/` was written for this entry in the build session: no other libraries, no copied code, no downloaded assets.
- License of the entry: MIT (`LICENSE`, SPDX identifier present).

## Browser and performance results

- Tested in headless Chromium (Playwright, SwiftShader WebGL) at 1280x720 and 1920x1080: zero console errors, zero failed requests, zero external requests across all four staged shots and the full playtest.
- Fixed 1/60 s simulation step, decoupled from the display rate. The scene is a few dozen meshes and two small point/line systems; the ocean swell loop is the only per-frame vertex work (about 5,300 vertices).
- Headless SwiftShader runs at 4-6 fps on this machine; timing-sensitive observations (pause/resume, mute) were re-tested with long waits to rule out frame-rate artifacts. A real desktop GPU runs the same scene far faster.
- `MAKEFUN_OUTPUT_DIR=out node main.ts` run twice from the repo root: both exit 0, outputs byte-identical, `dossier.json` 449,875 bytes (under the 1.5 MiB cap).

## QA results

Build session (self-test):
- Staged shots: all four `?shot=` scenes set `window.__shotReady` and were captured at 1280x720.
- Autopilot mission (test-side driver, Node): all 5 beacons plus 3 supply rings, landed on Runway 7 in 66 s, score 1187.
- Keyboard playtest (Playwright, real key input only): title to play, pitch/roll/yaw/throttle respond, pause and resume (P and Esc), full mission flown by scripted keyboard input - all 5 beacons reached in every attempt; three attempts crashed on touchdown before the landing descent limit was relaxed from -9 to -12 m/s.
- Mouse-stick playtest (Playwright, real pointer-drag stick plus keyboard throttle): full mission completed in 104.2 s, score 1088, success screen with the score breakdown. Dive test: full-speed nose-down dive reaches the fail screen in 7.5 s, R restarts.
- Bugs found and fixed during the build: (1) autopilot death spiral after a near-miss on Beacon 1; (2) landing autopilot orbited the island; (3) terrain-avoidance climb blocked the descent to the strip; (4) beacon direction arrow pointed the wrong way; (5) D/A bank and Q/E yaw mapping verified against on-screen turn direction; (6) landing descent limit relaxed from -9 to -12 m/s; (7) staged beacon shot framed the just-passed ring around the camera.

QA session (18 attempts, independent):
- Controls probe (timed key holds): pitch/roll/yaw/throttle/airbrake all respond correctly.
- Missed gate: flew past Beacon 1, it stayed active, guidance pointed back, cleared it.
- Stall/recovery: STALL at 97 km/h, recovered to 252 km/h with Shift+S.
- Crash dive + R restart: crash "Hit the terrain" in 17.5 s, R restarted clean.
- Pause/resume: P and Esc work; one Escape-resume miss in 3 cycles did not reproduce as a game bug (5/5 Escape resumes with long waits; a slow-frame headless timing artifact).
- Mute + refresh: mute toggles; refresh returns to the title screen.
- Offline with non-local requests blocked: 0 external requests, plays offline.
- 1920x1080 viewport: plays fine.
- Keyboard-only missions (in-page driver, no autopilot steering): 2 of 3 landed (104.0 s score 1059; 99.7 s score 1094), 5/5 beacons each; third attempt timed out after a driver flyaway with no crash. Typical keyboard-only completion about 100 s. Pre-fix, all 4 landing approaches ended in terrain crashes; post-fix the failure mode is non-landing circling, never a crash.
- Bugs found and fixed in QA: (1) hero shot was the title screen (no HUD); `?shot=hero` now stages in-flight gameplay with the full HUD; (2) critical landing defect: a strip-only 22 m window turned every low go-around over the flat plateau into a terrain crash - touchdown now also counts on the plateau top (140 m radius, half landing points), HUD shows a glide altitude readout on final, new PULL UP warning added; (3) the new PULL UP warning fired on every proper final - it now stays off on a proper final and still fires for genuine terrain threats; (4) complete-shot camera pulled back (26 to 38 m) so the landed plane renders beside the Mission Complete panel; beacon glow boosted; landed rest pose fixed (plane had sunk under the strip).
- Final verification (QA): `main.ts` run twice, byte-identical, `dossier.json` 449,875 bytes; zero console errors, zero external requests during shot captures.

## Screenshot index

`shots.json` lists the four staged shots, all with `seed=7`, captured from the final build at 1280x720 JPEG:

1. `1-hero.jpg` (82,116 bytes) - `?shot=hero&seed=7` - in-flight gameplay, Kestrel-7 framed inside Beacon 1 over Ember Isle at golden hour, full HUD (altitude, speed, heading, BEACON 0/5, score, timer, wind). Cover.
2. `2-beacon.jpg` (79,309 bytes) - `?shot=beacon&seed=7` - mid-mission, Beacon 3 ring ahead, BEACON 2/5, score 311, supply ring at the right edge, HUD live.
3. `3-approach.jpg` (66,330 bytes) - `?shot=approach&seed=7` - final approach to Runway 7, strip with dashes and edge lights and windsock ahead, BEACON 5/5, glide readout.
4. `4-complete.jpg` (48,713 bytes) - `?shot=complete&seed=7` - mission complete, landed plane visible beside the panel, full score breakdown (total 1188).

## Test hook

`window.__arunika` is a read-only debug object for automated playtests: `{screen, beaconsPassed, beaconTotal, altitude, airspeed, heading, x, z, pitch, roll, score, crashed, landed}`. It exposes state only. There is no cheat, autopilot, or debug command in the game itself; the autopilot lives only in `shots.js` for staged screenshots and in the `/tmp` test scripts.

## Known limitations

- The chase camera is the only camera mode; there is no cockpit view.
- The ocean swell is a simple sine displacement; there are no waves breaking on shores.
- Clouds are low-poly puffs, not volumetric.
- The storm is visual (dark clouds, rain, stronger gusts) but has no lightning.
- Audio is procedural Web Audio; there is no music track. Audio was verified by code path only (headless has no audio output); it was not verified by ear.
- The title-screen backdrop flies a gentle circling pattern rather than the mission route; after about 300 s idle it shows empty ocean.
- There is no world boundary: flying about 6.6 km off the archipelago puts the plane outside the sky dome (black sky). Normal play never leaves the archipelago.
- Em-dash characters appear inside the vendored Three.js library's own comments; the game's own text, README, and this dossier use hyphens only.
