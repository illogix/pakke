// Opening layout: free pieces are laid out around the tray to suit the shape of
// the screen, so the tray-centred opening view can be as close as possible.
// Authored starts supply each piece's orientation; their positions are only the
// fallback when no arrangement fits.

import { bounds } from './geometry.js';
import { boardCells, containerKeys, containment, orientedBounds } from './puzzle.js';

const GAP = 1;

/** Tray bounding box. */
export function trayBounds(def) {
    return bounds(boardCells(def));
}

/**
 * How far around the tray an arrangement may reach, in cells. Every arrangement
 * stays inside it and the workspace always contains it, whatever the screen.
 */
export function arrangeReach(def) {
    let area = 0;
    let largest = 0;

    for (const piece of def.pieces) {
        const { width, height } = orientedBounds(piece, piece.start);
        area += (width + GAP) * (height + GAP);
        largest = Math.max(largest, width, height);
    }

    return Math.ceil(Math.sqrt(area)) + largest + GAP;
}

/**
 * Placements for a fresh attempt on a board of `aspect` (width / height, in
 * the puzzle's own orientation). Pieces that start inside the tray keep their
 * place; the rest are packed into rows and columns around it, one cell apart.
 * Returns the smallest tray-centred frame that fits them all.
 */
export function arrangePieces(def, aspect) {
    const placements = Object.fromEntries(def.pieces.map((piece) => [piece.id, { ...piece.start }]));
    const keys = containerKeys(def);
    const free = def.pieces
        .filter((piece) => !piece.locked && containment(piece, piece.start, keys) !== 'contained')
        .map((piece, index) => ({ piece, index, box: orientedBounds(piece, piece.start) }))
        .sort((a, b) => Math.max(b.box.width, b.box.height) - Math.max(a.box.width, a.box.height)
            || b.piece.cells.length - a.piece.cells.length || a.index - b.index);

    if (free.length === 0) return placements;

    const tray = trayBounds(def);
    const reach = arrangeReach(def);
    const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
    // A frame of L columns either side and T rows above and below shows at a
    // zoom of min(width / (tray.width + 2L), height / (tray.height + 2T)). Step
    // through that zoom from close to far and take the first frame that fits.
    const zooms = [];

    for (let n = 0; n <= reach; n++) {
        zooms.push(ratio / (tray.width + 2 * n), 1 / (tray.height + 2 * n));
    }
    zooms.sort((a, b) => b - a);

    const variants = ratio < 1 ? ['rows', 'columns'] : ['columns', 'rows'];
    let tried = '';

    for (const zoom of zooms) {
        const L = Math.min(reach, Math.max(0, Math.floor((ratio / zoom - tray.width) / 2 + 1e-9)));
        const T = Math.min(reach, Math.max(0, Math.floor((1 / zoom - tray.height) / 2 + 1e-9)));

        if (`${L},${T}` === tried) continue;
        tried = `${L},${T}`;

        for (const variant of variants) {
            const packed = pack(free, tray, L, T, variant);

            if (packed) {
                for (const [id, start] of packed) placements[id] = start;

                return placements;
            }
        }
    }

    return placements;
}

/**
 * Bands around the tray. 'rows' runs the bands above and below across the full
 * frame width; 'columns' runs the side bands down its full height. Each band
 * has a length along the tray and a depth away from it, less the gap.
 */
function bands(tray, L, T, variant) {
    const wide = variant === 'rows';

    return [
        { side: 'above', length: tray.width + (wide ? 2 * L : 0), depth: T - GAP },
        { side: 'below', length: tray.width + (wide ? 2 * L : 0), depth: T - GAP },
        { side: 'left', length: tray.height + (wide ? 0 : 2 * T), depth: L - GAP },
        { side: 'right', length: tray.height + (wide ? 0 : 2 * T), depth: L - GAP }
    ].map((band) => ({ ...band, shelves: [], used: 0 }));
}

const across = (side) => side === 'above' || side === 'below';

/** Greedy shelf packing into the bands; null when something does not fit. */
function pack(free, tray, L, T, variant) {
    const all = bands(tray, L, T, variant);

    for (const item of free) {
        let best = null;

        for (const band of all) {
            const length = across(band.side) ? item.box.width : item.box.height;
            const depth = across(band.side) ? item.box.height : item.box.width;
            const options = band.shelves.map((shelf, index) => ({ shelf: index, depth: band.used - shelf.depth + Math.max(shelf.depth, depth), fits: shelf.length + GAP + length <= band.length }));

            options.push({ shelf: band.shelves.length, depth: band.used + (band.shelves.length ? GAP : 0) + depth, fits: length <= band.length });

            for (const option of options) {
                if (!option.fits || option.depth > band.depth) continue;
                // Least added depth first, then the emptier band, so sides fill evenly.
                const score = [option.depth - band.used, band.used / Math.max(1, band.depth)];

                if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && score[1] < best.score[1])) {
                    best = { band, option, length, depth, score };
                }
            }
        }

        if (!best) return null;

        const { band, option, length, depth } = best;

        if (option.shelf === band.shelves.length) band.shelves.push({ depth: 0, length: -GAP, items: [] });
        const shelf = band.shelves[option.shelf];

        shelf.items.push({ item, length, depth });
        shelf.length += GAP + length;
        shelf.depth = Math.max(shelf.depth, depth);
        band.used = option.depth;
    }

    const starts = new Map();
    const centre = { x: tray.minX + tray.width / 2, y: tray.minY + tray.height / 2 };

    for (const band of all) {
        let offset = 0;

        for (const shelf of band.shelves) {
            let along = Math.round((across(band.side) ? centre.x : centre.y) - shelf.length / 2);

            for (const { item, length, depth } of shelf.items) {
                // Pieces hug the tray: each sits against the shelf edge nearest it.
                const near = offset + GAP;
                let x;
                let y;

                if (band.side === 'above') { x = along; y = tray.minY - near - depth; }
                else if (band.side === 'below') { x = along; y = tray.maxY + 1 + near; }
                else if (band.side === 'left') { x = tray.minX - near - depth; y = along; }
                else { x = tray.maxX + 1 + near; y = along; }

                starts.set(item.piece.id, { ...item.piece.start, x: x - item.box.minX, y: y - item.box.minY });
                along += length + GAP;
            }
            offset += shelf.depth + GAP;
        }
    }

    return starts;
}
