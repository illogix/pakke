// Interaction decisions that do not need Phaser: which piece a click lands on,
// and where the grab offset moves when a piece turns mid-drag.
//
// These live outside the scene because they are the fiddly part and the scene
// itself cannot be tested without a browser.

import { cellKey } from '../core/geometry.js';
import { findPiece, placedCells } from '../core/puzzle.js';

/**
 * The piece a click on `cell` should pick up: the topmost, since last touched
 * draws on top. Returns null on an empty cell.
 */
export function topPieceAt(def, state, zOrder, [cx, cy]) {
    const key = cellKey(cx, cy);

    for (let i = zOrder.length - 1; i >= 0; i--) {
        const id = zOrder[i];
        const piece = findPiece(def, id);
        const placement = state.placements[id];

        if (!piece || !placement) continue;

        if (placedCells(piece, placement).some(([x, y]) => cellKey(x, y) === key)) return id;
    }

    return null;
}

/**
 * Where the grabbed cell ends up after a quarter-turn. Rotating mid-drag pivots
 * on the cursor rather than the piece's centre, so the offset has to turn with
 * the piece: a point (gx, gy) inside a w x h box lands at (h-1-gy, gx) clockwise.
 */
export function rotatedGrab({ width, height }, [gx, gy], direction) {
    return direction > 0 ? [height - 1 - gy, gx] : [gy, width - 1 - gx];
}

/**
 * Where the grabbed cell ends up after a mirror: left to right, or top to
 * bottom when `vertical`.
 */
export function flippedGrab({ width, height }, [gx, gy], vertical) {
    return vertical ? [gx, height - 1 - gy] : [width - 1 - gx, gy];
}

/** Continuous points rotate about box edges, unlike cell indices above. */
export function rotatedGrabPoint({ width, height }, [x, y], direction) {
    return direction > 0 ? [height - y, x] : [y, width - x];
}
export function flippedGrabPoint({ width, height }, [x, y], vertical) {
    return vertical ? [x, height - y] : [width - x, y];
}

/**
 * Whether a change of orientation mirrors top to bottom. Composing one
 * orientation with the inverse of another leaves a mirror turned by the sum of
 * their rotations: none for left to right, a half turn for top to bottom.
 */
export function mirrorIsVertical(before, after) {
    return (before.rotation + after.rotation) % 4 === 2;
}

/** A long press is held this long without moving. */
export const LONG_PRESS_MS = 500;

/**
 * What releasing a piece without dragging it does. A press held long enough on
 * a flippable piece is charged and flips; held as long where flipping is not
 * allowed it does nothing. A tap on the already selected piece turns it
 * clockwise, and any other tap selects it. A press that moved past its
 * threshold is a move even if it came back.
 */
export function pressAction({ moved, held, charged, wasSelected }) {
    if (moved) return 'move';
    if (charged) return 'flip';
    if (held >= LONG_PRESS_MS) return 'none';
    return wasSelected ? 'rotate' : 'select';
}

/**
 * How far, in CSS pixels, a press may stray before it becomes a drag. A charged
 * press tolerates up to a cell, so a steady hold survives a drifting finger.
 */
export function pressSlop({ threshold, charged }, cellSize) {
    return charged ? Math.max(threshold, cellSize) : threshold;
}
