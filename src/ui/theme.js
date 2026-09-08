// Shared warm material palette; piece identity stays in the definitions.
export const theme = {
    page: 0xf4f2ee, gridLine: 0xdcded7, trayFill: 0xe3e3de,
    trayStroke: 0xb9bfb7, trayGridLine: 0xcbd0c8,
    ink: '#343c3a', secondary: '#707874', invalidAlpha: 0.23,
    maxCellSize: 46, panelThickness: 108,
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
};
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
