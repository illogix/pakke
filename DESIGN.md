# 2D Packing Puzzle — V1 Design

Design record from the 2026-07-24/25 discussion. Captures decisions that are
settled, the puzzle schema as it currently stands, and the questions still open.

**Built so far:** the core and its tests, two bundled puzzles, the player scene,
and selection plus the actions panel. Not yet built: home screen, puzzle menu,
localStorage progress, the solve popup, and the editor. With no menu, `?puzzle=`
picks a puzzle and the first in id order is the default.

## Scope

V1 is **square-grid packing puzzles only**: a fixed tray of square cells, a set
of polyomino pieces, grid-snapped movement, 90° rotation, optional flipping.
Solved when every piece sits inside the tray.

The point of V1 is not breadth. It is to establish a player, an editor, and a
puzzle-definition format that later mechanics can extend without invalidating
puzzles already authored.

**Explicitly not in V1:** solver, solution counting, generator, puzzle packs,
calendar/variable-target puzzles, restricted entry, collision-constrained
sliding, anti-slide validation, colour-contact rules, non-square geometry,
continuous rotation, physics, custom executable rules.

## Architecture

The load-bearing constraint: **the puzzle is fully represented outside Phaser.**

- **`core/`** — pure JS, zero Phaser imports. Cell geometry, schema, placement
  state, legal-move checks, validation, completion. Runs in Node, so it is
  unit-testable and a future solver links against it directly.
- **`puzzles/`** — JSON definitions, hand-inspectable, `schemaVersion`-stamped.
- **Phaser scenes** — view and input adapter. Translates pointer events into
  core operations and core state into rendered cells. Owns pixels; owns nothing
  else.

If Phaser objects ever become the source of truth for where a piece is,
everything in the post-V1 list gets expensive.

## Data model

Two separate things: a **definition** (static JSON, never mutated) and a
**state** (runtime, mutable, owned by the core).

```json
{
  "schemaVersion": 1,
  "id": "a7f3c1e2",
  "type": "square-grid-packing",

  "meta": {
    "name": "…",
    "author": "…",
    "description": "…",
    "tags": [],
    "attribution": "…",
    "source": "…",
    "license": "…"
  },

  "field": { "width": 20, "height": 14 },
  "container": { "cells": [[8, 4], [9, 4], [10, 4]] },

  "rules": {
    "allowRotation": true,
    "allowFlip": false,
    "completion": "all-pieces-contained"
  },

  "pieces": [
    {
      "id": "p1",
      "cells": [[0, 0], [0, 1], [0, 2], [1, 2]],
      "color": "#e0564a",
      "start": { "x": 2, "y": 3, "rotation": 0, "flipped": false },
      "locked": false
    }
  ],

  "presentation": { "fieldRotation": 0 }
}
```

```
State = { placements: { "p1": { x, y, rotation, flipped }, … } }
```

### Terms

- **Placement** — the four numbers describing where a piece is and how it is
  turned: `{ x, y, rotation: 0–3, flipped: bool }`. `start` is the initial
  placement; state holds the live one.
- **Occupied cells** are derived on demand: take `piece.cells`, apply
  `rotation`/`flipped`, translate by `x,y`. Transformed cell lists are never
  stored.

### Decisions

- **`flipped`, not `mirrored`** — consistent with `allowFlip`.
- **Never normalise `flipped` away for symmetric shapes.** A 2×2 square has
  identical cells either way, but for a flat piece geometric flipping and
  physical face-flipping are the same operation, so `flipped` carries face
  identity for a post-V1 two-faced-piece rule. Canonicalising equivalent
  orientations is a solver-internal concern only.
- **No cell roles.** The container is a plain set of cells, so interior holes
  and non-rectangular trays come free. Roles (`required`/`optional`/`blocked`)
  were considered and dropped — the win condition is "all pieces placed", so
  per-cell coverage never enters it, and `blocked` is just a cell absent from
  the set.
- **Bounded playing field, origin `(0,0)` at top-left, no negative
  coordinates.** The field is the tray plus the surrounding area that initially
  holds the pieces. The tray's position within the field is implicit in the
  container's cell coordinates — no separate offset.
