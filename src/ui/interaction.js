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
 * Where the grabbed cell ends up after a flip. Orientation applies the flip
 * before the rotation, so at an odd rotation toggling `flipped` mirrors what is
 * on screen vertically rather than horizontally.
 */
export function flippedGrab({ width, height }, [gx, gy], rotation) {
    return rotation % 2 === 0 ? [width - 1 - gx, gy] : [gx, height - 1 - gy];
}
