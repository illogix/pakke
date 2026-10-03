// Regenerates the favicon and the iOS app icons: a P piece and the two cells
// that complete its 3×3 square, in the Latte or Mocha Blue and Yellow.
// PLAYWRIGHT_MODULE and CHROME_PATH work as in the browser checks.
import { writeFile } from 'node:fs/promises';

const CELL = 6, ORIGIN = 7, RADIUS = 0.6;
const schemes = {
    light: { page: '#eff1f5', blue: '#1e66f5', yellow: '#df8e1d' },
    dark: { page: '#1e1e2e', blue: '#89b4fa', yellow: '#f9e2af' },
    // iOS tints by luminance; the two pieces keep distinct brightness.
    tinted: { page: '#000000', blue: '#ffffff', yellow: '#999999' }
};

// Clockwise outlines in 32-unit icon space. The pieces share their seam: any gap
// would leave the P's lower cell narrower than it is tall.
const at = n => ORIGIN + n * CELL;
const pieces = {
    blue: [[at(0), at(0)], [at(3), at(0)], [at(3), at(2)], [at(1), at(2)], [at(1), at(3)], [at(0), at(3)]],
    yellow: [[at(1), at(2)], [at(3), at(2)], [at(3), at(3)], [at(1), at(3)]]
};

/** A polygon path with every corner rounded, convex and concave, like the pieces in play. */
function rounded(points) {
    const n = points.length, unit = ([x, y]) => { const l = Math.hypot(x, y); return [x / l, y / l]; };
    let d = '';
    points.forEach((p, i) => {
        const prev = points[(i + n - 1) % n], next = points[(i + 1) % n];
        const d1 = unit([p[0] - prev[0], p[1] - prev[1]]), d2 = unit([next[0] - p[0], next[1] - p[1]]);
        const a = [p[0] - d1[0] * RADIUS, p[1] - d1[1] * RADIUS], b = [p[0] + d2[0] * RADIUS, p[1] + d2[1] * RADIUS];
        const sweep = d1[0] * d2[1] - d1[1] * d2[0] > 0 ? 1 : 0;
        d += `${i ? 'L' : 'M'}${a.join(' ')}A${RADIUS} ${RADIUS} 0 0 ${sweep} ${b.join(' ')}`;
    });
    return d + 'Z';
}
const shapes = s => `<path d="${rounded(pieces.blue)}" fill="${s.blue}"/><path d="${rounded(pieces.yellow)}" fill="${s.yellow}"/>`;

// The favicon follows the system scheme where the browser supports it, Latte otherwise.
const { light, dark } = schemes;
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><style>.page{fill:${light.page}}.blue{fill:${light.blue}}.yellow{fill:${light.yellow}}@media (prefers-color-scheme:dark){.page{fill:${dark.page}}.blue{fill:${dark.blue}}.yellow{fill:${dark.yellow}}}</style><rect class="page" width="32" height="32" rx="7"/><path class="blue" d="${rounded(pieces.blue)}"/><path class="yellow" d="${rounded(pieces.yellow)}"/></svg>\n`;
await writeFile(new URL('../public/favicon.svg', import.meta.url), favicon);

// App icons are full-bleed and opaque; iOS applies its own mask.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
const set = '../ios/App/App/Assets.xcassets/AppIcon.appiconset/';
for (const [name, file] of [['light', 'AppIcon-512@2x.png'], ['dark', 'AppIcon-dark.png'], ['tinted', 'AppIcon-tinted.png']]) {
    const s = schemes[name];
    await page.setContent(`<style>html,body{margin:0}</style><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="1024" height="1024"><rect width="32" height="32" fill="${s.page}"/>${shapes(s)}</svg>`);
    await page.locator('svg').screenshot({ path: new URL(set + file, import.meta.url).pathname });
}
await browser.close();
console.log('Wrote public/favicon.svg and the light, dark and tinted app icons.');
