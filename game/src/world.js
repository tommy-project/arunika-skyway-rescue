// The mission rules and state, with no drawing and no browser in it: the
// Kestrel-7, the five beacons in sequence, the three optional supply rings,
// the runway landing, terrain and water collision, wind, and scoring.
// step() advances one fixed step and returns what happened as bit flags.
import { BEACONS, FLIGHT, ISLANDS, RUNWAY, SCORE, START, SUPPLY_RINGS, WIND } from './config.js';
import { createFlight, forwardOf, resetFlight, stepFlight } from './flight.js';

export const EVENT_BEACON = 1;
export const EVENT_SUPPLY = 2;
export const EVENT_LANDED = 4;
export const EVENT_CRASHED = 8;
export const EVENT_STALL = 16;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// Terrain height at (x, z): the tallest island cone under the point.
// The runway island is a flat plateau out to 140 m, then falls away.
export function terrainHeight(x, z) {
  let h = 0;
  for (let i = 0; i < ISLANDS.length; i += 1) {
    const isl = ISLANDS[i];
    const dx = x - isl.x;
    const dz = z - isl.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d >= isl.radius) continue;
    let top;
    if (isl.kind === 'runway') {
      if (d < 140) top = isl.height;
      else top = isl.height * Math.max(0, 1 - (d - 140) / (isl.radius - 140));
    } else {
      const t = 1 - d / isl.radius;
      top = isl.height * (t * t * 0.7 + t * 0.3);
    }
    if (top > h) h = top;
  }
  return h;
}

// The nearest named island to a point, for the HUD location line.
export function nearestIsland(x, z) {
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < ISLANDS.length; i += 1) {
    const isl = ISLANDS[i];
    const d = Math.hypot(x - isl.x, z - isl.z) - isl.radius;
    if (d < bestD) { bestD = d; best = isl; }
  }
  return best;
}

// Wind at a point and time: base wind plus gusts that grow near the storm.
export function windAt(x, z, t, out) {
  const dx = x - WIND.stormX;
  const dz = z - WIND.stormZ;
  const d = Math.sqrt(dx * dx + dz * dz);
  const storm = clamp(1 - d / WIND.stormRadius, 0, 1);
  const gustAmp = WIND.calmGust + storm * WIND.stormGust;
  out.windX = WIND.baseX;
  out.windZ = WIND.baseZ;
  out.gustX = Math.sin(t * 0.9 + x * 0.011 + z * 0.007) * gustAmp;
  out.gustZ = Math.cos(t * 0.7 + x * 0.008 - z * 0.013) * gustAmp;
  out.storm = storm;
  return out;
}

// Distance from a point to the centre of a ring, in the ring's plane.
function ringOffset(target, px, py, pz, hx, hz) {
  const dx = px - target.x;
  const dy = py - target.y;
  const dz = pz - target.z;
  const along = dx * hx + dz * hz;
  const cx = dx - along * hx;
  const cy = dy;
  const cz = dz - along * hz;
  return { along, dist: Math.sqrt(cx * cx + cy * cy + cz * cz) };
}

