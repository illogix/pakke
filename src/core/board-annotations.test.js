import { describe, expect, it } from 'vitest';
import { createDailyPuzzle } from '../daily/calendar.js';
import { inspectContent, definitionRecord } from '../library/format.js';
import { validatePuzzle } from './validate.js';
import { stagePieces, boardCells } from './puzzle.js';
import { createCamera, openingState } from '../ui/camera.js';

describe('optional board annotations', () => {
    it('rejects overlapping holes, duplicate/unknown labels, and out-of-field holes', () => {
        for (const change of [
            d => d.container.holes.push(d.container.cells[0]),
            d => d.container.labels.push(d.container.labels[0]),
            d => d.container.labels[0].cell = [999, 999],
            d => d.container.labels[0].text = '',
            d => d.container.holes.push([d.field.width, 0]),
            d => d.container.holes = 'bad',
            d => d.container.labels = null,
            d => d.container.cells = {}
        ]) {
            const def = createDailyPuzzle('2026-01-01'); change(def);
            expect(validatePuzzle(def).valid).toBe(false);
        }
    });
    it('allows empty annotations and validates optional flipped colors', async () => {
        const def = createDailyPuzzle('2026-01-01');
        def.container.labels = []; def.container.holes = [];
        def.pieces[0].flippedColor = '#abc';
        expect(validatePuzzle(def).valid).toBe(true);
        await expect(inspectContent(def)).resolves.toBeDefined();
        def.pieces[0].flippedColor = 'blue';
        expect(validatePuzzle(def).valid).toBe(false);
    });
    it('changes only content identity when labels and face colors change', async () => {
        const def = createDailyPuzzle('2026-01-01'), a = await definitionRecord(def);
        def.container.labels[0].text = 'January'; def.pieces[0].flippedColor = '#abc';
        const b = await definitionRecord(def);
        expect(b.key).not.toBe(a.key); expect(b.gameKey).toBe(a.gameKey);
    });
    it('translates annotations with staged geometry and includes visible holes in framing', () => {
        const def = createDailyPuzzle('2026-01-01');
        const staged = stagePieces(def);
        const [dx, dy] = staged.offset;
        expect(staged.def.container.holes).toEqual(def.container.holes.map(([x,y]) => [x+dx,y+dy]));
        expect(staged.def.container.labels[0].cell).toEqual(def.container.labels[0].cell.map((v,i) => v+staged.offset[i]));
        const camera = createCamera(def, { width: 390, height: 740 }, openingState(def, { width: 390, height: 740 }));
        expect(camera.initial.x).toBe((Math.min(...boardCells(def).map(c => c[0])) + Math.max(...boardCells(def).map(c => c[0]))+1)/2);
    });
    it('rejects unknown required capabilities', async () => {
        const def = createDailyPuzzle('2026-01-01'); def.requiredFeatures.push('unsupported-calendar-rule');
        await expect(inspectContent(def)).rejects.toThrow(/unsupported/);
    });
});
