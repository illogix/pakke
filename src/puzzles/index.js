// Identity and order are independent: this manifest is the authored sequence.
import first from './first-fit.json';
import turn from './little-turn.json';
import flip from './other-side.json';
import demo from './demo01.json';
import pent from './pent01.json';

export const bundledPacks = [
    { packVersion: 1, pack: { id: 'first-steps', name: 'First steps', author: 'Pakke', revision: 1,
        description: 'A gentle introduction. Make room, take a turn, and see the other side.' }, puzzles: [first, turn, flip, demo] },
    { packVersion: 1, pack: { id: 'classics', name: 'Room to think', author: 'Traditional puzzles', revision: 1,
        description: 'Settle in with a larger packing challenge.' }, puzzles: [pent] }
];
export const puzzles = bundledPacks.flatMap(pack => pack.puzzles);
export const puzzleById = id => puzzles.find(def => def.id === id);
// Compatibility helper: never crosses a collection boundary.
export function nextPuzzle(id, packId) {
    const pack = bundledPacks.find(p => packId ? p.pack.id === packId : p.puzzles.some(d => d.id === id));
    const index = pack?.puzzles.findIndex(d => d.id === id) ?? -1;
    return index < 0 ? null : pack.puzzles[index + 1] || null;
}
