// Daily content is derived locally, never installed as a collection. Keep the
// revision and starting faces stable: date + rule + definition key own progress.
import inventory from './calendar-pieces.json' with { type: 'json' };
import { flipH } from '../core/geometry.js';
import { stagePieces } from '../core/puzzle.js';

export const CALENDAR_YEAR = 2026;
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const pad = n => String(n).padStart(2, '0');
export function localDate(now = new Date()) {
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
export function parseDate(date) {
    const match = typeof date === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!match) return null;
    const [year, month, day] = match.slice(1).map(Number);
    if (year !== CALENDAR_YEAR || month < 1 || month > 12 || day < 1 || day > daysInMonth(month)) return null;
    return { year, month, day };
}
export function daysInMonth(month) { return new Date(Date.UTC(CALENDAR_YEAR, month, 0)).getUTCDate(); }
export function dailyId(date, allowFlip) { return `daily-calendar-${date}-${allowFlip ? 'flippable' : 'fixed'}`; }
export function parseDailyId(id) {
    const match = /^daily-calendar-(\d{4}-\d{2}-\d{2})-(fixed|flippable)$/.exec(id ?? '');
    return match && parseDate(match[1]) ? { date: match[1], allowFlip: match[2] === 'flippable' } : null;
}
export function dateTitle(date) {
    const value = parseDate(date);
    return value ? `${MONTHS[value.month - 1]} ${value.day}, ${value.year}` : date;
}
export function createDailyPuzzle(date, allowFlip = false) {
    const value = parseDate(date);
    if (!value || typeof allowFlip !== 'boolean') throw new Error('Daily calendar puzzles are available for valid dates in 2026.');
    const monthIndex = value.month - 1, dayIndex = value.day - 1;
    const holes = [[monthIndex % 6, Math.floor(monthIndex / 6)], [dayIndex % 7, 2 + Math.floor(dayIndex / 7)]];
    const all = [], labels = [];
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        if (y < 2 && x === 6) continue;
        const cell = [x, y]; all.push(cell);
        const number = (y - 2) * 7 + x + 1;
        const text = y < 2 ? SHORT_MONTHS[y * 6 + x] : number <= 31 ? String(number) : null;
        if (text) labels.push({ cell, text });
    }
    const blocked = new Set(holes.map(c => c.join(',')));
    const def = {
        schemaVersion: 1,
        requiredFeatures: ['board-labels', 'visible-holes'],
        id: dailyId(date, allowFlip), type: 'square-grid-packing',
        meta: { name: `${dateTitle(date)} · ${allowFlip ? 'Flips allowed' : 'No flips'}`, author: 'Pakke',
            description: `Leave ${SHORT_MONTHS[monthIndex]} and ${value.day} uncovered. Fit every piece into the remaining squares.` },
        container: { cells: all.filter(c => !blocked.has(c.join(','))), holes, labels },
        rules: { allowRotation: true, allowFlip, completion: 'all-pieces-contained' },
        // The saved research artifact stores side A. Both modes start on side B.
        pieces: inventory.pieces.map(p => ({ id: p.id.toLowerCase(), cells: flipH(p.cells),
            start: { x: 0, y: 0, rotation: 0, flipped: false }, locked: false })),
        presentation: { fieldRotation: 0 }
    };
    return stagePieces(def).def;
}

/** Status by date/rule, using ordinary revision-aware attempts. */
export function dailyStatuses(state) {
    const statuses = new Map();
    for (const record of Object.values(state.definitions)) {
        const info = parseDailyId(record.def.id), saved = state.progress[record.gameKey];
        if (!info || !saved || saved.context !== 'daily') continue;
        const key = dailyId(info.date, info.allowFlip), old = statuses.get(key);
        if (saved.solved || old !== 'completed') statuses.set(key, saved.solved ? 'completed' : 'attempted');
    }
    return statuses;
}
