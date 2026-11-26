// ARUNIKA: SKYWAY RESCUE - a best-flight-game-20261126-0057 entry (Node 22,
// standard library only): the game is this directory's game/ folder, plain
// static files a desktop browser loads offline (game/index.html and its ES
// modules, Three.js vendored under game/vendor/three/, no network request),
// and the program hands it in. It copies game/ and screenshots/ from beside
// this file to /output and writes /output/dossier.json, the summary the
// judge reads, with the vendored make.fun library. Cinematic arcade flight
// and precision aerial rescue: pilot the Kestrel-7 through five beacon gates
// over a volcanic archipelago at golden hour, then land on Runway 7 as a
// storm rolls in. Put your 3 or 4 PNG or JPEG screenshots in screenshots/
// (the first by name is the cover) and run it.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// cpSync preserves the source tree's permission bits, so output modes would
// depend on how the repo was obtained (640/660 files, 770 dirs on this VM).
// The grader collects outputs as another user, so normalize explicitly:
// every directory 0755, every file 0644, including the output root and
// dossier.json. chmod only changes modes, never bytes.
function normalizeModes(dir: string): void {
  chmodSync(dir, 0o755);
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) normalizeModes(p);
    else chmodSync(p, 0o644);
  }
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

normalizeModes(out);
