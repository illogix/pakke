// Generate a packing puzzle with exactly one solution, on the device, from a
// seed. Pure — no Phaser, no DOM — so it runs in a Web Worker or under Vitest.
//
// The approach constructs uniqueness rather than gambling on it: carve the tray
// into random pieces (that carving is the solution), ask the solver whether a
// different tiling exists, and if one does, glue two neighbouring pieces
// together and ask again. Merging can only remove solutions, so the loop ends
// with one piece at the very worst; in practice a handful of merges suffices.
// Pieces may not grow past a size cap, though, so a carving that needs a bigger
// piece to become unique is thrown away and the tray carved afresh.

import { bounds, cellKey, isConnected, normalise, orient, translate } from './geometry.js';
import { deriveField } from './puzzle.js';
import { validatePuzzle } from './validate.js';
import { createRandom } from './random.js';
import { shapeMultiset } from './shapes.js';
import { countSolutions, createRegion, indexPiece, solutionKey } from './solver.js';
import { randomPartition } from './partition.js';

export const GENERATOR_LIMITS = Object.freeze({
    minSize: 3,
    /** 81 cells: proven unique in well under a second in Node, a few seconds on an older phone. */
    maxSize: 9,
    defaultWidth: 6,
    defaultHeight: 6,
    /** Initial carving sizes. Smaller pieces tile too many ways and merge away anyway. */
    minPiece: 5,
    maxPiece: 6,
    /**
     * Hard cap on piece size: this share of the tray, clamped to
     * [minPieceCap, maxPieceCells]. One piece covering half the tray makes the
     * solve trivial, so a carving that cannot reach uniqueness under the cap is
     * discarded and the tray carved again.
     */
    pieceShare: 0.25,
    minPieceCap: 5,
    maxPieceCells: 14,
    /** Fresh carvings tried before giving up (the deadline usually ends it first). */
    maxCarves: 400,
    /** Pieces above this size are split again after uniqueness is reached, when that keeps it. */
    maxMergedPiece: 10,
    /** Random two-way splits tried per oversized piece. */
    splitTries: 4,
    /** Search nodes per uniqueness check before it is treated as unproven. */
    nodeBudget: 150000,
    deadlineMs: 6000
});

export const GENERATED_RULES = Object.freeze({
    allowRotation: true,
    allowFlip: true,
    completion: 'all-pieces-contained'
});

const PALETTE = [
    '#629daf', '#dbad51', '#6bbf59', '#e2574c', '#8a6cd1',
    '#e8833a', '#43b3a0', '#dd6693', '#5a7fd0', '#b5c94f'
];

const MARGIN = 2;

const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Generate a puzzle. `options.createdAt` (epoch ms, default now) names it by
 * local date and time. Returns `{ ok: true, def, solution, stats }` or
 * `{ ok: false, reason: 'timeout', stats }`. The solution is for tests and the
 * UI; it is deliberately not part of the emitted definition.
 *
 * `hooks.now` replaces the clock and `hooks.onProgress` receives
 * `{ pieces, merges, nodes }` after every solver run.
 */
export function generatePuzzle(options = {}, hooks = {}) {
    const limits = { ...GENERATOR_LIMITS, ...options };
    const now = hooks.now ?? (() => Date.now());
    const onProgress = hooks.onProgress ?? (() => {});
    const width = clampSize(options.width ?? limits.defaultWidth, limits);
    const height = clampSize(options.height ?? limits.defaultHeight, limits);
    const seed = (options.seed ?? Math.floor(Math.random() * 4294967296)) >>> 0;
    const random = createRandom(seed);
    const started = now();
    const deadline = started + limits.deadlineMs;
    const cells = rectangle(width, height);
    const region = createRegion(cells);
    const stats = { pieces: 0, merges: 0, splits: 0, carves: 0, nodes: 0, ms: 0 };
    const clock = { now, deadline, onProgress, stats };
    const cap = pieceCap(width, height, limits);
    let pieces = uniquePartition(region, random, { ...limits, cap }, clock);

    if (pieces) pieces = refine(region, pieces, random, { ...limits, cap }, clock);

    stats.ms = now() - started;

    if (!pieces) return { ok: false, reason: 'timeout', stats };

    const { def, solution } = emit(pieces, { width, height, seed, createdAt: options.createdAt ?? Date.now() }, random);
    const errors = validatePuzzle(def).errors;

    if (errors.length) throw new Error(`generated an invalid puzzle: ${errors.join('; ')}`);

    stats.pieces = def.pieces.length;

    return { ok: true, def, solution, stats };
}

/** The largest piece allowed on a board of this size. */
export function pieceCap(width, height, limits = GENERATOR_LIMITS) {
    return Math.min(limits.maxPieceCells, Math.max(limits.minPieceCap, Math.round(width * height * limits.pieceShare)));
}

