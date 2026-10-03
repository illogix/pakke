// Runtime staging bounds are wider than the authored schema-1 field: they also
// hold any opening arrangement around the tray, whatever the screen shape.
import { orientedBounds } from './puzzle.js';
import { arrangeReach, trayBounds } from './arrange.js';

export function workspaceBounds(def) {
    let margin = 4;
    for (const piece of def.pieces) {
        const { width, height } = orientedBounds(piece, piece.start);
        margin = Math.max(margin, width, height);
    }
    const tray = trayBounds(def), reach = arrangeReach(def);
    return { minX: Math.min(-margin, tray.minX - reach), minY: Math.min(-margin, tray.minY - reach),
        maxX: Math.max(def.field.width + margin, tray.maxX + 1 + reach), maxY: Math.max(def.field.height + margin, tray.maxY + 1 + reach) };
}

/** Supports fractional view previews; committed state rounds before calling. */
export function clampToWorkspace(def, piece, placement) {
    const box = workspaceBounds(def);
    const { width, height } = orientedBounds(piece, placement);
    return { ...placement,
        x: Math.max(box.minX, Math.min(box.maxX - width, placement.x)),
        y: Math.max(box.minY, Math.min(box.maxY - height, placement.y)) };
}

// Half-cell ties go toward positive infinity, also at negative coordinates.
export function snapPlacement(def, piece, placement) {
    return clampToWorkspace(def, piece, { ...placement, x: Math.floor(placement.x + 0.5), y: Math.floor(placement.y + 0.5) });
}
