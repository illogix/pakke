import { describe, expect, it } from 'vitest';

import { flipH, orient } from './geometry.js';
import {
    clampToField,
    containment,
    containerKeys,
    deriveField,
    orientedBounds,
    placedCells,
    slack,
    stagePieces
} from './puzzle.js';
import { createState, flipOrientation, flipPiece, movePiece, rotatePiece, setPlacement } from './state.js';

function rect(x0, y0, w, h) {
    const cells = [];

    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) cells.push([x, y]);

    return cells;
}

function makeDef(overrides = {}) {
    return {
        schemaVersion: 1,
        id: 'test01',
        type: 'square-grid-packing',
        meta: { name: 'Test', author: 'Test' },
        field: { width: 12, height: 12 },
        container: { cells: rect(2, 2, 3, 2) },
        rules: { allowRotation: true, allowFlip: true, completion: 'all-pieces-contained' },
        pieces: [
            {
                id: 'a',
                cells: [[0, 0], [1, 0]],
                color: '#fff',
                start: { x: 2, y: 6, rotation: 0, flipped: false },
                locked: false
            },
            {
                id: 'b',
                cells: [[0, 0], [1, 0]],
                color: '#fff',
                start: { x: 6, y: 6, rotation: 0, flipped: false },
                locked: false
            }
        ],
        presentation: { fieldRotation: 0 },
        ...overrides
    };
}

const bar = { id: 'bar', cells: [[0, 0], [0, 1], [0, 2], [0, 3]], color: '#fff', locked: false };

describe('placedCells', () => {
    it('orients then translates', () => {
        const piece = { cells: [[0, 0], [0, 1]] };

        expect(placedCells(piece, { x: 3, y: 4, rotation: 1, flipped: false })).toEqual([
            [3, 4],
            [4, 4]
        ]);
    });
});

describe('containment', () => {
    const def = makeDef();
    const keys = containerKeys(def);
    const piece = { cells: [[0, 0], [1, 0]] };
    const at = (x, y) => containment(piece, { x, y, rotation: 0, flipped: false }, keys);

    it('calls a piece with every cell in the tray contained', () => {
        expect(at(2, 2)).toBe('contained');
    });

    it('calls a piece with no cells in the tray staged', () => {
        expect(at(2, 8)).toBe('staged');
    });

    it('calls a piece with only some cells in the tray straddling', () => {
        expect(at(4, 2)).toBe('straddling');
    });
});

describe('slack', () => {
    it('is the tray area left over once every piece is in', () => {
        expect(slack(makeDef())).toBe(2);
    });

    it('goes negative when the pieces cannot possibly fit', () => {
        const def = makeDef({ container: { cells: rect(2, 2, 1, 2) } });

        expect(slack(def)).toBe(-2);
    });
});

describe('deriveField', () => {
    it('bounds the tray and every starting piece, plus a border', () => {
        expect(deriveField(makeDef())).toEqual({ width: 10, height: 9 });
    });

    it('matches the stored field on a puzzle laid out to fit it', () => {
        const def = makeDef({ field: { width: 10, height: 9 } });

        expect(deriveField(def)).toEqual(def.field);
    });
});

describe('clampToField', () => {
    const def = makeDef();
    const piece = def.pieces[0];

    it('keeps a piece inside the right and bottom edges', () => {
        const clamped = clampToField(def, piece, { x: 40, y: 40, rotation: 0, flipped: false });

        expect(clamped).toMatchObject({ x: 10, y: 11 });
    });

    it('keeps a piece inside the top and left edges', () => {
        const clamped = clampToField(def, piece, { x: -5, y: -5, rotation: 0, flipped: false });

        expect(clamped).toMatchObject({ x: 0, y: 0 });
    });

    it('accounts for the piece being turned', () => {
        const def4 = makeDef({ pieces: [{ ...bar, start: { x: 0, y: 0, rotation: 0, flipped: false } }] });
        const upright = clampToField(def4, def4.pieces[0], { x: 40, y: 40, rotation: 0, flipped: false });
        const onSide = clampToField(def4, def4.pieces[0], { x: 40, y: 40, rotation: 1, flipped: false });

        expect(upright).toMatchObject({ x: 11, y: 8 });
        expect(onSide).toMatchObject({ x: 8, y: 11 });
    });
});

