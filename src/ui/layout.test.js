import { describe, expect, it } from 'vitest';

import { createLayout } from './layout.js';

const field = { width: 8, height: 5 };
const viewport = { width: 800, height: 600 };

const build = (rotation) =>
    createLayout({ field, rotation, viewport, panel: { side: 'bottom', thickness: 0 } });

describe('createLayout', () => {
    it('fits the field inside the viewport', () => {
        const layout = build(0);

        expect(layout.cellSize * layout.displayWidth).toBeLessThanOrEqual(viewport.width);
        expect(layout.cellSize * layout.displayHeight).toBeLessThanOrEqual(viewport.height);
    });

    it('respects the maximum cell size, so small puzzles do not balloon', () => {
        const layout = createLayout({ field, viewport, maxCellSize: 20 });

        expect(layout.cellSize).toBe(20);
    });

    it('reserves the panel out of the available area', () => {
        const layout = createLayout({ field, viewport, panel: { side: 'right', thickness: 200 } });

        expect(layout.availWidth).toBe(600);
        expect(layout.availHeight).toBe(600);
    });

    it('swaps display dimensions on a quarter turn', () => {
        expect(build(1)).toMatchObject({ displayWidth: 5, displayHeight: 8 });
        expect(build(2)).toMatchObject({ displayWidth: 8, displayHeight: 5 });
        expect(build(3)).toMatchObject({ displayWidth: 5, displayHeight: 8 });
    });
});

describe('field rotation', () => {
    it.each([0, 1, 2, 3])('round-trips every cell at rotation %i', (rotation) => {
        const layout = build(rotation);

        for (let y = 0; y < field.height; y++) {
            for (let x = 0; x < field.width; x++) {
                expect(layout.fromDisplay(...layout.toDisplay(x, y))).toEqual([x, y]);
            }
        }
    });

    it.each([0, 1, 2, 3])('maps every cell inside the display area at rotation %i', (rotation) => {
        const layout = build(rotation);

        for (let y = 0; y < field.height; y++) {
            for (let x = 0; x < field.width; x++) {
                const [dc, dr] = layout.toDisplay(x, y);

                expect(dc).toBeGreaterThanOrEqual(0);
                expect(dr).toBeGreaterThanOrEqual(0);
                expect(dc).toBeLessThan(layout.displayWidth);
                expect(dr).toBeLessThan(layout.displayHeight);
            }
        }
    });

    it('keeps neighbours adjacent, so shape outlines survive rotation', () => {
        const layout = build(1);
        const [ax, ay] = layout.toDisplay(2, 2);
        const [bx, by] = layout.toDisplay(3, 2);

        expect(Math.abs(ax - bx) + Math.abs(ay - by)).toBe(1);
    });

    it('turns clockwise: the field’s top-left lands top-right', () => {
        const layout = build(1);

        expect(layout.toDisplay(0, 0)).toEqual([field.height - 1, 0]);
    });
});

describe('screenToCell', () => {
    it.each([0, 1, 2, 3])('inverts cellToScreen at rotation %i', (rotation) => {
        const layout = build(rotation);

        for (let y = 0; y < field.height; y++) {
            for (let x = 0; x < field.width; x++) {
                const [px, py] = layout.cellToScreen(x, y);

                expect(layout.screenToCell(px + 1, py + 1)).toEqual([x, y]);
            }
        }
    });

    it('returns null outside the field', () => {
        const layout = build(0);

        expect(layout.screenToCell(layout.originX - 5, layout.originY - 5)).toBeNull();
        expect(layout.screenToCell(1e6, 1e6)).toBeNull();
    });
});
