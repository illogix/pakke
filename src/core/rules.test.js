import { describe, expect, it } from 'vitest';

import { isSolved, progress } from './completion.js';
import { createState, setPlacement } from './state.js';
import { computeViolations } from './violations.js';

function rect(x0, y0, w, h) {
    const cells = [];

    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) cells.push([x, y]);

    return cells;
}

// A 2x2 tray and two dominoes: an exact fit, so it can be driven to solved.
function makeDef(overrides = {}) {
    return {
        schemaVersion: 1,
        id: 'test01',
        type: 'square-grid-packing',
        meta: { name: 'Test', author: 'Test' },
        field: { width: 10, height: 10 },
        container: { cells: rect(2, 2, 2, 2) },
        rules: { allowRotation: true, allowFlip: true, completion: 'all-pieces-contained' },
        pieces: [
            {
                id: 'a',
                cells: [[0, 0], [1, 0]],
                color: '#fff',
                start: { x: 1, y: 6, rotation: 0, flipped: false },
                locked: false
            },
            {
                id: 'b',
                cells: [[0, 0], [1, 0]],
                color: '#fff',
                start: { x: 5, y: 6, rotation: 0, flipped: false },
                locked: false
            }
        ],
        presentation: { fieldRotation: 0 },
        ...overrides
    };
}

const put = (def, state, id, x, y) => setPlacement(def, state, id, { x, y, rotation: 0, flipped: false });

function solvedState(def) {
    let state = createState(def);

    state = put(def, state, 'a', 2, 2);
    state = put(def, state, 'b', 2, 3);

    return state;
}

describe('computeViolations', () => {
    it('finds nothing wrong with the starting layout', () => {
        const def = makeDef();

        expect(computeViolations(def, createState(def)).cells.size).toBe(0);
    });

    it('marks every cell two pieces both cover', () => {
        const def = makeDef();
        let state = createState(def);

        state = put(def, state, 'a', 2, 2);
        state = put(def, state, 'b', 2, 2);

        const violations = computeViolations(def, state);

        expect([...violations.overlap].sort()).toEqual(['2,2', '3,2']);
        expect([...violations.pieces].sort()).toEqual(['a', 'b']);
    });

    it('marks overlaps outside the tray too', () => {
        const def = makeDef();
        let state = createState(def);

        state = put(def, state, 'a', 5, 6);

        expect(computeViolations(def, state).overlap.size).toBe(2);
    });

    it('marks the outside cells of a piece hanging off the tray edge', () => {
        const def = makeDef();
        const state = put(def, createState(def), 'a', 3, 2);

        const violations = computeViolations(def, state);

        expect([...violations.outside]).toEqual(['4,2']);
        expect([...violations.pieces]).toEqual(['a']);
    });

    it('leaves a piece parked well clear of the tray alone', () => {
        const def = makeDef();
        const state = put(def, createState(def), 'a', 6, 8);

        expect(computeViolations(def, state).cells.size).toBe(0);
    });
});

describe('progress', () => {
    it('counts only pieces fully inside the tray', () => {
        const def = makeDef();
        const state = put(def, createState(def), 'a', 2, 2);

        expect(progress(def, state)).toEqual({ contained: 1, total: 2 });
    });

    it('does not count a piece hanging off the edge', () => {
        const def = makeDef();
        const state = put(def, createState(def), 'a', 3, 2);

        expect(progress(def, state)).toEqual({ contained: 0, total: 2 });
    });
});

describe('isSolved', () => {
    it('is true once every piece is in the tray and nothing conflicts', () => {
        const def = makeDef();

        expect(isSolved(def, solvedState(def))).toBe(true);
    });

    it('is false while a piece is still staged', () => {
        const def = makeDef();

        expect(isSolved(def, createState(def))).toBe(false);
    });

    it('is false when pieces overlap, even if all of them are in the tray', () => {
        const def = makeDef({ container: { cells: rect(2, 2, 3, 2) } });
        let state = createState(def);

        state = put(def, state, 'a', 2, 2);
        state = put(def, state, 'b', 3, 2);

        expect(progress(def, state)).toEqual({ contained: 2, total: 2 });
        expect(isSolved(def, state)).toBe(false);
    });

    it('is false for a completion condition it does not recognise', () => {
        const def = makeDef({
            rules: { allowRotation: true, allowFlip: true, completion: 'no-such-condition' }
        });

        expect(isSolved(def, solvedState(def))).toBe(false);
    });

    it('tolerates spare room in the tray', () => {
        const def = makeDef({ container: { cells: rect(2, 2, 3, 2) } });
        let state = createState(def);

        state = put(def, state, 'a', 2, 2);
        state = put(def, state, 'b', 2, 3);

        expect(isSolved(def, state)).toBe(true);
    });
});
