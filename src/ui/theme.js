// Catppuccin Latte (light) and Mocha (dark). Board colours mirror the CSS
// custom properties in style.css; Phaser cannot read CSS variables.
// page: Base · panel: Mantle · field: Surface0 · grid: Surface1 · ink: Text · secondary: Subtext0.
// pieces: the regular terminal colours 1–6 (Red, Green, Yellow, Blue, Pink, Teal).
export const schemes = {
    light: { page: 0xeff1f5, panel: 0xe6e9ef, field: 0xccd0da, grid: 0xbcc0cc, ink: 0x4c4f69, secondary: 0x6c6f85,
        pieces: [0xd20f39, 0x40a02b, 0xdf8e1d, 0x1e66f5, 0xea76cb, 0x179299] },
    dark: { page: 0x1e1e2e, panel: 0x181825, field: 0x313244, grid: 0x45475a, ink: 0xcdd6f4, secondary: 0xa6adc8,
        pieces: [0xf38ba8, 0xa6e3a1, 0xf9e2af, 0x89b4fa, 0xf5c2e7, 0x94e2d5] }
};
// Shared opacities of ink over the page, as in the CSS tokens.
export const inkAlpha = { footprint: 0.08, footprintEdge: 0.2 };
// Grid dots and tray cell lines are Surface1 at low opacity.
export const gridAlpha = 0.5;

export const theme = {
    scheme: 'light', ...schemes.light,
    invalidAlpha: 0.3, maxCellSize: 46, panelThickness: 108
};
export function applyScheme(name) {
    const scheme = schemes[name] ? name : 'light';
    return Object.assign(theme, schemes[scheme], { scheme });
}
const query = () => globalThis.matchMedia?.('(prefers-color-scheme: dark)');
export function preferredScheme() { return query()?.matches ? 'dark' : 'light'; }
/** Follow the system colour scheme live; returns an unsubscribe function. */
export function watchScheme(callback) {
    const media = query(); if (!media) return () => {};
    const listener = () => callback(applyScheme(preferredScheme()));
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
}
applyScheme(preferredScheme());

/**
 * A piece's own colour, or the palette's: uncoloured pieces take colours 1–6 in
 * definition order, then cycle. Resolved at paint time so it follows the scheme.
 */
export function pieceColor(def, pieceId) {
    let index = 0;
    for (const piece of def.pieces) {
        if (piece.id === pieceId) return piece.color ?? theme.pieces[index % theme.pieces.length];
        if (piece.color === undefined) index++;
    }
    return theme.pieces[0];
}

export function toColor(hex) {
    if (typeof hex === 'number') return hex;
    let s = hex.replace('#','');
    if (s.length === 3) s = [...s].map(c=>c+c).join('');
    return parseInt(s,16);
}
export function darken(color, amount) {
    const n = toColor(color), k = 1-amount;
    return (Math.round(((n>>16)&255)*k)<<16) | (Math.round(((n>>8)&255)*k)<<8) | Math.round((n&255)*k);
}
export function cssColor(color) { return '#'+toColor(color).toString(16).padStart(6,'0'); }
export function rgba(color, alpha) {
    const n = toColor(color); return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${alpha})`;
}