function clampSize(value, limits) {
    const n = Number.isInteger(value) ? value : limits.defaultWidth;

    return Math.min(limits.maxSize, Math.max(limits.minSize, n));
}

function rectangle(width, height) {
    const cells = [];

    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) cells.push([x, y]);

    return cells;
}

/**
 * Carve the region and merge pieces until the solver proves the tiling unique,
 * never growing a piece past `limits.cap`. When no merge fits under the cap the
 * carving is abandoned for a fresh one. Returns the pieces, or null if the
 * deadline or the carving allowance ran out first.
 */
function uniquePartition(region, random, limits, clock) {
    const carve = carveSizes(limits);

    while (clock.stats.carves < limits.maxCarves && clock.now() <= clock.deadline) {
        clock.stats.carves++;

        let pieces = randomPartition(region.cells, random, carve);

        // Folded-in pockets can overshoot the cap; carving again costs no search.
        if (pieces.some((piece) => piece.length > limits.cap)) continue;

        for (;;) {
            const result = verify(region, pieces, limits, clock);

            if (result.orbits === 0 && result.exhausted) throw new Error('the carved solution was not found by the solver');
            if (result.orbits === 1 && result.exhausted) return pieces;
            if (clock.now() > clock.deadline) return null;

            const own = solutionKey(region, pieces.map((piece) => indexPiece(region, piece)));
            const other = result.solutions.find((solution) => solution.key !== own) ?? null;

            pieces = mergeOnce(pieces, other, limits, random);
            if (!pieces) break;
            clock.stats.merges++;
        }
    }

    return null;
}

/** Carving sizes shrunk to leave small boards room to merge under the cap. */
function carveSizes(limits) {
    const maxPiece = Math.max(3, Math.min(limits.maxPiece, limits.cap - 1));

    return { minPiece: Math.max(3, Math.min(limits.minPiece, maxPiece - 1)), maxPiece };
}

/** One solver run over the current pieces, with progress and node accounting. */
function verify(region, pieces, limits, clock) {
    const shapes = shapeMultiset(pieces, GENERATED_RULES);
    const result = countSolutions(region, shapes, GENERATED_RULES, { cap: 2, nodeBudget: limits.nodeBudget });

    clock.stats.nodes += result.nodes;
    clock.onProgress({ pieces: pieces.length, merges: clock.stats.merges, nodes: clock.stats.nodes });

    return result;
}

/**
 * Merging can leave a few very large pieces. Try to cut each one in two again;
 * keep a cut only when the puzzle stays provably unique. Largest pieces first,
 * a bounded number of random cuts each, and never past the deadline.
 */
function refine(region, pieces, random, limits, clock) {
    const tried = new Set();

    for (;;) {
        const candidates = pieces
            .map((piece, index) => ({ piece, index }))
            .filter(({ piece }) => piece.length > limits.maxMergedPiece && !tried.has(piece))
            .sort((a, b) => b.piece.length - a.piece.length);

        if (!candidates.length || clock.now() > clock.deadline) return pieces;

        const { piece, index } = candidates[0];

        tried.add(piece);

        for (let attempt = 0; attempt < limits.splitTries && clock.now() <= clock.deadline; attempt++) {
            const halves = splitPiece(piece, random, carveSizes(limits).minPiece);

            if (!halves) continue;

            const next = pieces.filter((_, i) => i !== index).concat(halves);
            const result = verify(region, next, limits, clock);

            if (result.orbits === 1 && result.exhausted) {
                pieces = next;
                clock.stats.splits++;
                break;
            }
        }
    }
}

/** A random cut of a connected piece into two connected parts of at least `minPiece`. */
function splitPiece(piece, random, minPiece) {
    if (piece.length < 2 * minPiece) return null;

    const keys = new Map(piece.map(([x, y], i) => [cellKey(x, y), i]));
    const neighbours = piece.map(([x, y]) => STEPS.map(([dx, dy]) => keys.get(cellKey(x + dx, y + dy))).filter((i) => i !== undefined));
    const target = minPiece + random.int(piece.length - 2 * minPiece + 1);
    const taken = new Uint8Array(piece.length);
    const blob = [random.int(piece.length)];

    taken[blob[0]] = 1;

    while (blob.length < target) {
        const frontier = [];

        for (const i of blob) for (const j of neighbours[i]) if (!taken[j]) frontier.push(j);
        if (!frontier.length) return null;

        const next = random.pick(frontier);

        taken[next] = 1;
        blob.push(next);
    }

    const rest = piece.filter((_, i) => !taken[i]);

    if (!isConnected(rest)) return null;

    return [blob.map((i) => piece[i]), rest];
}

/**
 * Glue two adjacent pieces whose union fits under the cap. Prefer a pair the
 * alternative solution cuts across (merging them rules that solution out), then
 * the smallest result. Returns null when no pair fits.
 */
