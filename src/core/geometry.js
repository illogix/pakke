// Cell-set geometry for square-grid puzzles. Pure — no Phaser, no DOM.
//
// A cell is [x, y] with y increasing downward, matching screen orientation.
// A shape is an array of cells normalised so its minimum x and y are both 0
// and its cells are sorted (row-major), which makes shapes comparable by value.
//
// Orientation is (rotation, flipped): flip horizontally first, then rotate
// clockwise `rotation` quarter-turns. That order is fixed, and both the editor
// and any future solver depend on it.

export function cellKey(x, y) {
    return `${x},${y}`;
}

export function sortCells(cells) {
    return [...cells].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

export function bounds(cells) {
    if (cells.length === 0) {
        return { minX: 0, minY: 0, maxX: -1, maxY: -1, width: 0, height: 0 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const [x, y] of cells) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    }

    return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function translate(cells, dx, dy) {
    return cells.map(([x, y]) => [x + dx, y + dy]);
}

/** Move a shape so its minimum x and y are 0, and sort it. */
export function normalise(cells) {
    if (cells.length === 0) return [];

    const { minX, minY } = bounds(cells);

    return sortCells(translate(cells, -minX, -minY));
}

/** 90° clockwise in y-down coordinates: (x, y) -> (-y, x). */
export function rotateCW(cells) {
    return normalise(cells.map(([x, y]) => [-y, x]));
}

/** Mirror across the vertical axis. */
export function flipH(cells) {
    return normalise(cells.map(([x, y]) => [-x, y]));
}

/** Apply an orientation: flip first, then `rotation` clockwise quarter-turns. */
export function orient(cells, rotation = 0, flipped = false) {
    let out = flipped ? flipH(cells) : normalise(cells);

    for (let i = 0; i < (((rotation % 4) + 4) % 4); i++) {
        out = rotateCW(out);
    }

    return out;
}

export function cellsEqual(a, b) {
    if (a.length !== b.length) return false;

    const sortedA = sortCells(a);
    const sortedB = sortCells(b);

    return sortedA.every(([x, y], i) => x === sortedB[i][0] && y === sortedB[i][1]);
}

/** True if every cell is reachable from every other by orthogonal steps. */
export function isConnected(cells) {
    if (cells.length === 0) return false;

    const remaining = new Set(cells.map(([x, y]) => cellKey(x, y)));
    const queue = [cells[0]];

    remaining.delete(cellKey(cells[0][0], cells[0][1]));

    while (queue.length > 0) {
        const [x, y] = queue.pop();

        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const key = cellKey(x + dx, y + dy);

            if (remaining.has(key)) {
                remaining.delete(key);
                queue.push([x + dx, y + dy]);
            }
        }
    }

    return remaining.size === 0;
}

/**
 * Perimeter edges of a cell set, for drawing an outline around the whole shape
 * rather than a box around every cell. Each edge is the side of a cell that has
 * no orthogonal neighbour.
 */
export function outlineEdges(cells) {
    const occupied = new Set(cells.map(([x, y]) => cellKey(x, y)));
    const edges = [];

    for (const [x, y] of cells) {
        if (!occupied.has(cellKey(x, y - 1))) edges.push({ x1: x, y1: y, x2: x + 1, y2: y });
        if (!occupied.has(cellKey(x, y + 1))) edges.push({ x1: x, y1: y + 1, x2: x + 1, y2: y + 1 });
        if (!occupied.has(cellKey(x - 1, y))) edges.push({ x1: x, y1: y, x2: x, y2: y + 1 });
        if (!occupied.has(cellKey(x + 1, y))) edges.push({ x1: x + 1, y1: y, x2: x + 1, y2: y + 1 });
    }

    return edges;
}
