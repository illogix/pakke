import { describe, expect, it } from 'vitest';

import { arrangePieces } from './arrange.js';
import { generatePuzzle } from './generate.js';
import { bounds, cellKey } from './geometry.js';
import { containerKeys, containment, placedCells } from './puzzle.js';
import { validSavedState } from '../app/storage.js';
import { bundledPacks } from '../puzzles/index.js';

const bundled = bundledPacks.flatMap((pack) => pack.puzzles);
const generated = [[4, 4, 1], [6, 6, 2], [8, 8, 3], [5, 9, 4]]
    .map(([width, height, seed]) => generatePuzzle({ width, height, seed }, { now: () => 0 }).def);
const aspects = [0.25, 0.5, 0.75, 1, 1.5, 2, 4];

/** Cells of pieces arranged out of the tray, with their owner. */
function owners(def, placements) {
    const keys = containerKeys(def);
    const cells = new Map(def.container.cells.map(([x, y]) => [cellKey(x, y), 'tray']));

    for (const piece of def.pieces) {
        if (piece.locked || containment(piece, piece.start, keys) === 'contained') continue;
        for (const [x, y] of placedCells(piece, placements[piece.id])) cells.set(cellKey(x, y), piece.id);
    }

    return cells;
}

describe('arrangePieces', () => {
    it.each([...bundled, ...generated].map((def) => [def.id, def]))('lays %s out apart and inside the workspace', (id, def) => {
        const keys = containerKeys(def);

        for (const aspect of aspects) {
            const placements = arrangePieces(def, aspect);
            const cells = owners(def, placements);
            let count = 0;

            for (const piece of def.pieces) {
                const placement = placements[piece.id];

                expect([placement.rotation, placement.flipped]).toEqual([piece.start.rotation, piece.start.flipped]);
                if (piece.locked || containment(piece, piece.start, keys) === 'contained') {
                    expect(placement).toEqual(piece.start);
                } else {
                    expect(containment(piece, placement, keys)).toBe('staged');
                    count += piece.cells.length;
                }
            }
            // No overlaps, and a clear cell between neighbours, diagonals included.
            expect(cells.size).toBe(def.container.cells.length + count);
            for (const [key, owner] of cells) {
                const [x, y] = key.split(',').map(Number);

                for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
                    const other = cells.get(cellKey(x + dx, y + dy));

                    if (other !== undefined) expect(other).toBe(owner);
                }
            }
            expect(validSavedState(def, { placements })).toBe(true);
        }
    });

    it('fills the sides on a wide screen and above and below on a tall one', () => {
        const def = bundled.find((puzzle) => puzzle.id === 'pent01');
        const extent = (aspect) => {
            const placements = arrangePieces(def, aspect);

            return bounds([...def.container.cells, ...def.pieces.flatMap((piece) => placedCells(piece, placements[piece.id]))]);
        };
        const tall = extent(0.5);
        const wide = extent(2);

        expect(tall.height).toBeGreaterThan(tall.width);
        expect(wide.width).toBeGreaterThan(wide.height);
    });

    it('suits the screen it was made for better than any other shape would', () => {
        // Zoom of the tray-centred opening view that shows every piece, on a screen of this shape.
        const zoom = (def, placements, aspect) => {
            const tray = bounds(def.container.cells);
            const all = bounds([...def.container.cells, ...def.pieces.flatMap((piece) => placedCells(piece, placements[piece.id]))]);
            const x = tray.minX + tray.width / 2;
            const y = tray.minY + tray.height / 2;

            return Math.min(aspect / (2 * Math.max(x - all.minX, all.maxX + 1 - x)), 1 / (2 * Math.max(y - all.minY, all.maxY + 1 - y)));
        };

        for (const def of [...bundled, ...generated]) {
            for (const aspect of aspects) {
                const own = zoom(def, arrangePieces(def, aspect), aspect);

                for (const other of aspects) expect(own).toBeGreaterThanOrEqual(zoom(def, arrangePieces(def, other), aspect) - 1e-9);
            }
        }
    });
});
