// Flat and geometric: solid fills, no gradients, no bevels. The only decoration
// is line weight, which is what distinguishes normal, selected and locked pieces
// from each other.
//
// Theme lives in code rather than in puzzle definitions. Puzzles carry piece
// colours and nothing else about how they look.

export const theme = {
    page: 0x101015,
    field: 0x181820,
    fieldStroke: 0x24242f,
    gridLine: 0x20202a,
    trayFill: 0x2b2b38,
    trayStroke: 0x474759,
    trayGridLine: 0x333342,

    pieceGridLine: 0x000000,
    pieceGridAlpha: 0.09,
    pieceStrokeDarken: 0.45,
    pieceStrokeWidth: 2,

    selectedStroke: 0xffffff,
    selectedStrokeWidth: 4,

    lockedOverlay: 0x000000,
    lockedOverlayAlpha: 0.4,
    lockedStrokeWidth: 5,
    lockedStrokeDarken: 0.65,

    // Conflicts read as a warning label rather than a colour, so they stay
    // legible over any piece colour and do not rely on hue to be noticed.
    conflictBase: 0xf5f5f5,
    conflictBaseAlpha: 0.92,
    conflictStripe: 0xd42020,
    conflictStripeWidth: 3,
    conflictStripesPerCell: 4,

    panel: 0x1c1c26,
    panelStroke: 0x2e2e3c,
    button: 0x2f2f3f,
    buttonHover: 0x3d3d51,
    buttonDisabled: 0x232330,
    buttonStroke: 0x4a4a60,
    buttonText: '#e6e6f0',
    buttonTextDisabled: '#5d5d70',
    statusText: '#9a9ab0',
    solvedText: '#7fe0a8',

    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',

    maxCellSize: 46,
    minCellSize: 6,
    panelThickness: 92,
    panelThicknessLandscape: 168
};

/** '#rrggbb' from a puzzle definition to the integer Phaser wants. */
export function toColor(hex) {
    return typeof hex === 'number' ? hex : parseInt(hex.replace('#', ''), 16);
}

export function darken(color, amount) {
    const value = toColor(color);
    const scale = 1 - amount;

    const r = Math.round(((value >> 16) & 0xff) * scale);
    const g = Math.round(((value >> 8) & 0xff) * scale);
    const b = Math.round((value & 0xff) * scale);

    return (r << 16) | (g << 8) | b;
}
