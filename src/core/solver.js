// Exact-cover solver for square-grid packing. Pure — no Phaser, no DOM — so it
// runs under Vitest and inside a Web Worker alike.
//
// The search is plain backtracking with the bookkeeping dancing links keeps:
// every cell knows how many legal placements still cover it, and each step
// takes the cell with the fewest, so dead ends surface as soon as a cell has
// none and forced moves cost no branching. A connectivity check after every
// placement rejects boards whose free cells have split into islands no
// combination of the remaining shapes can fill.
//
// Solutions are counted up to the tray's own symmetry: two tilings that differ
// only by rotating or reflecting the whole board are one solution, reflections
// included whether or not the rules allow pieces to flip. The search stops at
// `cap` distinct solutions, so uniqueness costs an exhaustive run only when the
// puzzle is in fact unique.

import { bounds, cellKey, orient, sortCells } from './geometry.js';
import { shapeMultiset } from './shapes.js';

const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Index a set of tray cells: row-major order, a key → index map, orthogonal
 * neighbours per cell, and the board symmetries as index permutations.
 */
export function createRegion(cells) {
    const sorted = sortCells(cells);
    const index = new Map(sorted.map(([x, y], i) => [cellKey(x, y), i]));
    const neighbours = sorted.map(([x, y]) =>
        STEPS.map(([dx, dy]) => index.get(cellKey(x + dx, y + dy))).filter((i) => i !== undefined)
    );

    return { cells: sorted, index, n: sorted.length, neighbours, symmetries: regionSymmetries(sorted, index) };
}

/**
 * The transforms in the dihedral group of the square that map the cell set to
 * itself. Each is returned with the permutation of cell indices it induces.
 */
export function regionSymmetries(cells, index = null) {
    const sorted = index ? cells : sortCells(cells);
    const lookup = index ?? new Map(sorted.map(([x, y], i) => [cellKey(x, y), i]));
    const out = [];

    for (const flipped of [false, true]) {
        for (let rotation = 0; rotation < 4; rotation++) {
            const moved = sorted.map(([x, y]) => {
                let px = flipped ? -x : x;
                let py = y;

                for (let i = 0; i < rotation; i++) [px, py] = [-py, px];

                return [px, py];
            });
            const from = bounds(moved);
            const to = bounds(sorted);
            const dx = to.minX - from.minX;
            const dy = to.minY - from.minY;
            const perm = new Int32Array(sorted.length);
            let ok = true;

            for (let i = 0; i < moved.length && ok; i++) {
                const target = lookup.get(cellKey(moved[i][0] + dx, moved[i][1] + dy));

                if (target === undefined) ok = false;
                else perm[i] = target;
            }

            if (ok) out.push({ rotation, flipped, perm });
        }
    }

    return out;
}

/**
 * Canonical string for a solution (a list of cell-index lists) under the
 * region's symmetries: the smallest rendering over every symmetric image.
 */
export function solutionKey(region, pieces) {
    let best = null;

    for (const { perm } of region.symmetries) {
        const rendered = pieces
            .map((piece) => Array.from(piece, (i) => perm[i]).sort((a, b) => a - b).join(','))
            .sort()
            .join('|');

        if (best === null || rendered < best) best = rendered;
    }

    return best;
}

/** Cell indices of a piece given in region coordinates. */
export function indexPiece(region, cells) {
    return cells.map(([x, y]) => {
        const i = region.index.get(cellKey(x, y));

        if (i === undefined) throw new Error(`cell ${cellKey(x, y)} is not in the region`);

        return i;
    });
}

/**
 * Every way each shape fits in the region. Placements are grouped by their
 * anchor: the first of their cells in row-major order. Each carries a bitmask
 * over region cells (`words` 32-bit words per placement, flat in `masks`).
 */
function buildPlacements(region, shapes) {
    const words = Math.ceil(region.n / 32);
    const cellLists = [];
    const shapeOf = [];
    const anchored = Array.from({ length: region.n }, () => []);

    for (let s = 0; s < shapes.length; s++) {
        for (const oriented of shapes[s].orientations) {
            const [ox, oy] = oriented[0];

            // Anchor the shape's first cell on every region cell. Both lists are
            // row-major, so that cell is also the placement's first region index,
            // and each fit is enumerated exactly once, whether or not the
            // shape's bounding corner is one of its cells.
            for (let c = 0; c < region.n; c++) {
                const [cx, cy] = region.cells[c];
                const indices = [];

                for (const [x, y] of oriented) {
                    const i = region.index.get(cellKey(x - ox + cx, y - oy + cy));

                    if (i === undefined) break;
                    indices.push(i);
                }

                if (indices.length !== oriented.length) continue;

                anchored[c].push(cellLists.length);
                cellLists.push(indices);
                shapeOf.push(s);
            }
        }
    }

    const masks = new Uint32Array(cellLists.length * words);

    cellLists.forEach((indices, p) => {
        for (const i of indices) masks[p * words + (i >> 5)] |= 1 << (i & 31);
    });

    return { count: cellLists.length, words, cellLists, shapeOf: Int32Array.from(shapeOf), anchored, masks };
}