- **`field` is auto-derived, hidden from the author, and written to the file
  anyway.** Computed as `bbox(tray ∪ all pieces at start)` expanded by a border
  (2 cells, so edge pieces stay grabbable on touch). Written out so the file is
  self-describing in a diff, and so changing the sizing algorithm later cannot
  silently reflow existing puzzles.
- **Stable `id`, author-defined and readable** (`coffin01`, `coffin02`).
  Permanent, unique, never reused, distinct from `name`. Readable because it
  shows up in localStorage keys, validation errors and any future deep link.
  Required as a separate field because progress keys on it — keying on filename
  or manifest index would mean renaming or reordering silently corrupts
  progress.

  Two consequences of author-defined ids: uniqueness across the bundled set is
  checked by the validation sweep rather than guaranteed by construction, and a
  readable id invites renaming, which silently resets that puzzle's progress. So
  it is write-once by convention — the editor sets it at creation, does not make
  it casually editable, and warns if it changes.

  **Play order is the id, sorted alphabetically.** Zero-pad it (`coffin01`, not
  `coffin1`, or the set orders 1, 10, 2, 3). Accepted consequence: because id is
  both identity and ordering, reordering a series means renaming ids, which
  resets those puzzles' solve progress — so settle ids before a set ships.
- **No `instructions` field.** With one puzzle type and one win condition it
  would be identical boilerplate on every puzzle. `description` covers
  puzzle-specific notes. A post-V1 type supplies its own rules text in code.
- **`type` and `completion` are IDs; human-readable labels live in code.**
  Consistent across puzzles, one place to edit, translatable later.
- **`locked` sits beside `start`.** In V1 every puzzle owns its pieces outright,
  so piece-level vs placement-level is a distinction without a difference.

## Rules and completion

- **V1 win condition is `all-pieces-contained`** — every piece fully inside the
  tray, with no violations. Stored as a named ID so further conditions can be
  added.
- **Slack is legitimate.** `slack = container area − piece area`. Zero slack is
  exact packing; positive slack is a normal puzzle with empty cells left over.
  Only negative slack is impossible.
- **Containment is all-or-nothing per piece.** A piece straddling the tray edge
  is not partially valid.
- **`allowRotation`** is always `true` in V1 but honoured by the core.
  **`allowFlip`** is per-puzzle.

### Permissive drops

Drops always succeed: the piece snaps to the grid cell it was released over and
stays there. There is no revert-to-origin and no blocked drop, so the
`invalidDrop` config option was dropped from the schema entirely. Strict drops
can be added later as an option.

The core computes a **violation set** over the whole state, and the view marks
those cells:

1. Cells covered by two or more pieces.
2. Cells of a piece that is *partly* in the tray, falling outside it.

A piece with **zero** cells in the container is staged, and fine. A piece with
*some* cells in the container must have all of them in it. Overlaps are marked
everywhere, including in the staging area — uniform rule, no special cases, and
it matches the physical fact that pieces cannot stack on a table.

Completion is then `violations.isEmpty && every piece fully contained` — same
computation, no extra machinery.

**Marking is pattern-based, not colour-based** (a piece may itself be red), drawn
as an overlay above the pieces so it reads on any fill, and therefore also
colourblind-safe. Working name: hatch / stripey shadow.

## Interaction

- **Selection is an explicit concept**, and it lives in view state — the core has
  no opinion about what is highlighted.
- **Actions panel outside the playfield** holds rotate and flip, operating on the
  selection. The flip button renders only when `allowFlip` is true. Bottom strip
  in portrait, side strip in landscape. Desktop additionally gets `R` / `F` and
  right-click-to-rotate as accelerators over the same operations. This works
  identically on touch and desktop, so mobile is not a separate design.
- **Rotation pivot:** the cell under the cursor while dragging; the bounding-box
  centre for an at-rest piece rotated from the panel.
- **Drag:** snaps to cells as it moves (reads crisper than snapping only on
  release), preserves the grab offset so the piece does not jump under the
  cursor, and clamps to the field.
- **Z-order:** last-touched draws on top. Clicking a cell shared by overlapping
  pieces selects the topmost.
- **Locked pieces are fully non-interactive** — no selection, no drag — so the
  rotate/flip buttons can never target them.
- **Reset** returns every piece to its `start` placement.

## Presentation

