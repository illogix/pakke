// Optional Playwright end-to-end coverage. Production mode also verifies offline reload.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createCamera, openingState, worldToScreen } from '../src/ui/camera.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const base = process.env.PUZZLE_URL || 'http://127.0.0.1:5173';
const production = process.env.PRODUCTION === '1';
const out = new URL('../docs/verification/', import.meta.url).pathname; await mkdir(out, { recursive: true });
const demo = JSON.parse(await readFile(new URL('../src/puzzles/demo01.json', import.meta.url), 'utf8'));
const pack = (revision = 1) => ({ packVersion: 1, pack: { id: 'browser-pack', name: 'A shared collection', author: 'Test creator', revision, description: 'A collection brought in from a file.' }, puzzles: [structuredClone(demo)] });
let checks = 0; const errors = [];
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
let page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
const close = async () => { if (await page.locator('#sheet').evaluate(d => d.open)) await page.getByRole('button', { name: 'Close', exact: true }).click(); };
async function upload(data, backup = false) {
    await page.locator(`input[data-file="${backup ? 'backup' : 'pack'}"]`).setInputFiles({ name: backup ? 'backup.json' : 'pack.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
}
async function state() {
    return page.evaluate(() => new Promise((resolve, reject) => {
        const open = indexedDB.open('packing-library', 1); open.onerror = () => reject(open.error);
        open.onsuccess = () => { const db = open.result, tx = db.transaction('library', 'readonly'), get = tx.objectStore('library').get('current'); tx.oncomplete = () => { resolve(get.result); db.close(); }; };
    }));
}
async function home() { await page.goto(base); await page.getByRole('heading', { name: 'Pakke', exact: true }).waitFor(); }
const group = name => page.locator('.group').filter({ has: page.locator('.group-name', { hasText: name }) });
async function collectionsPage() { await page.getByRole('button', { name: /Hand-made sets/ }).click(); await page.getByRole('heading', { name: 'Collections', exact: true }).waitFor(); }
async function expand(name) { const toggle = group(name).locator('.group-toggle'); if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click(); }
async function expanded(name) { await group(name).locator('.group-toggle[aria-expanded="true"]').waitFor(); }
async function sheetButton(name) { await page.locator('#sheet').getByRole('button', { name, exact: true }).click(); }
async function dragCells(def, from, to) {
    const rect=await page.locator('#game canvas').boundingBox(),camera=createCamera(def,rect,openingState(def,rect));
    const a=worldToScreen(def,camera,...from),b=worldToScreen(def,camera,...to);
    await page.mouse.move(rect.x+a[0],rect.y+a[1]);await page.mouse.down();await page.mouse.move(rect.x+b[0],rect.y+b[1],{steps:6});await page.mouse.up();await page.waitForTimeout(200);
}
async function assertLayout() {
    const bad = await page.evaluate(() => [...document.querySelectorAll('#screen button, #screen input, #screen select')].filter(e => {
        // Stepper buttons are 40 px wide but the full 56 px row tall.
        const r = e.getBoundingClientRect(), minWidth = e.closest('.stepper') ? 40 : 44; return r.width > 0 && (r.width < minWidth || r.height < 44 || r.left < -1 || r.right > innerWidth + 1);
    }).map(e => e.textContent || e.getAttribute('aria-label')));
    assert.deepEqual(bad, []); assert(await page.evaluate(() => document.querySelector('#screen').scrollWidth <= innerWidth)); checks++;
}
async function download(button) {
    const waiting = page.waitForEvent('download'); await button.click(); const file = await waiting;
    return JSON.parse(await readFile(await file.path(), 'utf8'));
}
try {
    await home(); assert.equal(await page.locator('.stepper').count(), 2); assert.equal(await page.locator('[data-generate]').textContent(), 'Generate 6 × 6'); checks++;
    await collectionsPage(); assert.equal(await page.locator('.group').count(), 3); assert.equal(await group('Generated puzzles').locator('.icon-button').count(), 0); checks++;
    // Both pages, both colour schemes, every layout size.
    for (const scheme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme: scheme }); const suffix = scheme === 'dark' ? '-dark' : '';
        for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
            await page.setViewportSize(viewport);
            await home(); await assertLayout(); await page.screenshot({ path: out + `home-${viewport.width}x${viewport.height}${suffix}.png` });
            await collectionsPage(); await expand('First steps'); await assertLayout(); await page.screenshot({ path: out + `collections-${viewport.width}x${viewport.height}${suffix}.png` });
        }
    }
    await page.emulateMedia({ colorScheme: 'light' }); await page.setViewportSize({ width: 390, height: 844 });
    await home(); await page.getByRole('button', { name: 'Increase width', exact: true }).click(); await page.getByRole('button', { name: 'Decrease height', exact: true }).click();
    assert.equal(await page.locator('[data-generate]').textContent(), 'Generate 7 × 5'); checks++;
    await collectionsPage(); await expand('First steps'); assert.equal(await group('First steps').locator('.puzzle-row').count(), 4); checks++;
    // Browse filters survive returning from play; direct links retain pack context.
    await page.getByRole('searchbox').fill('little');
    await page.getByRole('button', { name: 'Filter and sort', exact: true }).click(); await page.getByLabel('Sort', { exact: true }).selectOption('name'); await close();
    assert.equal(await page.getByRole('button', { name: 'Filter and sort', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.locator('.puzzle-row').click(); await page.locator('#controls .dock').waitFor(); await page.waitForTimeout(250); await close();
    assert(new URL(page.url()).searchParams.get('pack') === 'first-steps');
    await page.getByRole('button', { name: 'More', exact: true }).click(); await sheetButton('Home'); await page.getByRole('heading', { name: 'Pakke', exact: true }).waitFor();
    await collectionsPage(); assert.equal(await page.getByRole('searchbox').inputValue(), 'little'); assert.equal(await page.locator('.puzzle-row').count(), 1);
    await page.getByRole('button', { name: 'Filter and sort', exact: true }).click(); assert.equal(await page.getByLabel('Sort', { exact: true }).inputValue(), 'name');
    await page.getByLabel('Sort', { exact: true }).selectOption('authored'); await close(); await page.getByRole('searchbox').fill(''); checks++;
    await page.goBack(); await page.getByRole('heading', { name: 'Pakke', exact: true }).waitFor(); await page.goBack(); await page.locator('#controls .dock').waitFor(); await page.goBack(); await page.getByRole('heading', { name: 'Collections', exact: true }).waitFor(); checks++;
    await home();
    // Invalid import changes no catalog or progress.
    const before = await state(), broken = pack(); broken.puzzles[0].pieces = [];
    await upload(broken); await page.getByRole('heading', { name: 'Could not complete that action' }).waitFor(); assert.deepEqual(await state(), before); await close(); checks++;
    const original = pack(); await upload(original); await page.getByRole('button', { name: 'Add pack', exact: true }).click();
    await page.getByRole('heading', { name: 'Saved to your library' }).waitFor(); await page.getByRole('button', { name: 'Open collection', exact: true }).click();
    await expanded('A shared collection'); checks++;
    await page.getByRole('button', { name: 'A shared collection actions', exact: true }).click();
    assert.deepEqual(await download(page.getByRole('button', { name: 'Export pack', exact: true })), original); await close(); checks++;
    await group('A shared collection').locator('.puzzle-row').click(); await page.locator('#controls .dock').waitFor(); await page.waitForTimeout(200); await close();
    // A fresh attempt is arranged for the screen, exactly as the player does it.
    const barStart = openingState(demo, await page.locator('#game canvas').boundingBox()).placements.bar;
    await dragCells(demo,[barStart.x+.3,barStart.y+.5],[barStart.x+1.3,barStart.y+.5]);
    await page.getByRole('button',{name:'More',exact:true}).click();await sheetButton('Home');await page.getByRole('heading',{name:'Pakke',exact:true}).waitFor();
    const moved=await state(),gameKey=moved.definitions[moved.packs['browser-pack'].keys[0]].gameKey;
    assert.equal(moved.progress[gameKey].state.placements.bar.x,barStart.x+1);checks++;
    const installed = await state(); await upload(original); await page.getByRole('heading', { name: 'Already installed', exact: true }).waitFor(); assert.deepEqual(await state(), installed); await close(); checks++;
    await upload(pack(2)); await page.getByRole('button', { name: 'Update pack', exact: true }).click(); await page.getByRole('heading', { name: 'Saved to your library' }).waitFor(); await close();
    await upload(pack(1)); await page.getByRole('heading', { name: 'Update preview' }).waitFor(); assert(await page.getByRole('button', { name: 'Update pack', exact: true }).isDisabled());
    await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Update pack', exact: true }).click(); await page.getByRole('heading', { name: 'Saved to your library' }).waitFor(); await close(); checks++;
    // Authoring drafts are recognized and cannot accidentally become playable.
    await upload({ kind: 'draft', draftVersion: 1, definition: demo }); await page.getByRole('heading', { name: 'Could not complete that action' }).waitFor(); assert((await page.locator('.file-message').textContent()).includes('draft'));
    await close(); checks++;
    // Share a standalone puzzle and search by catalog number.
    const loose = structuredClone(demo); loose.id = 'standalone-test'; loose.meta.name = 'One loose puzzle'; loose.meta.catalogNumber = 'CAT-492';
    await upload(loose); await page.getByRole('button', { name: 'Add puzzle', exact: true }).click(); await page.getByRole('heading', { name: 'Saved to your library' }).waitFor(); await close();
    await home(); await collectionsPage(); await page.getByRole('searchbox').fill('CAT-492'); assert.equal(await page.locator('.puzzle-row').count(), 1); assert.equal(await group('Generated puzzles').locator('.puzzle-row').count(), 1); checks++;
    await home(); await page.getByRole('button', { name: 'Settings', exact: true }).click(); await page.getByRole('checkbox', { name: 'Reduce motion' }).check();
    const backup = await download(page.getByRole('button', { name: 'Back up library', exact: true })); assert.equal(backup.backupVersion, 1); assert(backup.library.preferences['reduced-motion']); await close(); checks++;
    // Restore on a fresh browser profile, not just into the exporting context.
    const second = await browser.newContext({ viewport: { width: 390, height: 844 } }); const firstPage = page; page = await second.newPage(); page.on('pageerror', e => errors.push(e.message)); await home();
    await upload(backup, true); await page.getByRole('button', { name: 'Restore into library', exact: true }).click(); await page.getByRole('heading', { name: 'Backup restored' }).waitFor(); await close();
    assert((await state()).packs['browser-pack']); assert.equal((await state()).loose.length, 1); assert((await state()).preferences['reduced-motion']); assert.deepEqual((await state()).progress,backup.library.progress); checks++;
    await collectionsPage(); await page.getByRole('button', { name: 'A shared collection actions', exact: true }).click(); await sheetButton('Remove pack'); await sheetButton('Remove from library');
    await page.locator('#sheet:not([open])').waitFor({ state: 'attached' }); assert.equal(await group('A shared collection').count(), 0); assert(!(await state()).packs['browser-pack']); checks++;
    await upload(original);await page.getByRole('button',{name:'Add pack',exact:true}).click();await page.getByRole('heading',{name:'Saved to your library'}).waitFor();assert.equal((await state()).progress[gameKey].state.placements.bar.x,barStart.x+1);await close();checks++;
    await second.close(); page = firstPage;
    if (production) {
        await home(); await page.waitForFunction(() => navigator.serviceWorker?.controller);
        await context.setOffline(true); await page.reload(); await page.getByRole('heading', { name: 'Pakke', exact: true }).waitFor();
        await collectionsPage(); await expand('A shared collection'); await group('A shared collection').locator('.puzzle-row').click(); await page.locator('#controls .dock').waitFor(); await close();
        await page.screenshot({ path: out + 'offline-imported-player.png' }); checks++;
        await page.goto(`${base}/?pack=first-steps`); await expanded('First steps'); await group('First steps').locator('.puzzle-row').first().click(); await page.locator('#controls .dock').waitFor(); checks++;
        await context.setOffline(false);
    }
    assert.deepEqual(errors, []); console.log(`PASS: ${checks} library browser checks${production ? ', including production offline reload' : ''}. No page errors.`);
} finally { await browser.close(); }
