// Mutable puzzle state and the operations that change it. State is a plain
// object of placements keyed by piece id; every operation returns a new state
// rather than mutating, so undo later is a stack of previous states.
//
// Operations refuse illegal changes (a locked piece, a rule the puzzle disables)
// by returning the state unchanged. They never refuse a placement for being
// invalid — overlapping and out-of-tray placements are permitted and marked.

import { mirrorOrientation } from './geometry.js';
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

/**
 * Mirror a piece left to right in field coordinates, or top to bottom when
 * `vertical`. Where rotation is disallowed the turn must stay, so only the flip
 * toggles and the axis follows the piece's rotation instead.
 */
export function flipOrientation(def, placement, vertical = false) {
    if (def.rules.allowRotation === false) return { rotation: placement.rotation, flipped: !placement.flipped };

    return mirrorOrientation(placement.rotation, placement.flipped, vertical);
}

export function flipPiece(def, state, pieceId, vertical = false) {
    const piece = findPiece(def, pieceId);
    const current = state.placements[pieceId];

    if (!piece || piece.locked || !current) return state;
    if (def.rules.allowFlip !== true) return state;

    const next = { ...current, ...flipOrientation(def, current, vertical) };

    return setPlacement(def, state, pieceId, recentre(piece, current, next));
}

/**
 * Keep the bounding-box centre fixed across an orientation change.
 *
 * A piece with an oblong box — a 2x3 L, a 1x4 bar — cannot turn about its exact
 * centre, because the centre of the 3x2 box it becomes sits half a cell away, so
 * half a cell always has to be rounded off. Rounding by the direction the box
 * grows rounds every turn the same way and walks the piece a cell down-right per
 * half turn. Rounding by the parity of the target rotation instead gives the
 * even rotations one anchor and the odd rotations another: a turn and its
 * opposite cancel exactly, and two turns always land back in the same box.
 */
function recentre(piece, current, next) {
    const before = orientedBounds(piece, current);
    const after = orientedBounds(piece, next);
    // ceil(-n) === -floor(n), which is what makes the two anchors exact inverses.
    const round = next.rotation % 2 === 0 ? Math.floor : Math.ceil;

    return {
        ...next,
        x: current.x + round((before.width - after.width) / 2),
        y: current.y + round((before.height - after.height) / 2)
    };
}
