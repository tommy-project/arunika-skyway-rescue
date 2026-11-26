// Score regression test for ARUNIKA: SKYWAY RESCUE.
// Run: node --experimental-default-type=module tests/score-regression.mjs
// (the repo has no package.json, so the flag is what lets Node treat the
// game's ESM .js modules as modules; do NOT add "type": "module" to the
// repo just for this test — it would change how the entry's own files load.)
// Exits 0 on pass, 1 on any failure. Imports the world module directly:
// world.js, shots.js, flight.js, config.js, random.js and best.js are all
// DOM-free, so no browser or DOM shim is needed.
//
// What it checks:
// (a) a world driven to a landing has breakdown additive rows
//     (beacons + landing.total + smooth + time) summing exactly to
//     breakdown.total and to state.score;
// (b) the landing sub-scores (align + vs + spd) sum exactly to the
//     landing total — including the off-strip halving, which is applied
//     per sub-score so the identity always holds;
// (c) Best is max(previous best, score) across successive landings, via
//     the pure nextBest() helper that main.js endSuccess() uses.
// (d) sanity check: the staged ?shot=complete scene with seed 7 (the same
//     seed shots.json uses) reproduces the known Mission Complete numbers
//     790 / 148 / 100 / 150 / total 1188.
import { createWorld } from '../game/src/world.js';
import { stageShot } from '../game/src/shots.js';
import { createRandom } from '../game/src/random.js';
import { nextBest } from '../game/src/best.js';

let failures = 0;
let checks = 0;

function check(name, cond, detail = '') {
  checks += 1;
  if (cond) {
    console.log(`ok   ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// Fly the full mission with the staged-shot autopilot and return the world.
function flyComplete(seed) {
  const world = createWorld(createRandom(seed));
  const scene = stageShot('complete', world);
  return { world, scene };
}

// (a) + (b) + (d): seed 7 is the shots.json seed for 4-complete.jpg.
const first = flyComplete(7);
check('complete scene lands (success screen)', first.scene.screen === 'success',
  `screen=${first.scene.screen} landed=${first.world.state.landed} crashed=${first.world.state.crashed}`);
const b = first.world.state.breakdown;
check('breakdown exists after landing', b !== null && typeof b === 'object');
check('landing breakdown is a nested non-additive object',
  b && typeof b.landing === 'object' && Number.isFinite(b.landing.total)
  && Number.isFinite(b.landing.align) && Number.isFinite(b.landing.vs)
  && Number.isFinite(b.landing.spd) && typeof b.landing.offStrip === 'boolean');
if (b) {
  const additive = b.beacons + b.landing.total + b.smooth + b.time;
  check('additive rows sum exactly to breakdown.total',
    additive === b.total, `rows=${additive} total=${b.total}`);
  check('breakdown.total equals state.score',
    b.total === first.world.state.score, `total=${b.total} score=${first.world.state.score}`);
  check('landing sub-scores sum exactly to landing total',
    b.landing.align + b.landing.vs + b.landing.spd === b.landing.total,
    `align=${b.landing.align} vs=${b.landing.vs} spd=${b.landing.spd} total=${b.landing.total}`);
  // (d) known Mission Complete numbers for the seed-7 staged landing.
  check('seed-7 beacons and supply rings = 790', b.beacons === 790, `got ${b.beacons}`);
  check('seed-7 landing total = 148', b.landing.total === 148, `got ${b.landing.total}`);
  check('seed-7 smooth flight = 100', b.smooth === 100, `got ${b.smooth}`);
  check('seed-7 time bonus = 150', b.time === 150, `got ${b.time}`);
  check('seed-7 final score = 1188', b.total === 1188, `got ${b.total}`);
  // The old bug rendered 7 '+' rows summing to total + landing (1336).
  // With the nested breakdown the '+' rows are exactly the four additive
  // ones, so their sum must NOT exceed the total.
  check('additive rows do not exceed the total (no double-count)',
    additive <= b.total, `rows=${additive} total=${b.total}`);
}

// (c) Best across successive landings. (The flight itself is seed-
// independent — the seed only varies cosmetic cloud placement — so the
// two staged landings score the same; the max logic is covered by the
// pure-helper unit checks below as well as by the two-landing sequence.)
const score1 = first.world.state.score;
let best = nextBest(0, score1);
check('best after first landing equals first score', best === score1, `best=${best} score1=${score1}`);
const second = flyComplete(11);
check('second staged mission also lands', second.scene.screen === 'success',
  `screen=${second.scene.screen}`);
const score2 = second.world.state.score;
best = nextBest(best, score2);
check('best after second landing is max(score1, score2)',
  best === Math.max(score1, score2), `best=${best} score1=${score1} score2=${score2}`);

// Pure-helper unit checks.
check('nextBest keeps the higher previous best', nextBest(100, 50) === 100);
check('nextBest takes the higher new score', nextBest(50, 100) === 100);
check('nextBest ties keep the value', nextBest(100, 100) === 100);
check('nextBest zero/zero is zero', nextBest(0, 0) === 0);
check('nextBest ignores non-finite inputs', nextBest(NaN, 1188) === 1188 && nextBest(500, NaN) === 500);

if (failures > 0) {
  console.log(`\nFAIL: ${failures} of ${checks} checks failed`);
  process.exitCode = 1;
} else {
  console.log(`\nPASS: all ${checks} checks passed (seed-7 breakdown: beacons=${b.beacons} landing=${b.landing.total} ` +
    `align=${b.landing.align} vs=${b.landing.vs} spd=${b.landing.spd} smooth=${b.smooth} time=${b.time} total=${b.total})`);
}
