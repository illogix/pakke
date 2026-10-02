# Library formats and persistence

Current implementation reference, reviewed September 9, 2026. Product behavior
is in [DESIGN.md](../DESIGN.md); this document records contracts that future
content tools and an optional editor must preserve.

## Puzzle and pack exchange

Standalone files contain a complete `schemaVersion: 1` puzzle definition. See
[the schema example](../DESIGN.md#puzzle-definition) and
[a bundled puzzle](../src/puzzles/first-fit.json). A standalone import belongs
to the app's Generated puzzles collection; it does not acquire invented pack credits.

A pack is one self-contained JSON file:

```json
{
  "packVersion": 1,
  "pack": {
    "id": "my-collection",
    "name": "My collection",
    "author": "Your name",
    "description": "A collection of packing puzzles.",
    "revision": 1
  },
  "puzzles": []
}
```

The empty list above is a structural illustration, not an importable pack.
Supply one or more complete puzzle definitions, in authored play order. Export
an installed pack for a ready-to-import example.

Pack `id`, `name`, and a positive integer `revision` are required. Author,
description, contributor, attribution, source, and license are optional.
Revision labels declare a change; they are not proof of authorship or authority.
Names and catalog numbers are display metadata, not ordering or progress keys.

Puzzle and pack IDs are permanent lowercase alphanumeric identifiers with
hyphens/underscores, at most 80 characters, starting with a letter or digit.
Prototype-sensitive names are refused. `loose` is additionally reserved for the
app's collection ID. A pack cannot contain a puzzle ID twice. The same puzzle
can belong to multiple packs, with each pack retaining its exact definition.

`src/library/format.js` validates imports before a preview can be installed:

- Supported versions, required data, coordinate/shape/rule validity, valid
  starts, and compatible feature declarations are checked.
- Unknown required features and unsupported rule/piece fields are refused.
  Optional supported metadata and other permitted JSON data survive export.
- Any hard error rejects the entire file. Warnings are visible and nonblocking;
  they are not a solvability verdict.
- Draft-marked content is refused by the player. A stable authoring-draft
  exchange format is not defined yet.
- Personal backups are routed to Restore backup rather than content import.

## Identity and updates

Definitions have two SHA-256 identifiers, computed independently of object-key
insertion order:

| Identifier | Includes | Purpose |
| --- | --- | --- |
| Content key | Complete definition, including presentation and metadata | Pins exactly what a collection contains. |
| Gameplay key | Puzzle ID, schema/type, field bounds, tray cells, rules, piece IDs/shapes, starts, and locks | Keys attempts and solved history. |

Coordinate-list order and piece-list order are normalized for gameplay identity.
Metadata, colors, and presentation do not change that identity. Field bounds do:
changing them can change the set of valid saved placements. Stored shape/start
changes produce a new gameplay key even if an author considers them equivalent.
A portable hashing fallback supports local HTTP/LAN environments without
SubtleCrypto; these IDs do not authenticate content.

Identical imports are no-ops, including exported bundled packs. Different content
under an installed imported pack's ID is an update. A same/older declared
revision requires explicit replacement confirmation. Changed content cannot
replace a bundled pack through import; adaptations need their own pack ID.

Metadata-only changes preserve attempts. Gameplay changes start a separate
attempt and keep prior history associated with the old gameplay key. Updating
one collection never rewrites another collection's pinned definitions. Stale
previews must be reopened if the library changes before confirmation.

Removing an imported collection or the Generated puzzles collection removes its
membership, retaining definitions and historical progress. Reimporting matching
content restores history. Erase all saved progress clears attempts/solve history
separately, while leaving installed content, settings, and draft data intact.

## Database and legacy migration

`src/library/repository.js` stores an atomic snapshot in IndexedDB:

- Database: `packing-library`, database version 1.
- Object store: `library`; snapshot key: `current`.
- Snapshot fields: `version`, `serial`, `definitions`, `packs`, `loose`,
  `progress`, `preferences`, `drafts`, and `migrated`.
- Each definition record contains its content key, gameplay key, and full JSON.
  Pack records hold metadata/envelope, ordered content keys, provenance, and
  installation time. Attempts hold placements, solved history, time, and optional
  collection context.

Mutations are queued and published in memory after a successful transaction.
The serial check rejects stale writers in other tabs instead of overwriting
newer changes. Imports and restores never silently fall back to memory after a
write failure. If opening IndexedDB is unavailable, the shell can offer clearly
announced temporary bundled play; other initialization errors remain explicit.

Legacy `packing:v2:` localStorage attempts migrate once when their definition
fingerprints and placements validate. Old keys are retained, but clearing new
progress does not rerun migration. localStorage also mirrors the existing
player's preferences; new library attempts and definitions live in IndexedDB.

Draft storage is a separate reserved map. No UI currently creates or edits its
contents. Library operations preserve it without interpreting it as playable
content. A future editor must specify its schema and lifecycle separately.

## Personal backup and restore

Backups use `{backupVersion: 1, createdAt, library}` and include the snapshot's
installed/historical definitions, memberships, attempts, preferences, and
reserved drafts. Pack/puzzle exports exclude this personal state.

Restore validates definitions, identity keys, references, and saved placements
before a transaction. The default merge retains conflicting local packs,
standalone versions, attempts, drafts, and preferences. Explicit replacement can
choose backup versions even when local data is newer. Solved histories combine
for matching gameplay keys. Bundled collections remain those shipped by the app.

Known settings are `reduced-motion` and `help-seen`. The current snapshot and
backup versions are separate from puzzle schema and pack format versions.
Unknown versions are refused; future migrations should be explicit data
transformations, not silent repairs.

## Limits and performance

- Pack/standalone import: up to 10 MiB of input JSON.
- Backup import: up to 50 MiB of input JSON.
- At most 2,000 definitions and 500,000 total tray/piece cells per validated
  content set. The same limits bound the complete retained library.
- Repository writes check compact serialized snapshot size against 50 MiB minus
  1 KiB. Export pretty-prints JSON, so actual exported size is a distinct release
  edge case, still to be verified.
- Individual puzzles also have structural bounds in `src/core/structure.js`:
  field dimensions up to 1,024, up to 128 pieces, and bounded coordinates/cell
  counts. Deeply nested JSON and unsafe object keys are refused before traversal.

The initial implementation loads a bounded snapshot and pages visible cards in
batches of 60. There is no separate build-time catalog index, definition lazy
loading, or virtualized scroller. Change these only in response to measured need,
while preserving file and identity semantics.

## Offline application delivery

`scripts/offline-plugin.js` builds a service worker from the actual emitted
production files. Installation caches the whole application before activation;
the UI reports readiness once controlled. Updates use the worker lifecycle and
do not force activation during play; close old app tabs to allow a waiting
version to take over. Development does not register this cache.

Imported definitions remain in IndexedDB. Cached application code and stored
puzzles together provide offline playback. Neither is a backup or device-sync
guarantee. Native packaging and incoming native file-open integration remain
future distribution work.
