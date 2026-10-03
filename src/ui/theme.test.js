import { describe, expect, it } from 'vitest';
import { applyScheme, cssColor, pieceColor, rgba, schemes, theme } from './theme.js';

describe('theme', () => {
    it('switches every board token between schemes', () => {
        applyScheme('dark');
        expect(theme).toMatchObject({ scheme: 'dark', ...schemes.dark });
        applyScheme('light');
        expect(theme).toMatchObject({ scheme: 'light', ...schemes.light });
    });
    it('falls back to light for an unknown scheme', () => {
        expect(applyScheme('sepia').scheme).toBe('light');
    });
    it('keeps both schemes complete and formats colours for canvas', () => {
        expect(Object.keys(schemes.dark)).toEqual(Object.keys(schemes.light));
        expect(schemes.light.pieces).toHaveLength(6);
        expect(schemes.dark.pieces).toHaveLength(6);
        expect(cssColor(schemes.light.page)).toBe('#eff1f5');
        expect(rgba(schemes.dark.ink, 0.06)).toBe('rgba(205,214,244,0.06)');
    });
    it('cycles the palette over uncoloured pieces and keeps explicit colours', () => {
        applyScheme('light');
        const pieces = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(id => ({ id }));
        pieces[1].color = '#123456';
        const def = { pieces };
        const colours = pieces.map(p => pieceColor(def, p.id));
        const palette = schemes.light.pieces;
        expect(colours).toEqual([palette[0], '#123456', palette[1], palette[2], palette[3], palette[4], palette[5], palette[0]]);
        applyScheme('dark');
        expect(pieceColor(def, 'a')).toBe(schemes.dark.pieces[0]);
        applyScheme('light');
    });
});
