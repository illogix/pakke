import { describe, expect, it } from 'vitest';

import { GENERATOR_LIMITS, generatePuzzle, pieceCap } from './generate.js';
import { analyseDef } from './solver.js';
import { deriveField, placedCells, slack } from './puzzle.js';
import { validatePuzzle } from './validate.js';
import { createState, setPlacement } from './state.js';
import { isSolved } from './completion.js';
import { inspectContent } from '../library/format.js';

// A clock that never advances keeps the deadline out of the tests: results
// then depend on the seed alone.
const frozen = { now: () => 0 };

const cases = [];

for (const [width, height] of [[3, 3], [4, 5], [6, 6], [8, 8]]) {
    for (const seed of [1, 2, 3]) cases.push([width, height, seed]);
}

describe('generatePuzzle', () => {
    it.each(cases)('produces a valid, uniquely solvable %ix%i puzzle for seed %i', (width, height, seed) => {
        const result = generatePuzzle({ width, height, seed }, frozen);

        expect(result.ok).toBe(true);

        const { def, solution } = result;

        expect(validatePuzzle(def).errors).toEqual([]);
        expect(validatePuzzle(def).warnings).toEqual([]);
        expect(def.field).toEqual(deriveField(def));
        expect(slack(def)).toBe(0);
        expect(def.container.cells).toHaveLength(width * height);
        expect(def.rules).toEqual({ allowRotation: true, allowFlip: true, completion: 'all-pieces-contained' });
        expect(def.id).toMatch(/^[a-z0-9][a-z0-9_-]{0,79}$/);
        for (const piece of def.pieces) expect(piece.cells.length).toBeLessThanOrEqual(pieceCap(width, height));
        expect(def).not.toHaveProperty('knownSolution');

        let state = createState(def);

        for (const { pieceId, ...placement } of solution) state = setPlacement(def, state, pieceId, placement);
        expect(isSolved(def, state)).toBe(true);

        const analysis = analyseDef(def, { cap: 2 });

        expect(analysis.orbits).toBe(1);
        expect(analysis.exhausted).toBe(true);
    });

    it('is deterministic for a seed', () => {
        const a = generatePuzzle({ width: 6, height: 6, seed: 11, createdAt: 0 }, frozen);
        const b = generatePuzzle({ width: 6, height: 6, seed: 11, createdAt: 0 }, frozen);

        expect(a.def).toEqual(b.def);
        expect(a.solution).toEqual(b.solution);
    });

    it('caps piece size at a quarter of the tray, within fixed bounds', () => {
        expect(pieceCap(3, 3)).toBe(GENERATOR_LIMITS.minPieceCap);
        expect(pieceCap(6, 6)).toBe(9);
        expect(pieceCap(9, 9)).toBe(GENERATOR_LIMITS.maxPieceCells);
    });

    it('keeps every piece under the cap on small rectangular boards', () => {
        for (const [width, height] of [[3, 7], [4, 5], [3, 6]]) {
            for (let seed = 1; seed <= 10; seed++) {
                const result = generatePuzzle({ width, height, seed }, frozen);

                expect(result.ok).toBe(true);
                for (const piece of result.def.pieces) expect(piece.cells.length).toBeLessThanOrEqual(pieceCap(width, height));
            }
        }
    });

    it('is named by local creation time and board size', () => {
        const createdAt = new Date(2026, 8, 14, 12, 34, 56).getTime();
        const { def } = generatePuzzle({ width: 5, height: 4, seed: 1, createdAt }, frozen);

        expect(def.meta.name).toBe('2026-09-14 12:34:56 · 5×4');
    });

    it('differs across seeds', () => {
        const a = generatePuzzle({ width: 6, height: 6, seed: 1 }, frozen);
        const b = generatePuzzle({ width: 6, height: 6, seed: 2 }, frozen);

        expect(a.def.id).not.toBe(b.def.id);
        expect(a.def.pieces).not.toEqual(b.def.pieces);
    });

    it('passes import-level validation', async () => {
        const { def } = generatePuzzle({ width: 5, height: 5, seed: 3 }, frozen);
        const content = await inspectContent(def);

        expect(content.standalone).toBe(true);
        expect(content.warnings).toEqual([]);
    });

    it('stages pieces below the tray without touching it', () => {
        const { def } = generatePuzzle({ width: 6, height: 6, seed: 4 }, frozen);
        const trayBottom = Math.max(...def.container.cells.map(([, y]) => y));

        for (const piece of def.pieces) {
            expect(piece.start.y).toBeGreaterThan(trayBottom + 1);
            expect(piece.start.rotation).toBe(0);
            expect(piece.start.flipped).toBe(false);
            expect(piece.locked).toBe(false);
        }
    });

    it('gives neighbouring pieces in the solution different colours', () => {
        const { def, solution } = generatePuzzle({ width: 8, height: 8, seed: 5 }, frozen);
        const owner = new Map();

        for (const { pieceId, ...placement } of solution) {
            const piece = def.pieces.find((p) => p.id === pieceId);
            let state = createState(def);

            state = setPlacement(def, state, pieceId, placement);

            for (const [x, y] of placedCells(piece, state.placements[pieceId])) owner.set(`${x},${y}`, piece);
        }

        for (const [key, piece] of owner) {
            const [x, y] = key.split(',').map(Number);

            for (const [dx, dy] of [[1, 0], [0, 1]]) {
                const other = owner.get(`${x + dx},${y + dy}`);

                if (other && other !== piece) expect(other.color).not.toBe(piece.color);
            }
        }
    });

    it('clamps sizes to the limits and reports a timeout instead of running on', () => {
        const small = generatePuzzle({ width: 1, height: 99, seed: 1 }, frozen);

        expect(small.def.container.cells).toHaveLength(GENERATOR_LIMITS.minSize * GENERATOR_LIMITS.maxSize);

        let ticks = 0;
        const rushed = generatePuzzle({ width: 8, height: 8, seed: 1, deadlineMs: 0, nodeBudget: 10 }, { now: () => ticks++ });

        expect(rushed.ok).toBe(false);
        expect(rushed.reason).toBe('timeout');
    });

    it('reports progress after each solver run', () => {
        const progress = [];

        generatePuzzle({ width: 6, height: 6, seed: 6 }, { ...frozen, onProgress: (p) => progress.push(p) });
        expect(progress.length).toBeGreaterThan(0);
        expect(progress.at(-1)).toMatchObject({ pieces: expect.any(Number), merges: expect.any(Number), nodes: expect.any(Number) });
    });
});
