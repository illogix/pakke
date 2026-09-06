import { describe, expect, it } from 'vitest';

import {
    bounds,
    cellsEqual,
    flipH,
    isConnected,
    normalise,
    orient,
    outlineEdges,
    rotateCW
} from './geometry.js';

// An L-tromino, deliberately unsymmetrical so rotation and flipping are visible.
const L = [[0, 0], [0, 1], [1, 1]];
// The S-tetromino: chiral, but with 180° symmetry, so only four orientations.
const S = [[1, 0], [2, 0], [0, 1], [1, 1]];
// The L-tetromino: chiral with no symmetry at all, so all eight are distinct.
const J = [[0, 0], [0, 1], [0, 2], [1, 2]];

function distinctOrientations(cells) {
    const seen = new Set();

    for (const flipped of [false, true]) {
        for (let rotation = 0; rotation < 4; rotation++) {
            seen.add(JSON.stringify(orient(cells, rotation, flipped)));
        }
    }

    return seen.size;
}

describe('normalise', () => {
    it('moves a shape to the origin and sorts it row-major', () => {
        expect(normalise([[5, 9], [4, 9], [4, 8]])).toEqual([[0, 0], [0, 1], [1, 1]]);
    });

    it('leaves an empty shape empty', () => {
        expect(normalise([])).toEqual([]);
    });
});

describe('rotateCW', () => {
    it('turns four times back to the original', () => {
        let cells = L;

        for (let i = 0; i < 4; i++) cells = rotateCW(cells);

        expect(cellsEqual(cells, normalise(L))).toBe(true);
    });

    it('is not the identity after one turn', () => {
        expect(cellsEqual(rotateCW(L), normalise(L))).toBe(false);
    });

    it('swaps width and height of an oblong', () => {
        expect(bounds(rotateCW(S))).toMatchObject({ width: 2, height: 3 });
    });

    it('turns clockwise, so the cell to the right ends up below', () => {
        // A domino lying flat becomes a domino standing up.
        expect(rotateCW([[0, 0], [1, 0]])).toEqual([[0, 0], [0, 1]]);
    });
});

describe('flipH', () => {
    it('mirrors back to the original when applied twice', () => {
        expect(cellsEqual(flipH(flipH(L)), normalise(L))).toBe(true);
    });

    it('changes a chiral shape', () => {
        expect(cellsEqual(flipH(S), normalise(S))).toBe(false);
    });

    it('leaves a symmetric shape alone', () => {
        const square = [[0, 0], [1, 0], [0, 1], [1, 1]];

        expect(cellsEqual(flipH(square), square)).toBe(true);
    });
});

describe('orient', () => {
    it('flips before rotating', () => {
        expect(orient(S, 1, true)).toEqual(rotateCW(flipH(S)));
    });

    it('accepts any rotation and wraps it', () => {
        expect(orient(L, 4, false)).toEqual(orient(L, 0, false));
        expect(orient(L, -1, false)).toEqual(orient(L, 3, false));
    });

    it('reaches eight distinct orientations for a shape with no symmetry', () => {
        expect(distinctOrientations(J)).toBe(8);
    });

    it('reaches four for a shape with half-turn symmetry', () => {
        expect(distinctOrientations(S)).toBe(4);
    });

    it('reaches only one for a square', () => {
        expect(distinctOrientations([[0, 0], [1, 0], [0, 1], [1, 1]])).toBe(1);
    });
});

describe('isConnected', () => {
    it('accepts an orthogonally joined shape', () => {
        expect(isConnected(L)).toBe(true);
    });

    it('rejects cells joined only at a corner', () => {
        expect(isConnected([[0, 0], [1, 1]])).toBe(false);
    });

    it('rejects a shape in two separate parts', () => {
        expect(isConnected([[0, 0], [1, 0], [5, 0], [6, 0]])).toBe(false);
    });

    it('rejects an empty shape', () => {
        expect(isConnected([])).toBe(false);
    });
});

describe('outlineEdges', () => {
    it('gives four sides for a single cell', () => {
        expect(outlineEdges([[0, 0]])).toHaveLength(4);
    });

    it('omits the shared side of a domino', () => {
        expect(outlineEdges([[0, 0], [1, 0]])).toHaveLength(6);
    });

    it('traces only the perimeter of a square block', () => {
        expect(outlineEdges([[0, 0], [1, 0], [0, 1], [1, 1]])).toHaveLength(8);
    });
});
