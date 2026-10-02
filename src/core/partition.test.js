import { describe, expect, it } from 'vitest';

import { randomPartition } from './partition.js';
import { createRandom } from './random.js';
import { isConnected, cellKey } from './geometry.js';

function rect(w, h) {
    const cells = [];

    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push([x, y]);

    return cells;
}

describe('createRandom', () => {
    it('is deterministic for a seed and different across seeds', () => {
        const a = createRandom(42);
        const b = createRandom(42);
        const c = createRandom(43);
        const take = (r) => Array.from({ length: 5 }, () => r.int(1000));
        const first = take(a);

        expect(take(b)).toEqual(first);
        expect(take(c)).not.toEqual(first);
    });

    it('shuffles a copy and keeps every element', () => {
        const random = createRandom(7);
        const input = [1, 2, 3, 4, 5, 6, 7, 8];
        const out = random.shuffle(input);

        expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        expect([...out].sort((a, b) => a - b)).toEqual(input);
    });
});

describe('randomPartition', () => {
    const cases = [[3, 3], [5, 4], [6, 6], [10, 10], [7, 3]];

    it.each(cases)('covers every cell of a %ix%i region exactly once', (w, h) => {
        const cells = rect(w, h);
        const pieces = randomPartition(cells, createRandom(1), { minPiece: 4, maxPiece: 5 });
        const seen = pieces.flat().map(([x, y]) => cellKey(x, y));

        expect(seen).toHaveLength(cells.length);
        expect(new Set(seen).size).toBe(cells.length);
    });

    it.each(cases)('keeps every piece of a %ix%i region connected', (w, h) => {
        for (const piece of randomPartition(rect(w, h), createRandom(2), { minPiece: 4, maxPiece: 5 })) {
            expect(isConnected(piece)).toBe(true);
        }
    });

    it('keeps sizes within bounds except where a pocket had to be folded in', () => {
        for (let seed = 1; seed <= 20; seed++) {
            const pieces = randomPartition(rect(8, 8), createRandom(seed), { minPiece: 4, maxPiece: 5 });
            const oversized = pieces.filter((piece) => piece.length > 5);

            for (const piece of pieces) expect(piece.length).toBeGreaterThanOrEqual(4);
            // Pockets are rare with tight seeding: a handful per board at most.
            expect(oversized.length).toBeLessThanOrEqual(5);
        }
    });

    it('is deterministic for a seed', () => {
        const a = randomPartition(rect(6, 6), createRandom(9));
        const b = randomPartition(rect(6, 6), createRandom(9));

        expect(a).toEqual(b);
    });

    it('handles a region smaller than one piece by producing a single piece', () => {
        const pieces = randomPartition(rect(2, 1), createRandom(1), { minPiece: 4, maxPiece: 5 });

        expect(pieces).toHaveLength(1);
        expect(pieces[0]).toHaveLength(2);
    });
});
