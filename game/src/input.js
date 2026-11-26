// Keyboard, mouse-drag flight stick and touch input. Held keys give steering;
// one-shot presses (start, restart, pause, mute) are queued as bit flags and
// taken once by the loop, so a press between two frames is never lost.
// The mouse wheel is the throttle for mouse-only play: it sets an absolute
// throttle value (last-used input wins — pressing Shift/Ctrl hands the
// throttle back to the keyboard rate model).

import { FLIGHT } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_MUTE = 8;

export function createInput(target) {
  const keys = new Set();
  let actions = 0;
  let stick = { active: false, pitch: 0, roll: 0 };
  let stickStart = { x: 0, y: 0 };
  let stickId = null;
  // Absolute throttle set by the mouse wheel; null means "not set" and the
  // keyboard rate model owns the throttle.
  let throttleSet = null;

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    // Keyboard throttle takes over: clear the wheel setting so the two
    // inputs never fight (last-used input wins).
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight'
      || event.code === 'ControlLeft' || event.code === 'ControlRight') {
      throttleSet = null;
    }
    if (event.code === 'Space' || event.code === 'Enter') actions |= ACTION_CONFIRM;
    else if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    else if (event.code === 'KeyR') actions |= ACTION_RESTART;
    else if (event.code === 'KeyM') actions |= ACTION_MUTE;
    if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
  }
  function onKeyUp(event) {
    keys.delete(event.code);
  }
  function onBlur() {
    keys.clear();
    stick = { active: false, pitch: 0, roll: 0 };
    stickId = null;
  }

  // Mouse drag (and touch drag via pointer events) is the flight stick:
  // drag down to pull the nose up, drag right to bank right, like pulling
  // a real stick. Release recentres it.
  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    stickId = event.pointerId;
    stickStart = { x: event.clientX, y: event.clientY };
    stick = { active: true, pitch: 0, roll: 0 };
    try { target.setPointerCapture(event.pointerId); } catch { /* already released */ }
  }
  function onPointerMove(event) {
    if (!stick.active || event.pointerId !== stickId) return;
    const dx = (event.clientX - stickStart.x) / 120;
    const dy = (event.clientY - stickStart.y) / 120;
    stick.roll = Math.max(-1, Math.min(1, dx));
    stick.pitch = Math.max(-1, Math.min(1, dy));
  }
  function onPointerUp(event) {
    if (event.pointerId !== stickId) return;
    stick = { active: false, pitch: 0, roll: 0 };
    stickId = null;
  }

  // Mouse wheel = throttle (the standard flight-game control): wheel up
  // increases it, wheel down decreases it, in 0.05 steps. The first wheel
  // tick starts from the cruise throttle. Non-passive + preventDefault so
  // the page never scrolls under the game.
  function onWheel(event) {
    event.preventDefault();
    if (throttleSet === null) throttleSet = FLIGHT.cruiseThrottle;
    throttleSet = Math.max(0, Math.min(1, throttleSet - Math.sign(event.deltaY) * 0.05));
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  target.addEventListener('pointerdown', onPointerDown);
  target.addEventListener('pointermove', onPointerMove);
  target.addEventListener('pointerup', onPointerUp);
  target.addEventListener('pointercancel', onPointerUp);
  target.addEventListener('wheel', onWheel, { passive: false });

  function clamp1(v) {
    return Math.max(-1, Math.min(1, v));
  }

  return {
    // Combined steering, keyboard plus stick, each clamped to -1..1.
    // pitch: +1 pulls the nose up. roll: +1 banks right (the flight model
    // turns the heading down as the plane banks right, as on screen).
    pitchInput() {
      const key = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      return clamp1(key + stick.pitch);
    },
    rollInput() {
      const key = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      return clamp1(key + stick.roll);
    },
    yawInput() {
      return (keys.has('KeyQ') ? 1 : 0) - (keys.has('KeyE') ? 1 : 0);
    },
    throttleInput() {
      return (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1 : 0)
        - (keys.has('ControlLeft') || keys.has('ControlRight') ? 1 : 0);
    },
    // Absolute throttle from the mouse wheel, or null when the keyboard
    // rate model owns the throttle.
    throttleSet() {
      return throttleSet;
    },
    brake() {
      return keys.has('Space');
    },
    stickActive() {
      return stick.active;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
