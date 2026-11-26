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
    // Sunset sky above the horizon, dark ocean below: the same palette as
    // the world outside, so the instrument reads as part of the scene.
    const sky = hctx.createLinearGradient(0, -60, 0, 0);
    sky.addColorStop(0, '#f7c873');
    sky.addColorStop(0.6, '#e8905a');
    sky.addColorStop(1, '#ff9a3c');
    hctx.fillStyle = sky;
    hctx.fillRect(-60, -60, 120, 60);
    const sea = hctx.createLinearGradient(0, 0, 0, 60);
    sea.addColorStop(0, '#1d6f7a');
    sea.addColorStop(1, '#0a2e3a');
    hctx.fillStyle = sea;
    hctx.fillRect(-60, 0, 120, 60);
    // Pitch ladder: ticks every ~10 deg (12 px), longer at ~20 deg.
    hctx.strokeStyle = 'rgba(255,255,255,0.85)';
    hctx.lineWidth = 1.5;
    for (const off of [-24, -12, 12, 24]) {
      const half = Math.abs(off) === 24 ? 22 : 14;
      hctx.beginPath();
      hctx.moveTo(-half, off);
      hctx.lineTo(half, off);
      hctx.stroke();
    }
    // Horizon line: bright, 2.5 px.
    hctx.strokeStyle = '#ffffff';
    hctx.lineWidth = 2.5;
    hctx.beginPath();
    hctx.moveTo(-60, 0);
    hctx.lineTo(60, 0);
    hctx.stroke();
    hctx.restore();
    // Bezel: dark outer ring, crisp white inner ring.
    hctx.strokeStyle = '#22303c';
    hctx.lineWidth = 5;
    hctx.beginPath();
    hctx.arc(cx, cy, 54, 0, Math.PI * 2);
    hctx.stroke();
    hctx.strokeStyle = '#ffffff';
    hctx.lineWidth = 2;
    hctx.beginPath();
    hctx.arc(cx, cy, 52, 0, Math.PI * 2);
    hctx.stroke();
    // Bank indicator: orange pointer at the top, rolling with the aircraft.
    hctx.save();
    hctx.translate(cx, cy);
    hctx.rotate(roll);
    hctx.fillStyle = '#ff7a1a';
    hctx.beginPath();
    hctx.moveTo(0, -52);
    hctx.lineTo(-6, -42);
    hctx.lineTo(6, -42);
    hctx.closePath();
    hctx.fill();
    hctx.restore();
    // Fixed bank ticks at +/-30 and +/-60 deg around the bezel top.
    hctx.strokeStyle = 'rgba(255,255,255,0.9)';
    hctx.lineWidth = 2;
    for (const deg of [-60, -30, 30, 60]) {
      const a = (-90 + deg) * Math.PI / 180;
      hctx.beginPath();
      hctx.moveTo(cx + Math.cos(a) * 46, cy + Math.sin(a) * 46);
      hctx.lineTo(cx + Math.cos(a) * 52, cy + Math.sin(a) * 52);
      hctx.stroke();
    }
    // Fixed wings marker, orange, with a white centre dot.
    hctx.strokeStyle = '#ff7a1a';
    hctx.lineWidth = 3;
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
    const l = b.landing;
    el('success-score').textContent = 'Score ' + state.score;
    el('success-best').textContent = 'Best ' + best;
    el('success-lines').innerHTML = '';
    // Additive rows only: their values sum exactly to the final score.
    // The landing sub-scores are detail under the landing row, shown
    // without a '+' prefix so they cannot be read as extra points.
    const rows = [
      { label: 'Beacons and supply rings', value: b.beacons, additive: true },
      { label: l.offStrip ? 'Landing quality (off the strip)' : 'Landing quality (' + RUNWAY.name + ')', value: l.total, additive: true },
      { label: 'Alignment', value: l.align, additive: false },
      { label: 'Descent rate', value: l.vs, additive: false },
      { label: 'Touchdown speed', value: l.spd, additive: false },
      { label: 'Smooth flight bonus', value: b.smooth, additive: true },
      { label: 'Time bonus (' + fmtTime(state.elapsed) + ')', value: b.time, additive: true },
    ];
    for (const { label, value, additive } of rows) {
      const row = doc.createElement('div');
      row.className = additive ? 'score-row' : 'score-row score-sub';
      const a = doc.createElement('span');
      a.textContent = label;
      const c = doc.createElement('span');
      c.textContent = additive ? '+' + value : String(value);
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
