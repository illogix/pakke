import Phaser from 'phaser';

import { completionLabel, isSolved, progress } from '../core/completion.js';
import { outlineEdges } from '../core/geometry.js';
import { findPiece, orientedBounds, placedCells } from '../core/puzzle.js';
import { createState, movePiece, rotatePiece, setPlacement } from '../core/state.js';
import { computeViolations } from '../core/violations.js';
import { flippedGrab, rotatedGrab, topPieceAt } from '../ui/interaction.js';
import { createLayout, panelFor } from '../ui/layout.js';
import { darken, theme, toColor } from '../ui/theme.js';

// The view and input adapter. It owns pixels, selection and z-order; everything
// about where pieces are and whether that is legal comes from the core.
//
// Drawing happens in display coordinates (the field after `fieldRotation`), so
// a rotated field needs no special handling below this line.

export default class PlayScene extends Phaser.Scene {
    constructor() {
        super('Play');
    }

    init(data) {
        this.def = data.def;
    }

    create() {
        this.state = createState(this.def);
        this.selectedId = null;
        this.drag = null;
        this.solved = false;

        // Last touched draws on top, and is what a click on overlapping cells finds.
        this.zOrder = this.def.pieces.map((piece) => piece.id);

        this.boardLayer = this.add.graphics().setDepth(0);
        this.pieceLayer = this.add.graphics().setDepth(1);
        this.markLayer = this.add.graphics().setDepth(2);
        this.bannerLayer = this.add.container(0, 0).setDepth(3);
        this.uiLayer = this.add.container(0, 0).setDepth(4);

        this.input.mouse?.disableContextMenu();
        this.input.on('pointerdown', this.onPointerDown, this);
        this.input.on('pointermove', this.onPointerMove, this);
        this.input.on('pointerup', this.onPointerUp, this);
        this.input.on('pointerupoutside', this.onPointerUp, this);

        this.input.keyboard?.on('keydown-R', (event) => this.rotateSelected(event.shiftKey ? -1 : 1));
        this.input.keyboard?.on('keydown-E', () => this.rotateSelected(-1));
        this.input.keyboard?.on('keydown-F', () => this.flipSelected());
        this.input.keyboard?.on('keydown-ESC', () => this.select(null));

        this.scale.on('resize', this.relayout, this);
        this.events.once('shutdown', () => this.scale.off('resize', this.relayout, this));

        this.relayout();
    }

    // ---- layout -----------------------------------------------------------

    relayout() {
        const viewport = { width: this.scale.width, height: this.scale.height };

        this.panel = panelFor(viewport, theme);
        this.viewport = viewport;
        this.layout = createLayout({
            field: this.def.field,
            rotation: this.def.presentation?.fieldRotation ?? 0,
            viewport,
            panel: this.panel,
            maxCellSize: theme.maxCellSize,
            minCellSize: theme.minCellSize
        });

        this.cameras.main.setBackgroundColor(theme.page);
        this.drawBoard();
        this.buildPanel();
        this.refresh();
    }

    panelRect() {
        const { width, height } = this.viewport;

        return this.panel.side === 'right'
            ? { x: width - this.panel.thickness, y: 0, w: this.panel.thickness, h: height }
            : { x: 0, y: height - this.panel.thickness, w: width, h: this.panel.thickness };
    }

    isInPanel(pointer) {
        const { x, y, w, h } = this.panelRect();

        return pointer.x >= x && pointer.x < x + w && pointer.y >= y && pointer.y < y + h;
    }

    // ---- drawing ----------------------------------------------------------

    cellRect(cx, cy) {
        const [x, y] = this.layout.cellToScreen(cx, cy);

        return { x, y, size: this.layout.cellSize };
    }

