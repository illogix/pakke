# Verification and release checks

Current testing guide, reviewed October 6, 2026. This replaces the completed
player/library implementation reports. Product behavior is documented in
[DESIGN.md](../DESIGN.md); unfinished verification and optional features are
tracked outside this repo.

## Theme checks

Theme values live in `src/themes/palettes.js`; CSS and browser theme colors are
rendered from that data by `scripts/theme-plugin.js`. Unit checks cover matching
token sets, pre-boot CSS generation, explicit palette-change notifications,
optional face colors, and a four-color palette cycling twice across eight pieces.
Generator checks use both four- and six-color neighbor ordering.

On October 6, after the Pakke redesign, `npm run check` passed all 463 tests
and the production build. Unit checks also cover Home's section colours taken
from the piece palette, cycling a palette shorter than four, and the five most
recent unfinished attempts behind Last played. The daily browser script also
checks pre-boot light/dark tokens with JavaScript disabled, the Daily section's
Green on Today and the calendar button with their piece-ink labels (including
hover), Home surface colors, live board theme changes, actual tray texture pixels, and dock
colors. Settings checks cover the System default, fixed choices ignoring OS
changes on Home and the board, reload persistence, System following OS changes,
and a backup restoring the applied theme. All 41 daily browser checks passed
with no page errors, as did the player (41), library (34), reliability (8), and
production offline checks. Home, the history sheet, Library, and the board were
inspected at 390×844 in both schemes; with simulated iPhone safe areas (47 px
top, 34 px bottom) all four Home sections fit without scrolling. Screenshots include `theme-board-light.png`
and `theme-board-dark.png`, plus `theme-settings-light.png` and
`theme-settings-dark.png`.

## Daily mode checks

`src/daily/calendar.test.js` validates all 730 emitted 2026 date/mode definitions
against independent saved research witnesses, including exact coverage, excluded
month/day squares, starting B faces, and legal flips. It also checks separate
progress, Continue, solved history after Restart, backup/restore, date validity,
and local-date handling. Board annotation and theme tests cover malformed
labels/holes, staging translation, optional flipped colors, and identity.
The generator tests now exercise both rule settings, with a regression for
unsafe symmetry pruning against unavailable mirrored orientations. Labeled
board analysis counts arrangements on the fixed board rather than symmetry orbits.

The optional browser check uses an existing Playwright installation and a
running Vite server:

```sh
node scripts/daily-browser-check.mjs
```

`PLAYWRIGHT_MODULE`, `CHROME_PATH`, and `PUZZLE_URL` can select installed tooling
and the server. On October 5, 2026, 30 checks passed with no page errors:
Home entry, mode selection, native piece input, independent attempts/completion,
resume/reload/history, Continue restoring its date and mode, month dropdown and range limits, generation without
flips, separation from Collections, backup/erase/restore, and flip color painting.
Both schemes passed layout checks at 320×568, 390×844, and 844×390; screenshots
under ignored `docs/verification/daily-*.png` were visually inspected.
`npm run check` passed all 448 tests and the production build.

Production offline check (start `npm run preview` first):

```sh
node scripts/daily-offline-check.mjs
```

On October 5, the production app reloaded Home offline, derived a previously
unopened January 17 flippable puzzle offline, and reloaded its daily route,
with no page errors. This uses the same tooling environment variables.

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

Rerun it after changing the solver, partitioner, or `GENERATOR_LIMITS`.
October 5, 2026, 12 seeds per size: flippable 6/8/9 medians 3/106/1090 ms,
p95 20/581/2371 ms; rotations-only 1/30/465 ms, p95 6/40/1222 ms. All 72
runs succeeded. The default flippable path retains its previous behavior. On the
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
charge and making Flip a left-to-right mirror on screen, and again on October 3
after moving the dock to the device's bottom edge on turned touch screens.

| Check | Last result | Coverage |
| --- | --- | --- |
| Unit suite | 432 tests in 16 files passed | Core rules/geometry, camera/gesture math, workspace, validation, hashing, library revisions, migration, backup/restore, failed writes, introductory solutions, generator, starting layout, screen-shaped arrangement (spacing, workspace, best shape), tray-centred opening and tight Fit, colour-scheme tokens and piece palette, screen-horizontal flips at every orientation, and the tap/long-press decision and charged-press slop, and the dock side for each screen angle. |
| Production build | Passed | Full application and offline service worker emitted. Vite warns about the Phaser-containing JS chunk. |
| Player browser script | 41 checks passed | Drag/release, turn/flip, tap to select then turn, long-press flip mirroring left to right at turned pieces and rotated fields, Flip enabled while charged, kept through drift under a cell and dropped after a cell, a drag returned to its start staying a move, ownership/cancellation, touch/pinch, transforms, saved attempts, completion, tray centring on opening, tight Fit, re-arrangement on resize until the first move, the dock and More menu, the dock beside the board for each landscape turn and above it upside down, with buttons in reading order and dragging through the moved canvas, and backdrop-tap cancel, with player screenshots in both schemes. |
| Library browser script | 34 checks passed (dev); 36 with `PRODUCTION=1` | Home steppers, Library tree and filter sheet, layout in both schemes at four sizes, navigation and history, file import/export through group actions, duplicates and conflicts, backup into a fresh profile, removal/reimport with progress, and offline imported/bundled play. |
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
under Generated puzzles in the Library; reloading the
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
readability, and target sizes in Home, Library, and dialogs as well as the
player, in both light and dark schemes. Safari is the only browser that shows
SF Pro Rounded; check label fit there as well as in Chrome's system font.

Scripts regenerate screenshots in `docs/verification/`. That directory is
ignored disposable test output, not game assets or a design source. Superseded
concept images and old captures have been removed. Reproduce current screenshots
from the running build rather than treating generated concepts as authoritative.

The iOS app has been installed on an iPhone from Xcode but not yet checked
systematically; the simulator was skipped as too slow. Check launch with no white flash in either scheme, no
page zoom, text selection, callout or loupe from pinches, long presses and
double-tap-and-hold, a long
press on a piece enabling Flip and flipping on release, the dock moving to the
left when the phone is turned clockwise and to the right when turned
counterclockwise, including a direct half turn between the two, generation in its
worker, import through the file picker, export and backup through the share
sheet, and that the library survives quitting the app and airplane mode.

Physical iOS/Android testing, Safari behavior, native sharing, sustained phone
performance, and the broader offline/storage lifecycle remain unverified.
Chrome touch emulation is useful evidence for wiring and layout, not a substitute
for device feel. The pre-release checklist is kept outside this repo.
