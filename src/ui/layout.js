// The field-to-canvas transform. Pure maths, no Phaser — the ScaleManager owns
// canvas-to-window, and this owns field-to-canvas. Conflating the two is easy
// and wrong: the canvas is fixed at boot while every puzzle has its own field
// aspect.
//
// `fieldRotation` is applied here and nowhere else. Field coordinates stay
// canonical, so the core, the validator and any future solver never see a
// rotated puzzle. Renderers work in *display* coordinates, which is the field
// after rotation; cells map one-to-one, so neighbours stay neighbours and shape
// outlines can be computed in display space directly.

export function createLayout({
    field,
    rotation = 0,
    viewport,
    panel = { side: 'bottom', thickness: 0 },
    maxCellSize = Infinity,
    minCellSize = 1
}) {
    const turn = (((rotation % 4) + 4) % 4);
    const sideways = turn % 2 === 1;

    const displayWidth = sideways ? field.height : field.width;
    const displayHeight = sideways ? field.width : field.height;

    const availWidth = viewport.width - (panel.side === 'right' ? panel.thickness : 0);
    const availHeight = viewport.height - (panel.side === 'bottom' ? panel.thickness : 0);

    const cellSize = Math.max(
        minCellSize,
        Math.min(
            maxCellSize,
            Math.floor(Math.min(availWidth / displayWidth, availHeight / displayHeight))
        )
    );

    const originX = Math.round((availWidth - displayWidth * cellSize) / 2);
    const originY = Math.round((availHeight - displayHeight * cellSize) / 2);

    function toDisplay(cx, cy) {
        switch (turn) {
            case 1:
                return [field.height - 1 - cy, cx];
            case 2:
                return [field.width - 1 - cx, field.height - 1 - cy];
            case 3:
                return [cy, field.width - 1 - cx];
            default:
                return [cx, cy];
        }
    }

    function fromDisplay(dc, dr) {
        switch (turn) {
            case 1:
                return [dr, field.height - 1 - dc];
            case 2:
                return [field.width - 1 - dc, field.height - 1 - dr];
            case 3:
                return [field.width - 1 - dr, dc];
            default:
                return [dc, dr];
        }
    }

    const displayToScreen = (dc, dr) => [originX + dc * cellSize, originY + dr * cellSize];

    return {
        cellSize,
        originX,
        originY,
        displayWidth,
        displayHeight,
        availWidth,
        availHeight,
        toDisplay,
        fromDisplay,
        displayToScreen,

        /** Screen position of a field cell's top-left corner. */
        cellToScreen(cx, cy) {
            const [dc, dr] = toDisplay(cx, cy);

            return displayToScreen(dc, dr);
        },

        /** Field cell under a screen point, or null if outside the field. */
        screenToCell(px, py) {
            const dc = Math.floor((px - originX) / cellSize);
            const dr = Math.floor((py - originY) / cellSize);

            if (dc < 0 || dr < 0 || dc >= displayWidth || dr >= displayHeight) return null;

            return fromDisplay(dc, dr);
        },

        /**
         * Nearest field cell to a screen point, never null. Dragging uses this
         * so a piece keeps following the cursor once it leaves the field.
         */
        screenToCellClamped(px, py) {
            const clamp = (value, limit) => Math.min(Math.max(value, 0), limit - 1);
            const dc = clamp(Math.floor((px - originX) / cellSize), displayWidth);
            const dr = clamp(Math.floor((py - originY) / cellSize), displayHeight);

            return fromDisplay(dc, dr);
        },

        /** Convert a whole cell set into display space for drawing. */
        cellsToDisplay(cells) {
            return cells.map(([x, y]) => toDisplay(x, y));
        }
    };
}

/**
 * The screen edge for the controls on a touch device: the device's own bottom
 * edge, away from any notch, however the screen is turned. `angle` is the
 * screen's clockwise rotation from its natural orientation in degrees, as in
 * `screen.orientation.angle` or iOS's `window.orientation`. Mouse and trackpad
 * devices keep the controls at the bottom whatever their screen reports.
 */
export function dockSide(angle, touch = true) {
    if (!touch) return 'bottom';
    return { 90: 'right', 180: 'top', 270: 'left' }[(((Math.round(angle / 90) * 90) % 360) + 360) % 360] ?? 'bottom';
}
