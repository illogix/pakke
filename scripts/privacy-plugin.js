import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { schemes, cssColor } from '../src/ui/theme.js';

const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const link = text => text.replace(/https:\/\/[^\s<]+[^\s<.,)]/g, url => `<a href="${url}">${url}</a>`);

// PRIVACY.md uses only headings and paragraphs, so a block-level conversion is enough.
function render(markdown) {
    return markdown.trim().split(/\n\s*\n/).map(block => {
        const text = link(escape(block.replace(/\s*\n\s*/g, ' ')));
        const heading = text.match(/^(#{1,2}) (.*)$/);
        return heading ? `<h${heading[1].length}>${heading[2]}</h${heading[1].length}>` : `<p>${text}</p>`;
    }).join('\n');
}

// Publish PRIVACY.md as /privacy/ on the web build, the URL given to the App Store.
export function privacyPlugin() {
    let root;
    return {
        name: 'packing-privacy', apply: 'build',
        configResolved(config) { root = config.root; },
        async generateBundle() {
            const { light, dark } = schemes;
            const source = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<title>Pakke Privacy Policy</title>
<style>
    body { margin: 0 auto; max-width: 40rem; padding: 2rem 1rem 4rem; font: 1rem/1.55 system-ui, -apple-system, sans-serif;
        background: ${cssColor(light.page)}; color: ${cssColor(light.ink)}; }
    @media (prefers-color-scheme: dark) { body { background: ${cssColor(dark.page)}; color: ${cssColor(dark.ink)}; } }
    h1 { font-size: 1.75rem; } h2 { font-size: 1.15rem; margin-top: 2rem; }
    a { color: inherit; overflow-wrap: anywhere; }
</style>
</head>
<body>
${render(await readFile(resolve(root, 'PRIVACY.md'), 'utf8'))}
</body>
</html>
`;
            this.emitFile({ type: 'asset', fileName: 'privacy/index.html', source });
        }
    };
}