describe('state operations', () => {
    it('starts every piece at its authored placement', () => {
        const def = makeDef();

        expect(createState(def).placements.a).toEqual(def.pieces[0].start);
    });

    it('refuses to move a locked piece', () => {
        const def = makeDef();

        def.pieces[0].locked = true;

        const state = createState(def);

        expect(movePiece(def, state, 'a', 0, 0)).toBe(state);
    });

    it('refuses to rotate when the puzzle disallows rotation', () => {
        const def = makeDef({
            rules: { allowRotation: false, allowFlip: true, completion: 'all-pieces-contained' }
        });
        const state = createState(def);

        expect(rotatePiece(def, state, 'a', 1)).toBe(state);
    });

    it('refuses to flip when the puzzle disallows flipping', () => {
        const def = makeDef({
            rules: { allowRotation: true, allowFlip: false, completion: 'all-pieces-contained' }
        });
        const state = createState(def);

        expect(flipPiece(def, state, 'a')).toBe(state);
    });

    it('flips a turned piece left to right, not top to bottom', () => {
        const ell = { id: 'ell', cells: [[0, 0], [0, 1], [0, 2], [1, 2]], color: '#fff', locked: false, start: { x: 5, y: 4, rotation: 1, flipped: false } };
        const def = makeDef({ pieces: [ell] });
        const state = createState(def);
        const once = flipPiece(def, state, 'ell');
        const { rotation, flipped } = once.placements.ell;

        expect(orient(ell.cells, rotation, flipped)).toEqual(flipH(orient(ell.cells, 1, false)));
        expect(flipPiece(def, once, 'ell').placements.ell).toEqual(state.placements.ell);
    });

    it('keeps the turn when flipping a puzzle that disallows rotation', () => {
        const def = makeDef({
            rules: { allowRotation: false, allowFlip: true, completion: 'all-pieces-contained' }
        });

        expect(flipOrientation(def, { rotation: 1, flipped: false })).toEqual({ rotation: 1, flipped: true });
        expect(flipPiece(def, createState(def), 'a').placements.a.flipped).toBe(true);
    });

    it('leaves the original state untouched when a piece moves', () => {
        const def = makeDef();
        const before = createState(def);
        const after = movePiece(def, before, 'a', 1, 1);

        expect(before.placements.a).toEqual(def.pieces[0].start);
        expect(after.placements.a).toMatchObject({ x: 1, y: 1 });
    });

    it('rotates about the centre, not the corner', () => {
        const def = makeDef({ pieces: [{ ...bar, start: { x: 5, y: 4, rotation: 0, flipped: false } }] });
        const state = createState(def);
        const turned = rotatePiece(def, state, 'bar', 1);

        const centre = (placement) => {
            const { width, height } = orientedBounds(def.pieces[0], placement);

            return [placement.x + width / 2, placement.y + height / 2];
        };

        const [x0, y0] = centre(state.placements.bar);
        const [x1, y1] = centre(turned.placements.bar);

        expect(Math.abs(x1 - x0)).toBeLessThan(1);
        expect(Math.abs(y1 - y0)).toBeLessThan(1);
    });

    it('returns to the starting orientation after four turns', () => {
        const def = makeDef();
        let state = createState(def);

        for (let i = 0; i < 4; i++) state = rotatePiece(def, state, 'a', 1);

        expect(state.placements.a.rotation).toBe(0);
    });

    it('lands an oblong piece back in its own box every half turn', () => {
        const ell = {
            id: 'ell',
            cells: [[0, 0], [0, 1], [0, 2], [1, 2]],
            color: '#fff',
            locked: false,
            start: { x: 5, y: 4, rotation: 0, flipped: false }
        };

        for (const direction of [1, -1]) {
            for (const piece of [ell, { ...bar, start: ell.start }]) {
                const def = makeDef({ pieces: [piece] });
                let state = createState(def);

                for (let turn = 1; turn <= 4; turn++) {
                    state = rotatePiece(def, state, piece.id, direction);

                    // Odd quarter-turns sit half a cell off — an oblong box has no
                    // exact centre to turn about — but half turns must land home.
                    if (turn % 2 === 0) {
                        expect(state.placements[piece.id]).toMatchObject({ x: 5, y: 4 });
                    }
                }
            }
        }
    });

    it('undoes a turn when it is turned back the other way', () => {
        const def = makeDef({ pieces: [{ ...bar, start: { x: 5, y: 4, rotation: 0, flipped: false } }] });
        const state = createState(def);
        const there = rotatePiece(def, state, 'bar', 1);

        expect(rotatePiece(def, there, 'bar', -1).placements.bar).toEqual(state.placements.bar);
    });

    it('clamps a runtime placement to the expanded workspace', () => {
        const def = makeDef();
        const state = setPlacement(def, createState(def), 'a', {
            x: 99,
            y: 99,
            rotation: 0,
            flipped: false
        });

        expect(state.placements.a).toMatchObject({ x: 14, y: 15 });
    });
});

describe('stagePieces', () => {
    it('splits free pieces above and below the tray, centred, and keeps locked pieces in place', () => {
        const locked = { id: 'l', cells: [[0, 0]], start: { x: 2, y: 2, rotation: 0, flipped: false }, locked: true };
        const def = makeDef({ pieces: [...makeDef().pieces, { ...bar, start: { x: 0, y: 9, rotation: 1, flipped: false } }, locked] });
        const { def: staged, offset } = stagePieces(def);
        const tray = staged.container.cells;
        const [top, bottom] = [Math.min(...tray.map(c => c[1])), Math.max(...tray.map(c => c[1]))];
        const of = (id) => placedCells(staged.pieces.find(p => p.id === id), staged.pieces.find(p => p.id === id).start);

        // Areas 2, 2 and 4 of 8: the first two go below, the bar above.
        expect(Math.min(...of('a').map(c => c[1]))).toBe(bottom + 2);
        expect(Math.min(...of('b').map(c => c[1]))).toBe(bottom + 2);
        expect(Math.max(...of('bar').map(c => c[1]))).toBe(top - 2);
        expect(of('l')).toEqual([[2 + offset[0], 2 + offset[1]]]);
        expect(staged.pieces.find(p => p.id === 'bar').start.rotation).toBe(1);

        const all = [...tray, ...staged.pieces.flatMap(p => placedCells(p, p.start))];
        expect(Math.min(...all.map(c => c[0]))).toBe(2);
        expect(Math.min(...all.map(c => c[1]))).toBe(2);
        expect(staged.field).toEqual(deriveField(staged));
    });
});
