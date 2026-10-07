# Pakke

Phaser 4 + Vite. Plain JavaScript, ES modules.

A 2D packing puzzle game with a local collection library. Read `DESIGN.md`
before building: it is the current design, not a historical V1 plan.
`docs/LIBRARY_FORMAT.md` defines content/storage contracts;
`docs/VERIFICATION.md` records how to test and what remains unverified.
`plans/` holds planning notes — the roadmap and redesign briefs — and is
untracked, so it is present locally but never committed.

## Commands

- `npm run dev` — dev server at http://localhost:5173
- `npm run build` — production build to `dist/`
- `npm run preview` — serve the built output
- `npm test` — Vitest over pure logic, interaction, persistence, and bundled content
- `npm run check` — tests followed by production build
- `npm run ios` — production build copied into the Capacitor iOS project (`npx cap open ios` opens Xcode)

## Layout

- `src/core/` — pure puzzle logic. **No Phaser imports, ever.** Geometry,
  placement state, violations, completion, validation, plus the exact-cover
  solver and the unique-solution puzzle generator (`solver.js`, `generate.js`).
- `src/puzzles/` — bundled JSON definitions and explicitly ordered pack manifest
- `src/library/` — content identity, exchange validation, revision-aware library model and IndexedDB repository; no Phaser imports
- `src/app/` — player shell, Home and Library UI, generator controls and their Web Worker, offline registration, legacy-save migration adapter
- `src/themes/palettes.js` — shared pure theme color values and variable-length piece palettes.
- `src/ui/` — camera/interaction math, theme application, silhouettes, materials, and icons.
  Math is pure; material/icon helpers also use browser canvas/DOM APIs.
- `src/scenes/` — Phaser scenes, default-exported classes extending `Phaser.Scene`
- `src/main.js` — `Phaser.Game` config and scene registration
- `ios/` — Capacitor's native iOS project; `ios/App/App/public` is a generated copy of `dist/`

Phaser 4 will not boot under jsdom, so scenes cannot be unit tested — keep logic
worth testing in `core/` or `ui/` and leave drawing and event wiring in the scene.

## Phaser 4 skills

Phaser ships official skills covering its v4 API. They are symlinked into
`.claude/skills/` as `phaser-*` (targets live in `node_modules/phaser/skills/`,
so they resolve after `npm install`).

Consult the relevant one before writing Phaser code — **v4 differs from v3** in
ways that fail at runtime rather than at build time. `phaser-v3-to-v4-migration`
covers the breaking changes; notably pipelines became render nodes, and FX and
masks became the unified filter system.

## Documentation and artifacts

Keep current behavior in `DESIGN.md` and remaining work in `plans/ROADMAP.md`.
Update format and testing references when those contracts change. Do not revive
completed handoffs as parallel sources of truth. Tracked docs must not link into
`plans/`, which is untracked and absent from a fresh clone. Browser scripts
regenerate ignored screenshots under `docs/verification/`; these are not game
assets.
