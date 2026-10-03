# Pakke

A mobile-friendly square-grid packing game built with Phaser 4 and Vite. The
player and personal puzzle library run in the browser without a backend.

## Run locally

```sh
npm install
npm run dev
```

Use the URL printed by Vite. The library includes First steps (four introductory
puzzles) and Room to think (the larger pentomino challenge). Direct links such
as `/?puzzle=demo01` and `/?puzzle=pent01` still work.

| Server | Command | Default port | Purpose |
| --- | --- | --- | --- |
| Development | `npm run dev` | 5173 | Source changes update automatically; offline caching is disabled. |
| Production preview | `npm run build`, then `npm run preview` | 4173 | Serves built `dist/` files, including offline behavior. Rebuild after source changes. |

These ports are defaults, not evidence that either server is currently running.
Different ports/hostnames have separate browser storage, so their imported packs
and attempts do not automatically carry across. Use backup/restore to transfer
personal data between origins or devices.

In production, the first load caches the whole app; nothing is shown about it,
and the app never needs the network afterwards. Cached
updates do not interrupt an active game; close old app tabs to allow a waiting
version to activate. Normal local HTTP/LAN play is supported, but offline
installation requires a browser and serving origin that support service workers.

## iPhone app

`ios/` is a Capacitor project that bundles the production build into a native
app, which then runs fully offline. It needs Xcode and an Apple developer
account.

```sh
npm run ios      # Production build, copied into the Xcode project
npx cap open ios # Open the project in Xcode
```

Copy `ios/Local.xcconfig.example` to `ios/Local.xcconfig` and set your Apple
Developer Team ID there; git ignores that file. Choosing a team in Xcode's
Signing & Capabilities also works, but writes it into the project file. If
Xcode reports the bundle identifier is unavailable, change `appId` in
`capacitor.config.json` and the App target's Bundle Identifier to your own.
Pick your connected iPhone as the run destination and press Run. Rerun
`npm run ios` after web changes. The app keeps its own library, separate from
Safari's; use backup/restore to move one across.

`node scripts/icons.mjs` regenerates `public/favicon.svg` and the light, dark
and tinted app icons. It needs Playwright, set up as for the browser checks in
[docs/VERIFICATION.md](docs/VERIFICATION.md).

## Play and manage puzzles

Drag a piece continuously and release to snap. Tap a piece to select it, tap it
again to turn it clockwise, or hold it still until Flip lights up and release to
flip it. The dock's controls turn and flip the selected piece. Drag empty canvas
to pan; pinch or scroll to zoom. Reframe fits all pieces in view. Keyboard
shortcuts: **R** clockwise, **Shift+R** or **E** counterclockwise, **F** flip
when allowed, and **Escape** cancel or clear selection. Right-click a movable
piece to rotate it.

Fit every piece in the tray without overlaps. Spare tray cells may be allowed.
Darkened cells indicate a conflict; matte, seated pieces are locked. Help is
available from the More (⋯) button below the board.

**Generate W × H** on Home builds a new rectangular puzzle with
exactly one solution, from 3×3 up to 9×9, and saves it under Generated puzzles.
Generation runs in a background worker and can be cancelled.

Import a pack or standalone puzzle from the bottom of Collections. Preview the
file before adding it; export a pack from its "…" actions and a puzzle from Help. Removing a pack retains its progress
for reimport. Settings provides backup/restore and a separate erase-progress
action. Content exports exclude personal progress; backups include it.

See [library formats](docs/LIBRARY_FORMAT.md) before authoring pack files. The
built-in editor remains optional future work; it is not present in the app.

## Check changes

```sh
npm test        # Unit tests, including bundled-puzzle validation
npm run build   # Production output; does not itself run tests
npm run check   # Tests followed by production build
```

[Verification](docs/VERIFICATION.md) covers optional browser checks, production
offline testing, the latest recorded results, and device limitations. Generated
screenshots are ignored test output and are not game assets.

## Project documentation

- [DESIGN.md](DESIGN.md): current product, gameplay, and architecture.
- [CLAUDE.md](CLAUDE.md): coding guidance and Phaser skill requirements.
- [Library formats](docs/LIBRARY_FORMAT.md): exchange, identity, revisions, persistence, and limits.
- [Verification](docs/VERIFICATION.md): reproducible checks and known coverage limits.
