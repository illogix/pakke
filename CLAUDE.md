# Phaser Game

Phaser 4 + Vite. Plain JavaScript, ES modules.

## Commands

- `npm run dev` — dev server at http://localhost:5173
- `npm run build` — production build to `dist/`
- `npm run preview` — serve the built output

## Layout

- `src/main.js` — `Phaser.Game` config and scene registration
- `src/scenes/` — one file per scene, default-exported class extending `Phaser.Scene`

## Phaser 4 skills

Phaser ships official skills covering its v4 API. They are symlinked into
`.claude/skills/` as `phaser-*` (targets live in `node_modules/phaser/skills/`,
so they resolve after `npm install`).

Consult the relevant one before writing Phaser code — **v4 differs from v3** in
ways that fail at runtime rather than at build time. `phaser-v3-to-v4-migration`
covers the breaking changes; notably pipelines became render nodes, and FX and
masks became the unified filter system.
