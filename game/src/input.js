// Keyboard, mouse-drag flight stick and touch input. Held keys give steering;
// one-shot presses (start, restart, pause, mute) are queued as bit flags and
// taken once by the loop, so a press between two frames is never lost.

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

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
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

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  target.addEventListener('pointerdown', onPointerDown);
  target.addEventListener('pointermove', onPointerMove);
  target.addEventListener('pointerup', onPointerUp);
  target.addEventListener('pointercancel', onPointerUp);

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
