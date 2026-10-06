import { schemes, cssColor, initialThemeCss } from '../src/ui/theme.js';

// Generate pre-boot colors from the same palette used by the running app.
export function themePlugin() {
    return {
        name: 'packing-theme',
        transformIndexHtml() {
            return [
                { tag: 'style', attrs: { id: 'theme-tokens' }, children: initialThemeCss(), injectTo: 'head-prepend' },
                ...[schemes.light, schemes.dark].map(palette => ({
                    tag: 'meta', attrs: { name: 'theme-color', content: cssColor(palette.page), media: `(prefers-color-scheme: ${palette.colorScheme})` },
                    injectTo: 'head-prepend'
                }))
            ];
        }
    };
}