export function createWorld(random) {
  const plane = createFlight();
  const beacons = BEACONS.map((b) => ({ ...b, passed: false, flash: 0 }));
  const rings = SUPPLY_RINGS.map((r) => ({ ...r, passed: false, flash: 0 }));
  const wind = { windX: 0, windZ: 0, gustX: 0, gustZ: 0, storm: 0 };
  const state = {
    plane, beacons, rings, wind,
    score: 0, elapsed: 0, time: 0,
    beaconsPassed: 0, ringsPassed: 0,
    crashed: false, landed: false, crashReason: '',
    stallCount: 0, hardTurns: 0,
    landing: null, breakdown: null,
    landingFinal: false,
    objective: 'Fly through Beacon 1',
    targetName: 'Beacon 1',
    targetX: BEACONS[0].x, targetY: BEACONS[0].y, targetZ: BEACONS[0].z,
    beaconFlash: 0,
  };
  // Cosmetic seed use: cloud drift phase, kept on the state for the renderer.
  state.cloudSeed = random() * 1000;
  let wasStalled = false;

  function reset() {
    resetFlight(plane);
    for (const b of beacons) { b.passed = false; b.flash = 0; }
    for (const r of rings) { r.passed = false; r.flash = 0; }
    state.score = 0;
    state.elapsed = 0;
    state.beaconsPassed = 0;
    state.ringsPassed = 0;
    state.crashed = false;
    state.landed = false;
    state.crashReason = '';
    state.stallCount = 0;
    state.hardTurns = 0;
    state.landing = null;
    state.breakdown = null;
    state.landingFinal = false;
    state.objective = 'Fly through Beacon 1';
    state.targetName = 'Beacon 1';
    state.targetX = BEACONS[0].x;
    state.targetY = BEACONS[0].y;
    state.targetZ = BEACONS[0].z;
    state.beaconFlash = 0;
    wasStalled = false;
  }

  function currentBeacon() {
    return beacons[state.beaconsPassed] || null;
  }

  function updateTarget() {
    const next = currentBeacon();
    if (next) {
      state.targetName = next.name;
      state.targetX = next.x;
      state.targetY = next.y;
      state.targetZ = next.z;
      state.objective = 'Fly through ' + next.name;
    } else {
      state.targetName = RUNWAY.name;
      state.targetX = RUNWAY.x;
      state.targetY = RUNWAY.y + 25;
      state.targetZ = RUNWAY.z;
      state.objective = 'Land on ' + RUNWAY.name + ' - Airstrip Isle';
    }
  }

  function ringHeading(target) {
    // Rings face the incoming aircraft: normal along the path from the
    // previous target to this one.
    const from = state.beaconsPassed === 0 && target === beacons[0]
      ? START : (beacons[state.beaconsPassed - 1] || START);
    const dx = target.x - from.x;
    const dz = target.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    return { x: dx / len, z: dz / len };
  }

  function checkRing(target, radius, prev, cur) {
    const h = ringHeading(target);
    const a = ringOffset(target, prev.x, prev.y, prev.z, h.x, h.z);
    const b = ringOffset(target, cur.x, cur.y, cur.z, h.x, h.z);
    if (a.along <= 0 && b.along > 0 && b.dist < radius + 4) return b.dist;
    return -1;
  }

  // A touchdown on the strip scores full landing points; one on the flat
  // plateau top beside it scores half. The strip is 22 m wide, so a
  // keyboard-only landing that is gentle and aligned but a few metres off
  // the asphalt still counts instead of dying as terrain.
  function finishLanding(offStrip) {
    const p = plane;
    const headingDiff = Math.abs(((p.heading - RUNWAY.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const alignScore = Math.round(80 * Math.max(0, 1 - headingDiff / 0.5));
    const vsScore = Math.round(60 * clamp(1 - Math.max(0, -p.vspeed - 2) / 10, 0, 1));
    const spdScore = Math.round(60 * clamp(1 - Math.abs(p.speed - 32) / 28, 0, 1));
    let landingScore = alignScore + vsScore + spdScore;
    if (offStrip) landingScore = Math.round(landingScore / 2);
    const smooth = clamp(SCORE.smoothMax - state.stallCount * 25 - state.hardTurns * 5, 0, SCORE.smoothMax);
    const timeBonus = state.elapsed <= SCORE.timeFastSec ? SCORE.timeFast
      : state.elapsed <= SCORE.timeMidSec ? SCORE.timeMid
      : state.elapsed <= SCORE.timeSlowSec ? SCORE.timeSlow : 0;
    const beaconScore = state.score;
    const total = beaconScore + landingScore + smooth + timeBonus;
    state.landing = { alignScore, vsScore, spdScore, landingScore, smooth, timeBonus, offStrip };
    state.breakdown = {
      beacons: beaconScore, landing: landingScore, smooth, time: timeBonus, total,
    };
    state.score = total;
    state.landed = true;
  }

  // One fixed step. `input` is the flight input for this step. With
  // `harmless` set (the title backdrop) the plane flies but nothing scores
  // and nothing can crash it.
  function step(dt, input, harmless) {
    let events = 0;
    state.time += dt;
    if (!harmless) state.elapsed += dt;
    windAt(plane.x, plane.z, state.time, wind);
    state.wind = wind;
    const prev = { x: plane.x, y: plane.y, z: plane.z };

    stepFlight(plane, input, dt, wind);
    if (plane.stalled && !wasStalled) {
      state.stallCount += 1;
      events |= EVENT_STALL;
    }
    wasStalled = plane.stalled;
    if (Math.abs(plane.roll) > 0.95 && !state._wasHard) state.hardTurns += 1;
    state._wasHard = Math.abs(plane.roll) > 0.95;

    for (const b of beacons) if (b.flash > 0) b.flash = Math.max(0, b.flash - dt * 2);
    for (const r of rings) if (r.flash > 0) r.flash = Math.max(0, r.flash - dt * 2);
    if (state.beaconFlash > 0) state.beaconFlash = Math.max(0, state.beaconFlash - dt * 2);

    if (harmless) return events;

    // Beacon in sequence: crossing its plane near the centre scores.
    const next = currentBeacon();
    if (next) {
      const d = checkRing(next, next.radius + 8, prev, plane);
      if (d >= 0) {
        next.passed = true;
        next.flash = 1;
        state.beaconFlash = 1;
        const centerBonus = Math.round(SCORE.centerBonusMax * Math.max(0, 1 - d / next.radius));
        state.score += SCORE.beacon + centerBonus;
        state.beaconsPassed += 1;
        events |= EVENT_BEACON;
        updateTarget();
      }
    }

    // Optional supply rings: any order, once each.
    for (const r of rings) {
      if (r.passed) continue;
      const d = checkRing(r, r.radius + 6, prev, plane);
      if (d >= 0) {
        r.passed = true;
        r.flash = 1;
        state.score += SCORE.supply;
        state.ringsPassed += 1;
        events |= EVENT_SUPPLY;
      }
    }

    // Landing: over the strip, or on the flat plateau top of Airstrip
    // Isle (140 m around the strip centre, height 55), aligned, gentle
    // descent, sane speed. This check runs before the crash check at the
    // same height, so a gentle aligned touchdown on the plateau lands
    // instead of counting as terrain: the old strip-only window turned
    // every low go-around over the plateau into a crash.
    const ground = terrainHeight(plane.x, plane.z);
    const dxr = plane.x - RUNWAY.x;
    const dzr = plane.z - RUNWAY.z;
    const along = dxr * Math.sin(RUNWAY.heading) + dzr * Math.cos(RUNWAY.heading);
    const cross = dxr * Math.cos(RUNWAY.heading) - dzr * Math.sin(RUNWAY.heading);
    const overStrip = Math.abs(along) < RUNWAY.length / 2 && Math.abs(cross) < RUNWAY.width / 2;
    const onPlateau = Math.hypot(dxr, dzr) < 140;
    const surfaceY = overStrip ? RUNWAY.y + 1.2 : 55;
    if (plane.y <= surfaceY + 2 && (overStrip || onPlateau)) {
      const headingDiff = Math.abs(((plane.heading - RUNWAY.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (headingDiff < 0.5 && plane.vspeed > -12 && plane.speed > 15 && plane.speed < 62) {
        // Rest pose: the belly (fuselage radius 1.5) sits on the surface
        // it touched, strip top or plateau grass, instead of sinking in.
        plane.y = surfaceY + 1.5;
        finishLanding(!overStrip);
        events |= EVENT_LANDED;
        return events;
      }
    }

    // Crash: terrain, water, or a hard arrival on the strip.
    if (plane.y <= ground + 2) {
      state.crashed = true;
      state.crashReason = ground <= 1 ? 'Dithed in the ocean' : 'Hit the terrain';
      if (overStrip && plane.y <= RUNWAY.y + 1.2) state.crashReason = 'Hard landing on the runway';
      events |= EVENT_CRASHED;
      return events;
    }
    return events;
  }

  reset();
  return { state, reset, step, terrainHeight, currentBeacon };
}

export { forwardOf };
