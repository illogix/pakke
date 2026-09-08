import { describe, expect, it } from 'vitest';

import { cellKey } from '../core/geometry.js';
import { orientedBounds, placedCells } from '../core/puzzle.js';
import { createState, setPlacement } from '../core/state.js';
import { flippedGrab, rotatedGrab, topPieceAt } from './interaction.js';

function makeDef(pieces) {
    return {
        schemaVersion: 1,
        id: 'test01',
        type: 'square-grid-packing',
        meta: { name: 'Test', author: 'Test' },
        field: { width: 20, height: 20 },
        container: { cells: [[0, 0]] },
        rules: { allowRotation: true, allowFlip: true, completion: 'all-pieces-contained' },
        pieces,
        presentation: { fieldRotation: 0 }
    };
}

const piece = (id, cells, x, y) => ({
    id,
    cells,
    color: '#fff',
    start: { x, y, rotation: 0, flipped: false },
    locked: false
});

describe('topPieceAt', () => {
    const def = makeDef([
        piece('under', [[0, 0], [1, 0]], 4, 4),
        piece('over', [[0, 0], [1, 0]], 5, 4)
    ]);
    const state = createState(def);

    it('finds the piece covering a cell', () => {
        expect(topPieceAt(def, state, ['under', 'over'], [4, 4])).toBe('under');
    });

    it('returns null on an empty cell', () => {
        expect(topPieceAt(def, state, ['under', 'over'], [0, 9])).toBeNull();
    });

    it('picks the piece drawn on top where two overlap', () => {
        expect(topPieceAt(def, state, ['under', 'over'], [5, 4])).toBe('over');
        expect(topPieceAt(def, state, ['over', 'under'], [5, 4])).toBe('under');
    });
});

// The property that matters while dragging: whatever cell the cursor is over
// stays under the cursor when the piece turns. Getting this wrong makes a piece
// jump out from under the pointer, which is the bug the offset maths prevents.
describe('grab offsets keep the cursor cell covered', () => {
    const shapes = {
        bar: [[0, 0], [1, 0], [2, 0], [3, 0]],
        ell: [[0, 0], [0, 1], [0, 2], [1, 2]],
        tee: [[0, 0], [1, 0], [2, 0], [1, 1]],
        eff: [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]]
    };

    const cases = [];

    for (const [name, cells] of Object.entries(shapes)) {
        for (let rotation = 0; rotation < 4; rotation++) {
            for (const flipped of [false, true]) {
                cases.push([name, cells, rotation, flipped]);
            }
        }
    }

    it.each(cases)('%s at rotation %#: rotating clockwise', (name, cells, rotation, flipped) => {
        expectCursorHeld(cells, rotation, flipped, (bounds, grab) => ({
            grab: rotatedGrab(bounds, grab, 1),
            change: { rotation: (rotation + 1) % 4 }
        }));
    });

    it.each(cases)('%s at rotation %#: rotating anticlockwise', (name, cells, rotation, flipped) => {
        expectCursorHeld(cells, rotation, flipped, (bounds, grab) => ({
            grab: rotatedGrab(bounds, grab, -1),
            change: { rotation: (rotation + 3) % 4 }
        }));
    });

    it.each(cases)('%s at rotation %#: flipping', (name, cells, rotation, flipped) => {
        expectCursorHeld(cells, rotation, flipped, (bounds, grab) => ({
            grab: flippedGrab(bounds, grab, rotation),
            change: { flipped: !flipped }
        }));
    });
});

function expectCursorHeld(cells, rotation, flipped, transform) {
    const def = makeDef([piece('p', cells, 8, 8)]);
    const start = { x: 8, y: 8, rotation, flipped };
    const state = setPlacement(def, createState(def), 'p', start);
    const [target] = [def.pieces[0]];
    const occupied = placedCells(target, start);

    // Grab each cell of the piece in turn; every one must survive the turn.
    for (const [cx, cy] of occupied) {
        const grab = [cx - start.x, cy - start.y];
        const bounds = orientedBounds(target, start);
        const { grab: nextGrab, change } = transform(bounds, grab);

        const next = { ...start, ...change, x: cx - nextGrab[0], y: cy - nextGrab[1] };
        const after = placedCells(target, next).map(([x, y]) => cellKey(x, y));

        expect(after, `grabbing ${cx},${cy} of a piece at rotation ${rotation}`).toContain(
            cellKey(cx, cy)
        );
    }
}

// Fractional grab points must use edge coordinates, including under field rotation.
it('continuous grab transforms preserve interior points across turns and flips', async () => {
    const { rotatedGrabPoint, flippedGrabPoint } = await import('./interaction.js');
    for (const cells of [[[0,0],[1,0],[2,0],[3,0]],[[0,0],[0,1],[0,2],[1,2]]]) {
        const target=piece('p',cells,8,8);
        for(let rotation=0;rotation<4;rotation++) for(const flipped of [false,true]) {
            const start={x:0,y:0,rotation,flipped};
            for(const [x,y] of placedCells(target,start)) {
                const grab=[x+.27,y+.81],box=orientedBounds(target,start);
                for(const dir of [-1,1]) {
                    const next=rotatedGrabPoint(box,grab,dir);
                    const after=placedCells(target,{...start,rotation:(rotation+dir+4)%4});
                    expect(after.map(c=>c.join(','))).toContain([Math.floor(next[0]),Math.floor(next[1])].join(','));
                    const inverse=rotatedGrabPoint(orientedBounds(target,{...start,rotation:(rotation+dir+4)%4}),next,-dir);
                    expect(inverse[0]).toBeCloseTo(grab[0]);expect(inverse[1]).toBeCloseTo(grab[1]);
                }
                const next=flippedGrabPoint(box,grab,rotation);
                expect(placedCells(target,{...start,flipped:!flipped}).map(c=>c.join(','))).toContain([Math.floor(next[0]),Math.floor(next[1])].join(','));
            }
        }
    }
});
