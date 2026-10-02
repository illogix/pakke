// Shape identity under a puzzle's rules. Two pieces are the same shape when one
// can be turned into the other using only the moves the rules allow, so the
// solver treats them as a multiset of shapes rather than a list of pieces and
// never counts the same tiling once per way of labelling its pieces.

import { orient } from './geometry.js';

/** Every distinct orientation the rules let a shape take, each normalised. */
export function allowedOrientations(cells, rules = {}) {
    const rotations = rules.allowRotation === false ? [0] : [0, 1, 2, 3];
    const flips = rules.allowFlip === true ? [false, true] : [false];
    const seen = new Map();

    for (const flipped of flips) {
        for (const rotation of rotations) {
            const oriented = orient(cells, rotation, flipped);
            const key = JSON.stringify(oriented);

            if (!seen.has(key)) seen.set(key, oriented);
        }
    }

    return [...seen.values()];
}

/** The lexicographically smallest allowed orientation, as a string. */
export function canonicalKey(cells, rules = {}) {
    return allowedOrientations(cells, rules).map((o) => JSON.stringify(o)).sort()[0];
}

/**
 * Group pieces (or bare cell lists) by canonical shape. Each entry carries the
 * shape's size, how many pieces have it, and its allowed orientations.
 */
export function shapeMultiset(pieces, rules = {}) {
    const byKey = new Map();

    for (const piece of pieces) {
        const cells = Array.isArray(piece) ? piece : piece.cells;
        const key = canonicalKey(cells, rules);
        const entry = byKey.get(key);

        if (entry) {
            entry.count++;
        } else {
            const canonical = JSON.parse(key);

            byKey.set(key, {
                key,
                cells: canonical,
                size: canonical.length,
                count: 1,
                orientations: allowedOrientations(canonical, rules)
            });
        }
    }

    return [...byKey.values()];
}
