// Node sweep of the puzzle generator: median and p95 of time, merges and
// solver nodes per board size. Used to set GENERATOR_LIMITS; rerun after
// changing the solver, the partitioner, or the limits.
//
//   node scripts/generator-bench.mjs [seeds=20] [sizes=4,5,6,7,8,9]

import { generatePuzzle, GENERATOR_LIMITS } from '../src/core/generate.js';

const seeds = Number(process.argv[2] ?? 20);
const sizes = (process.argv[3] ?? '4,5,6,7,8,9').split(',').map(Number);

const quantile = (values, q) => {
    const sorted = [...values].sort((a, b) => a - b);

    return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};

console.log(`limits: ${JSON.stringify(GENERATOR_LIMITS)}`);
console.log('size    ok  ms(med)  ms(p95)  merges(med/p95)  nodes(med/p95)  pieces(med)  maxPiece(max)  splits(med)  carves(med/p95)');

for (const size of sizes) {
    const runs = [];

    for (let seed = 1; seed <= seeds; seed++) {
        const started = performance.now();
        const result = generatePuzzle({ width: size, height: size, seed });

        runs.push({
            ok: result.ok,
            ms: performance.now() - started,
            merges: result.stats.merges,
            nodes: result.stats.nodes,
            pieces: result.ok ? result.def.pieces.length : 0,
            maxPiece: result.ok ? Math.max(...result.def.pieces.map((p) => p.cells.length)) : 0,
            splits: result.stats.splits,
            carves: result.stats.carves
        });
    }

    const column = (key, q) => quantile(runs.map((r) => r[key]), q);
    const ok = runs.filter((r) => r.ok).length;

    console.log(
        `${String(size).padStart(2)}x${String(size).padEnd(4)}${String(ok).padStart(3)}/${seeds}`
        + `  ${column('ms', 0.5).toFixed(0).padStart(6)}  ${column('ms', 0.95).toFixed(0).padStart(7)}`
        + `  ${String(column('merges', 0.5)).padStart(6)}/${String(column('merges', 0.95)).padEnd(8)}`
        + `  ${String(column('nodes', 0.5)).padStart(7)}/${String(column('nodes', 0.95)).padEnd(8)}`
        + `  ${String(column('pieces', 0.5)).padStart(6)}       ${String(Math.max(...runs.map((r) => r.maxPiece))).padStart(6)}       ${String(column('splits', 0.5)).padStart(6)}`
        + `       ${String(column('carves', 0.5)).padStart(3)}/${column('carves', 0.95)}`
    );
}