Keep the `presentation` block nearly empty; ship a theme in code. Per-puzzle
presentation config is easy to over-build and hard to keep coherent across
puzzles. Piece colours are the exception and already live on the piece.

- **`fieldRotation` (0–3) earns its place** — it is purely a display property.
  Rotation happens at render time; authored coordinates stay canonical, so the
  core, the validator and a future solver all see one unrotated representation.
  Two caveats: any text rendered inside the field (piece IDs or coordinates in
  the editor) needs counter-rotation or it reads sideways; and be explicit about
  whether the stored `field` is pre- or post-rotation where the fit maths
  consumes it, since a 20×14 field displays as 14×20 when rotated.
- **Always stroke piece outlines.** Two same-coloured pieces sitting adjacent
  otherwise merge into one blob, which is a real legibility failure in this
  genre, and outlines also keep the hatch overlay readable.
- **Curated palette (~12 colours) in the editor, not a freeform picker.** A free
  picker produces nine muddy browns.
- **Cap cell size in pixels.** Because the field is auto-derived, a small puzzle
  (3×3 tray, two pieces) would otherwise balloon to absurd cell sizes when
  scaled to fill a phone. Cap it and centre the field in whitespace instead.
- **Two scaling layers, do not conflate them.** Phaser's ScaleManager handles
  canvas↔window. Field↔canvas is per-puzzle — the aspect changes with every
  puzzle while the canvas is fixed at boot — so that fit belongs to a
  camera/view transform inside the scene.

## Editor

An authoring tool, not a public creation platform. Reachable from the main menu.

- **Validation is advisory and never blocks export.** Authoring is a walk through
  invalid states — you paint a tray, and until the pieces exist the puzzle is
  "wrong". The editor always reports the facts and a verdict, and always lets you
  export.
  - **Hard errors:** negative slack; a piece with zero cells; two contained
    pieces overlapping in the starting layout; a `locked` piece not fully inside
    the tray.
  - **Warnings:** disconnected piece cells; overlapping staged pieces; missing
    metadata; slack larger than probably intended; a piece touching the tray
    (it reads as already placed).
- **The lock toggle refuses** for a piece that is not fully contained.
- **The 1-cell tray↔piece gap is a warning, not a nudge.** A tool that moves your
  work while you are placing it is worse than one that flags it.
- **Rotate field 90°** toggles the `fieldRotation` presentation flag. Because it
  is render-time only, there is no coordinate transform to get wrong and it is
  freely reversible.
- **Mutations funnel through a small set of named operations**
  (`paintContainerCell`, `erase`, `addPiece`, `duplicatePiece`, `setPieceColor`,
  `movePiece`, …). Undo is then a stack of inverses added later; ad-hoc mutations
  scattered through Phaser callbacks would mean restructuring the editor.
- Eraser tool. Duplicate-piece (repeated shapes are routine).
- **Export is a single puzzle file.** No packs in V1. Import exists, giving the
  round-trip needed to revise a bundled puzzle.

## App shell and persistence

No backend, no server, no editor drafts. Editor state is in memory; export
downloads a JSON file; the author commits it into the repo.

**There are no files at runtime.** The browser has no filesystem: puzzles are
plain objects in memory. Export writes a download for archiving or committing;
import reads a user-picked file and parses it into memory without copying it
anywhere. "File" is an authoring and build-time concept only — the bundled set
lives in the repo as source and Vite inlines it into the bundle, so nothing is
fetched or loaded while the game runs.

**Bundled puzzles are collected from `src/puzzles/` and sorted by `id`**, which
is what "next puzzle" walks. Nothing needs a hand-maintained order list, and
filenames carry no meaning for the app — export just suggests `<id>.json` so the
author never types one.

A "series" as a first-class concept — shared metadata, its own ordering — is
puzzle packs, which is post-V1. For V1 a series is an id prefix.

Accepted tradeoff: a refresh mid-authoring loses the work.

**Scenes:** home → puzzle menu → player, plus editor.

**Menu cards** show name, author, type, win condition, and solved status. No
difficulty.

**Solved status in localStorage.** Known drawbacks:

1. Forces the stable `id` above.
2. Per-browser, per-device, no sync — clearing site data loses everything.
3. Origin-scoped, not path-scoped, so prefix the keys in case the game ever
   shares an origin with another app.