    drawBoard() {
        const gfx = this.boardLayer;
        const { cellSize, originX, originY, displayWidth, displayHeight } = this.layout;

        gfx.clear();

        gfx.fillStyle(theme.field, 1);
        gfx.fillRect(originX, originY, displayWidth * cellSize, displayHeight * cellSize);

        gfx.lineStyle(1, theme.gridLine, 1);
        for (let dc = 1; dc < displayWidth; dc++) {
            gfx.lineBetween(
                originX + dc * cellSize,
                originY,
                originX + dc * cellSize,
                originY + displayHeight * cellSize
            );
        }
        for (let dr = 1; dr < displayHeight; dr++) {
            gfx.lineBetween(
                originX,
                originY + dr * cellSize,
                originX + displayWidth * cellSize,
                originY + dr * cellSize
            );
        }

        gfx.lineStyle(1, theme.fieldStroke, 1);
        gfx.strokeRect(originX, originY, displayWidth * cellSize, displayHeight * cellSize);

        // The tray: a filled panel with its own separators and a strong outline,
        // so it reads as the target rather than as part of the background.
        const trayDisplay = this.layout.cellsToDisplay(this.def.container.cells);

        gfx.fillStyle(theme.trayFill, 1);
        gfx.lineStyle(1, theme.trayGridLine, 1);
        for (const [dc, dr] of trayDisplay) {
            const [x, y] = this.layout.displayToScreen(dc, dr);

            gfx.fillRect(x, y, cellSize, cellSize);
            gfx.strokeRect(x, y, cellSize, cellSize);
        }

        gfx.lineStyle(2, theme.trayStroke, 1);
        this.strokeOutline(gfx, trayDisplay);
    }

    strokeOutline(gfx, displayCells) {
        const { cellSize, originX, originY } = this.layout;

        for (const edge of outlineEdges(displayCells)) {
            gfx.lineBetween(
                originX + edge.x1 * cellSize,
                originY + edge.y1 * cellSize,
                originX + edge.x2 * cellSize,
                originY + edge.y2 * cellSize
            );
        }
    }

    drawPieces() {
        const gfx = this.pieceLayer;
        const { cellSize } = this.layout;

        gfx.clear();

        for (const id of this.zOrder) {
            const piece = findPiece(this.def, id);
            const placement = this.state.placements[id];

            if (!piece || !placement) continue;

            const display = this.layout.cellsToDisplay(placedCells(piece, placement));
            const fill = toColor(piece.color);

            gfx.fillStyle(fill, 1);
            gfx.lineStyle(1, theme.pieceGridLine, theme.pieceGridAlpha);

            for (const [dc, dr] of display) {
                const [x, y] = this.layout.displayToScreen(dc, dr);

                gfx.fillRect(x, y, cellSize, cellSize);
                gfx.strokeRect(x, y, cellSize, cellSize);
            }

            if (piece.locked) {
                gfx.fillStyle(theme.lockedOverlay, theme.lockedOverlayAlpha);

                for (const [dc, dr] of display) {
                    const [x, y] = this.layout.displayToScreen(dc, dr);

                    gfx.fillRect(x, y, cellSize, cellSize);
                }
            }

            if (id === this.selectedId) {
                gfx.lineStyle(theme.selectedStrokeWidth, theme.selectedStroke, 1);
            } else if (piece.locked) {
                gfx.lineStyle(theme.lockedStrokeWidth, darken(fill, theme.lockedStrokeDarken), 1);
            } else {
                gfx.lineStyle(theme.pieceStrokeWidth, darken(fill, theme.pieceStrokeDarken), 1);
            }

            this.strokeOutline(gfx, display);
        }
    }

    /**
     * Conflicts are hatched rather than tinted: a piece may itself be red, and a
     * pattern stays legible over any fill and without relying on hue.
     */
    drawMarks() {
        const gfx = this.markLayer;
        const { cellSize } = this.layout;
        const step = cellSize / theme.conflictStripesPerCell;

        gfx.clear();

        for (const key of this.violations.cells) {
            const [cx, cy] = key.split(',').map(Number);
            const { x, y, size } = this.cellRect(cx, cy);

            gfx.fillStyle(theme.conflictBase, theme.conflictBaseAlpha);
            gfx.fillRect(x, y, size, size);

            gfx.lineStyle(theme.conflictStripeWidth, theme.conflictStripe, 1);

            for (let k = -size + step; k < size; k += step) {
                gfx.lineBetween(
                    x + Math.max(0, k),
                    y + Math.max(0, -k),
                    x + Math.min(size, size + k),
                    y + Math.min(size, size - k)
                );
            }
        }
    }

    // ---- panel ------------------------------------------------------------

