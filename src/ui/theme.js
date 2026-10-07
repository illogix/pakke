import { schemes } from '../themes/palettes.js';
import { themePreference } from '../themes/preferences.js';
export { schemes } from '../themes/palettes.js';

export const theme = { scheme: 'light', ...schemes.light, maxCellSize: 46, panelThickness: 108 };
const listeners = new Set();
let preference = 'system';

/** CSS and canvas read the same palette, including translucent material colors. */
export function cssTokens(palette) {
    const tokens = {
        bg: 'page', panel: 'panel', field: 'field', hairline: 'grid', ink: 'ink', secondary: 'secondary',
        hover: 'hover', pressed: 'pressed', started: 'started', 'selected-bg': 'selectedBg', track: 'track', divider: 'divider',
        'primary-bg': 'primaryBg', 'primary-ink': 'primaryInk', 'accent-ink': 'pieceInk', wordmark: 'wordmark',
        'calendar-blue': 'calendarBlue', 'calendar-yellow': 'calendarYellow'
    };
    return {
        ...Object.fromEntries(Object.entries(tokens).map(([name, key]) => [`--${name}`, cssColor(palette[key])])),
        // Home's sections take the first four piece colours, cycling a shorter palette.
        ...Object.fromEntries([1, 2, 3, 4].map(n => [`--accent-${n}`, cssColor(palette.pieces[(n - 1) % palette.pieces.length])])),
        '--scrim': rgba(palette.scrim, palette.scrimAlpha),
        '--sheet-shadow': rgba(palette.sheetShadow, palette.sheetShadowAlpha)
    };
}

// Vite inserts these generated tokens into HTML so the correct theme is visible
// before JavaScript boots. No color values are maintained in CSS or HTML.
export function initialThemeCss() {
    const rule = palette => `:root{${Object.entries(cssTokens(palette)).map(([key, value]) => `${key}:${value}`).join(';')};color-scheme:${palette.colorScheme};background:var(--bg);color:var(--ink)}`;
    return `${rule(schemes.light)}@media(prefers-color-scheme:dark){${rule(schemes.dark)}}`;
}

export function applyScheme(name) {
    const scheme = Object.hasOwn(schemes, name) ? name : 'light';
    Object.assign(theme, schemes[scheme], { scheme });
    if (globalThis.document) {
        const root = document.documentElement;
        for (const [key, value] of Object.entries(cssTokens(theme))) root.style.setProperty(key, value);
        root.style.colorScheme = theme.colorScheme;
        root.dataset.theme = scheme;
        for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.content = cssColor(theme.page);
    }
    for (const listener of listeners) listener(theme);
    return theme;
}
const query = () => globalThis.matchMedia?.('(prefers-color-scheme: dark)');
export function preferredScheme() { return query()?.matches ? 'dark' : 'light'; }
/** Fixed choices ignore system changes; System follows them live. */
export function setThemePreference(value) {
    preference = themePreference(value);
    return applyScheme(preference === 'system' ? preferredScheme() : preference);
}
/** Subscribe to palette changes, whether driven by the system or applyScheme. */
export function watchScheme(callback) {
    listeners.add(callback);
    return () => listeners.delete(callback);
}
query()?.addEventListener('change', () => {
    if (preference === 'system') applyScheme(preferredScheme());
});
applyScheme(preferredScheme());

/**
 * A piece's own colour, or the palette's: uncoloured pieces cycle through the palette in
 * definition order, regardless of its length. Resolved at paint time so it follows the scheme.
 */
export function pieceColor(def, pieceId, flipped = false) {
    let index = 0;
    for (const piece of def.pieces) {
        if (piece.id === pieceId) return (flipped ? piece.flippedColor : undefined) ?? piece.color ?? theme.pieces[index % theme.pieces.length];
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
