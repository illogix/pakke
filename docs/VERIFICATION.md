# Verification and release checks

Current testing guide, reviewed September 14, 2026. This replaces the completed
player/library implementation reports. Product behavior is documented in
[DESIGN.md](../DESIGN.md); unfinished verification and optional features are
tracked outside this repo.

## Automated checks

```sh
npm test
npm run check
```

`npm run check` runs the unit suite, including bundled-puzzle validation, then
builds production output. `npm run build` alone does not run tests. Pure logic
can run in Node; Phaser rendering and real input require a browser, not jsdom.

The generator suite (`src/core/solver.test.js`, `partition.test.js`,
`generate.test.js`) checks hand-built tilings against the solver, then generates
boards from 3×3 to 8×8 over fixed seeds and verifies each one independently:
valid and warning-free, exact fit, solved by the returned placements, and
reported as a single solution by an exhaustive solver run, with every piece
within the size cap. The generator benchmark prints time, merges, solver nodes,
piece counts, largest piece, and carvings per board size:

```sh
node scripts/generator-bench.mjs            # 20 seeds, sizes 4–9
node scripts/generator-bench.mjs 50 6,9     # seeds, then sizes
```

Rerun it after changing the solver, partitioner, or `GENERATOR_LIMITS`. On the
desktop host, September 14, 2026: 6×6 took about 3 ms median, 8×8 about 120 ms
median and 660 ms p95, and 9×9 about 950 ms median and 1.6 s p95 in Node, all
with 12 of 12 seeds succeeding. After adding the piece-size cap (same day, 50
seeds each): 6×6 about 2 ms median, 8×8 about 190 ms median and 480 ms p95, 9×9
about 1.0 s median and 2.3 s p95, 50 of 50 succeeding at every size from 3×3 to
9×9, largest piece 14 cells. A 40-seed sweep of rectangular boards up to 64
cells also succeeded throughout; narrow small boards such as 3×7 and 4×5 need
dozens of carvings. 10×10 exceeded the plan's 1 s p95 target and is
outside the allowed range.

Optional browser scripts use an existing Playwright installation and an
isolated browser profile. They accept `PLAYWRIGHT_MODULE`, `CHROME_PATH`, and
`PUZZLE_URL`. Start `npm run dev` before running:

```sh
node scripts/browser-check.mjs
node scripts/library-browser-check.mjs
node scripts/library-reliability-check.mjs
```

For the production/offline checks, run `npm run build`, start `npm run preview`
in another terminal, then use:

```sh
PRODUCTION=1 PUZZLE_URL=http://127.0.0.1:4173 node scripts/library-browser-check.mjs
```

Use the actual server port if the default is occupied. Keep player/reliability
scripts on the development server; they inspect development modules. The
production library suite verifies file operations and offline playback through
the built application.

## Latest recorded baseline

Last executed September 8, 2026, after the library implementation and initial
player-sizing fix. The September 9 cleanup changes documentation and generated
artifact handling; these results are historical baseline evidence, not a claim
that tests were rerun for the cleanup.

| Check | Last result | Coverage |
| --- | --- | --- |
| Unit suite | 278 tests in 11 files passed | Core rules/geometry, camera/gesture math, workspace, validation, hashing, library revisions, migration, backup/restore, failed writes, introductory solutions. |
| Production build | Passed | Full application and offline service worker emitted. Vite warned about the Phaser-containing JS chunk, about 1.45 MB / 383 kB gzip. |
| Player browser script | 31 checks passed | Drag/release, turn/flip, ownership/cancellation, touch/pinch, transforms, saved attempts, completion, and dock layout. |
| Production library browser script | 23 checks passed | File import/export, duplicates and conflicts, search/navigation, backup into a fresh profile, removal/reimport with progress, and offline imported/bundled play. |
| Reliability browser script | 8 checks passed | 1,000-puzzle paging, simulated write failure, actual stale-tab rejection, reopening, denied storage, migration, and absent SubtleCrypto. |

Successful browser runs reported no page errors. A 1,000-puzzle import/preview
took about 1.8–2.6 seconds on the desktop host, with 60 cards initially rendered.
This is not a mobile frame-time or battery measurement.

## Generator in the browser

Manual check with `npm run dev`: the library page shows **Generate puzzle**;
the sheet's steppers clamp at 3 and 9 and default to 6×6; Generate shows a
status line with a Cancel button, then opens a playable puzzle; the puzzle is
listed under Generated puzzles on returning to the library; reloading the
`?puzzle=gen-…&pack=loose` URL resolves; solving marks it solved; generating
the same size again yields a different puzzle. With Chrome DevTools CPU
throttling at 6×, the library must stay responsive during a 9×9 generation and
finish within the deadline or show the retry sheet. Phone performance for the
largest boards is unmeasured; see the roadmap.

## Visual and device checks

The browser suites cover 320×568 and 390×844 portrait, 844×390 landscape, and
1280×800 desktop. Recheck both the small starter content and the dense pentomino
board when changing layout, materials, camera behavior, or input.

Inspect continuous silhouettes, local invalid tint, matte locked material,
aligned inner/outer grid, all display rotations, negative staging, and the dock
with/without flip and reframe. Include fractional dragging, selected and solved
states, overlaps, straddling, cancellation, and reduced motion. Check focus,
readability, and target sizes in library pages and dialogs as well as the player.

Scripts regenerate screenshots in `docs/verification/`. That directory is
ignored disposable test output, not game assets or a design source. Superseded
concept images and old captures have been removed. Reproduce current screenshots
from the running build rather than treating generated concepts as authoritative.

Physical iOS/Android testing, Safari behavior, native sharing, sustained phone
performance, and the broader offline/storage lifecycle remain unverified.
Chrome touch emulation is useful evidence for wiring and layout, not a substitute
for device feel. The pre-release checklist is kept outside this repo.