    buildPanel() {
        this.uiLayer.removeAll(true);
        this.buttons = [];

        const { x, y, w, h } = this.panelRect();
        const vertical = this.panel.side === 'right';

        const backdrop = this.add.rectangle(x, y, w, h, theme.panel).setOrigin(0, 0);

        backdrop.setStrokeStyle(1, theme.panelStroke);
        this.uiLayer.add(backdrop);

        const actions = [
            { label: '↺ Left', run: () => this.rotateSelected(-1) },
            { label: 'Right ↻', run: () => this.rotateSelected(1) }
        ];

        if (this.def.rules.allowFlip === true) {
            actions.push({ label: 'Flip', run: () => this.flipSelected() });
        }

        actions.push({ label: 'Reset', run: () => this.resetPuzzle(), always: true });

        const pad = 12;
        const buttonHeight = 44;

        if (vertical) {
            const buttonWidth = w - pad * 2;
            const totalHeight = actions.length * buttonHeight + (actions.length - 1) * 10;
            let top = y + (h - totalHeight) / 2;

            for (const action of actions) {
                this.buttons.push(this.makeButton(x + pad, top, buttonWidth, buttonHeight, action));
                top += buttonHeight + 10;
            }

            this.statusText = this.add
                .text(x + w / 2, y + 24, '', {
                    fontFamily: theme.fontFamily,
                    fontSize: '13px',
                    color: theme.statusText,
                    align: 'center',
                    wordWrap: { width: w - pad * 2 }
                })
                .setOrigin(0.5, 0);
        } else {
            const buttonWidth = Math.min(140, (w - pad * (actions.length + 1)) / actions.length);
            const totalWidth = actions.length * buttonWidth + (actions.length - 1) * pad;
            let left = x + (w - totalWidth) / 2;
            const top = y + h - buttonHeight - pad;

            for (const action of actions) {
                this.buttons.push(this.makeButton(left, top, buttonWidth, buttonHeight, action));
                left += buttonWidth + pad;
            }

            this.statusText = this.add
                .text(x + w / 2, y + 12, '', {
                    fontFamily: theme.fontFamily,
                    fontSize: '13px',
                    color: theme.statusText,
                    align: 'center'
                })
                .setOrigin(0.5, 0);
        }

        this.uiLayer.add(this.statusText);
    }

    makeButton(x, y, w, h, action) {
        const rect = this.add.rectangle(x, y, w, h, theme.button).setOrigin(0, 0);
        const label = this.add
            .text(x + w / 2, y + h / 2, action.label, {
                fontFamily: theme.fontFamily,
                fontSize: '14px',
                color: theme.buttonText
            })
            .setOrigin(0.5);

        rect.setStrokeStyle(1, theme.buttonStroke);
        rect.setInteractive({ useHandCursor: true });

        const button = { rect, label, action, enabled: true };

        rect.on('pointerover', () => {
            if (button.enabled) rect.setFillStyle(theme.buttonHover);
        });
        rect.on('pointerout', () => {
            if (button.enabled) rect.setFillStyle(theme.button);
        });
        rect.on('pointerdown', () => {
            if (button.enabled) action.run();
        });

        this.uiLayer.add([rect, label]);

        return button;
    }

    updatePanel() {
        const hasSelection = Boolean(this.selectedId);

        for (const button of this.buttons) {
            const enabled = button.action.always === true || hasSelection;

            button.enabled = enabled;
            button.rect.setFillStyle(enabled ? theme.button : theme.buttonDisabled);
            button.label.setColor(enabled ? theme.buttonText : theme.buttonTextDisabled);
        }

        const { contained, total } = progress(this.def, this.state);

        if (this.solved) {
            this.statusText.setText('Solved');
            this.statusText.setColor(theme.solvedText);
        } else {
            this.statusText.setText(
                `${this.def.meta.name}\n${contained} of ${total} placed — ${completionLabel(this.def)}`
            );
            this.statusText.setColor(theme.statusText);
        }
    }

    drawBanner() {
        this.bannerLayer.removeAll(true);

        if (!this.solved) return;

        const { originX, originY, displayWidth, cellSize } = this.layout;
        const width = displayWidth * cellSize;
        const banner = this.add
            .rectangle(originX, originY, width, 52, 0x1d3a2b)
            .setOrigin(0, 0)
            .setAlpha(0.94);

        banner.setStrokeStyle(1, 0x2f6b4c);

        const label = this.add
            .text(originX + width / 2, originY + 26, 'Solved', {
                fontFamily: theme.fontFamily,
                fontSize: '22px',
                color: theme.solvedText
            })
            .setOrigin(0.5);

        this.bannerLayer.add([banner, label]);
    }

