// The screenshot scenes behind ?shot=hero|beacon|approach|complete. Each one
// plays the real rules forward from a fresh world for a fixed number of
// steps, steered by a simple autopilot that flies toward the current mission
// target, so the frame is what a real flight looks like and the same seed
// always gives the same frame. No cheats: the autopilot only sets the same
// inputs a player could set.
import { RUNWAY, STEP } from './config.js';
import { EVENT_CRASHED, EVENT_LANDED } from './world.js';
import { terrainHeight } from './world.js';

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Steer toward (tx, ty, tz): bank to fix the heading error, pitch to fix
// the altitude error, climb hard over rising terrain, throttle up when slow.
// Both axes use proportional control on the current attitude, so the pilot
// eases onto the target instead of diving through it.
export function autopilotInput(state, tx, ty, tz) {
  const p = state.plane;
  const dx = tx - p.x;
  const dz = tz - p.z;
  const wantHeading = Math.atan2(dx, dz);
  const err = wrapAngle(wantHeading - p.heading);
  const dist = Math.hypot(dx, dz);
  const wantRoll = clamp(-err * 1.1, -1.0, 1.0);
  let roll = clamp((wantRoll - p.roll) * 2.5, -1, 1);
  // Terrain ahead: look 140 m forward and climb if the ground rises close
  // under the nose. Disabled on the landing final, where the glide path
  // over the flat runway plateau is meant to descend to the strip.
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  const ahead = terrainHeight(p.x + fx * 140, p.z + fz * 140);
  let wantPitch = clamp((ty - p.y) * 0.02, -0.3, 0.45);
  if (!state.landingFinal && p.y < ahead + 20) wantPitch = 0.55;
  if (Math.abs(err) > 1.2) wantPitch = Math.min(wantPitch, 0.15);
  let pitch = clamp((wantPitch - p.pitch) * 2.5, -1, 1);
  if (dist < 100) roll *= 0.5;
  let throttle = 0;
  if (p.speed < 45) throttle = 1;
  else if (p.speed > 58) throttle = -1;
  return { pitch, roll, yaw: 0, throttle, brake: false };
}

function landingInput(state) {
  const p = state.plane;
  const fx = Math.sin(RUNWAY.heading);
  const fz = Math.cos(RUNWAY.heading);
  // Position in the runway frame: along is distance past the strip centre,
  // cross is the lateral offset from the runway axis.
  const dx = p.x - RUNWAY.x;
  const dz = p.z - RUNWAY.z;
  const along = dx * fx + dz * fz;
  const cross = dx * fz - dz * fx;
  const headingDiff = Math.abs(wrapAngle(p.heading - RUNWAY.heading));
  // Abort the final back to the approach if we overshoot or drift off line.
  if (state.landingFinal && (along > 110 || headingDiff > 0.6 || Math.abs(cross) > 70)) {
    state.landingFinal = false;
  }
  // Enter the final once lined up 250 m out, low enough for the glide.
  if (!state.landingFinal && along < -250 && headingDiff < 0.35 && Math.abs(cross) < 60 && p.y < 140) {
    state.landingFinal = true;
  }
  if (state.landingFinal) {
    // Final: glide down the runway axis toward a point beyond the strip, so
    // the heading stays on the runway line all the way to touchdown. The
    // target shifts against the cross-track error, which crabs the plane
    // back onto the centre line against the wind.
    const latx = fz;
    const latz = -fx;
    const shift = -cross * 1.2;
    const tx = RUNWAY.x + fx * 120 + latx * shift;
    const tz = RUNWAY.z + fz * 120 + latz * shift;
    const wantY = RUNWAY.y + 1 + Math.max(0, -along) * 0.10;
    const input = autopilotInput(state, tx, wantY, tz);
    input.throttle = p.speed > 36 ? -1 : p.speed < 30 ? 1 : 0;
    return input;
  }
  // Approach (and go-around): fly to a point 350 m before the strip, on the
  // glide line, at a moderate speed.
  const latx = fz;
  const latz = -fx;
  const shift = -cross * 1.2;
  const ax = RUNWAY.x - fx * 350 + latx * shift;
  const az = RUNWAY.z - fz * 350 + latz * shift;
  const input = autopilotInput(state, ax, RUNWAY.y + 35, az);
  input.throttle = p.speed > 45 ? -1 : 0;
  return input;
}

export function missionInput(state) {
  if (state.beaconsPassed >= 5) return landingInput(state);
  // Fly through the supply ring if it is close and roughly ahead.
  const p = state.plane;
  for (const r of state.rings) {
    if (r.passed) continue;
    const d = Math.hypot(r.x - p.x, r.z - p.z);
    if (d < 220 && Math.abs(r.y - p.y) < 60) return autopilotInput(state, r.x, r.y, r.z);
  }
  return autopilotInput(state, state.targetX, state.targetY, state.targetZ);
}

// Step the world with the autopilot until `stop` says so or the limit hits.
// Returns the events seen on the last step.
function flyFor(world, seconds, stop) {
  const steps = Math.floor(seconds / STEP);
  let events = 0;
  for (let i = 0; i < steps; i += 1) {
    events = world.step(STEP, missionInput(world.state), false);
    if (stop && stop(world.state, events)) break;
  }
  return events;
}

/**
 * Set `world` to the named scene and return the screen to draw over it and
 * the best score to show. hero: in-flight chase view toward Beacon 1 with
 * the full HUD lit, so the cover frame is gameplay, not the title screen.
 * beacon: mid-mission, closing on Beacon 3. approach: final approach to
 * Runway 7. complete: the full mission flown and landed.
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'hero') {
    // A short cruise toward Beacon 1, aircraft framed over Ember Isle,
    // HUD on: altitude, speed, heading, beacon progress and score visible.
    flyFor(world, 9, null);
    return { screen: 'play', best: 0 };
  }
  if (name === 'beacon') {
    // Stop a few seconds after clearing Beacon 2, so the passed ring is
    // behind the camera instead of surrounding it, with Beacon 3 ahead.
    let afterPass = -1;
    flyFor(world, 60, (s) => {
      if (s.beaconsPassed >= 2 && afterPass < 0) afterPass = 0;
      if (afterPass >= 0) afterPass += 1;
      return afterPass > 180;
    });
    return { screen: 'play', best: world.state.score };
  }
  if (name === 'approach') {
    flyFor(world, 240, (s) => {
      if (s.beaconsPassed < 5 || !s.landingFinal) return false;
      const p = s.plane;
      const fx = Math.sin(RUNWAY.heading);
      const fz = Math.cos(RUNWAY.heading);
      const along = (p.x - RUNWAY.x) * fx + (p.z - RUNWAY.z) * fz;
      return along > -200;
    });
    return { screen: 'play', best: world.state.score };
  }
  if (name === 'complete') {
    const events = flyFor(world, 300, (s, e) => (e & EVENT_LANDED) !== 0 || (e & EVENT_CRASHED) !== 0);
    const landed = (events & EVENT_LANDED) !== 0 || world.state.landed;
    return { screen: landed ? 'success' : 'play', best: world.state.score };
  }
  flyFor(world, 9, null);
  return { screen: 'title', best: 0 };
}
