// Drawing only: the Three.js scene, the chase camera, the Kestrel-7 built
// from primitives, the islands, ocean, clouds, storm, beacons and runway.
// Nothing here owns rules; it paints the world state it is handed.
import * as THREE from '../vendor/three/three.module.min.js';
import { BEACONS, ISLANDS, PALETTE, RUNWAY, SUPPLY_RINGS, WIND } from './config.js';
import { forwardOf } from './flight.js';
import { terrainHeight } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

function mulberry(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexColor(str) {
  return new THREE.Color(str);
}

// Radial glow texture drawn once on a canvas, reused by beacon sprites.
function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.35, 'rgba(25,227,216,0.45)');
  g.addColorStop(1, 'rgba(25,227,216,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

export function createRenderer(canvas, seed) {
  const rng = mulberry(seed * 7919 + 13);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xe8a06a, 700, 2600);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 6000);

  // Golden-hour sky dome: a gradient shader with a low sun disc.
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: hexColor(PALETTE.skyTop) },
      mid: { value: hexColor(PALETTE.skyMid) },
      low: { value: hexColor(PALETTE.skyLow) },
      sunDir: { value: new THREE.Vector3(-0.55, 0.28, -0.79).normalize() },
      sunCol: { value: hexColor(PALETTE.sun) },
    },
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vDir; uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform vec3 sunDir; uniform vec3 sunCol;'
      + 'void main() { float h = clamp(vDir.y, -0.1, 1.0); vec3 col = h > 0.45 ? mix(mid, top, (h - 0.45) / 0.55) : mix(low, mid, h / 0.45);'
      + ' float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0); col += sunCol * pow(s, 220.0) * 1.4 + sunCol * pow(s, 8.0) * 0.22; gl_FragColor = vec4(col, 1.0); }',
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4200, 24, 16), skyMat);
  scene.add(sky);

  const sun = new THREE.DirectionalLight(0xffd9a0, 2.6);
  sun.position.set(-900, 480, -1300);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xffe0b8, 0x1d5a66, 1.1));

  // Ocean: a wide plane with a gentle sine swell, animated in draw().
  const oceanGeo = new THREE.PlaneGeometry(5200, 5200, 72, 72);
  oceanGeo.rotateX(-Math.PI / 2);
  const oceanMat = new THREE.MeshStandardMaterial({ color: hexColor(PALETTE.ocean), roughness: 0.35, metalness: 0.15 });
  const ocean = new THREE.Mesh(oceanGeo, oceanMat);
  ocean.position.y = 0;
  scene.add(ocean);
  const oceanBase = oceanGeo.attributes.position.array.slice();

  // Islands: displaced cones with colour bands by height (sand, grass, rock).
  const islandGroup = new THREE.Group();
  scene.add(islandGroup);
  const sand = hexColor(PALETTE.sand);
  const grass = hexColor(PALETTE.grass);
  const rock = hexColor(PALETTE.rock);
  const volcano = hexColor(PALETTE.volcano);
  for (const isl of ISLANDS) {
    const geo = new THREE.ConeGeometry(isl.radius, isl.height, 28, 7);
    geo.translate(0, isl.height / 2, 0);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 1) {
      const px = pos.getX(i);
      const pz = pos.getZ(i);
      const py = pos.getY(i);
      const wob = 1 + (rng() - 0.5) * 0.16;
      pos.setX(i, px * wob);
      pos.setZ(i, pz * wob);
      const t = isl.height > 0 ? py / isl.height : 0;
      // The runway island is a cleared airstrip: pale sand over the whole
      // upper cone, so the strip reads as a prepared field from the air.
      if (isl.kind === 'runway' && t > 0.55) c.copy(sand);
      else if (t < 0.12) c.copy(sand);
      else if (t < 0.55) c.copy(grass);
      else if (isl.kind === 'volcano') c.copy(volcano);
      else c.copy(rock);
      // Slight per-vertex variation so the bands do not look flat.
      const v = 0.92 + rng() * 0.16;
      colors[i * 3] = c.r * v;
      colors[i * 3 + 1] = c.g * v;
      colors[i * 3 + 2] = c.b * v;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
    mesh.position.set(isl.x, 0, isl.z);
    islandGroup.add(mesh);
    // Palm clusters on the palm islands: trunk + five splayed fronds,
    // planted on the cone slope so each island reads at a glance.
    if (isl.kind === 'palm') {
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.95, flatShading: true });
      const frondMat = new THREE.MeshStandardMaterial({ color: 0x2f7a33, roughness: 0.9, flatShading: true });
      for (let k = 0; k < 5; k += 1) {
        const a = rng() * Math.PI * 2;
        const rr = isl.radius * (0.3 + rng() * 0.45);
        const px = isl.x + Math.cos(a) * rr;
        const pz = isl.z + Math.sin(a) * rr;
        const palm = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.8, 7, 6), trunkMat);
        trunk.position.y = 3.5;
        palm.add(trunk);
        for (let f = 0; f < 5; f += 1) {
          const fa = (f / 5) * Math.PI * 2;
          const frond = new THREE.Mesh(new THREE.ConeGeometry(1.1, 6.5, 4), frondMat);
          frond.position.set(Math.cos(fa) * 2.2, 7.2, Math.sin(fa) * 2.2);
          frond.rotation.z = Math.cos(fa) * 1.1;
          frond.rotation.x = -Math.sin(fa) * 1.1;
          palm.add(frond);
        }
        palm.position.set(px, terrainHeight(px, pz) - 0.5, pz);
        islandGroup.add(palm);
      }
    }
    // Boulders on the rock islands: grey slabs breaking the cone silhouette.
    if (isl.kind === 'rock') {
      const boulderMat = new THREE.MeshStandardMaterial({ color: hexColor(PALETTE.rock), roughness: 1, flatShading: true });
      for (let k = 0; k < 4; k += 1) {
        const a = rng() * Math.PI * 2;
        const rr = isl.radius * (0.3 + rng() * 0.5);
        const px = isl.x + Math.cos(a) * rr;
        const pz = isl.z + Math.sin(a) * rr;
        const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(4 + rng() * 5, 0), boulderMat);
        boulder.position.set(px, terrainHeight(px, pz) + 1.5, pz);
        boulder.rotation.set(rng() * 3, rng() * 3, rng() * 3);
        islandGroup.add(boulder);
      }
    }
    // Volcano crater glow: a small emissive disc on the peak.
    if (isl.kind === 'volcano') {
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(isl.radius * 0.12, 16),
        new THREE.MeshBasicMaterial({ color: 0xff5a1a }),
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(isl.x, isl.height + 0.6, isl.z);
      islandGroup.add(glow);
    }
  }

  // Waterfalls: two animated white streaks down Ember Isle and Stormwatch.
  const falls = [];
  const fallMat = new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.75 });
  for (const isl of ISLANDS.filter((i) => i.kind === 'volcano')) {
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(10, isl.height * 0.75), fallMat.clone());
    const ang = rng() * Math.PI * 2;
    const r = isl.radius * 0.55;
    fall.position.set(isl.x + Math.cos(ang) * r, isl.height * 0.42, isl.z + Math.sin(ang) * r);
    fall.lookAt(isl.x, fall.position.y, isl.z);
    scene.add(fall);
    falls.push(fall);
  }

  // Volcano smoke: grey puffs stacked over each crater, so the volcanoes
  // read as live peaks, not just dark cones. Bobbed gently in draw().
  const smokePuffs = [];
  const smokeMat = new THREE.MeshStandardMaterial({ color: 0x8f969e, roughness: 1, transparent: true, opacity: 0.28, flatShading: true });
  for (const isl of ISLANDS.filter((i) => i.kind === 'volcano')) {
    for (let k = 0; k < 3; k += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(4.5 + rng() * 4.5, 8, 6), smokeMat);
      puff.scale.y = 0.7;
      puff.position.set(isl.x + (rng() - 0.5) * 16, isl.height + 14 + k * 8, isl.z + (rng() - 0.5) * 16);
      puff.userData.baseY = puff.position.y;
      puff.userData.phase = rng() * Math.PI * 2;
      scene.add(puff);
      smokePuffs.push(puff);
    }
  }

  // Clouds: low-poly puffs that drift with the wind.
  const clouds = [];
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffe9c4, roughness: 1, transparent: true, opacity: 0.92, emissive: 0x554433, emissiveIntensity: 0.4 });
  const stormMat = new THREE.MeshStandardMaterial({ color: 0x555b6e, roughness: 1, transparent: true, opacity: 0.95, emissive: 0x11131c, emissiveIntensity: 0.5 });
  for (let i = 0; i < 26; i += 1) {
    const group = new THREE.Group();
    const puffs = 3 + Math.floor(rng() * 3);
    for (let j = 0; j < puffs; j += 1) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(18 + rng() * 22, 8, 6), cloudMat);
      s.position.set((rng() - 0.5) * 70, (rng() - 0.5) * 10, (rng() - 0.5) * 30);
      s.scale.y = 0.45;
      group.add(s);
    }
    const stormy = i >= 20;
    if (stormy) group.children.forEach((m) => { m.material = stormMat; });
    group.position.set(-1400 + rng() * 3000, 230 + rng() * 140, -1200 + rng() * 2400);
    group.userData.stormy = stormy;
    scene.add(group);
    clouds.push(group);
  }

  // Rain streaks over the storm side: one Points cloud, recycled in draw().
  const rainCount = 900;
  const rainPos = new Float32Array(rainCount * 3);
  for (let i = 0; i < rainCount; i += 1) {
    rainPos[i * 3] = WIND.stormX + (rng() - 0.5) * 900;
    rainPos[i * 3 + 1] = rng() * 320;
    rainPos[i * 3 + 2] = WIND.stormZ + (rng() - 0.5) * 900;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xbcd8e8, size: 2.2, transparent: true, opacity: 0.55 }));
  scene.add(rain);

  // Beacons: cyan torus rings facing the flight path, with a glow sprite and
  // a faint vertical beam. Passed beacons dim to a soft green.
  const glowTex = makeGlowTexture();
  const beaconMeshes = BEACONS.map((b) => {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(b.radius, 1.4, 12, 48),
      new THREE.MeshStandardMaterial({ color: hexColor(PALETTE.beacon), emissive: hexColor(PALETTE.beacon), emissiveIntensity: 1.6, roughness: 0.4 }),
    );
    group.add(ring);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: hexColor(PALETTE.beacon), transparent: true, opacity: 0.5, depthWrite: false }));
    sprite.scale.set(b.radius * 2.2, b.radius * 2.2, 1);
    group.add(sprite);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 220, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: hexColor(PALETTE.beacon), transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 110;
    group.add(beam);
    group.position.set(b.x, b.y, b.z);
    scene.add(group);
    return { group, ring, sprite, beam, def: b };
  });

  // Supply rings: smaller gold torus rings, each with a rescue crate slung
  // underneath on a tether, so the ring reads as a deliberate pickup, not
  // a stray floating hoop.
  const supplyMeshes = SUPPLY_RINGS.map((r) => {
    const group = new THREE.Group();
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(r.radius, 0.9, 10, 36),
      new THREE.MeshStandardMaterial({ color: hexColor(PALETTE.supply), emissive: hexColor(PALETTE.supply), emissiveIntensity: 1.2, roughness: 0.4 }),
    );
    group.add(torus);
    const tether = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 7, 6),
      new THREE.MeshBasicMaterial({ color: hexColor(PALETTE.supply) }),
    );
    tether.position.y = -3.5;
    group.add(tether);
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 4.2, 4.2),
      new THREE.MeshStandardMaterial({ color: hexColor(PALETTE.planeOrange), roughness: 0.6 }),
    );
    crate.position.y = -8.5;
    group.add(crate);
    const crateBand = new THREE.Mesh(
      new THREE.BoxGeometry(4.3, 1.1, 4.3),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
    );
    crateBand.position.y = -8.5;
    group.add(crateBand);
    group.position.set(r.x, r.y, r.z);
    scene.add(group);
    return { mesh: group, torus, def: r };
  });

  // Runway: asphalt strip, centre dashes, edge lights, windsock.
  const runwayGroup = new THREE.Group();
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(RUNWAY.width, 1.2, RUNWAY.length),
    new THREE.MeshStandardMaterial({ color: hexColor(PALETTE.runway), roughness: 0.9 }),
  );
  strip.position.y = 0.6;
  runwayGroup.add(strip);
  for (let i = -3; i <= 3; i += 1) {
    const dash = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.3, 12),
      new THREE.MeshBasicMaterial({ color: hexColor(PALETTE.runwayLine) }),
    );
    dash.position.set(0, 1.35, i * 22);
    runwayGroup.add(dash);
  }
  // Threshold bars at both ends of the strip.
  for (const end of [-1, 1]) {
    for (let k = -1.5; k <= 1.5; k += 1) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(3.2, 0.3, 9),
        new THREE.MeshBasicMaterial({ color: hexColor(PALETTE.runwayLine) }),
      );
      bar.position.set(k * 5, 1.35, end * (RUNWAY.length / 2 - 10));
      runwayGroup.add(bar);
    }
  }
  // Runway number "7" painted at the approach end, readable from the air
  // by a pilot on final (digit top points down the strip, away from them).
  const numCanvas = document.createElement('canvas');
  numCanvas.width = 128;
  numCanvas.height = 128;
  const nctx = numCanvas.getContext('2d');
  nctx.fillStyle = '#f2f2e8';
  nctx.font = '900 96px system-ui, sans-serif';
  nctx.textAlign = 'center';
  nctx.textBaseline = 'middle';
  nctx.fillText('7', 64, 70);
  const numPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 13),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(numCanvas), transparent: true, depthWrite: false }),
  );
  numPlane.rotation.set(-Math.PI / 2, 0, Math.PI);
  numPlane.position.set(0, 1.45, -RUNWAY.length / 2 + 24);
  runwayGroup.add(numPlane);
  const edgeLights = [];
  for (let i = -4; i <= 4; i += 1) {
    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.9, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0x7dff9a }),
      );
      lamp.position.set(side * (RUNWAY.width / 2 + 2), 1.6, i * 20);
      runwayGroup.add(lamp);
      edgeLights.push(lamp);
    }
  }
  const sockPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.6 }),
  );
  sockPole.position.set(RUNWAY.width / 2 + 8, 6, -RUNWAY.length / 2 + 8);
  runwayGroup.add(sockPole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(1.6, 7, 10),
    new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.7 }),
  );
  sock.position.set(RUNWAY.width / 2 + 8, 11.4, -RUNWAY.length / 2 + 8);
  sock.rotation.z = Math.PI / 2;
  runwayGroup.add(sock);
  runwayGroup.position.set(RUNWAY.x, RUNWAY.y, RUNWAY.z);
  runwayGroup.rotation.y = RUNWAY.heading;
  scene.add(runwayGroup);

  // Kestrel-7: orange and white rescue aircraft built from primitives.
  const planeGroup = new THREE.Group();
  const orange = new THREE.MeshStandardMaterial({ color: hexColor(PALETTE.planeOrange), roughness: 0.45, metalness: 0.25 });
  const white = new THREE.MeshStandardMaterial({ color: hexColor(PALETTE.planeWhite), roughness: 0.5, metalness: 0.15 });
  const dark = new THREE.MeshStandardMaterial({ color: hexColor(PALETTE.planeDark), roughness: 0.35, metalness: 0.4 });
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.1, 9, 12), orange);
  fuselage.rotation.x = Math.PI / 2;
  planeGroup.add(fuselage);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.4, 12), white);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 5.6;
  planeGroup.add(nose);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.15, 12, 8), dark);
  canopy.scale.set(1, 0.75, 1.9);
  canopy.position.set(0, 1.15, 1.6);
  planeGroup.add(canopy);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(15, 0.32, 2.6), white);
  wing.position.set(0, -0.1, 0.6);
  planeGroup.add(wing);
  const wingTipL = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.36, 2.6), orange);
  wingTipL.position.set(-7.2, -0.1, 0.6);
  planeGroup.add(wingTipL);
  const wingTipR = wingTipL.clone();
  wingTipR.position.x = 7.2;
  planeGroup.add(wingTipR);
  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.28, 1.6), white);
  tailWing.position.set(0, 0.25, -4.2);
  planeGroup.add(tailWing);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.6, 2.2), orange);
  fin.position.set(0, 1.2, -4.2);
  planeGroup.add(fin);
  const propHub = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.8, 8), dark);
  propHub.rotation.x = Math.PI / 2;
  propHub.position.z = 6.9;
  planeGroup.add(propHub);
  const prop = new THREE.Group();
  const bladeGeo = new THREE.BoxGeometry(0.5, 5.6, 0.18);
  const blade1 = new THREE.Mesh(bladeGeo, dark);
  const blade2 = new THREE.Mesh(bladeGeo, dark);
  blade2.rotation.z = Math.PI / 2;
  prop.add(blade1);
  prop.add(blade2);
  prop.position.z = 7.3;
  planeGroup.add(prop);
  // Spinning-propeller disc: a faint translucent disc behind the blades,
  // so the prop reads as a blur at screenshot distance, not two sticks.
  const propDisc = new THREE.Mesh(
    new THREE.CircleGeometry(2.9, 24),
    new THREE.MeshBasicMaterial({ color: 0xdfe8ea, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  );
  propDisc.position.z = 7.32;
  planeGroup.add(propDisc);
  // Canopy highlight: a pale sliver along the canopy crown.
  const canopyGlint = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.12, 1.7),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }),
  );
  canopyGlint.position.set(0.35, 1.92, 1.6);
  planeGroup.add(canopyGlint);
  // Tail stripe: a white band across the orange fin.
  const finStripe = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 2.2), white);
  finStripe.position.set(0, 1.2, -4.2);
  planeGroup.add(finStripe);
  const navL = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  navL.position.set(-7.6, 0, 0.6);
  planeGroup.add(navL);
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color: 0x22ff66 }));
  navR.position.set(7.6, 0, 0.6);
  planeGroup.add(navR);
  // Rescue stripe and tail number plate, for close-up readability.
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.5, 3.4), white);
  stripe.position.set(0, 0.1, -1.2);
  planeGroup.add(stripe);
  scene.add(planeGroup);

  // Chase camera state, smoothed so the view never snaps.
  const camPos = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  let camInit = false;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  // One frame: place the aircraft, chase it, animate water, clouds, rain,
  // beacon pulses and the propeller, then render.
  function draw(state, screen, time) {
    const p = state.plane;
    const fwd = forwardOf(p);
    planeGroup.position.set(p.x, p.y, p.z);
    // Three.js forward is -z for lookAt; build orientation from heading,
    // pitch and roll manually so the nose follows the flight model.
    planeGroup.rotation.order = 'YXZ';
    planeGroup.rotation.y = p.heading;
    planeGroup.rotation.x = -p.pitch;
    planeGroup.rotation.z = p.roll;
    prop.rotation.z = p.propAngle;

    // Chase camera: behind and above the aircraft, looking ahead. On the
    // success screen the camera pulls back further and the look target
    // shifts sideways, so the landed aircraft sits in the right half of
    // the frame, clear of the Mission Complete panel on the left.
    const back = screen === 'success' ? 46 : 26;
    const up = screen === 'success' ? 9 : 8.5;
    const wantX = p.x - fwd.x * back;
    const wantY = p.y - fwd.y * back + up;
    const wantZ = p.z - fwd.z * back;
    if (!camInit) {
      camPos.set(wantX, wantY, wantZ);
      camInit = true;
    } else {
      const k = 1 - Math.pow(0.0001, 1 / 60);
      camPos.x += (wantX - camPos.x) * k;
      camPos.y += (wantY - camPos.y) * k;
      camPos.z += (wantZ - camPos.z) * k;
    }
    // Keep the camera out of the sea and out of island rock.
    const groundAtCam = terrainHeight(camPos.x, camPos.z);
    if (camPos.y < groundAtCam + 4) camPos.y = groundAtCam + 4;
    if (camPos.y < 6) camPos.y = 6;
    camera.position.copy(camPos);
    camTarget.set(p.x + fwd.x * 55, p.y + fwd.y * 55, p.z + fwd.z * 55);
    if (screen === 'success') {
      // Shift the look target toward the aircraft's left, so the aircraft
      // itself renders right of centre, clear of the left-side panel.
      camTarget.x += fwd.z * 64;
      camTarget.z += -fwd.x * 64;
    }
    camera.lookAt(camTarget);

    // Ocean swell.
    const opos = oceanGeo.attributes.position;
    for (let i = 0; i < opos.count; i += 1) {
      const bx = oceanBase[i * 3];
      const bz = oceanBase[i * 3 + 2];
      opos.array[i * 3 + 1] = Math.sin(bx * 0.008 + time * 0.7) * 0.9 + Math.cos(bz * 0.011 + time * 0.5) * 0.9;
    }
    opos.needsUpdate = true;

    // Clouds drift with the base wind and wrap around the map.
    for (const c of clouds) {
      c.position.x += -0.55 * (1 / 60) * 8;
      c.position.z += 0.3 * (1 / 60) * 8;
      if (c.position.x < -1600) c.position.x = 1600;
      if (c.position.z > 1600) c.position.z = -1600;
    }

    // Rain falls and recycles over the storm zone.
    const rpos = rainGeo.attributes.position;
    for (let i = 0; i < rainCount; i += 1) {
      let y = rpos.array[i * 3 + 1] - 2.6;
      if (y < 0) y = 320;
      rpos.array[i * 3 + 1] = y;
    }
    rpos.needsUpdate = true;

    // Waterfalls shimmer; volcano smoke bobs over the craters.
    for (let i = 0; i < falls.length; i += 1) {
      falls[i].material.opacity = 0.6 + Math.sin(time * 2.2 + i * 2.1) * 0.18;
    }
    for (let i = 0; i < smokePuffs.length; i += 1) {
      smokePuffs[i].position.y = smokePuffs[i].userData.baseY + Math.sin(time * 0.4 + smokePuffs[i].userData.phase) * 2;
    }

    // Beacons: pulse the next one, dim passed ones, spin supply rings.
    for (let i = 0; i < beaconMeshes.length; i += 1) {
      const bm = beaconMeshes[i];
      const b = state.beacons[i];
      const isNext = i === state.beaconsPassed;
      const pulse = isNext ? 2.4 + Math.sin(time * 4) * 0.9 : 1.4;
      bm.ring.material.emissiveIntensity = b.passed ? 0.25 : pulse;
      bm.ring.scale.setScalar(1 + b.flash * 0.25 + (isNext ? Math.sin(time * 4) * 0.03 : 0));
      bm.sprite.material.opacity = b.passed ? 0.06 : 0.55 + (isNext ? Math.sin(time * 4) * 0.15 : 0);
      bm.beam.visible = !b.passed;
      bm.group.rotation.z = 0;
      // Face the ring toward the aircraft so it reads as a gate.
      const dx = p.x - bm.def.x;
      const dz = p.z - bm.def.z;
      bm.group.rotation.y = Math.atan2(dx, dz);
    }
    for (let i = 0; i < supplyMeshes.length; i += 1) {
      const sm = supplyMeshes[i];
      sm.torus.rotation.z += 0.01;
      sm.mesh.visible = !state.rings[i].passed;
      sm.torus.material.emissiveIntensity = 1.0 + Math.sin(time * 3 + i) * 0.4;
    }

    // Windsock points downwind; runway edge lights twinkle.
    sock.rotation.y = Math.atan2(state.wind.windX, state.wind.windZ) + time * 0.05;
    for (let i = 0; i < edgeLights.length; i += 1) {
      edgeLights[i].material.color.setHex(Math.sin(time * 2 + i) > 0 ? 0x7dff9a : 0x3fae5a);
    }

    // Stall buffet: shake the camera a touch while stalled.
    if (p.stalled && screen === SCREEN_PLAY) {
      camera.position.x += Math.sin(time * 47) * 0.25;
      camera.position.y += Math.cos(time * 39) * 0.2;
    }

    renderer.render(scene, camera);
  }

  return { draw, resetCamera() { camInit = false; } };
}