    // ---- state ------------------------------------------------------------

    refresh() {
        this.violations = computeViolations(this.def, this.state);
        this.solved = isSolved(this.def, this.state);

        this.drawPieces();
        this.drawMarks();
        this.drawBanner();
        this.updatePanel();
    }

    apply(next) {
        if (next === this.state) return;

        this.state = next;
        this.refresh();
    }

    select(id) {
        if (this.selectedId === id) return;

        this.selectedId = id;
        this.drawPieces();
        this.updatePanel();
    }

    bringToTop(id) {
        this.zOrder = [...this.zOrder.filter((other) => other !== id), id];
    }

    resetPuzzle() {
        this.drag = null;
        this.selectedId = null;
        this.zOrder = this.def.pieces.map((piece) => piece.id);
        this.state = createState(this.def);
        this.refresh();
    }

    // ---- input ------------------------------------------------------------

    onPointerDown(pointer) {
        if (this.isInPanel(pointer)) return;

        const cell = this.layout.screenToCell(pointer.x, pointer.y);

        if (!cell) {
            if (!pointer.rightButtonDown()) this.select(null);

            return;
        }

        const id = topPieceAt(this.def, this.state, this.zOrder, cell);
        const piece = id ? findPiece(this.def, id) : null;

        // Right-click rotates whatever it lands on, selecting it first, so it
        // does not need a separate click to take aim.
        if (pointer.rightButtonDown()) {
            if (piece && !piece.locked) this.select(id);
            this.rotateSelected(1);

            return;
        }

        // Locked pieces are fully non-interactive, so a click on one reads as a
        // click on the board rather than selecting whatever sits underneath.
        if (!piece || piece.locked) {
            this.select(null);

            return;
        }

        this.select(id);
        this.bringToTop(id);

        const placement = this.state.placements[id];

        this.drag = { id, gx: cell[0] - placement.x, gy: cell[1] - placement.y };
        this.drawPieces();
    }

    onPointerMove(pointer) {
        if (!this.drag) return;

        const [cx, cy] = this.layout.screenToCellClamped(pointer.x, pointer.y);

        this.apply(movePiece(this.def, this.state, this.drag.id, cx - this.drag.gx, cy - this.drag.gy));
    }

    onPointerUp() {
        this.drag = null;
    }

    // ---- actions ----------------------------------------------------------

    rotateSelected(direction) {
        const id = this.selectedId;
        const piece = id ? findPiece(this.def, id) : null;

        if (!piece || piece.locked || this.def.rules.allowRotation === false) return;

        if (this.drag?.id !== id) {
            this.apply(rotatePiece(this.def, this.state, id, direction));

            return;
        }

        // Mid-drag the pivot is the cell under the cursor, not the centre, so the
        // grab offset turns with the piece.
        const placement = this.state.placements[id];
        const grab = rotatedGrab(orientedBounds(piece, placement), [this.drag.gx, this.drag.gy], direction);
        const rotation = (((placement.rotation + direction) % 4) + 4) % 4;

        this.regrab(id, { ...placement, rotation }, grab);
    }

    flipSelected() {
        const id = this.selectedId;
        const piece = id ? findPiece(this.def, id) : null;

        if (!piece || piece.locked || this.def.rules.allowFlip !== true) return;

        const placement = this.state.placements[id];

        if (this.drag?.id !== id) {
            this.apply(setPlacement(this.def, this.state, id, { ...placement, flipped: !placement.flipped }));

            return;
        }

        const grab = flippedGrab(
            orientedBounds(piece, placement),
            [this.drag.gx, this.drag.gy],
            placement.rotation
        );

        this.regrab(id, { ...placement, flipped: !placement.flipped }, grab);
    }

    regrab(id, placement, [gx, gy]) {
        const [cx, cy] = this.layout.screenToCellClamped(
            this.input.activePointer.x,
            this.input.activePointer.y
        );

        this.drag = { id, gx, gy };
        this.apply(setPlacement(this.def, this.state, id, { ...placement, x: cx - gx, y: cy - gy }));
    }
}
