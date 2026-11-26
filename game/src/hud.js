// The DOM HUD and the screens: title, pause, success and fail. Every number
// shown comes from the live world state; nothing here is hardcoded.
import { BEST_KEY, FONT, RUNWAY } from './config.js';
import { headingDeg } from './flight.js';
import { nearestIsland, terrainHeight } from './world.js';

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function fmtSigned(v, unit) {
  const r = Math.round(v);
  if (r === 0) return '0' + unit;
  const sign = r > 0 ? '+' : '-';
  return sign + Math.abs(r) + unit;
}

export function createHud(doc) {
  const el = (id) => doc.getElementById(id);
  const hud = el('hud');
  const alt = el('hud-alt');
  const spd = el('hud-spd');
  const hdg = el('hud-hdg');
  const vs = el('hud-vs');
  const thr = el('hud-thr');
  const score = el('hud-score');
  const timer = el('hud-time');
  const beacon = el('hud-beacon');
  const objective = el('hud-objective');
  const wind = el('hud-wind');
  const place = el('hud-place');
  const stall = el('hud-stall');
  const low = el('hud-low');
  const beaconArrow = el('hud-arrow');
  const beaconDist = el('hud-dist');
  const horizon = el('horizon');
  const hctx = horizon.getContext('2d');
  const message = el('hud-message');
  const screens = {
    title: el('screen-title'),
    paused: el('screen-pause'),
    success: el('screen-success'),
    fail: el('screen-fail'),
  };
  let messageTimer = 0;

  function showScreen(name) {
    for (const key of Object.keys(screens)) {
      screens[key].style.display = key === name ? 'flex' : 'none';
    }
    hud.style.display = name === 'title' || name === 'success' || name === 'fail' ? 'none' : 'block';
  }

  function drawHorizon(pitch, roll) {
    const w = horizon.width;
    const h = horizon.height;
    const cx = w / 2;
    const cy = h / 2;
    hctx.clearRect(0, 0, w, h);
    hctx.save();
    hctx.beginPath();
    hctx.arc(cx, cy, 52, 0, Math.PI * 2);
    hctx.clip();
    hctx.translate(cx, cy);
    hctx.rotate(roll);
    hctx.translate(0, pitch * 70);
    hctx.fillStyle = '#3f7fb8';
    hctx.fillRect(-60, -60, 120, 60);
    hctx.fillStyle = '#8a6a44';
    hctx.fillRect(-60, 0, 120, 60);
    hctx.strokeStyle = '#ffffff';
    hctx.lineWidth = 2;
    hctx.beginPath();
    hctx.moveTo(-60, 0);
    hctx.lineTo(60, 0);
    hctx.stroke();
    hctx.restore();
    hctx.strokeStyle = '#ffffff';
    hctx.lineWidth = 2;
    hctx.beginPath();
    hctx.arc(cx, cy, 52, 0, Math.PI * 2);
    hctx.stroke();
    // Fixed wings marker.
    hctx.beginPath();
    hctx.moveTo(cx - 34, cy);
    hctx.lineTo(cx - 12, cy);
    hctx.moveTo(cx + 12, cy);
    hctx.lineTo(cx + 34, cy);
    hctx.stroke();
    hctx.beginPath();
    hctx.arc(cx, cy - 2, 3, 0, Math.PI * 2);
    hctx.fillStyle = '#ffffff';
    hctx.fill();
  }

  function setMessage(text, seconds) {
    message.textContent = text;
    message.style.display = text ? 'block' : 'none';
    messageTimer = seconds;
  }

  // Compass strip: the target bearing as a marker on a heading tape.
  function compassText(heading, targetBearing) {
    const rel = ((targetBearing - heading + 540) % 360) - 180;
    const arrow = rel > 25 ? '<<' : rel < -25 ? '>>' : '^^';
    return arrow + ' ' + Math.round(rel) + ' deg';
  }

  function update(state, screen, best, dt) {
    if (messageTimer > 0) {
      messageTimer -= dt;
      if (messageTimer <= 0) message.style.display = 'none';
    }
    if (screen === 'title' || screen === 'success' || screen === 'fail') return;
    const p = state.plane;
    alt.textContent = Math.round(p.y) + ' m';
    spd.textContent = Math.round(p.speed * 3.6) + ' km/h';
    const hd = headingDeg(p);
    hdg.textContent = String(hd).padStart(3, '0') + ' deg';
    vs.textContent = fmtSigned(p.vspeed, ' m/s');
    thr.textContent = Math.round(p.throttle * 100) + '%';
    score.textContent = 'Score ' + state.score;
    timer.textContent = fmtTime(state.elapsed);
    beacon.textContent = 'BEACON ' + state.beaconsPassed + '/5';
    objective.textContent = state.objective;
    const windKmh = Math.round(Math.hypot(state.wind.windX, state.wind.windZ) * 3.6);
    const gustKmh = Math.round(Math.hypot(state.wind.gustX, state.wind.gustZ) * 3.6);
    wind.textContent = 'Wind ' + windKmh + ' km/h' + (state.wind.storm > 0.35 ? ' - STORM ' + gustKmh + ' gust' : '');
    const isl = nearestIsland(p.x, p.z);
    place.textContent = isl ? isl.name : '';
    stall.style.display = p.stalled ? 'block' : 'none';
    // Beacon direction arrow and distance to the current target.
    const dx = state.targetX - p.x;
    const dz = state.targetZ - p.z;
    const dist = Math.round(Math.hypot(dx, dz));
    const bearing = (Math.atan2(dx, dz) * 180) / Math.PI;
    const bearingNorm = ((bearing % 360) + 360) % 360;
    const targetBearing = Math.round(bearingNorm);
    beaconArrow.textContent = compassText(hd, targetBearing);
    beaconDist.textContent = state.targetName + ' ' + dist + ' m';
    // Landing guidance: the glide altitude for this distance, so the
    // pilot can see the slope instead of guessing it, and a terrain
    // warning when sinking toward rising ground. The warning stays off
    // on a proper final: over the runway island, aligned, descending
    // gently, the plane is about to land, not about to crash.
    if (state.beaconsPassed >= 5) {
      objective.textContent = 'Land on ' + RUNWAY.name + ' - glide ' + Math.round(57 + dist * 0.10) + ' m';
    }
    const dxr = p.x - RUNWAY.x;
    const dzr = p.z - RUNWAY.z;
    const nearRunway = Math.hypot(dxr, dzr) < 200;
    const headingDiff = Math.abs(((p.heading - RUNWAY.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const landingCorridor = state.beaconsPassed >= 5 && nearRunway && headingDiff < 0.5 && p.vspeed > -12;
    low.style.display = (!landingCorridor && p.vspeed < -1 && p.y < terrainHeight(p.x, p.z) + 25) ? 'block' : 'none';
    drawHorizon(p.pitch, p.roll);
  }

  function showSuccess(state, best) {
    const b = state.breakdown;
    const l = state.landing;
    el('success-score').textContent = 'Score ' + state.score;
    el('success-best').textContent = 'Best ' + best;
    el('success-lines').innerHTML = '';
    const lines = [
      ['Beacons and supply rings', b.beacons],
      [l.offStrip ? 'Landing quality (off the strip)' : 'Landing quality (' + RUNWAY.name + ')', b.landing],
      ['  Alignment', l.alignScore],
      ['  Descent rate', l.vsScore],
      ['  Touchdown speed', l.spdScore],
      ['Smooth flight bonus', b.smooth],
      ['Time bonus (' + fmtTime(state.elapsed) + ')', b.time],
    ];
    for (const [label, value] of lines) {
      const row = doc.createElement('div');
      row.className = 'score-row';
      const a = doc.createElement('span');
      a.textContent = label;
      const c = doc.createElement('span');
      c.textContent = '+' + value;
      row.appendChild(a);
      row.appendChild(c);
      el('success-lines').appendChild(row);
    }
    showScreen('success');
  }

  function showFail(state) {
    el('fail-reason').textContent = state.crashReason || 'Mission failed';
    el('fail-score').textContent = 'Score ' + state.score + ' - Beacons ' + state.beaconsPassed + '/5';
    showScreen('fail');
  }

  function setBestOnTitle(best) {
    el('title-best').textContent = best > 0 ? 'Best score ' + best : 'First flight - good luck, pilot';
  }

  return { update, showScreen, showSuccess, showFail, setBestOnTitle, setMessage };
}

export { BEST_KEY, FONT };
