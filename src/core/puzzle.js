// Read-only helpers over a puzzle definition. A definition is inert data; every
// derived quantity is computed here rather than stored, except `field`, which is
// written into the file so that changing the derivation cannot silently reflow
// existing puzzles.

import { bounds, cellKey, orient, translate } from './geometry.js';

export const SCHEMA_VERSION = 1;
export const FIELD_BORDER = 2;

/** Cells a piece occupies at a given placement, in field coordinates. */
export function placedCells(piece, placement) {
    const oriented = orient(piece.cells, placement.rotation, placement.flipped);

    return translate(oriented, placement.x, placement.y);
}

/** Bounding box of a piece at a given orientation, before translation. */
export function orientedBounds(piece, placement) {
    return bounds(orient(piece.cells, placement.rotation, placement.flipped));
}

/** All visible board squares, including non-playable holes. */
export function boardCells(def) {
    return [...def.container.cells, ...(def.container.holes ?? [])];
}

export function containerKeys(def) {
    return new Set(def.container.cells.map(([x, y]) => cellKey(x, y)));
}

export function containerArea(def) {
    return def.container.cells.length;
}

export function totalPieceArea(def) {
    return def.pieces.reduce((sum, piece) => sum + piece.cells.length, 0);
}

/** Spare room in the tray. Zero is an exact fit; negative is impossible. */
export function slack(def) {
    return containerArea(def) - totalPieceArea(def);
}

export function findPiece(def, pieceId) {
    return def.pieces.find((piece) => piece.id === pieceId);
}

/**
 * Field size the editor would derive for this definition: everything the puzzle
 * starts with, plus a border wide enough that edge pieces stay grabbable.
 */
export function deriveField(def, border = FIELD_BORDER) {
    const all = boardCells(def);

    for (const piece of def.pieces) {
        all.push(...placedCells(piece, piece.start));
    }

    const { maxX, maxY } = bounds(all);

    return { width: maxX + 1 + border, height: maxY + 1 + border };
}

/**
 * Lay out the free pieces' starts around the tray: the first half by area in
 * rows below it, the rest in rows above, each row centred on the tray, one empty row from it. Locked
 * pieces keep their place relative to the tray. Everything is then shifted so the
 * leading border matches the trailing one, and the field is rederived.
 * Returns the new definition and the shift applied to the tray.
 */
export function stagePieces(def, { gap = 1, minRowWidth = 10, border = FIELD_BORDER } = {}) {
    const tray = bounds(boardCells(def));
    const centre = tray.minX + tray.width / 2;
    const rowWidth = Math.max(minRowWidth, tray.width + 4);
    const free = def.pieces.filter((piece) => !piece.locked);
    const half = free.reduce((sum, piece) => sum + piece.cells.length, 0) / 2;
    // Contiguous halves, so each side runs through the palette in order: split
    // where the area below comes closest to half, below taking ties.
    let split = 0;
    let closest = half;
    let area = 0;

    free.forEach((piece, index) => {
        area += piece.cells.length;
        if (Math.abs(area - half) <= closest) {
            split = index + 1;
            closest = Math.abs(area - half);
        }
    });

    const sides = { below: free.slice(0, split), above: free.slice(split) };

    const starts = new Map();

    for (const [side, pieces] of Object.entries(sides)) {
        const rows = [];

        for (const piece of pieces) {
            const box = orientedBounds(piece, piece.start);
            const row = rows.at(-1);

            if (row && row.width + 1 + box.width <= rowWidth) {
                row.items.push({ piece, box });
                row.width += 1 + box.width;
                row.height = Math.max(row.height, box.height);
            } else {
                rows.push({ items: [{ piece, box }], width: box.width, height: box.height });
            }
        }

        let edge = side === 'below' ? tray.maxY + 1 + gap : tray.minY - gap;

        for (const row of rows) {
            let x = Math.round(centre - row.width / 2);
            const top = side === 'below' ? edge : edge - row.height;

            for (const { piece, box } of row.items) {
                // Rows hug the tray: pieces align to the row edge nearest it.
                const y = side === 'below' ? top : top + row.height - box.height;

                starts.set(piece.id, { ...piece.start, x: x - box.minX, y: y - box.minY });
                x += box.width + 1;
            }
            edge = side === 'below' ? edge + row.height + 1 : edge - row.height - 1;
        }
    }

    const staged = def.pieces.map((piece) => ({ ...piece, start: starts.get(piece.id) ?? piece.start }));
    const all = [...boardCells(def), ...staged.flatMap((piece) => placedCells(piece, piece.start))];
    const box = bounds(all);
    const dx = border - box.minX;
    const dy = border - box.minY;
    const next = {
        ...def,
        container: { ...def.container, cells: translate(def.container.cells, dx, dy),
            ...(def.container.holes !== undefined ? { holes: translate(def.container.holes, dx, dy) } : {}),
            ...(def.container.labels !== undefined ? { labels: def.container.labels.map(label => ({ ...label, cell: [label.cell[0] + dx, label.cell[1] + dy] })) } : {}) },
        pieces: staged.map((piece) => ({ ...piece, start: { ...piece.start, x: piece.start.x + dx, y: piece.start.y + dy } }))
    };

    next.field = deriveField(next, border);

    return { def: next, offset: [dx, dy] };
}

/** Clamp a placement's origin so the whole piece stays inside the field. */
export function clampToField(def, piece, placement) {
    const { width, height } = orientedBounds(piece, placement);
    const maxX = Math.max(0, def.field.width - width);
    const maxY = Math.max(0, def.field.height - height);

    return {
        ...placement,
        x: Math.min(Math.max(placement.x, 0), maxX),
        y: Math.min(Math.max(placement.y, 0), maxY)
    };
}

/**
 * Containment is all-or-nothing. A piece with no cells in the tray is staged and
 * fine; a piece with some cells in the tray must have all of them in it.
 */
export function containment(piece, placement, keys) {
    const cells = placedCells(piece, placement);
    const inside = cells.filter(([x, y]) => keys.has(cellKey(x, y)));

    if (inside.length === cells.length) return 'contained';
    if (inside.length === 0) return 'staged';

    return 'straddling';
}
