import { describe, expect, it } from 'vitest';

import {
    clampToField,
    containment,
    containerKeys,
    deriveField,
    orientedBounds,
    placedCells,
    slack
} from './puzzle.js';
import { createState, flipPiece, movePiece, rotatePiece, setPlacement } from './state.js';

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

    it('clamps a placement that would leave the field', () => {
        const def = makeDef();
        const state = setPlacement(def, createState(def), 'a', {
            x: 99,
            y: 99,
            rotation: 0,
            flipped: false
        });

        expect(state.placements.a).toMatchObject({ x: 10, y: 11 });
    });
});