4. Writes can throw (historically Safari private mode) — wrap access and degrade
   to in-memory rather than crashing.

Also needs a reset-progress control, or there is no way out of an unwanted state.

**On completion:** a popup with home / next / puzzle-selector actions. Detailed
UX deferred.

**A broken puzzle file is refused at load** and shown as broken in the menu,
rather than silently repaired — silently unlocking an out-of-tray locked piece
changes what the puzzle *is*, and an unsolvable puzzle that looks fine is worse
than one visibly marked broken. But the real fix is build-time: **run the
validator over every bundled puzzle as a test**, reusing the same core function
the editor calls, so a broken puzzle cannot ship. Runtime refusal is the backstop
for imported files.

**Schema policy:** `schemaVersion` on every file; the player warns or refuses on
an unknown version; migrations are pure JSON→JSON functions.

## Tests worth having alongside the core

The pure core makes these cheap and high-value:

- rotate ×4 = identity; flip ×2 = identity
- transforms round-trip through serialisation
- containment at tray edges (all-or-nothing)
- overlap and violation detection, including partly-in-tray pieces
- completion under positive slack
- the bundled-puzzle validation sweep, including id uniqueness across the set

## Post-V1 — do not block

- **`faceConsistency: "uniform"`** for two-faced pieces. *Not* redundant with
  `allowFlip: false`: that is a movement restriction which freezes each piece on
  whatever face it started on, making the all-other-face solution unreachable.
  `faceConsistency` is a win condition over a state where flipping is allowed —
  a materially different puzzle. The `flipped` placement field already carries
  the information such a rule would read.
- **Variable containers** for calendar puzzles: a base cell set plus a way to
  subtract cells for a given variant (today's date). The win condition stays
  "all pieces placed", because piece area then equals container area minus the
  subtracted cells. This is the reason cell roles were not needed.
- Further win conditions; puzzle packs with shared metadata and defaults; solver
  and solution counting consuming this same definition; per-piece `allowFlip`
  (a strict superset of per-puzzle); strict drops as an option;
  player-driven field rotation; `type` promoted from display label to real
  dispatch discriminator.

## Open questions

1. **How does the editor edit a piece's shape?** The biggest remaining unknown,
   and it shapes the whole editor.
   - *Dedicated scratch grid per piece* — paint cells on a small grid of its own,
     then arrange placements on the field separately. Clean separation, matches
     how validation splits into shape vs layout problems, but context-switches.
   - *Paint directly on the field* — more direct, fewer modes, but editing an
     existing shape in place among its neighbours gets fiddly, and the field is
     auto-derived from the very thing being edited.

   Leaning toward the scratch grid, with field arrangement as a distinct mode.
2. **Phone-friendly authoring.** Since the field is derived from content there is
   no default field size to make phone-friendly. A portrait aspect guide overlay
   in the editor was proposed and not liked. Unresolved.
3. **Editor undo.** Deferred, not rejected. Kept cheap by the named-operations
   decision above.
4. **Whether the editor should be gated** behind a URL param rather than shipping
   on the public main menu. Low stakes.
5. **Solve-popup UX** in detail.

### Settled during implementation

- **`cells` are coordinate pairs**, not ASCII rows. Parsing is one function
  either way, so ASCII stays available later as a loader convenience if hand
  editing ever matters.
- **The Phaser layer cannot be tested here.** Phaser 4 will not boot under jsdom
  in either the HEADLESS or CANVAS renderer, so `PlayScene` is only verifiable in
  a browser. The response was to move the fiddly parts out of it: hit-testing and
  the mid-drag grab-offset maths live in `src/ui/interaction.js`, and the
  field-to-canvas transform in `src/ui/layout.js`, both pure and both tested.
  What remains in the scene is drawing calls and event wiring.

### Considered and set aside

- **`knownSolution`** (author solves the puzzle in the editor, placements are
  captured) — rejected for V1. Accepted consequence: with no solver and no
  captured solution, nothing verifies that an authored puzzle is solvable.
- **Player-side undo** — probably unnecessary; moves are non-destructive and
  reset covers the real need.
- **Move counter** — nearly free, not wanted now.
- **Keyboard-only play** — out of scope; the explicit selection model leaves the
  door open.
