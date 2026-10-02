// Random partition of a cell set into connected pieces. The partition is the
// generator's known solution: it always exists, whatever the region's shape,
// because it is built by carving the region rather than by fitting a library
// of shapes into it.

import { cellKey } from './geometry.js';

const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Split `cells` into connected pieces with sizes in [minPiece, maxPiece] where
 * possible. Pockets too small to reach `minPiece` are merged into a neighbouring
 * piece, so a few pieces may end up larger than `maxPiece`.
 *
 * Returns an array of cell lists in the region's own coordinates.
 */
export function randomPartition(cells, random, { minPiece = 4, maxPiece = 5 } = {}) {
    const index = new Map(cells.map(([x, y], i) => [cellKey(x, y), i]));
    const neighbours = cells.map(([x, y]) =>
        STEPS.map(([dx, dy]) => index.get(cellKey(x + dx, y + dy))).filter((i) => i !== undefined)
    );
    const owner = new Int32Array(cells.length).fill(-1);
    const pieces = [];
    let unassigned = cells.length;

    const freeNeighbours = (i) => neighbours[i].filter((j) => owner[j] === -1);

    while (unassigned > 0) {
        // Start each piece in the tightest spot: the free cell with the fewest
        // free neighbours. Corners and pockets get filled before they become
        // leftovers that must be merged away.
        let seeds = [];
        let fewest = Infinity;

        for (let i = 0; i < cells.length; i++) {
            if (owner[i] !== -1) continue;

            const count = freeNeighbours(i).length;

            if (count < fewest) {
                fewest = count;
                seeds = [i];
            } else if (count === fewest) {
                seeds.push(i);
            }
        }

        const target = minPiece + random.int(maxPiece - minPiece + 1);
        const id = pieces.length;
        const blob = [random.pick(seeds)];

        owner[blob[0]] = id;
        unassigned--;

        while (blob.length < target) {
            const frontier = [];

            for (const i of blob) for (const j of freeNeighbours(i)) frontier.push(j);
            if (frontier.length === 0) break;

            // Duplicates in the frontier weight cells touching the blob on more
            // sides, which keeps pieces compact.
            const next = random.pick(frontier);

            owner[next] = id;
            blob.push(next);
            unassigned--;
        }

        pieces.push(blob);

        if (blob.length < minPiece) {
            // Fold a pocket into the smallest piece next to it.
            const adjacent = new Set();

            for (const i of blob) for (const j of neighbours[i]) if (owner[j] !== -1 && owner[j] !== id) adjacent.add(owner[j]);

            if (adjacent.size > 0) {
                const into = [...adjacent].sort((a, b) => pieces[a].length - pieces[b].length || a - b)[0];

                for (const i of blob) owner[i] = into;
                pieces[into].push(...blob);
                pieces.pop();
            }
        }
    }

    return pieces.map((piece) => piece.map((i) => cells[i]));
}