/**
 * Placements of one shape to rule out so that the board's symmetries cannot
 * produce the same tiling several times over. A shape that appears once and
 * is fixed by no symmetry of the board (no symmetry maps any of its placements
 * onto itself) may be restricted to one placement per symmetry orbit: every
 * solution orbit still has a representative, and the tree shrinks by up to the
 * size of the symmetry group. Returns the set of placement ids to drop.
 */
function symmetryBreakingDrops(region, shapes, table) {
    const drops = new Set();

    if (region.symmetries.length < 2) return drops;

    const candidates = shapes
        .map((shape, s) => ({ shape, s }))
        .filter(({ shape }) => shape.count === 1)
        .sort((a, b) => b.shape.orientations.length - a.shape.orientations.length || b.shape.size - a.shape.size);
    const identity = region.symmetries[0].perm;

    for (const { s } of candidates) {
        let free = true;

        drops.clear();

        for (let p = 0; p < table.count && free; p++) {
            if (table.shapeOf[p] !== s) continue;

            const own = [...table.cellLists[p]].sort((a, b) => a - b).join(',');

            for (const { perm } of region.symmetries) {
                const image = table.cellLists[p].map((i) => perm[i]).sort((a, b) => a - b).join(',');

                if (image === own && perm !== identity) free = false;
                if (image < own) drops.add(p);
            }
        }

        if (free) return drops;
    }

    drops.clear();

    return drops;
}

/**
 * Count solutions of tiling `region` with the shape multiset exactly.
 *
 * Returns `{ orbits, exhausted, nodes, solutions }`: the number of distinct
 * solutions found (at most `cap`), whether the search finished rather than
 * stopping at the cap or the node budget, the nodes visited, and one
 * representative per orbit as `{ pieces: [[x, y], ...][], key }`.
 *
 * Options: `cap` (default 2), `nodeBudget`, `prune` (island check, default
 * on), `breakSymmetry` (default on).
 */
