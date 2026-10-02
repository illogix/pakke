import { describe, expect, it } from 'vitest';

import { analyseDef, countSolutions, createRegion, regionSymmetries, solutionKey, indexPiece } from './solver.js';
import { allowedOrientations, canonicalKey, shapeMultiset } from './shapes.js';
import { puzzleById } from '../puzzles/index.js';

const FREE = { allowRotation: true, allowFlip: true };
const FIXED = { allowRotation: false, allowFlip: false };

function rect(w, h, x0 = 0, y0 = 0) {
    const cells = [];

    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) cells.push([x, y]);

    return cells;
}

const domino = [[0, 0], [1, 0]];
const L = [[0, 0], [0, 1], [1, 1]];
const J = [[0, 0], [0, 1], [0, 2], [1, 2]];
const square = [[0, 0], [1, 0], [0, 1], [1, 1]];

describe('shapes', () => {
    it('lists eight orientations for a chiral shape when flipping is allowed and four when it is not', () => {
        expect(allowedOrientations(J, FREE)).toHaveLength(8);
        expect(allowedOrientations(J, { allowRotation: true, allowFlip: false })).toHaveLength(4);
        expect(allowedOrientations(J, FIXED)).toHaveLength(1);
    });

    it('gives mirror images the same key only when flipping is allowed', () => {
        const mirrored = [[1, 0], [1, 1], [1, 2], [0, 2]];

        expect(canonicalKey(J, FREE)).toBe(canonicalKey(mirrored, FREE));
        expect(canonicalKey(J, { allowRotation: true, allowFlip: false })).not.toBe(canonicalKey(mirrored, { allowRotation: true, allowFlip: false }));
    });

    it('counts identical shapes once with a multiplicity', () => {
        const shapes = shapeMultiset([domino, [[0, 0], [0, 1]], L], FREE);

        expect(shapes).toHaveLength(2);
        expect(shapes.find((s) => s.size === 2).count).toBe(2);
        expect(shapes.find((s) => s.size === 3).count).toBe(1);
    });
});

describe('regionSymmetries', () => {
    it('finds all eight for a square, four for an oblong, and one for an asymmetric region', () => {
        expect(regionSymmetries(rect(3, 3))).toHaveLength(8);
        expect(regionSymmetries(rect(4, 2))).toHaveLength(4);
        expect(regionSymmetries([[0, 0], [1, 0], [2, 0], [0, 1]])).toHaveLength(1);
    });

    it('returns permutations that map the region onto itself', () => {
        const region = createRegion(rect(3, 2));

        for (const { perm } of region.symmetries) {
            expect(new Set(perm).size).toBe(region.n);
        }
    });

    it('does not depend on where the region sits', () => {
        expect(regionSymmetries(rect(3, 3, 7, 5))).toHaveLength(8);
    });
});

