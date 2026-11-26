// The arcade flight model: pure numbers in, pure numbers out, no DOM, no
// Three.js. The plane flies on heading, pitch and bank; speed follows the
// throttle with drag; lift falls away below stall speed so the nose drops.
// Wind and turbulence arrive through `env` so the world can shape them.
import { FLIGHT, START } from './config.js';

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function createFlight() {
  return {
    x: START.x, y: START.y, z: START.z,
    heading: START.heading,
    pitch: 0, roll: 0,
    speed: 55, throttle: FLIGHT.cruiseThrottle,
    vspeed: 0, stalled: false, stallTime: 0,
    propAngle: 0,
    prevX: START.x, prevY: START.y, prevZ: START.z,
  };
}

export function resetFlight(plane) {
  const fresh = createFlight();
  Object.assign(plane, fresh);
}

// Forward unit vector from heading and pitch.
export function forwardOf(plane) {
  const ch = Math.cos(plane.heading);
  const sh = Math.sin(plane.heading);
  const cp = Math.cos(plane.pitch);
  return { x: sh * cp, y: Math.sin(plane.pitch), z: ch * cp };
}

// One fixed step. `input` is {pitch, roll, yaw, throttle, brake} in -1..1,
// plus optional throttleSet (absolute 0..1 from the mouse wheel).
// `env` is {windX, windZ, gustX, gustZ}. Returns nothing; state is mutated.
export function stepFlight(plane, input, dt, env) {
  plane.prevX = plane.x;
  plane.prevY = plane.y;
  plane.prevZ = plane.z;

  // Throttle: Shift/Ctrl nudge it, brake sheds speed fast. A mouse-wheel
  // throttle setting (input.throttleSet) overrides absolutely instead.
  if (typeof input.throttleSet === 'number') {
    plane.throttle = clamp(input.throttleSet, 0, 1);
  } else {
    plane.throttle = clamp(plane.throttle + input.throttle * 0.55 * dt, 0, 1);
  }
  const targetSpeed = FLIGHT.minSpeed + plane.throttle * (FLIGHT.maxSpeed - FLIGHT.minSpeed);
  let speed = plane.speed;
  if (input.brake) speed -= FLIGHT.brakeDecel * dt;
  else if (speed < targetSpeed) speed = Math.min(targetSpeed, speed + FLIGHT.accel * dt);
  else speed = Math.max(targetSpeed, speed - FLIGHT.accel * 0.6 * dt);
  plane.speed = clamp(speed, 8, FLIGHT.maxSpeed + 10);

  // Attitude: pitch and bank ease toward the commanded rates; bank returns
  // to level hands-off, and banked flight turns the heading (coordination).
  plane.pitch = clamp(plane.pitch + input.pitch * FLIGHT.pitchRate * dt, -FLIGHT.maxPitch, FLIGHT.maxPitch);
  if (input.roll !== 0) {
    plane.roll = clamp(plane.roll + input.roll * FLIGHT.rollRate * dt, -FLIGHT.maxRoll, FLIGHT.maxRoll);
  } else {
    const back = FLIGHT.rollReturn * dt;
    plane.roll = Math.abs(plane.roll) <= back ? 0 : plane.roll - Math.sign(plane.roll) * back;
  }
  const turn = -Math.sin(plane.roll) * FLIGHT.turnRate * (plane.speed / 55);
  plane.heading = wrapAngle(plane.heading + (turn + input.yaw * FLIGHT.yawRate) * dt);

  // Stall: below stall speed the wing stops lifting, the nose drops and the
  // airframe buffets. Recover with throttle and a lower nose.
  plane.stalled = plane.speed < FLIGHT.stallSpeed;
  if (plane.stalled) {
    plane.stallTime += dt;
    plane.pitch = Math.max(-FLIGHT.maxPitch, plane.pitch - 0.35 * dt);
    plane.roll += Math.sin(plane.stallTime * 31) * 0.25 * dt;
  }

  // Motion: forward thrust plus a sink that grows as speed falls short,
  // plus wind and turbulence gusts.
  const fwd = forwardOf(plane);
  const sink = Math.max(0, FLIGHT.stallSpeed - plane.speed) * FLIGHT.sinkFactor;
  const vx = fwd.x * plane.speed + env.windX + env.gustX;
  const vy = fwd.y * plane.speed - sink + env.gustZ * 0.15;
  const vz = fwd.z * plane.speed + env.windZ + env.gustZ;
  plane.x += vx * dt;
  plane.y += vy * dt;
  plane.z += vz * dt;
  plane.vspeed = vy;
  plane.propAngle += (6 + plane.throttle * FLIGHT.propSpin) * dt;
  if (plane.y < 1) plane.y = 1;
}

export function headingDeg(plane) {
  return Math.round(((plane.heading * 180) / Math.PI % 360) + 360) % 360;
}
