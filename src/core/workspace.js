// Runtime staging bounds are wider than the authored schema-1 field.
import { orientedBounds } from './puzzle.js';

export function workspaceBounds(def) {
    let margin = 4;
    for (const piece of def.pieces) {
        const { width, height } = orientedBounds(piece, piece.start);
        margin = Math.max(margin, width, height);
    }
    return { minX: -margin, minY: -margin, maxX: def.field.width + margin, maxY: def.field.height + margin };
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
