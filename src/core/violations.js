// Violations are the marked-in-red state: placements the puzzle permits but
// which cannot be part of a solution. Drops always succeed, so this is what
// tells the player something is wrong, and it is also half of the solved check.

import { cellKey } from './geometry.js';
import { containerKeys, containment, placedCells } from './puzzle.js';

/**
 * Two kinds of violation:
 *   overlap — a cell covered by more than one piece, anywhere in the field
 *   outside — a cell of a piece that is partly in the tray, falling outside it
 *
 * A piece entirely outside the tray is staged, not violating.
 */
export function computeViolations(def, state) {
    const keys = containerKeys(def);
    const occupancy = new Map();
    const overlap = new Set();
    const outside = new Set();
    const pieces = new Set();

    for (const piece of def.pieces) {
        const placement = state.placements[piece.id];

        if (!placement) continue;

        for (const [x, y] of placedCells(piece, placement)) {
            const key = cellKey(x, y);
            const owners = occupancy.get(key);

            if (owners) {
                owners.push(piece.id);
                overlap.add(key);
                for (const id of owners) pieces.add(id);
            } else {
                occupancy.set(key, [piece.id]);
            }
        }

        if (containment(piece, placement, keys) === 'straddling') {
            pieces.add(piece.id);

            for (const [x, y] of placedCells(piece, placement)) {
                if (!keys.has(cellKey(x, y))) outside.add(cellKey(x, y));
            }
        }
    }

    const cells = new Set([...overlap, ...outside]);

    return { cells, overlap, outside, pieces };
}

export function hasViolations(def, state) {
    return computeViolations(def, state).cells.size > 0;
}
