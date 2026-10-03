# Verification and release checks

Current testing guide, reviewed October 2, 2026. This replaces the completed
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
`PUZZLE_URL`; `playwright-core` installed outside the repo with `CHROME_PATH`
pointing at a local Chrome is enough. Start `npm run dev` before running:

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

Last executed October 2, 2026, after the Rounded redesign (Home, Collections
tree, flat board, light and dark schemes), the Catppuccin Latte and Mocha
themes, and the follow-up that moved every control into one bottom dock with a
More menu, arranged pieces around the tray for the screen's shape, and made Fit
a tight frame, with `playwright-core` driving the desktop Chrome. The player
script was rerun the same day after adding tap-to-turn and the long-press flip
charge and making Flip a left-to-right mirror on screen.

| Check | Last result | Coverage |
| --- | --- | --- |
| Unit suite | 429 tests in 16 files passed | Core rules/geometry, camera/gesture math, workspace, validation, hashing, library revisions, migration, backup/restore, failed writes, introductory solutions, generator, starting layout, screen-shaped arrangement (spacing, workspace, best shape), tray-centred opening and tight Fit, colour-scheme tokens and piece palette, screen-horizontal flips at every orientation, and the tap/long-press decision and charged-press slop. |
| Production build | Passed | Full application and offline service worker emitted. Vite warns about the Phaser-containing JS chunk. |
| Player browser script | 38 checks passed | Drag/release, turn/flip, tap to select then turn, long-press flip mirroring left to right at turned pieces and rotated fields, Flip enabled while charged, kept through drift under a cell and dropped after a cell, a drag returned to its start staying a move, ownership/cancellation, touch/pinch, transforms, saved attempts, completion, tray centring on opening, tight Fit, re-arrangement on resize until the first move, the dock and More menu, and backdrop-tap cancel, with player screenshots in both schemes. |
| Library browser script | 34 checks passed (dev); 36 with `PRODUCTION=1` | Home steppers, Collections tree and filter sheet, layout in both schemes at four sizes, navigation and history, file import/export through group actions, duplicates and conflicts, backup into a fresh profile, removal/reimport with progress, and offline imported/bundled play. |
| Reliability browser script | 8 checks passed | 1,000-puzzle paging within a group, simulated write failure, actual stale-tab rejection, reopening, denied storage, migration, and absent SubtleCrypto. |

Successful browser runs reported no page errors. A 1,000-puzzle import/preview
took about 0.6 seconds on the desktop host, with 60 rows initially rendered.
This is not a mobile frame-time or battery measurement.

Also checked by hand in the same session: generating from Home opens a playable
puzzle in Generated puzzles with pieces arranged around a centred tray, and switching the emulated colour scheme while a
puzzle is open repaints the board and pieces without a reload.

## Generator in the browser

Manual check with `npm run dev`: Home shows the New puzzle steppers, which
clamp at 3 and 9 and default to 6×6; **Generate W × H** shows a Generating
sheet with a Cancel button, then opens a playable puzzle; the puzzle is listed
under Generated puzzles in Collections; reloading the
`?puzzle=gen-…&pack=loose` URL resolves; solving marks it solved; generating
the same size again yields a different puzzle. With Chrome DevTools CPU
throttling at 6×, the app must stay responsive during a 9×9 generation and
finish within the deadline or show the retry sheet. Phone performance for the
largest boards is unmeasured; see the roadmap.

## Visual and device checks

The browser suites cover 320×568 and 390×844 portrait, 844×390 landscape, and
1280×800 desktop. Recheck both the small starter content and the dense pentomino
board when changing layout, materials, camera behavior, or input.

Inspect continuous silhouettes, local invalid tint, matte locked material,
aligned inner/outer grid, all display rotations, negative staging, the tray
centred on opening, Fit framing tightly, the arrangement in portrait and
landscape, and the dock with and without flip. On an iPhone, check the board
clears the Dynamic Island and the dock clears the home indicator.
Check that palette pieces repaint when the scheme changes. Include fractional dragging, selected and solved
states, overlaps, straddling, cancellation, and reduced motion. Check focus,
readability, and target sizes in Home, Collections, and dialogs as well as the
player, in both light and dark schemes. Safari is the only browser that shows
SF Pro Rounded; check label fit there as well as in Chrome's system font.

Scripts regenerate screenshots in `docs/verification/`. That directory is
ignored disposable test output, not game assets or a design source. Superseded
concept images and old captures have been removed. Reproduce current screenshots
from the running build rather than treating generated concepts as authoritative.

Physical iOS/Android testing, Safari behavior, native sharing, sustained phone
performance, and the broader offline/storage lifecycle remain unverified.
Chrome touch emulation is useful evidence for wiring and layout, not a substitute
for device feel. The pre-release checklist is kept outside this repo.
