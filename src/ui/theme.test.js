import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyScheme, cssColor, cssTokens, initialThemeCss, pieceColor, rgba, schemes, setThemePreference, theme, watchScheme } from './theme.js';

describe('theme', () => {
    afterEach(() => { vi.unstubAllGlobals(); delete schemes.test; setThemePreference('system'); applyScheme('light'); });
    it('switches every board token between schemes', () => {
        applyScheme('dark');
        expect(theme).toMatchObject({ scheme: 'dark', ...schemes.dark });
        applyScheme('light');
        expect(theme).toMatchObject({ scheme: 'light', ...schemes.light });
    });
    it('resolves System from the OS and honors fixed choices', () => {
        vi.stubGlobal('matchMedia', () => ({ matches: true }));
        expect(setThemePreference('light').scheme).toBe('light');
        expect(setThemePreference('dark').scheme).toBe('dark');
        expect(setThemePreference('system').scheme).toBe('dark');
        expect(setThemePreference(undefined).scheme).toBe('dark');
        vi.stubGlobal('matchMedia', () => ({ matches: false }));
        expect(setThemePreference('system').scheme).toBe('light');
    });
    it('falls back to light for an unknown scheme', () => {
        expect(applyScheme('sepia').scheme).toBe('light');
    });
    it('keeps both schemes complete and formats colours for canvas', () => {
        expect(Object.keys(schemes.dark)).toEqual(Object.keys(schemes.light));
        for (const scheme of Object.values(schemes)) expect(scheme.pieces.length).toBeGreaterThan(0);
        expect(cssColor(schemes.light.page)).toBe('#dce0e8');
        expect(rgba(schemes.dark.ink, 0.06)).toBe('rgba(205,214,244,0.06)');
    });
    it('cycles a four-color theme twice over eight uncolored pieces', () => {
        schemes.test = { ...schemes.light, pieces: schemes.light.pieces.slice(0, 4) };
        applyScheme('test');
        const def = { pieces: Array.from({ length: 8 }, (_, i) => ({ id: String(i) })) };
        expect(def.pieces.map(p => pieceColor(def, p.id))).toEqual([...theme.pieces, ...theme.pieces]);
        for (const p of def.pieces) expect(pieceColor(def, p.id, true)).toBe(pieceColor(def, p.id));
    });
    it('notifies renderers for explicit palette changes and unsubscribes', () => {
        const listener = vi.fn(), unsubscribe = watchScheme(listener);
        try {
            applyScheme('dark');
            expect(listener).toHaveBeenCalledWith(theme);
            unsubscribe(); applyScheme('light');
            expect(listener).toHaveBeenCalledTimes(1);
        } finally { unsubscribe(); }
    });
    it('generates pre-boot CSS and every UI token from the palette', () => {
        const css = initialThemeCss();
        for (const palette of Object.values(schemes)) {
            for (const [key, value] of Object.entries(cssTokens(palette))) expect(css).toContain(`${key}:${value}`);
            expect(cssTokens(palette)['--panel']).toBe(cssColor(palette.panel));
            expect(cssTokens(palette)['--accent-4']).toBe(cssColor(palette.pieces[3]));
        }
        const short = cssTokens({ ...schemes.light, pieces: [0x112233, 0x445566] });
        expect([short['--accent-1'], short['--accent-3']]).toEqual(['#112233', '#112233']);
        expect(css).toContain('@media(prefers-color-scheme:dark)');
    });
    it('resolves flip-side colors, including symmetric shapes, without shifting the palette', () => {
        const def = {pieces: [{id:'a', flippedColor:'#abc'}, {id:'b', color:'#123456'}, {id:'c'}]};
        for (const scheme of ['light', 'dark']) {
            applyScheme(scheme);
            expect(pieceColor(def, 'a', true)).toBe('#abc');
            expect(pieceColor(def, 'a', false)).toBe(schemes[scheme].pieces[0]);
            expect(pieceColor(def, 'b', true)).toBe('#123456');
            expect(pieceColor(def, 'c', true)).toBe(schemes[scheme].pieces[1]);
        }
        applyScheme('light');
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
