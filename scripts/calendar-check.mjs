// Design study only: not a bundled puzzle or an extension to the player schema.
// Prove existence for every valid leap-year date and validate saved witnesses
// by reconstructing their occupied cells independently of the solver search.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { bounds, cellKey, isConnected, normalise, orient } from '../src/core/geometry.js';
import { canonicalKey, shapeMultiset } from '../src/core/shapes.js';
import { countSolutions } from '../src/core/solver.js';

const directory = new URL('../plans/calendar/', import.meta.url);
const definition = JSON.parse(await readFile(new URL('board-pieces.json', directory), 'utf8'));
const { board, pieces, rules } = definition;
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const lengths = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const allCells = Array.from({ length: 49 }, (_,i) => [i % 7, Math.floor(i / 7)]);
const dates = lengths.flatMap((length, index) => Array.from({ length }, (_,i) => ({ month: index + 1, day: i + 1 })));
const keyOfDate = ({ month, day }) => `${month}-${day}`;
const uncovered = ({ month, day }) => [
    [(month - 1) % 6, Math.floor((month - 1) / 6)],
    [(day - 1) % 7, 2 + Math.floor((day - 1) / 7)]
];
const shapeKey = (cells) => canonicalKey(cells, rules);

function validateDefinition() {
    assert.equal(board.width, 7);
    assert.equal(board.height, 7);
    assert.deepEqual(board.labels, [
        [...months.slice(0, 6), null], [...months.slice(6), null],
        ...Array.from({ length: 5 }, (_,row) => Array.from({ length: 7 }, (_,x) => {
            const day = row * 7 + x + 1;
            return day <= 31 ? day : null;
        }))
    ]);
    assert.deepEqual(rules, { allowRotation: true, allowFlip: true });
    assert.equal(pieces.length, 10);
    assert.equal(new Set(pieces.map(({ id }) => id)).size, 10);
    assert.equal(pieces.filter(({ cells }) => cells.length === 4).length, 3);
    assert.equal(pieces.filter(({ cells }) => cells.length === 5).length, 7);
    assert.equal(pieces.reduce((sum, { cells }) => sum + cells.length, 0), 47);
    assert.equal(new Set(pieces.map(({ cells }) => shapeKey(cells))).size, 10);
    for (const { id, cells } of pieces) {
        assert.ok(isConnected(cells), `${id} must be connected`);
        assert.equal(new Set(cells.map(([x,y]) => cellKey(x,y))).size, cells.length);
        assert.ok(cells.every(([x,y]) => Number.isInteger(x) && Number.isInteger(y)));
        assert.deepEqual(cells, normalise(cells));
    }
}

function validateWitnesses(witnesses) {
    assert.equal(witnesses.length, 366);
    const expectedDates = new Set(dates.map(keyOfDate));
    for (const witness of witnesses) {
        const date = keyOfDate(witness);
        assert.ok(expectedDates.delete(date), `Invalid or duplicate date ${date}`);
        assert.deepEqual(witness.uncovered, uncovered(witness));
        const holes = new Set(witness.uncovered.map(([x,y]) => cellKey(x,y)));
        const occupied = new Set();
        const remaining = new Map(pieces.map((piece) => [piece.id, piece]));
        assert.equal(witness.placements.length, pieces.length);
        for (const { id, x, y, rotation, flipped } of witness.placements) {
            const piece = remaining.get(id);
            assert.ok(piece, `${date}: unexpected or repeated piece ${id}`);
            remaining.delete(id);
            assert.ok(Number.isInteger(x) && Number.isInteger(y));
            assert.ok(Number.isInteger(rotation) && rotation >= 0 && rotation < 4);
            assert.equal(typeof flipped, 'boolean');
            for (const [px,py] of orient(piece.cells, rotation, flipped)) {
                const cx = x + px, cy = y + py, key = cellKey(cx,cy);
                assert.ok(cx >= 0 && cx < 7 && cy >= 0 && cy < 7, `${date}: outside board`);
                assert.ok(!holes.has(key), `${date}: covered date cell`);
                assert.ok(!occupied.has(key), `${date}: overlap`);
                occupied.add(key);
            }
        }
        assert.equal(remaining.size, 0);
        assert.equal(occupied.size, 47);
        assert.deepEqual(allCells.filter(([x,y]) => !occupied.has(cellKey(x,y))), witness.uncovered);
    }
    assert.equal(expectedDates.size, 0);
}

function placementFor(cells) {
    const piece = pieces.find((candidate) => shapeKey(candidate.cells) === shapeKey(cells));
    assert.ok(piece);
    const target = JSON.stringify(normalise(cells));
    const { minX: x, minY: y } = bounds(cells);
    for (const flipped of [false, true]) {
        for (let rotation = 0; rotation < 4; rotation++) {
            if (JSON.stringify(orient(piece.cells, rotation, flipped)) === target) {
                return { id: piece.id, x, y, rotation, flipped };
            }
        }
    }
    throw new Error(`Cannot orient ${piece.id}`);
}

const colors = ['#d20f39', '#40a02b', '#df8e1d', '#1e66f5', '#ea76cb', '#179299'];
const text = (x, y, value, size = 18, attributes = '') =>
    `<text x="${x}" y="${y}" font-size="${size}" ${attributes}>${value}</text>`;
