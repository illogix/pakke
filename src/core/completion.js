// Completion conditions. V1 ships one — every piece inside the tray — but it is
// looked up by the id stored in `rules.completion` so that further conditions
// slot in without touching existing puzzles.

import { containerKeys, containment } from './puzzle.js';
import { computeViolations } from './violations.js';

export const COMPLETION_LABELS = {
    'all-pieces-contained': 'Fit every piece into the tray'
};

/** How many pieces are fully inside the tray, out of how many there are. */
export function progress(def, state) {
    const keys = containerKeys(def);
    let contained = 0;

    for (const piece of def.pieces) {
        const placement = state.placements[piece.id];

        if (placement && containment(piece, placement, keys) === 'contained') contained++;
    }

    return { contained, total: def.pieces.length };
}

const CONDITIONS = {
    'all-pieces-contained'(def, state) {
        const { contained, total } = progress(def, state);

        return contained === total;
    }
};

export function isSolved(def, state) {
    const condition = CONDITIONS[def.rules.completion];

    if (!condition) return false;

    // Every condition also requires a legal state, since drops are permissive.
    if (computeViolations(def, state).cells.size > 0) return false;

    return condition(def, state);
}

export function completionLabel(def) {
    return COMPLETION_LABELS[def.rules.completion] ?? def.rules.completion;
}

/** Player-facing progress excludes every piece involved in a conflict. */
export function validProgress(def, state) {
    const keys = containerKeys(def);
    const violations = computeViolations(def, state);
    return { contained: def.pieces.filter(piece => !violations.pieces.has(piece.id)
        && state.placements[piece.id]
        && containment(piece, state.placements[piece.id], keys) === 'contained').length,
        total: def.pieces.length };
}
