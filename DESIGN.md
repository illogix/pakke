# Pakke — current design

Current as of September 14, 2026. This is the authoritative product and gameplay
reference. It describes the implemented player and library. See
[the library format reference](docs/LIBRARY_FORMAT.md) for exchange and storage
contracts, and [verification](docs/VERIFICATION.md) for checks and their limits.
Remaining work and optional extensions are tracked outside this repo.

## Product and scope

A mobile-first square-grid packing game, also playable in a local desktop
browser. Arrange polyomino pieces in a fixed tray using movement, quarter-turns,
and optional flipping. Play is untimed, with no score or move counter.

The player uses continuous dragging, release snapping, an aligned canvas,
subtle materials, and a bottom icon dock. The local library supports bundled
and imported collections, resume, search, status filters, export, backups, and
production offline play. No account or server is needed.

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
| `src/ui/` | Camera and gesture math, theme, procedural materials, silhouettes, and icons. Some rendering helpers use browser canvas/DOM APIs. |
| `src/scenes/` | Phaser drawing, event wiring, transient selection and gesture previews. |
| `src/app/` | Library pages, player controls/dialogs, routing, offline registration, legacy storage migration, and the generator sheet with its Web Worker. |

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
    "color": "#629daf",
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

Preserve `flipped` even for symmetric pieces. Equivalent geometry does not
justify discarding face identity; a future two-faced-piece rule could use it.

### Authored field and runtime workspace

Authored tray cells and starting placements use nonnegative coordinates and
must fit the stored `field`. `deriveField()` computes width and height from the
furthest occupied starting cell plus a two-cell trailing border; authors must
also leave useful leading space. The stored field preserves initial framing
and is not a visible outer container.

Runtime staging extends the field on every side by the larger of four cells or
the largest piece dimension. This permits negative runtime coordinates. Clamp
whole oriented pieces to this finite workspace. The visible grid continues to
the viewport edges; only the tray has a perimeter.

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
- Tray, outer grid, pieces, footprints, and hit testing share one transform,
  including all four `fieldRotation` values. A decorative rim must not change
  grid pitch or phase. Field rotation is presentation only.
- Render whole-piece silhouettes with subtle edge highlights and shadows.
  Keep internal seams faint. Adjacent same-colored pieces need distinct outlines.
- Invalid cells retain their hue under a borderless translucent dark screen.
  Do not give invalid cells or the valid portion a separate outline, bevel, or
  shadow. No stripes, mesh, warning icons, or wrapped-plastic effect.
- Locked pieces use whole-face matte grain and seated contact shading, at normal
  brightness. No lock symbol; the treatment is distinct from invalid shading.
- Use warm, quiet surfaces. No player title or persistent puzzle-name heading.
  Metadata belongs in browsing/details/help. Icon controls stay below the board
  in every orientation, with accessible names, tooltips, and 44 px minimum targets.
- The dock offers rotate, conditional flip, restart, puzzle browsing, help, and
  conditional reframe. Reserve any needed second row before fitting the board.
  Keyboard accelerators are R, Shift+R/E, F, Escape, and right-click rotation.

## Library experience and persistence

Browse **Library → Pack → Puzzle**. Collection cards show name, creator,
thumbnail, and completion count. Puzzle cards distinguish Not started,
In progress, and Solved. Search includes name, creator, and catalog number;
status filters and alternate sorting do not change authored order or identity.
Cards render in batches of 60. Browse position, query, and filters persist while
navigating in the running app.

Continue playing resumes an available unfinished saved attempt. Solved history
is independent of the current arrangement and survives restarting a puzzle.
A completion sheet appears once per transition to a solved board. Next follows
the originating pack's order, even under a browsing filter. At the last puzzle,
return to the pack; celebrate collection completion only when all its current
puzzles are solved. There are no progression locks.

Direct puzzle links remain supported. Pack context is explicit in the URL;
ambiguous installed versions require a choice. A direct link without collection
context returns to the library rather than inventing a Next sequence.

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

**Generate puzzle** on the library page opens a sheet with width and height
steppers (3–9 each, default 6×6) and builds a fresh rectangular puzzle on the
device. Every generated puzzle has **exactly one solution up to rotating or
reflecting the whole board**, fills the tray with no spare cells, and allows
both rotation and flipping. It is saved to the Generated puzzles collection like a
standalone import, then opened for play. It is named by its local creation
time and board size (`2026-09-14 12:34:56 · 9×9`); its ID is derived from the
board size and the random seed, so the same seed always yields the same pieces.
The Generated puzzles collection also holds individually imported puzzles.

The generator lives in `src/core/` (`random.js`, `shapes.js`, `solver.js`,
`partition.js`, `generate.js`) and runs inside a module Web Worker so the
library stays responsive; a Cancel button ends it. Uniqueness is established by
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

Pieces are stored in a random orientation and staged below the tray, so the
saved definition does not reveal the answer, and no solution is written into
the file. Solution colours are chosen so that neighbouring pieces in the
solution differ.

Production builds cache the complete application before reporting offline
readiness. Development is uncached. Browser storage is local to an origin, not
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
