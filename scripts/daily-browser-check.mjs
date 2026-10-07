// Optional integration checks against Vite. Uses an existing Playwright install.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { schemes } from '../src/themes/palettes.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {}), args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const base = process.env.PUZZLE_URL || 'http://localhost:5173';
const out = new URL('../docs/verification/', import.meta.url).pathname; await mkdir(out, {recursive:true});
const witnesses = JSON.parse(await readFile(new URL('../src/daily/calendar-witnesses.test.json',import.meta.url),'utf8'));
const context = await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true});
const page = await context.newPage(), errors = []; let checks = 0;
page.on('pageerror', error => errors.push(error.message));
await page.clock.install({time:new Date('2026-10-05T12:00:00')});
await page.addInitScript(() => localStorage.setItem('packing:v2:help-seen','true'));
const scene = (fn, arg) => page.evaluate(async ({source,arg}) => {
    const game = (await import(document.querySelector('script[src*="src/main.js"]').src)).default;
    return await (new Function('s','arg',`return (${source})(s,arg)`))(game.scene.getScene('Play'),arg);
}, {source:fn.toString(),arg});
const group = () => page.getByRole('group',{name:'Daily puzzle mode'});
const close = async () => { if(await page.locator('#sheet').evaluate(d=>d.open)) await page.getByRole('button',{name:'Close',exact:true}).click(); };
const player = async () => { await page.locator('#controls .dock').waitFor(); await page.waitForTimeout(200); await close(); };
const home = async () => { await page.goto(base); await page.getByRole('heading',{name:'Pakke',exact:true}).waitFor(); };
const calendar = async () => { await page.getByRole('button',{name:'More',exact:true}).click(); await page.getByRole('button',{name:'Daily Calendar Puzzles',exact:true}).click(); await page.getByRole('heading',{name:'Daily Calendar Puzzles',exact:true}).waitFor(); };
async function movePiece(id='l4') {
    const point = await scene(async (s,id) => {
        const {placedCells}=await import('/src/core/puzzle.js'), {worldToScreen}=await import('/src/ui/camera.js');
        const p=s.def.pieces.find(p=>p.id===id), [x,y]=placedCells(p,s.state.placements[id])[0];
        const box=s.game.canvas.getBoundingClientRect(), point=worldToScreen(s.def,s.camera,x+.5,y+.5);
        return [box.left+point[0],box.top+point[1]];
    },id);
    await page.mouse.click(...point); await page.getByRole('button',{name:'Rotate right',exact:true}).click();
    await scene(async s => { await s.shell.pendingSave; }); checks++;
}
async function solve(date, allowFlip) {
    const witness=witnesses.find(d=>d.date===date)[allowFlip?'flippable':'fixed'];
    await scene(async (s,placements) => {
        const {createState,setPlacement}=await import('/src/core/state.js');
        const [dx,dy]=s.def.container.labels.find(l=>l.text==='Jan').cell;
        let state=createState(s.def);
        for(const p of placements) state=setPlacement(s.def,state,p.id.toLowerCase(),{x:p.x+dx,y:p.y+dy,rotation:p.rotation,flipped:!p.flipped});
        s.commit(state); await s.shell.pendingSave;
    },witness);
    await page.getByRole('heading',{name:'Solved',exact:true}).waitFor(); checks++;
}
async function layout() {
    const bad = await page.evaluate(() => [...document.querySelectorAll('#screen button,#screen select,#screen .mode-control label')].filter(e=> {
        const r=e.getBoundingClientRect(), minimum=e.closest('.stepper')?40:44;
        return r.width>0 && (r.width<minimum-.1||r.height<44-.1||r.left<0||r.right>innerWidth+.1);
    }).map(e=>e.textContent||e.getAttribute('aria-label')));
    assert.deepEqual(bad,[]); assert(await page.evaluate(()=>document.querySelector('#screen').scrollWidth<=innerWidth)); checks++;
}
try {
    // Palette tokens must also be present before JavaScript starts.
    for (const scheme of ['light','dark']) {
        const boot = await browser.newContext({javaScriptEnabled:false,colorScheme:scheme});
        try {
            const p=await boot.newPage();await p.goto(base);
            const values=await p.locator('html').evaluate(e=>({page:getComputedStyle(e).backgroundColor,panel:getComputedStyle(e).getPropertyValue('--panel').trim()}));
            const rgb=n=>`rgb(${n>>16&255}, ${n>>8&255}, ${n&255})`;
            assert.equal(values.page,rgb(schemes[scheme].page));
            assert.equal(values.panel,'#'+schemes[scheme].panel.toString(16).padStart(6,'0'));checks++;
        } finally {await boot.close();}
    }
    await home(); await layout(); assert.equal(await page.locator('[data-accent="2"] .action-row button').count(),2);
    assert(await group().getByRole('radio',{name:'No flips',exact:true}).isChecked());
    await page.locator('[data-today]').click(); await player();
    assert.equal(await scene(s=>s.def.rules.allowFlip),false); assert.equal(await page.getByRole('button',{name:'Flip',exact:true}).count(),0);
    assert.equal(await scene(s=>s.def.container.labels.length),43); checks++;
    await page.screenshot({path:out+'daily-board-fixed.png'});
    await movePiece(); await calendar();
    const day=()=>page.locator('[data-date="2026-10-05"]');
    assert.equal(await day().locator('.fixed.attempted').count(),1); assert.equal(await day().locator('.flippable.unattempted').count(),1);
    await group().getByRole('radio',{name:'Flips allowed',exact:true}).check(); await day().click(); await player();
    assert.equal(await scene(s=>s.def.rules.allowFlip),true); assert.equal(await page.getByRole('button',{name:'Flip',exact:true}).count(),1);
    await movePiece(); await solve('2026-10-05',true);
    await page.getByRole('button',{name:'Daily Calendar Puzzles',exact:true}).click();
    assert.equal(await day().locator('.flippable.completed').count(),1); assert.equal(await day().locator('.fixed.attempted').count(),1); checks++;
    await group().getByRole('radio',{name:'No flips',exact:true}).check(); await day().click(); await player();
    assert(await scene(s=>!!s.saved)); await solve('2026-10-05',false);
    await page.getByRole('button',{name:'Daily Calendar Puzzles',exact:true}).click();
    assert.equal(await day().locator('.completed').count(),2); checks++;
    // Reload and history retain separate modes and saved placements.
    await day().click(); await player(); await page.reload(); await player(); assert.equal(await scene(s=>s.solved),true);
    await calendar(); await page.goBack(); await player(); await page.goBack(); await page.getByRole('heading',{name:'Daily Calendar Puzzles',exact:true}).waitFor(); checks++;
    for(const month of [1,2,12]) {
        await page.getByLabel('Month',{exact:true}).selectOption(String(month));
        assert.equal(await page.locator('.calendar-day').count(),month===2?28:31);
        assert.equal(await page.getByRole('button',{name:'Previous month',exact:true}).isDisabled(),month===1);
        assert.equal(await page.getByRole('button',{name:'Next month',exact:true}).isDisabled(),month===12); checks++;
    }
    // Continue restores the date and its mode even after another mode was selected.
    await group().getByRole('radio',{name:'No flips',exact:true}).check();
    await page.getByLabel('Month',{exact:true}).selectOption('9');
    await page.locator('[data-date="2026-09-30"]').click(); await player(); await movePiece();
    await page.getByRole('button',{name:'More',exact:true}).click(); await page.getByRole('button',{name:'Home',exact:true}).click();
    await group().getByRole('radio',{name:'Flips allowed',exact:true}).check();
    await page.locator('[data-continue]').click(); await player();
    assert.equal(await scene(s=>s.def.id),'daily-calendar-2026-09-30-fixed');
    await calendar(); assert.equal(await page.getByLabel('Month',{exact:true}).inputValue(),'9');
    assert(await group().getByRole('radio',{name:'No flips',exact:true}).isChecked()); checks++;
    // Both schemes and the narrowest supported layout.
    for(const scheme of ['light','dark']) for(const size of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]) {
        await page.emulateMedia({colorScheme:scheme}); await page.setViewportSize(size);
        await page.getByLabel('Month',{exact:true}).selectOption('10'); await layout();
        await page.screenshot({path:out+`daily-calendar-${size.width}-${scheme}.png`});
        await page.getByRole('button',{name:'Home',exact:true}).click(); await layout();
        await page.screenshot({path:out+`daily-home-${size.width}-${scheme}.png`});
        await page.getByRole('button',{name:'Daily Calendar Puzzles',exact:true}).click();
    }
    // Home controls, both primary buttons, and the canvas follow live changes.
    await page.setViewportSize({width:390,height:844});
    for(const scheme of ['light','dark']) {
        await page.emulateMedia({colorScheme:scheme});
        await page.getByRole('button',{name:'Home',exact:true}).click();
        const surfaces=await page.evaluate(()=>{
            const color=selector=>getComputedStyle(document.querySelector(selector)).backgroundColor;
            return {page:color('body'),stepper:color('.stepper'),today:color('[data-today]'),calendar:color('[data-accent="2"] .square-action'),calendarInk:getComputedStyle(document.querySelector('[data-accent="2"] .square-action')).color,selected:color('.mode-control label:has(input:checked)')};
        });
        const rgb=n=>`rgb(${n>>16&255}, ${n>>8&255}, ${n&255})`;
        const palette=schemes[scheme];
        assert.equal(surfaces.page,rgb(palette.page));assert.equal(surfaces.stepper,rgb(palette.selectedBg));assert.equal(surfaces.selected,rgb(palette.selectedBg));
        assert.equal(surfaces.today,surfaces.calendar);assert.equal(surfaces.calendar,rgb(palette.pieces[1]));assert.equal(surfaces.calendarInk,rgb(palette.pieceInk));
        await page.locator('[data-accent="2"] .square-action').hover();assert.equal(await page.locator('[data-accent="2"] .square-action').evaluate(e=>getComputedStyle(e).backgroundColor),surfaces.today);checks++;
        await page.getByRole('button',{name:'Daily Calendar Puzzles',exact:true}).click();
    }
    await page.locator('[data-date="2026-10-06"]').click();await player();
    for(const scheme of ['light','dark']) {
        await page.emulateMedia({colorScheme:scheme});await page.waitForTimeout(100);
        const palette=schemes[scheme];
        const painted=await scene(async s=>{
            const {theme}=await import('/src/ui/theme.js');
            const {metrics,key}=s.tray,canvas=s.textures.get(key).getSourceImage();
            const cell=s.def.container.cells[0];
            const pixel=canvas.getContext('2d').getImageData(metrics.pad+(cell[0]-metrics.box.minX+.8)*metrics.unit,metrics.pad+(cell[1]-metrics.box.minY+.8)*metrics.unit,1,1).data;
            return {scheme:theme.scheme,pixel:[...pixel],page:s.cameras.main.backgroundColor.color,dock:getComputedStyle(document.querySelector('.dock')).backgroundColor};
        });
        assert.equal(painted.scheme,scheme);assert.equal(painted.page,palette.page);
        assert.deepEqual(painted.pixel,[palette.field>>16&255,palette.field>>8&255,palette.field&255,255]);
        assert.equal(painted.dock,`rgb(${palette.panel>>16&255}, ${palette.panel>>8&255}, ${palette.panel&255})`);
        await page.screenshot({path:out+`theme-board-${scheme}.png`});checks++;
    }
    await page.getByRole('button',{name:'More',exact:true}).click();await page.getByRole('button',{name:'Home',exact:true}).click();
    await page.emulateMedia({colorScheme:'light'}); await page.setViewportSize({width:390,height:844});
    const gen=page.getByRole('group',{name:'Generated pieces can flip'});
    await gen.getByRole('radio',{name:'No flips',exact:true}).check(); await page.locator('[data-generate]').click(); await player();
    assert.equal(await scene(s=>s.def.rules.allowFlip),false); checks++;
    await page.getByRole('button',{name:'More',exact:true}).click(); await page.getByRole('button',{name:'Home',exact:true}).click();
    await page.getByRole('button',{name:'Browse library',exact:true}).click();
    assert.equal(await page.locator('.group').count(),3); // Daily mode has no collection.
    await page.getByRole('button',{name:'Home',exact:true}).click();
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    // Theme choice persists, ignores OS changes when fixed, and follows them in System.
    const selectTheme=async value=>{
        await page.getByLabel('Theme',{exact:true}).selectOption(value);
        await page.waitForFunction(()=>!document.querySelector('#sheet select[aria-label="Theme"]').disabled);
    };
    const applied=async scheme=>{await page.waitForFunction(s=>document.documentElement.dataset.theme===s,scheme);};
    assert.equal(await page.getByLabel('Theme',{exact:true}).inputValue(),'system');
    await selectTheme('dark');await applied('dark');
    await page.emulateMedia({colorScheme:'light'});await applied('dark');checks++;
    await page.screenshot({path:out+'theme-settings-dark.png'});
    await close();await page.locator('[data-today]').click();await player();
    assert.equal(await scene(async s=>(await import('/src/ui/theme.js')).theme.scheme),'dark');
    await page.emulateMedia({colorScheme:'dark'});await page.emulateMedia({colorScheme:'light'});await page.waitForTimeout(100);
    assert.equal(await scene(s=>s.cameras.main.backgroundColor.color),schemes.dark.page);checks++;
    await page.getByRole('button',{name:'More',exact:true}).click();await page.getByRole('button',{name:'Home',exact:true}).click();
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await selectTheme('light');await page.emulateMedia({colorScheme:'dark'});await applied('light');
    await page.reload();await page.getByRole('heading',{name:'Pakke',exact:true}).waitFor();await applied('light');
    await page.getByRole('button',{name:'Settings',exact:true}).click();assert.equal(await page.getByLabel('Theme',{exact:true}).inputValue(),'light');checks++;
    await page.screenshot({path:out+'theme-settings-light.png'});
    await selectTheme('system');await applied('dark');
    await page.emulateMedia({colorScheme:'light'});await applied('light');
    await page.emulateMedia({colorScheme:'dark'});await applied('dark');checks++;
    await selectTheme('dark');
    const waiting=page.waitForEvent('download'); await page.getByRole('button',{name:'Back up library',exact:true}).click();
    const downloaded=await waiting, backup=JSON.parse(await readFile(await downloaded.path(),'utf8'));
    assert.equal(backup.library.preferences.theme,'dark');
    assert.equal(Object.values(backup.library.progress).filter(p=>p.context==='daily'&&p.solved).length,2); checks++;
    // Erase and restore use ordinary library operations, including both dot states.
    await page.getByRole('button',{name:'Erase all saved progress',exact:true}).click(); await page.getByRole('button',{name:'Erase progress',exact:true}).click();
    await page.getByRole('heading',{name:'Pakke',exact:true}).waitFor(); await page.getByRole('button',{name:'Daily Calendar Puzzles',exact:true}).click();
    assert.equal(await day().locator('.completed,.attempted').count(),0);
    await page.getByRole('button',{name:'Home',exact:true}).click();
    await page.getByRole('button',{name:'Settings',exact:true}).click();await selectTheme('light');await close();
    await page.locator('input[data-file="backup"]').setInputFiles({name:'daily-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
    await page.getByRole('checkbox',{name:/Replace conflicting local content/}).check();
    await page.getByRole('button',{name:'Restore into library',exact:true}).click(); await page.getByRole('heading',{name:'Backup restored',exact:true}).waitFor(); await close();await applied('dark');checks++;
    await page.getByRole('button',{name:'Daily Calendar Puzzles',exact:true}).click(); assert.equal(await day().locator('.completed').count(),2); checks++;
    // Optional back color is painted using face identity, even on a symmetric piece.
    await day().click(); await player();
    const colors=await scene(async s=> {
        const {paintMaterial}=await import('/src/ui/materials.js'), {pieceColor}=await import('/src/ui/theme.js');
        const p=s.def.pieces.find(p=>p.id==='o4'); p.color='#123456';p.flippedColor='#abcdef';
        const results=[];
        for(const flipped of [false,true]) {
            const canvas=document.createElement('canvas');const color=pieceColor(s.def,p.id,flipped);
            const metrics=paintMaterial(canvas,[[0,0],[1,0],[0,1],[1,1]],color);
            results.push([...canvas.getContext('2d').getImageData(metrics.pad+20,metrics.pad+20,1,1).data]);
        }
        return results;
    });
    assert.deepEqual(colors,[[18,52,86,255],[171,205,239,255]]); checks++;
    assert.deepEqual(errors,[]); console.log(`${checks} daily browser checks passed; no page errors.`);
} finally {await browser.close();}
