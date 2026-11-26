// ARUNIKA: SKYWAY RESCUE - every tuning number and colour in one place.
// Distances in metres, speeds in metres per second, angles in radians.
// The world is a fixed volcanic archipelago; ?seed=N only varies cosmetic
// details (cloud placement, waterfall phase, turbulence noise phase).

export const STEP = 1 / 60;

export const BEST_KEY = 'arunika.best';

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// Flight tuning.
export const FLIGHT = {
  minSpeed: 18,
  maxSpeed: 95,
  cruiseThrottle: 0.62,
  stallSpeed: 26,
  accel: 14,
  brakeDecel: 26,
  pitchRate: 0.85,
  maxPitch: 0.62,
  rollRate: 1.6,
  maxRoll: 1.05,
  rollReturn: 1.1,
  yawRate: 0.35,
  turnRate: 0.7,
  sinkFactor: 0.5,
  propSpin: 28,
};

// Mission layout. Heading 0 points along +z; forward = (sin h, 0, cos h).
export const START = { x: -880, y: 150, z: 620, heading: 2.27 };

export const BEACONS = [
  { name: 'Beacon 1', x: -520, y: 150, z: 320, radius: 28 },
  { name: 'Beacon 2', x: -120, y: 170, z: -120, radius: 28 },
  { name: 'Beacon 3', x: 330, y: 170, z: -330, radius: 28 },
  { name: 'Beacon 4', x: 680, y: 150, z: 80, radius: 28 },
  { name: 'Beacon 5', x: 980, y: 140, z: 420, radius: 28 },
];

export const SUPPLY_RINGS = [
  { name: 'Supply 1', x: -300, y: 165, z: 80, radius: 15 },
  { name: 'Supply 2', x: 500, y: 165, z: -180, radius: 15 },
  { name: 'Supply 3', x: 850, y: 145, z: 250, radius: 15 },
];

// Runway: flat strip on Airstrip Isle, heading from Beacon 5 toward the strip.
export const RUNWAY = {
  x: 1150, y: 56.5, z: 650,
  heading: 0.637,
  length: 170, width: 22,
  name: 'Runway 7',
};

// Islands: centre, radius, peak height, kind. The runway island has a flat top.
export const ISLANDS = [
  { name: 'Kestrel Rock', x: -950, y: 0, z: 650, radius: 220, height: 90, kind: 'rock' },
  { name: 'Ember Isle', x: -500, y: 0, z: 300, radius: 260, height: 135, kind: 'volcano' },
  { name: 'Twin Palms', x: -100, y: 0, z: -150, radius: 200, height: 70, kind: 'palm' },
  { name: 'Stormwatch', x: 350, y: 0, z: -400, radius: 280, height: 155, kind: 'volcano' },
  { name: 'Coral Shelf', x: 700, y: 0, z: 50, radius: 180, height: 45, kind: 'palm' },
  { name: 'Airstrip Isle', x: 1150, y: 0, z: 650, radius: 230, height: 55, kind: 'runway' },
  { name: 'Far Reef', x: 900, y: 0, z: -650, radius: 150, height: 60, kind: 'rock' },
  { name: 'Smoker Rock', x: -200, y: 0, z: 750, radius: 130, height: 110, kind: 'volcano' },
];

// Wind: base vector plus a storm zone in the north-east where turbulence bites.
export const WIND = {
  baseX: -3.5, baseZ: 2.0,
  stormX: 520, stormZ: -180, stormRadius: 520,
  stormGust: 9, calmGust: 1.5,
};

export const SCORE = {
  beacon: 100,
  centerBonusMax: 50,
  supply: 25,
  landingMax: 200,
  smoothMax: 100,
  timeFast: 150, timeMid: 100, timeSlow: 50,
  timeFastSec: 150, timeMidSec: 210, timeSlowSec: 300,
};

export const PALETTE = {
  skyTop: '#2e4a7a',
  skyMid: '#e8905a',
  skyLow: '#f7c873',
  sun: '#ffd9a0',
  ocean: '#1d6f7a',
  oceanDeep: '#14505e',
  sand: '#e8d29a',
  grass: '#4f8f4a',
  rock: '#6b5a52',
  volcano: '#4a3f3c',
  beacon: '#19e3d8',
  beaconDim: '#0e8f8a',
  supply: '#ffc93c',
  runway: '#2c2f36',
  runwayLine: '#f2f2e8',
  planeOrange: '#ff7a1a',
  planeWhite: '#f4f2ea',
  planeDark: '#22303c',
  hudText: '#ffffff',
  hudPanel: 'rgba(10, 22, 34, 0.62)',
  hudAccent: '#19e3d8',
  warn: '#ff5252',
};

export const SCREEN = {
  title: 'title',
  play: 'play',
  paused: 'paused',
  success: 'success',
  fail: 'fail',
};
