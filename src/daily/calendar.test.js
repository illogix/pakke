import { describe, expect, it } from 'vitest';
import witnesses from './calendar-witnesses.test.json';
import { createDailyPuzzle, dailyId, dailyStatuses, localDate, parseDate, parseDailyId } from './calendar.js';
import { createState, setPlacement } from '../core/state.js';
import { boardCells, placedCells, slack } from '../core/puzzle.js';
import { validatePuzzle } from '../core/validate.js';
import { isSolved } from '../core/completion.js';
import { backupFile, continuation, emptyLibrary, saveAttempt, validateBackup, applyRestore, previewRestore, collections } from '../library/model.js';
import { definitionRecord, inspectContent } from '../library/format.js';

function solvedState(def, placements) {
    const [dx, dy] = def.container.labels.find(l => l.text === 'Jan').cell;
    return { placements: Object.fromEntries(placements.map(p => [p.id.toLowerCase(), {
        x: p.x + dx, y: p.y + dy, rotation: p.rotation, flipped: !p.flipped
    }])) };
}

describe('daily calendar content', () => {
    it('uses local dates, rejects unsupported years and invalid days', () => {
        expect(localDate(new Date(2026, 9, 5, 23, 59))).toBe('2026-10-05');
        for (const date of ['2026-02-29', '2026-04-31', '2025-01-01', '2027-01-01', '2026-13-01', '2026-1-1', null]) expect(parseDate(date)).toBeNull();
        expect(parseDailyId(dailyId('2026-01-01', true))).toEqual({ date: '2026-01-01', allowFlip: true });
        expect(() => createDailyPuzzle('2026-02-29')).toThrow(/2026/);
    });
    it('retains the trimmed board, four blank playable squares, and two labeled holes', async () => {
        const def = createDailyPuzzle('2026-10-05');
        expect(def.container.cells).toHaveLength(45);
        expect(boardCells(def)).toHaveLength(47);
        expect(def.container.labels).toHaveLength(43);
        expect(slack(def)).toBe(0);
        const holes = new Set(def.container.holes.map(c => c.join(',')));
        expect(def.container.labels.filter(l => holes.has(l.cell.join(','))).map(l => l.text)).toEqual(['Oct', '5']);
        expect(def.pieces.every(p => !p.color && !p.flippedColor && !p.start.flipped)).toBe(true);
        expect((await inspectContent(def)).warnings).toEqual([]);
        expect(createDailyPuzzle('2026-10-05')).toEqual(def);
    });
    it('independently validates saved research witnesses against all 730 emitted puzzles', () => {
        expect(witnesses).toHaveLength(365);
        for (const day of witnesses) for (const allowFlip of [false, true]) {
            const def = createDailyPuzzle(day.date, allowFlip), witness = solvedState(def, day[allowFlip ? 'flippable' : 'fixed']);
            expect(validatePuzzle(def).errors, day.date).toEqual([]);
            let state = createState(def);
            for (const [id, placement] of Object.entries(witness.placements)) state = setPlacement(def, state, id, placement);
            expect(isSolved(def, state), `${day.date} ${allowFlip}`).toBe(true);
            const covered = def.pieces.flatMap(p => placedCells(p, state.placements[p.id])).map(c => c.join(','));
            expect(new Set(covered).size).toBe(45);
            expect(def.container.holes.some(c => covered.includes(c.join(',')))).toBe(false);
        }
    });
    it('saves modes independently, resumes outside collections, and restores both via backups', async () => {
        const fixed = await definitionRecord(createDailyPuzzle('2026-01-01')), free = await definitionRecord(createDailyPuzzle('2026-01-01', true));
        let state = emptyLibrary(); state.definitions = { [fixed.key]: fixed, [free.key]: free };
        state.preferences['daily-allow-flip'] = true; state.preferences['generator-allow-flip'] = false;
        state = saveAttempt(state, fixed.key, solvedState(fixed.def, witnesses[0].fixed), 'daily', 1);
        state = saveAttempt(state, free.key, createState(free.def), 'daily', 2);
        expect(dailyStatuses(state).get(fixed.def.id)).toBe('completed');
        expect(dailyStatuses(state).get(free.def.id)).toBe('attempted');
        expect(continuation(state).key).toBe(free.key);
        expect(collections(state)).toEqual([]);
        const restored = applyRestore(emptyLibrary(), previewRestore(emptyLibrary(), await validateBackup(backupFile(state))));
        expect(restored.progress).toEqual(state.progress);
        state = saveAttempt(state, fixed.key, createState(fixed.def), 'daily', 3);
        expect(dailyStatuses(state).get(fixed.def.id)).toBe('completed');
        expect(dailyStatuses({ ...state, progress: {} }).size).toBe(0);
    });
});
