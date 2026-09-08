// Mutable puzzle state and the operations that change it. State is a plain
// object of placements keyed by piece id; every operation returns a new state
// rather than mutating, so undo later is a stack of previous states.
//
// Operations refuse illegal changes (a locked piece, a rule the puzzle disables)
// by returning the state unchanged. They never refuse a placement for being
// invalid — overlapping and out-of-tray placements are permitted and marked.

import { findPiece, orientedBounds } from './puzzle.js';
import { snapPlacement } from './workspace.js';

export function createState(def) {
    const placements = {};

    for (const piece of def.pieces) {
        placements[piece.id] = { ...piece.start };
    }

    return { placements };
}

export function canMove(def, pieceId) {
    const piece = findPiece(def, pieceId);

    return Boolean(piece) && !piece.locked;
}

export function setPlacement(def, state, pieceId, placement) {
    const piece = findPiece(def, pieceId);

    if (!piece || piece.locked) return state;
    if (!placement || !Number.isFinite(placement.x) || !Number.isFinite(placement.y)
        || !Number.isInteger(placement.rotation) || placement.rotation < 0 || placement.rotation > 3
        || typeof placement.flipped !== 'boolean') return state;
    const current = state.placements[pieceId];
    if (def.rules.allowRotation === false && placement.rotation !== current.rotation) return state;
    if (def.rules.allowFlip !== true && placement.flipped !== current.flipped) return state;

    return {
        ...state,
        placements: {
            ...state.placements,
            [pieceId]: snapPlacement(def, piece, placement)
        }
    };
}

export function movePiece(def, state, pieceId, x, y) {
    const current = state.placements[pieceId];

    if (!current) return state;

    return setPlacement(def, state, pieceId, { ...current, x, y });
}

/**
 * Rotate an at-rest piece about its bounding-box centre, so it turns in place
 * instead of pivoting around its top-left corner. Dragging uses a different
 * pivot — the cell under the cursor — which the scene applies by adjusting the
 * grab offset before calling this.
 */
export function rotatePiece(def, state, pieceId, direction = 1) {
    const piece = findPiece(def, pieceId);
    const current = state.placements[pieceId];

    if (!piece || piece.locked || !current) return state;
    if (def.rules.allowRotation === false) return state;

    const next = { ...current, rotation: (((current.rotation + direction) % 4) + 4) % 4 };

    return setPlacement(def, state, pieceId, recentre(piece, current, next));
}

export function flipPiece(def, state, pieceId) {
    const piece = findPiece(def, pieceId);
    const current = state.placements[pieceId];

    if (!piece || piece.locked || !current) return state;
    if (def.rules.allowFlip !== true) return state;

    const next = { ...current, flipped: !current.flipped };

    return setPlacement(def, state, pieceId, recentre(piece, current, next));
}

/** Keep the bounding-box centre fixed across an orientation change. */
function recentre(piece, current, next) {
    const before = orientedBounds(piece, current);
    const after = orientedBounds(piece, next);

    return {
        ...next,
        x: current.x + Math.round((before.width - after.width) / 2),
        y: current.y + Math.round((before.height - after.height) / 2)
    };
}