function mergeOnce(pieces, other, limits, random) {
    const ownerOf = new Map();

    pieces.forEach((piece, index) => piece.forEach(([x, y]) => ownerOf.set(cellKey(x, y), index)));

    const pairs = new Map();

    pieces.forEach((piece, a) => {
        for (const [x, y] of piece) {
            for (const [dx, dy] of STEPS) {
                const b = ownerOf.get(cellKey(x + dx, y + dy));

                if (b !== undefined && b > a) pairs.set(`${a},${b}`, [a, b]);
            }
        }
    });

    const crossings = new Map();

    if (other) {
        for (const piece of other.pieces) {
            const touched = new Set(piece.map(([x, y]) => ownerOf.get(cellKey(x, y))));

            for (const a of touched) for (const b of touched) if (a < b) crossings.set(`${a},${b}`, (crossings.get(`${a},${b}`) ?? 0) + 1);
        }
    }

    const scored = random.shuffle([...pairs.entries()]).map(([key, [a, b]]) => ({
        a,
        b,
        crossed: crossings.get(key) ?? 0,
        size: pieces[a].length + pieces[b].length
    })).filter(({ size }) => size <= limits.cap);

    if (!scored.length) return null;

    scored.sort((p, q) => (q.crossed > 0) - (p.crossed > 0) || p.size - q.size);

    const { a, b } = scored[0];

    return pieces.filter((_, index) => index !== a && index !== b).concat([[...pieces[a], ...pieces[b]]]);
}

/** Turn a partition into a playable definition plus the placements that solve it. */
function emit(pieces, { width, height, seed, createdAt }, random) {
    const ordered = random.shuffle(pieces);
    const colors = colourPieces(ordered);
    const defPieces = [];
    const solution = [];
    const rowWidth = Math.max(width, 10) + 2;
    let x = MARGIN;
    let y = MARGIN + height + 2;
    let rowHeight = 0;

    ordered.forEach((cells, index) => {
        const id = `p${index + 1}`;
        const shape = normalise(cells);
        // Store the shape in a random orientation so the staged piece does not
        // give away how it sits in the solution.
        const stored = orient(shape, random.int(4), random.next() < 0.5);
        const { rotation, flipped } = orientationBack(stored, shape);
        const box = bounds(stored);
        const at = bounds(cells);

        if (x > MARGIN && x + box.width > MARGIN + rowWidth) {
            y += rowHeight + 1;
            x = MARGIN;
            rowHeight = 0;
        }

        defPieces.push({
            id,
            cells: stored,
            color: colors[index],
            start: { x, y, rotation: 0, flipped: false },
            locked: false
        });
        solution.push({ pieceId: id, x: at.minX + MARGIN, y: at.minY + MARGIN, rotation, flipped });

        x += box.width + 1;
        rowHeight = Math.max(rowHeight, box.height);
    });

    const def = {
        schemaVersion: 1,
        id: `gen-${width}x${height}-${seed.toString(36)}`,
        type: 'square-grid-packing',
        meta: {
            name: `${timestamp(createdAt)} · ${width}×${height}`,
            author: 'Pakke generator',
            description: `Seed ${seed.toString(36)} · ${pieces.length} pieces · exactly one way to fill the tray.`,
            tags: ['generated']
        },
        container: { cells: translate(rectangle(width, height), MARGIN, MARGIN) },
        rules: { ...GENERATED_RULES },
        pieces: defPieces,
        presentation: { fieldRotation: 0 }
    };

    def.field = deriveField(def);

    return { def, solution };
}

/** Local date and time as `YYYY-MM-DD HH:MM:SS`. */
function timestamp(ms) {
    const date = new Date(ms);
    const pad = (n) => String(n).padStart(2, '0');

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** The orientation that takes `stored` back to `target` (both normalised). */
function orientationBack(stored, target) {
    const want = JSON.stringify(target);

    for (const flipped of [false, true]) {
        for (let rotation = 0; rotation < 4; rotation++) {
            if (JSON.stringify(orient(stored, rotation, flipped)) === want) return { rotation, flipped };
        }
    }

    throw new Error('stored orientation does not reach the solution shape');
}

/** Greedy colouring so neighbouring pieces in the solution never share a colour. */
function colourPieces(pieces) {
    const ownerOf = new Map();

    pieces.forEach((piece, index) => piece.forEach(([x, y]) => ownerOf.set(cellKey(x, y), index)));

    const colors = [];

    pieces.forEach((piece, index) => {
        const taken = new Set();

        for (const [x, y] of piece) {
            for (const [dx, dy] of STEPS) {
                const other = ownerOf.get(cellKey(x + dx, y + dy));

                if (other !== undefined && other < index) taken.add(colors[other]);
            }
        }

        colors.push(PALETTE.find((color) => !taken.has(color)) ?? PALETTE[index % PALETTE.length]);
    });

    return colors;
}
