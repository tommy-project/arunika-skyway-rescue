// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between five screens:
// title, play, paused, success and fail.
//
// ?seed=N fixes the cosmetic seed. ?shot=hero|beacon|approach|complete (with
// &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BEACON, EVENT_CRASHED, EVENT_LANDED, EVENT_STALL, EVENT_SUPPLY } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createRenderer } from './render.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas, seed);
const hud = createHud(document);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

// Read-only test hook for automated playtests: window.__arunika.
function exposeHook(screen) {
  const p = world.state.plane;
  window.__arunika = {
    screen,
    beaconsPassed: world.state.beaconsPassed,
    beaconTotal: 5,
    altitude: Math.round(p.y),
    airspeed: Math.round(p.speed * 3.6),
    heading: Math.round(((p.heading * 180) / Math.PI % 360) + 360) % 360,
    x: Math.round(p.x),
    z: Math.round(p.z),
    pitch: Math.round((p.pitch * 180) / Math.PI),
    roll: Math.round((p.roll * 180) / Math.PI),
    score: world.state.score,
    crashed: world.state.crashed,
    landed: world.state.landed,
  };
}

function runShot(name) {
  const scene = stageShot(name, world);
  hud.setBestOnTitle(scene.best);
  if (scene.screen === 'success') hud.showSuccess(world.state, scene.best);
  else if (scene.screen === 'fail') hud.showFail(world.state);
  else hud.showScreen(scene.screen);
  hud.update(world.state, scene.screen, scene.best, 0);
  exposeHook(scene.screen);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, world.state.time);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = 'title';
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let stallBeepAt = 0;

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    renderer.resetCamera();
    accumulator = 0;
    screen = 'play';
    hud.showScreen('play');
    hud.setMessage('', 0);
    announce('Playing. Fly through the five beacons, then land on Runway 7.');
  }

  function endSuccess() {
    screen = 'success';
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    hud.showSuccess(world.state, best);
    audio.jingle();
    announce('Mission complete. Score ' + world.state.score + '. Best ' + best + '.');
  }

  function endFail() {
    screen = 'fail';
    hud.showFail(world.state);
    audio.crash();
    announce('Crashed. ' + world.state.crashReason + '. Score ' + world.state.score + '.');
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      document.getElementById('mute-btn').textContent = audio.isMuted() ? 'Sound: OFF (M)' : 'Sound: ON (M)';
    }
    if (actions & ACTION_RESTART && (screen === 'play' || screen === 'fail' || screen === 'success')) {
      startGame();
      return;
    }
    if (actions & ACTION_CONFIRM && (screen === 'title' || screen === 'success' || screen === 'fail')) {
      audio.unlock();
      startGame();
    } else if (actions & ACTION_PAUSE && screen === 'play') {
      screen = 'paused';
      hud.showScreen('paused');
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === 'paused') {
      screen = 'play';
      hud.showScreen('play');
      announce('Playing.');
    }
  }

  function step() {
    if (screen === 'title') {
      // Title backdrop: gentle cruise, no scoring, no crashes.
      world.step(STEP, { pitch: 0, roll: 0.12, yaw: 0, throttle: 0, brake: false }, true);
      return;
    }
    const flightInput = {
      pitch: input.pitchInput(),
      roll: input.rollInput(),
      yaw: input.yawInput(),
      throttle: input.throttleInput(),
      brake: input.brake(),
    };
    const events = world.step(STEP, flightInput, false);
    const p = world.state.plane;
    audio.setFlight(p.throttle, p.speed, p.stalled);
    if (events & EVENT_BEACON) {
      audio.chime();
      hud.setMessage('Beacon ' + world.state.beaconsPassed + '/5 cleared! +' + 100, 2.5);
    } else if (events & EVENT_SUPPLY) {
      audio.supply();
      hud.setMessage('Supply ring +25', 2);
    } else if (events & EVENT_STALL) {
      hud.setMessage('STALL - throttle up, nose down', 2);
    }
    if (p.stalled && world.state.time - stallBeepAt > 1.2) {
      stallBeepAt = world.state.time;
      audio.beep();
    }
    if (events & EVENT_LANDED) {
      audio.thump();
      endSuccess();
    } else if (events & EVENT_CRASHED) {
      endFail();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === 'title' || screen === 'play') {
      while (accumulator >= STEP && (screen === 'title' || screen === 'play')) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, world.state.time);
    hud.update(world.state, screen, best, 1 / 60);
    exposeHook(screen);
  }

  // Buttons on the screens do what the keys do.
  document.getElementById('play-btn').addEventListener('click', () => { audio.unlock(); startGame(); });
  document.getElementById('resume-btn').addEventListener('click', () => { screen = 'play'; hud.showScreen('play'); });
  document.getElementById('restart-btn').addEventListener('click', () => startGame());
  document.getElementById('again-btn').addEventListener('click', () => startGame());
  document.getElementById('retry-btn').addEventListener('click', () => startGame());
  document.getElementById('title-btn').addEventListener('click', () => { screen = 'title'; hud.setBestOnTitle(best); hud.showScreen('title'); });
  document.getElementById('mute-btn').addEventListener('click', () => {
    audio.unlock();
    audio.setMuted(!audio.isMuted());
    document.getElementById('mute-btn').textContent = audio.isMuted() ? 'Sound: OFF (M)' : 'Sound: ON (M)';
  });
  canvas.addEventListener('pointerdown', () => audio.unlock());

  // Leaving the tab pauses a running game rather than letting it fly unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'paused';
      hud.showScreen('paused');
      announce('Paused.');
    }
  });

  hud.setBestOnTitle(best);
  hud.showScreen('title');
  announce('Arunika: Skyway Rescue. Press Space or click Play to start.');
  exposeHook(screen);
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
