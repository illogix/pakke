// Read-only helpers over a puzzle definition. A definition is inert data; every
// derived quantity is computed here rather than stored, except `field`, which is
// written into the file so that changing the derivation cannot silently reflow
// existing puzzles.

import { bounds, cellKey, orient, translate } from './geometry.js';

export const SCHEMA_VERSION = 1;
export const FIELD_BORDER = 2;

/** Cells a piece occupies at a given placement, in field coordinates. */
export function placedCells(piece, placement) {
    const oriented = orient(piece.cells, placement.rotation, placement.flipped);

    return translate(oriented, placement.x, placement.y);
}

/** Bounding box of a piece at a given orientation, before translation. */
export function orientedBounds(piece, placement) {
    return bounds(orient(piece.cells, placement.rotation, placement.flipped));
}

export function containerKeys(def) {
    return new Set(def.container.cells.map(([x, y]) => cellKey(x, y)));
}

export function containerArea(def) {
    return def.container.cells.length;
}

export function totalPieceArea(def) {
    return def.pieces.reduce((sum, piece) => sum + piece.cells.length, 0);
}

/** Spare room in the tray. Zero is an exact fit; negative is impossible. */
export function slack(def) {
    return containerArea(def) - totalPieceArea(def);
}

export function findPiece(def, pieceId) {
    return def.pieces.find((piece) => piece.id === pieceId);
}

/**
 * Field size the editor would derive for this definition: everything the puzzle
 * starts with, plus a border wide enough that edge pieces stay grabbable.
 */
export function deriveField(def, border = FIELD_BORDER) {
    const all = [...def.container.cells];

    for (const piece of def.pieces) {
        all.push(...placedCells(piece, piece.start));
    }

    const { maxX, maxY } = bounds(all);

    return { width: maxX + 1 + border, height: maxY + 1 + border };
}

/** Clamp a placement's origin so the whole piece stays inside the field. */
export function clampToField(def, piece, placement) {
    const { width, height } = orientedBounds(piece, placement);
    const maxX = Math.max(0, def.field.width - width);
    const maxY = Math.max(0, def.field.height - height);

    return {
        ...placement,
        x: Math.min(Math.max(placement.x, 0), maxX),
        y: Math.min(Math.max(placement.y, 0), maxY)
    };
}

/**
 * Containment is all-or-nothing. A piece with no cells in the tray is staged and
 * fine; a piece with some cells in the tray must have all of them in it.
 */
export function containment(piece, placement, keys) {
    const cells = placedCells(piece, placement);
    const inside = cells.filter(([x, y]) => keys.has(cellKey(x, y)));

    if (inside.length === cells.length) return 'contained';
    if (inside.length === 0) return 'staged';

    return 'straddling';
}