describe('countSolutions', () => {
    it('sees the two domino tilings of a 2x2 as one solution up to symmetry', () => {
        const result = countSolutions(rect(2, 2), shapeMultiset([domino, domino], FREE), FREE, { cap: 10 });

        expect(result.orbits).toBe(1);
        expect(result.exhausted).toBe(true);
        expect(result.solutions[0].pieces).toHaveLength(2);
    });

    it('counts them separately when told not to break symmetry, still as one orbit', () => {
        const result = countSolutions(rect(2, 2), shapeMultiset([domino, domino], FREE), FREE, { cap: 10, breakSymmetry: false });

        expect(result.orbits).toBe(1);
        expect(result.exhausted).toBe(true);
    });

    it('finds exactly one tiling of an asymmetric region', () => {
        // An L-tetromino region: the single cell must take the end of the long
        // arm, since anywhere else leaves the tromino a straight line or two parts.
        const region = [[0, 0], [1, 0], [2, 0], [0, 1]];
        const result = countSolutions(region, shapeMultiset([L, [[0, 0]]], FREE), FREE, { cap: 10 });

        expect(result.orbits).toBe(1);
        expect(result.exhausted).toBe(true);
        expect(result.solutions[0].pieces).toContainEqual([[2, 0]]);
    });

    it('merges tilings related by a diagonal reflection of the board', () => {
        // A symmetric L region with a straight tromino and a domino tiles two
        // ways, each the transpose of the other.
        const region = [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2]];
        const bar = [[0, 0], [1, 0], [2, 0]];
        const result = countSolutions(region, shapeMultiset([bar, domino], FREE), FREE, { cap: 10 });

        expect(result.orbits).toBe(1);
        expect(countSolutions(region, shapeMultiset([bar, domino], FREE), FREE, { cap: 10, breakSymmetry: false }).orbits).toBe(1);
    });

    it('finds several distinct tilings when they exist', () => {
        // 2x4 with four dominoes: five tilings, four up to the board's symmetries.
        const result = countSolutions(rect(4, 2), shapeMultiset([domino, domino, domino, domino], FREE), FREE, { cap: 10 });

        expect(result.orbits).toBe(4);
        expect(result.exhausted).toBe(true);
    });

    it('finds no tiling when the shapes cannot fit', () => {
        const result = countSolutions(rect(3, 1), shapeMultiset([L], FREE), FREE);

        expect(result.orbits).toBe(0);
        expect(result.exhausted).toBe(true);
    });

    it('respects rules that forbid turning', () => {
        const standing = [[0, 0], [0, 1]];
        const lying = countSolutions(rect(2, 1), shapeMultiset([standing], FIXED), FIXED);

        expect(lying.orbits).toBe(0);
        expect(countSolutions(rect(2, 1), shapeMultiset([standing], { allowRotation: true, allowFlip: false }), FREE).orbits).toBe(1);
    });

    it('stops at the cap without claiming exhaustion', () => {
        const result = countSolutions(rect(4, 2), shapeMultiset([domino, domino, domino, domino], FREE), FREE, { cap: 2 });

        expect(result.orbits).toBe(2);
        expect(result.exhausted).toBe(false);
    });

    it('reports a spent node budget as unproven', () => {
        const result = countSolutions(rect(4, 4), shapeMultiset([square, square, square, square], FREE), FREE, { nodeBudget: 1 });

        expect(result.exhausted).toBe(false);
        expect(result.nodes).toBe(2);
    });

    it('rejects a shape set that does not match the area', () => {
        expect(() => countSolutions(rect(2, 2), shapeMultiset([domino], FREE), FREE)).toThrow(/exact fit/);
    });

    it('prunes islands without losing any solution', () => {
        const shapes = shapeMultiset([J, J, L, L, domino], FREE);
        const region = rect(4, 4);
        const pruned = countSolutions(region, shapes, FREE, { cap: 1000 });
        const plain = countSolutions(region, shapes, FREE, { cap: 1000, prune: false, breakSymmetry: false });

        expect(pruned.orbits).toBe(plain.orbits);
        expect(pruned.orbits).toBeGreaterThan(0);
        expect(pruned.nodes).toBeLessThanOrEqual(plain.nodes);
    });

    it('returns solutions in region coordinates', () => {
        const result = countSolutions(rect(2, 1, 5, 7), shapeMultiset([domino], FREE), FREE);

        expect(result.solutions[0].pieces).toEqual([[[5, 7], [6, 7]]]);
    });
});

describe('solutionKey', () => {
    it('gives mirrored tilings the same key on a symmetric region', () => {
        const region = createRegion(rect(3, 1));
        const left = [indexPiece(region, [[0, 0], [1, 0]]), indexPiece(region, [[2, 0]])];
        const right = [indexPiece(region, [[1, 0], [2, 0]]), indexPiece(region, [[0, 0]])];

        expect(solutionKey(region, left)).toBe(solutionKey(region, right));
    });
});

describe('analyseDef', () => {
    it('verifies the introductory puzzles from their definitions', () => {
        for (const id of ['first-fit', 'little-turn', 'other-side']) {
            const result = analyseDef(puzzleById(id), { cap: 10 });

            expect(result.orbits, id).toBeGreaterThan(0);
            expect(result.exhausted, id).toBe(true);
        }
    });

    it('treats a locked piece as fixed and removes its cells from the tray', () => {
        const def = {
            container: { cells: rect(3, 1) },
            rules: FREE,
            pieces: [
                { id: 'lock', cells: [[0, 0]], start: { x: 0, y: 0, rotation: 0, flipped: false }, locked: true },
                { id: 'free', cells: domino, start: { x: 0, y: 5, rotation: 0, flipped: false }, locked: false }
            ]
        };
        const result = analyseDef(def, { cap: 10 });

        expect(result.orbits).toBe(1);
        expect(result.solutions[0].pieces).toEqual([[[1, 0], [2, 0]]]);
    });
});