function silhouette(cells, x, y, pitch, color) {
    const keys = new Set(cells.map(([cx,cy]) => cellKey(cx,cy)));
    let paths = '';
    const edges = [[0,-1,0,0,1,0], [1,0,1,0,1,1], [0,1,1,1,0,1], [-1,0,0,1,0,0]];
    for (const [cx,cy] of cells) {
        for (const [dx,dy,x1,y1,x2,y2] of edges) {
            if (!keys.has(cellKey(cx+dx,cy+dy))) {
                paths += `M${x+(cx+x1)*pitch},${y+(cy+y1)*pitch}L${x+(cx+x2)*pitch},${y+(cy+y2)*pitch}`;
            }
        }
    }
    return `<g>${cells.map(([cx,cy]) => `<rect x="${x+cx*pitch}" y="${y+cy*pitch}" width="${pitch}" height="${pitch}" fill="${color}" stroke="${color}" stroke-width="1"/>`).join('')}<path d="${paths}" fill="none" stroke="#eff1f5" stroke-width="3" stroke-linejoin="round"/></g>`;
}
function drawBoard(x, y, pitch, solution = null) {
    let svg = `<rect x="${x}" y="${y}" width="${7*pitch}" height="${7*pitch}" rx="9" fill="#ccd0da"/>`;
    for (const [cx,cy] of allCells) {
        svg += `<rect x="${x+cx*pitch}" y="${y+cy*pitch}" width="${pitch}" height="${pitch}" fill="none" stroke="#bcc0cc" stroke-width="1"/>`;
    }
    if (solution) {
        for (const placement of solution.placements) {
            const index = pieces.findIndex(({ id }) => id === placement.id);
            const cells = orient(pieces[index].cells, placement.rotation, placement.flipped);
            svg += silhouette(cells, x + placement.x * pitch, y + placement.y * pitch, pitch, colors[index % colors.length]);
            const [cx,cy] = cells[0];
            svg += text(x+(placement.x+cx+0.5)*pitch, y+(placement.y+cy+0.5)*pitch, placement.id, 14, 'fill="white" text-anchor="middle" dominant-baseline="middle" font-weight="700"');
        }
    }
    for (const [cx,cy] of allCells) {
        const label = board.labels[cy][cx];
        if (label === null || (solution && !solution.uncovered.some(([hx,hy]) => hx === cx && hy === cy))) continue;
        svg += text(x+(cx+0.5)*pitch, y+(cy+0.5)*pitch, label, 18, 'text-anchor="middle" dominant-baseline="middle" font-weight="600"');
    }
    return svg;
}
function wrapSvg(width, height, title, body) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title"><title id="title">${title}</title><rect width="100%" height="100%" fill="#eff1f5"/><g font-family="ui-rounded, system-ui, sans-serif" fill="#4c4f69">${body}</g></svg>\n`;
}
function overviewSvg() {
    let svg = text(40, 48, 'Calendar puzzle · board and pieces', 28, 'font-weight="700"');
    svg += text(40, 80, '7 × 7 board · 47 covered squares · all 366 dates verified', 17);
    svg += drawBoard(40, 112, 54);
    svg += text(40, 528, 'Blank squares are usable and covered in every solution.', 16);
    pieces.forEach((piece, index) => {
        const x = 466 + (index % 5) * 110;
        const y = 112 + Math.floor(index / 5) * 185;
        svg += text(x, y+20, piece.id, 18, 'font-weight="600"');
        svg += silhouette(piece.cells, x, y+38, 24, colors[index % colors.length]);
    });
    svg += text(466, 493, '3 tetrominoes + 7 pentominoes = 47 squares', 17);
    svg += text(466, 528, 'Rotations and flips allowed · ten distinct shapes', 16);
    return wrapSvg(1030, 560, 'Calendar board and ten polyomino pieces', svg);
}

validateDefinition();
const write = process.argv.includes('--write');
assert.ok(process.argv.slice(2).every((arg) => arg === '--write'), 'Usage: node scripts/calendar-check.mjs [--write]');
if (!write) {
    const saved = JSON.parse(await readFile(new URL('solutions.json', directory), 'utf8'));
    assert.equal(saved.boardId, definition.id);
    validateWitnesses(saved.solutions);
}
const shapes = shapeMultiset(pieces, rules);
const witnesses = [];
let nodes = 0;
const start = performance.now();
for (const date of dates) {
    const holes = uncovered(date);
    const holeKeys = new Set(holes.map(([x,y]) => cellKey(x,y)));
    const region = allCells.filter(([x,y]) => !holeKeys.has(cellKey(x,y)));
    const result = countSolutions(region, shapes, rules, { cap: 1, nodeBudget: 2_000_000 });
    assert.equal(result.orbits, 1, `${keyOfDate(date)}: ${result.exhausted ? 'no solution' : 'search budget reached'}`);
    nodes += result.nodes;
    witnesses.push({ ...date, uncovered: holes, placements: result.solutions[0].pieces.map(placementFor) });
}
validateWitnesses(witnesses);
if (write) {
    const serialized = witnesses.map((witness) => `    ${JSON.stringify(witness)}`).join(',\n');
    await writeFile(new URL('solutions.json', directory), `{"boardId":"${definition.id}","solutions":[\n${serialized}\n]}\n`);
    await writeFile(new URL('board-pieces.svg', directory), overviewSvg());
    const leapDay = witnesses.find(({ month, day }) => month === 2 && day === 29);
    await writeFile(new URL('feb-29.svg', directory), wrapSvg(458, 510, 'Verified solution for February 29',
        text(40, 48, 'February 29', 28, 'font-weight="700"') +
        text(40, 80, 'One of 366 verified arrangements', 17) + drawBoard(40,112,54,leapDay)));
}
console.log(`Verified 366/366 dates, including Feb 29; ten distinct pieces, 47 cells, no overlaps.`);
console.log(`Fresh search: ${nodes.toLocaleString('en-US')} nodes, ${Math.round(performance.now()-start)} ms. ${write ? 'Wrote' : 'Checked saved and fresh'} witnesses.`);