export function countSolutions(regionOrCells, shapes, rules = {}, options = {}) {
    const region = Array.isArray(regionOrCells) ? createRegion(regionOrCells) : regionOrCells;
    const cap = options.cap ?? 2;
    const nodeBudget = options.nodeBudget ?? Infinity;
    const prune = options.prune !== false;
    const area = shapes.reduce((sum, shape) => sum + shape.size * shape.count, 0);

    if (area !== region.n) {
        throw new Error(`solver needs an exact fit: ${area} piece cells for ${region.n} tray cells`);
    }

    const table = buildPlacements(region, shapes);
    const { words, cellLists, shapeOf, masks } = table;
    // Placement pruning needs transformations that preserve every allowed shape.
    // Counting may still merge two legal solutions related by a board reflection,
    // but pruning against an illegal mirrored placement can remove every solution.
    const pruningRegion = { ...region, symmetries: region.symmetries.filter(sym =>
        (rules.allowRotation !== false || sym.rotation === 0) && (rules.allowFlip === true || !sym.flipped)) };
    const drops = options.breakSymmetry === false ? new Set() : symmetryBreakingDrops(pruningRegion, shapes, table);
    const anchored = table.anchored.map((list) => Int32Array.from(list.filter((p) => !drops.has(p))));
    const sizeOf = Int32Array.from(cellLists, (list) => list.length);
    const n = region.n;
    const occupied = new Uint32Array(words);
    const remaining = Int32Array.from(shapes, (shape) => shape.count);
    const chosen = [];
    const found = new Map();
    // Flat neighbour table for the island check.
    const neighbourAt = new Int32Array(n + 1);

    for (let i = 0; i < n; i++) neighbourAt[i + 1] = neighbourAt[i] + region.neighbours[i].length;

    const neighbours = Int32Array.from(region.neighbours.flat());
    const achievable = new Uint8Array(n + 1);
    const stamp = new Int32Array(n);
    const queue = new Int32Array(n);
    let free = n;
    let nodes = 0;
    let aborted = false;
    let stamped = 0;

    const isFree = (i) => (occupied[i >> 5] & (1 << (i & 31))) === 0;

    /** Sizes a sub-multiset of the remaining shapes can add up to. */
    function computeAchievable() {
        achievable.fill(0, 0, free + 1);
        achievable[0] = 1;

        for (let s = 0; s < shapes.length; s++) {
            const size = shapes[s].size;

            for (let k = 0; k < remaining[s]; k++) {
                for (let sum = free; sum >= size; sum--) {
                    if (achievable[sum - size]) achievable[sum] = 1;
                }
            }
        }
    }

    /**
     * Every island of free cells must be fillable by some of the remaining
     * shapes. One island always is (it is exactly the remaining area), so the
     * subset sums are only computed once the free cells have split.
     */
    function islandsFillable() {
        stamped++;

        let islands = 0;

        for (let start = 0; start < n; start++) {
            if (!isFree(start) || stamp[start] === stamped) continue;

            let head = 0;
            let tail = 0;

            queue[tail++] = start;
            stamp[start] = stamped;

            while (head < tail) {
                const c = queue[head++];

                for (let k = neighbourAt[c]; k < neighbourAt[c + 1]; k++) {
                    const d = neighbours[k];

                    if (isFree(d) && stamp[d] !== stamped) {
                        stamp[d] = stamped;
                        queue[tail++] = d;
                    }
                }
            }

            if (tail === free) return true;
            if (islands++ === 0) computeAchievable();
            if (!achievable[tail]) return false;
        }

        return true;
    }

    function record() {
        const pieces = chosen.map((p) => cellLists[p]);
        const key = solutionKey(region, pieces);

        if (!found.has(key)) {
            found.set(key, {
                key,
                pieces: pieces.map((piece) => sortCells(piece.map((i) => region.cells[i])))
            });
        }
    }

    /** Returns true to stop: the cap or the budget has been reached. */
    function search() {
        if (++nodes > nodeBudget) {
            aborted = true;

            return true;
        }

        if (free === 0) {
            record();

            return found.size >= cap;
        }

        // The first free cell in row-major order must be covered by a placement
        // anchored there: any other placement covering it would also cover an
        // earlier cell, which is already taken.
        let cell = -1;

        for (let w = 0; w < words && cell < 0; w++) {
            const open = ~occupied[w] >>> 0;

            if (open !== 0) cell = w * 32 + 31 - Math.clz32(open & -open);
        }

        const list = anchored[cell];

        for (let k = 0; k < list.length; k++) {
            const p = list[k];
            const s = shapeOf[p];

            if (remaining[s] === 0) continue;

            const base = p * words;
            let fits = true;

            for (let w = 0; w < words; w++) {
                if ((occupied[w] & masks[base + w]) !== 0) {
                    fits = false;
                    break;
                }
            }

            if (!fits) continue;

            for (let w = 0; w < words; w++) occupied[w] |= masks[base + w];
            remaining[s]--;
            free -= sizeOf[p];
            chosen.push(p);

            const stop = (!prune || islandsFillable()) && search();

            chosen.pop();
            free += sizeOf[p];
            remaining[s]++;
            for (let w = 0; w < words; w++) occupied[w] &= ~masks[base + w];

            if (stop) return true;
        }

        return false;
    }

    search();

    return {
        orbits: found.size,
        exhausted: !aborted && found.size < cap,
        nodes,
        solutions: [...found.values()]
    };
}

/**
 * Solve a puzzle definition as written: locked pieces are fixed in place and
 * removed from the tray, and the rest must tile what is left exactly.
 */
export function analyseDef(def, options = {}) {
    const lockedCells = new Set();

    for (const piece of def.pieces) {
        if (!piece.locked) continue;

        const dx = piece.start.x;
        const dy = piece.start.y;

        for (const [x, y] of orient(piece.cells, piece.start.rotation, piece.start.flipped)) {
            lockedCells.add(cellKey(x + dx, y + dy));
        }
    }

    const cells = def.container.cells.filter(([x, y]) => !lockedCells.has(cellKey(x, y)));
    const shapes = shapeMultiset(def.pieces.filter((piece) => !piece.locked), def.rules);

    const region = createRegion(cells);
    // Labeled board squares have fixed meaning; count on that fixed board.
    if (def.container.labels?.length) region.symmetries = region.symmetries.filter(s => s.rotation === 0 && !s.flipped);
    return countSolutions(region, shapes, def.rules, options);
}
