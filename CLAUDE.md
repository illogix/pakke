# Phaser Game

Phaser 4 + Vite. Plain JavaScript, ES modules.

A 2D packing puzzle game. `DESIGN.md` holds the V1 design — settled decisions,
the puzzle schema, what is built so far, and open questions. Read it before
building anything here.

## Commands

- `npm run dev` — dev server at http://localhost:5173
- `npm run build` — production build to `dist/`
- `npm run preview` — serve the built output
- `npm test` — Vitest over the core, layout and interaction modules

## Layout

- `src/core/` — pure puzzle logic. **No Phaser imports, ever.** Geometry,
  placement state, violations, completion, validation. A future solver links
  against this directly.
- `src/puzzles/` — one JSON per puzzle, collected and sorted by `id`
- `src/ui/` — theme, the field-to-canvas transform, interaction maths. Pure.
- `src/scenes/` — Phaser scenes, default-exported classes extending `Phaser.Scene`
- `src/main.js` — `Phaser.Game` config and scene registration

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
