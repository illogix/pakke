// The single source of theme color values. Catppuccin Latte and Mocha:
// https://github.com/catppuccin/palette
// Every theme supplies the same semantic tokens and a nonempty piece palette.
// Pieces cycle through that palette; its length is not fixed. Home's four
// section buttons take its first four colours, with `pieceInk` labels.
export const schemes = {
    light: {
        colorScheme: 'light',
        page: 0xdce0e8, panel: 0xeff1f5, field: 0xbcc0cc, grid: 0xacb0be, divider: 0xacb0be,
        ink: 0x4c4f69, secondary: 0x5c5f77,
        hover: 0xe6e9ef, pressed: 0xdce0e8, track: 0xccd0da, selectedBg: 0xeff1f5, started: 0x9ca0b0,
        primaryBg: 0x4c4f69, primaryInk: 0xeff1f5, pieceInk: 0xeff1f5, wordmark: 0x8839ef, iconGround: 0xeff1f5,
        calendarBlue: 0x1e66f5, calendarYellow: 0xdf8e1d,
        scrim: 0x4c4f69, scrimAlpha: 0.25,
        sheetShadow: 0x000000, sheetShadowAlpha: 0.23,
        pieceShadow: 0x141414, liftedShadowAlpha: 0.22, lockedShadowAlpha: 0.16,
        grainHighlight: 0xffffff, grainHighlightAlpha: 0.2,
        grainShade: 0x141414, grainShadeAlpha: 0.14,
        invalidShade: 0x000000, invalidAlpha: 0.3,
        pieceSeam: 0x000000, pieceSeamAlpha: 0.06,
        footprintAlpha: 0.08, footprintEdgeAlpha: 0.2, gridAlpha: 0.5,
        pieces: [0xd20f39, 0x40a02b, 0xdf8e1d, 0x1e66f5, 0xea76cb, 0x179299]
    },
    dark: {
        colorScheme: 'dark',
        page: 0x11111b, panel: 0x313244, field: 0x45475a, grid: 0x585b70, divider: 0x313244,
        ink: 0xcdd6f4, secondary: 0xa6adc8,
        hover: 0x45475a, pressed: 0x585b70, track: 0x313244, selectedBg: 0x585b70, started: 0x6c7086,
        primaryBg: 0xcdd6f4, primaryInk: 0x1e1e2e, pieceInk: 0x11111b, wordmark: 0xcba6f7, iconGround: 0x1e1e2e,
        calendarBlue: 0x89b4fa, calendarYellow: 0xf9e2af,
        scrim: 0x11111b, scrimAlpha: 0.6,
        sheetShadow: 0x000000, sheetShadowAlpha: 0.23,
        pieceShadow: 0x000000, liftedShadowAlpha: 0.5, lockedShadowAlpha: 0.5,
        grainHighlight: 0xffffff, grainHighlightAlpha: 0.2,
        grainShade: 0x141414, grainShadeAlpha: 0.14,
        invalidShade: 0x000000, invalidAlpha: 0.3,
        pieceSeam: 0x000000, pieceSeamAlpha: 0.06,
        footprintAlpha: 0.08, footprintEdgeAlpha: 0.2, gridAlpha: 0.5,
        pieces: [0xf38ba8, 0xa6e3a1, 0xf9e2af, 0x89b4fa, 0xf5c2e7, 0x94e2d5]
    }
};

// Native iOS tinting uses luminance rather than the UI theme.
export const tintedIcon = { page: 0x000000, blue: 0xffffff, yellow: 0x999999 };
