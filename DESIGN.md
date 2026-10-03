# Pakke — current design

Current as of October 2, 2026. This is the authoritative product and gameplay
reference. It describes the implemented player and library. See
[the library format reference](docs/LIBRARY_FORMAT.md) for exchange and storage
contracts, and [verification](docs/VERIFICATION.md) for checks and their limits.
Remaining work and optional extensions are tracked outside this repo.

## Product and scope

A mobile-first square-grid packing game, also playable in a local desktop
browser. Arrange polyomino pieces in a fixed tray using movement, quarter-turns,
and optional flipping. Play is untimed, with no score or move counter.

The player uses continuous dragging, release snapping, an aligned canvas,
flat pieces, and one dock of controls below the board. Generating a puzzle is the main activity
and starts from Home; hand-made collections are a secondary destination. The
local library supports bundled and imported collections, resume, search, status
filters, export, backups, and offline play. No account or server is needed.

Five bundled puzzles are arranged in two explicit collections:

- **First steps:** `first-fit`, `little-turn`, `other-side`, `demo01`. The first
  three introduce placement, rotation, and flipping; the demo adds a locked
  piece and intentional spare room.
- **Room to think:** `pent01`, the larger pentomino challenge.

The library can also **generate** new puzzles on the device; see
[Generated puzzles](#generated-puzzles). The editor is a possible future
feature, not a prerequisite or an implemented screen. Native mobile packaging
is also not implemented.

## Architecture and state boundaries

The puzzle is fully represented outside Phaser. Rendering must never become
the source of truth for piece placements or rules.

| Layer | Responsibility |
| --- | --- |
| `src/core/` | Pure geometry, committed state operations, violations, completion, validation, and the solver/generator. No Phaser imports. |
| `src/puzzles/` | Bundled JSON definitions and an explicitly ordered pack manifest. |
| `src/library/` | Definition identity, file validation, collections, saved attempts, backups, and the IndexedDB repository. No Phaser imports. |
| `src/ui/` | Camera and gesture math, colour-scheme tokens, procedural materials, silhouettes, and icons. Some rendering helpers use browser canvas/DOM APIs. |
| `src/scenes/` | Phaser drawing, event wiring, transient selection and gesture previews. |
| `src/app/` | Home and Collections pages, player controls/dialogs, routing, offline registration, legacy storage migration, and the generator controls with their Web Worker. |

Keep these concepts separate:

- **Definition:** immutable authored JSON describing a puzzle.
- **Attempt:** committed integer placements plus saved solve history.
- **View state:** selection, camera, fractional drag preview, and animation.
- **Pack:** an ordered collection referencing exact definition versions.
- **Draft:** reserved authoring data; it is neither an attempt nor playable
  library content. No draft editor or stable draft exchange format exists yet.

Core operations return new state objects. Future authoring should likewise use
named operations so history/undo can be added without restructuring event code.

## Puzzle definition

The supported puzzle schema is version 1. A minimal complete example:

```json
{
  "schemaVersion": 1,
  "id": "example-domino",
  "type": "square-grid-packing",
  "meta": {
    "name": "A place to start",
    "author": "Your name",
    "description": "Move the piece into the tray."
  },
  "field": { "width": 6, "height": 8 },
  "container": { "cells": [[2, 2], [3, 2]] },
  "rules": {
    "allowRotation": true,
    "allowFlip": false,
    "completion": "all-pieces-contained"
  },
  "pieces": [{
    "id": "p1",
    "cells": [[0, 0], [1, 0]],
    "start": { "x": 2, "y": 5, "rotation": 0, "flipped": false },
    "locked": false
  }],
  "presentation": { "fieldRotation": 0 }
}
```

An attempt contains `placements`, keyed by piece ID, with `{x, y, rotation,
flipped}` for each piece. Rotation is 0–3 clockwise quarter-turns. Geometry
flips horizontally first, then rotates, then translates into canonical field
coordinates. Occupied cell arrays are derived rather than saved.

IDs are permanent identity, independent of names, filenames, and play order.
Never rename an ID merely to reorder a collection. Designer, contributor,
source, attribution, license, tags, and catalog numbers belong in metadata;
optional credits are not a prerequisite for a private puzzle.

The tray is a set of cells, allowing holes and nonrectangular shapes without
special cell roles. `type` and `completion` are machine identifiers; common
instructions and human-readable rule labels live in code. Puzzle-specific
notes use `meta.description`.

`color` is optional. A piece without one takes the theme's piece palette in
definition order, counting only uncoloured pieces: colours 1–6, then cycling
back to 1. Palette colours follow the colour scheme; an authored hex colour is
used as given in every scheme. Bundled and generated puzzles leave colour unset.

Preserve `flipped` even for symmetric pieces. Equivalent geometry does not
justify discarding face identity; a future two-faced-piece rule could use it.

### Authored field and runtime workspace

Authored tray cells and starting placements use nonnegative coordinates and
must fit the stored `field`. `deriveField()` computes width and height from the
furthest occupied starting cell plus a two-cell trailing border; authors must
also leave useful leading space. The stored field preserves initial framing
and is not a visible outer container.

A fresh attempt is laid out for the screen it opens on (`arrangePieces()`).
Locked pieces, and free pieces that start inside the tray, keep their authored
place. Every other piece keeps its authored rotation and flip but not its
position: pieces are shelf-packed into bands above, below, left and right of
the tray, one empty cell from it and from each other, each shelf centred on the
tray and hugging it. The arrangement is the smallest tray-centred frame, in the
board's aspect ratio, that holds every piece, so the opening view is as close
as it can be: mostly beside the tray on a wide screen, mostly above and below it
in portrait. Until the first move, a resize lays the pieces out again for the
new shape. Restart lays them out for the current screen. Authored starts are
the fallback when nothing fits, which the workspace bound makes unreachable in
practice. The generator still stores a valid starting layout (`stagePieces()`:
rows below and above the tray) because the format requires one.

The runtime workspace is the field extended on every side by the larger of four
cells or the largest piece dimension, joined with the tray extended by the
arrangement reach (the square root of the pieces' gapped bounding area, plus
the largest piece dimension, plus one). Every arrangement lies inside it, so
saved attempts validate the same way whatever screen they were made on. This
permits negative runtime coordinates. Clamp whole oriented pieces to this
finite workspace. The faint dot grid continues to
the viewport edges; only the tray is drawn as a shape.

## Rules and feedback

A puzzle is solved when every piece is fully inside the tray and there are no
overlaps. Positive slack (tray area minus total piece area) is legitimate;
completion never requires filling every tray cell. Negative slack is invalid.

Drops are permissive. Overlaps and straddling placements stay where released,
subject to workspace bounds. There is no automatic return, nearest-valid-cell
search, or magnetic attraction to the tray.

Violations mark:

1. Cells occupied by multiple pieces, including outside the tray.
2. Cells outside the tray belonging to a piece that is partly inside it.

A piece entirely outside the tray is staged and has no containment violation.
Containment counts for the whole piece. Player progress excludes pieces
involved in any violation; contained locked pieces count toward progress.

Honor `allowRotation` and `allowFlip`. Locked pieces cannot be selected,
transformed, or dragged, and cannot expose a piece underneath to selection.

## Interaction and visual requirements

- Drag follows the exact fractional grab point without grid stepping or tween
  lag. Mouse/touch thresholds are four/six CSS pixels. A faint footprint shows
  the release candidate. Fractional preview state never triggers saves or solves.
- On release, snap the origin to the nearest integer (`floor(value + 0.5)`,
  including negative positions), clamp the whole piece, and commit once. Visual
  settling lasts about 110 ms, is interruptible, and honors reduced motion.
- Pressing a piece selects it. Releasing without dragging turns it clockwise
  if it was already selected. Once a press passes the drag threshold it is a
  move, even if it returns to its start.
- Holding a piece still for 500 ms, where flipping is allowed, charges a flip,
  whether or not it was selected: the otherwise disabled dock enables Flip as
  the cue, and release flips. A charged press may drift up to a cell; moving a
  cell drops the charge, disables Flip, and drags as usual. A long press where
  flipping is not allowed does nothing.
- Flip always mirrors left to right as shown on screen, whatever the piece's
  rotation or the field's. In stored orientation that negates the rotation and
  toggles `flipped`; under an odd `fieldRotation` the field mirror is top to
  bottom. Where rotation is disallowed, flip toggles `flipped` alone.
- Turning/flipping preserves the grabbed point during a drag. At rest it uses
  the piece's bounding-box center. The most recently touched piece draws on top.
- One pointer owns a piece gesture. Ignore other fingers during that drag.
  Outside release commits at the workspace limit; cancellation, blur, resize,
  or shutdown restores the committed state. Escape cancels or clears selection.
- Empty-canvas dragging pans; pinch starts only without a piece drag. Desktop
  wheel zoom is anchored under the pointer. Freeze the camera during piece
  dragging. Bound pan and zoom and offer reframe without moving pieces.
- Initial fit caps cells at 46 CSS pixels; interactive zoom caps them at 72.
  Resize recalculates limits. Saved attempts are reframed to reveal their pieces.
- The opening view of a fresh attempt centres the tray in the board,
  horizontally and vertically, and fits the smallest tray-centred box holding
  every piece. Fit is not centred: it shows the tightest box holding the tray and
  every piece, so with more pieces above the tray it sits lower. Fit is disabled
  while the view already matches it. Pan limits are symmetric about the tray.
- Tray, outer grid, pieces, footprints, and hit testing share one transform,
  including all four `fieldRotation` values. Decoration must not change grid
  pitch or phase. Field rotation is presentation only.
- The tray is one flat rounded silhouette (corner radius about 0.16 cell) in the
  field colour with faint cell lines and no rim. Outside it, faint dots mark the
  lattice points; dots on the tray's own corners are omitted.
- Render whole-piece silhouettes, flat in their colour, with a
  background-coloured edge (0.07 cell) so adjacent pieces, including
  same-coloured ones, stay distinct. Keep internal seams faint. Pieces cast no
  shadow at rest; a lifted piece casts a soft one. The selected piece gets an
  ink ring just outside its edge.
- Invalid cells retain their hue under a borderless translucent dark screen.
  Do not give invalid cells or the valid portion a separate outline, bevel, or
  shadow. No stripes, mesh, warning icons, or wrapped-plastic effect.
- Locked pieces use whole-face matte grain and faint contact shading, at normal
  brightness. No lock symbol; the treatment is distinct from invalid shading.
- No player title or persistent puzzle-name heading. Metadata belongs in the
  Collections tree and Help. Icon controls have accessible names, tooltips, and
  44 px minimum targets, and keep the same place in every orientation.
- Nothing sits above the board, which keeps clear of the notch or Dynamic
  Island. Below it, one rounded dock holds Rotate left, Rotate right, Flip when
  the puzzle allows it, a divider, Fit all pieces in view, and More. Buttons are
  60 × 52 px and shrink evenly (to no less than 40 px) so the dock stays on one
  row; at 320 px five buttons are 54 px. There is no visible progress line;
  progress is announced to screen readers.
- More opens a sheet titled with the puzzle's name, listing Restart, Help and
  Home as full-width rows with icon and label. Restart swaps the sheet for its
  confirmation. Any sheet closes, cancelling, on Escape, its close button, or a
  tap on the backdrop. Keyboard accelerators are R, Shift+R/E, F, Escape, and
  right-click rotation.

## Visual system

The light scheme is Catppuccin Latte and the dark scheme Catppuccin Mocha; more
themes may follow. Surfaces are flat, with no textures, gradients, or themed
decoration. The theme follows `prefers-color-scheme` live, including an open
board, and the browser `theme-color` follows it too. There is no accent colour:
solved marks and the primary button use the text colour.

| Element | Catppuccin role | Latte | Mocha |
| --- | --- | --- | --- |
| Page background, piece separation edge | Base | `#eff1f5` | `#1e1e2e` |
| Panels (rows, steppers, search, dock, menu rows) | Mantle | `#e6e9ef` | `#181825` |
| Tray, hover | Surface0 | `#ccd0da` | `#313244` |
| Hairlines, guide lines, pressed | Surface1 | `#bcc0cc` | `#45475a` |
| Board dots and tray lines | Surface1 at 50% | `#bcc0cc` | `#45475a` |
| Text, icons | Text | `#4c4f69` | `#cdd6f4` |
| Secondary text | Subtext0 | `#6c6f85` | `#a6adc8` |
| Started thumbnails | Overlay0 | `#9ca0b0` | `#6c7086` |

The piece palette is the style guide's regular terminal colours 1–6: Red,
Green, Yellow, Blue, Pink, Teal (Latte `#d20f39 #40a02b #df8e1d #1e66f5
#ea76cb #179299`; Mocha `#f38ba8 #a6e3a1 #f9e2af #89b4fa #f5c2e7 #94e2d5`).
CSS custom properties in `style.css` hold the UI tokens; `src/ui/theme.js`
mirrors the board colours and holds the palette because Phaser cannot read CSS
variables. Panels and buttons use a 14 px radius, the search field 12 px, and
the dock 20 px. Touch targets are at least 44 px; the generator's
stepper buttons are the exception at 40 px wide by 56 px tall, and the two
steppers stack below 390 px wide so their labels never truncate.

One rounded typeface, varied only by size and weight:
`ui-rounded, "SF Pro Rounded", system-ui, sans-serif`. `ui-rounded` resolves in
Safari on Apple platforms; elsewhere the plain system font is used, and no web
font is shipped. Icons are inlined Framework7 Icons (MIT, filled, 56-unit
viewBox) in `src/ui/icons.js`, plus a custom half-filled circle for Started.

UI text is labels, names, counts, and statuses only: no taglines, explainer
sentences under headings, or section blurbs. Empty states use the shortest
functional phrase ("None yet").

## Library experience and persistence

**Home** shows the Pakke wordmark with a Settings button, a **Continue** row
when an unfinished saved attempt is available, the **New puzzle** controls (see
[Generated puzzles](#generated-puzzles)), and one **Hand-made sets** row
("2 sets · 5 puzzles", excluding Generated puzzles) leading to Collections.

**Collections** is a collapsible tree with a search field, a compact Filter and
sort button (status: All, In progress, Unsolved, Solved; sort: collection order,
name, creator; the button is highlighted when either differs from the default),
and **Import a collection** at the bottom. Each group shows its name and
"solved of total"; Generated puzzles always appears, with "None yet" when empty.
A group's "…" button opens its actions: export, and removal for imported packs
or generated puzzles. Puzzle rows show a thumbnail of the real tray shape
(filled ink when solved, grey when started, field colour when new), the name,
and a Solved or Started status. Search covers puzzle names, creators, and
catalog numbers, plus collection names; matching groups expand automatically.
Filters and sorting do not change authored order or identity. Rows render in
batches of 60 per group. Scroll position, query, filters, and expanded groups
persist while navigating in the running app. A puzzle's description, credits,
revision notes, and Export puzzle live in the player's Help sheet.

Continue resumes an available unfinished saved attempt. Solved history
is independent of the current arrangement and survives restarting a puzzle.
A completion sheet appears once per transition to a solved board: "Solved",
with the number left in the collection, or "<collection> complete" only when
all its current puzzles are solved. Next follows the originating pack's order,
even under a browsing filter; the other action returns to Collections with that
group expanded. There are no progression locks. Home in the More menu returns to Home.

Direct puzzle links remain supported. Pack context is explicit in the URL;
ambiguous installed versions require a choice. A direct link without collection
context offers Home rather than inventing a Next sequence. `?view=collections`
opens Collections; a pack link without a puzzle (`?pack=<id>`) opens
Collections with that group expanded.

Use text labels for import/export, management, and backup operations. Import
previews and validates the whole file before mutation. Errors block import;
warnings do not. No silent repair or partial installation. Identical reimports
are no-ops. Updates preview changes and retain compatible progress; gameplay
changes get separate attempts. Shared puzzles retain independent pack versions.

Imported packs are stored locally. Removing a collection retains its history;
reimporting the same gameplay restores progress. Erasing all progress is a
separate confirmed action. Backups include content and personal data; content
exports do not. Restore keeps local conflicts unless replacement is selected.
See [the format reference](docs/LIBRARY_FORMAT.md) for precise version rules.

## Generated puzzles

The **New puzzle** section on Home has width and height steppers (3–9 each,
default 6×6) and a **Generate W × H** button that builds a fresh rectangular
puzzle on the device; the size is remembered for the session. Every generated puzzle has **exactly one solution up to rotating or
reflecting the whole board**, fills the tray with no spare cells, and allows
both rotation and flipping. It is saved to the Generated puzzles collection like a
standalone import, then opened for play. It is named by its local creation
time and board size (`2026-09-14 12:34:56 · 9×9`); its ID is derived from the
board size and the random seed, so the same seed always yields the same pieces.
The Generated puzzles collection also holds individually imported puzzles.

The generator lives in `src/core/` (`random.js`, `shapes.js`, `solver.js`,
`partition.js`, `generate.js`) and runs inside a module Web Worker so the
app stays responsive; a Generating sheet with a Cancel button covers it. Uniqueness is established by
search, never assumed: the tray is carved into random connected pieces (that
carving is the solution), an exact-cover solver looks for a second tiling, and
if one exists two neighbouring pieces are merged and the check repeats. Merging
only removes solutions, but no piece may grow past a quarter of the tray
(clamped to 5–14 cells), because one huge piece makes the solve trivial; when no
merge fits under that cap the carving is discarded and the tray carved again.
Pieces above 10 cells are then split again where that keeps the solution unique. The solver treats mirrored and
rotated arrangements of the whole board as the same solution whether or not
pieces may flip. Limits live in `GENERATOR_LIMITS`: the piece-size cap, a
carving allowance, a node budget per check and a wall-clock deadline; when the deadline passes the sheet reports failure and
offers a retry or a smaller board rather than blocking.

Pieces are stored in a random orientation and staged above and below the tray
(see [Authored field and runtime workspace](#authored-field-and-runtime-workspace)),
so the saved definition does not reveal the answer, and no solution is written
into the file. Pieces carry no colour; their order is searched so that
neighbouring pieces in the solution are never a multiple of six apart and so
never share a palette colour.

Production builds register a service worker that caches the complete
application; the app never needs the network after that, so no offline status
is shown. Development is uncached. Browser storage is local to an origin, not
synced across devices, and is not a backup guarantee. Imports/restores must
never report success after a failed write. Explicit temporary bundled play is
available when the database cannot be opened.

## Validation and evolution

Structural checks guard geometry traversal. Player imports also reject
unsupported required features and unknown rule/piece features. The bundled test
sweep checks validity and ID uniqueness. `npm run check` runs tests before build;
`npm run build` alone does not run them.

Validation does not establish solvability. The introductory puzzles have tested
solutions, and generated puzzles are the exception: the solver proves each one
uniquely solvable at creation time. Imported content is never solver-checked,
and there is no `knownSolution` schema field. Broken content must be refused
rather than silently changing its rules.

Keep puzzle schema, pack format, library storage, gameplay identity, and future
draft versions distinct. Future migrations should be explicit pure data
transformations. Add new mechanics only through a supported schema/rule design;
do not embed executable rules in imported files.
