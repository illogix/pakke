// Optional integration checks against a running Vite dev server.
// PLAYWRIGHT_MODULE can point to an existing Playwright installation.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const base=process.env.PUZZLE_URL || 'http://127.0.0.1:5173';
const out=new URL('../docs/verification/',import.meta.url).pathname;await mkdir(out,{recursive:true});
const errors=[];let checks=0;
// demo01 coordinates: offsets from the tray's top-left cell and from the bar's
// start, which the opening arrangement sets for each screen; load and reset reread it.
const demo=JSON.parse(await readFile(new URL('../src/puzzles/demo01.json',import.meta.url)));
const origin=[Math.min(...demo.container.cells.map(c=>c[0])),Math.min(...demo.container.cells.map(c=>c[1]))];
let barStart=null;
const tray=(x,y)=>[origin[0]+x,origin[1]+y],bar=(x,y)=>[barStart.x+x,barStart.y+y];
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const scene=async(fn,arg)=>page.evaluate(async({source,arg})=>{
    const game=(await import(document.querySelector('script[src*="src/main.js"]').src)).default;
    return (new Function('game','s','arg',`return (${source})(s,arg,game)`))(game,game.scene.getScene('Play'),arg);
},{source:fn.toString(),arg});
const pause=()=>page.waitForTimeout(160);
const world=async(x,y)=>scene(async(s,p)=>{
    // Page coordinates: the canvas sits below any safe-area inset.
    const {worldToScreen}=await import('/src/ui/camera.js'),box=s.game.canvas.getBoundingClientRect(),[x,y]=worldToScreen(s.def,s.camera,...p);return [box.left+x,box.top+y];
},[x,y]);
const controls=()=>page.locator('#controls .dock').waitFor();
const placed=async()=>{barStart=await scene(s=>s.state.placements.bar??null);};
async function load(id='demo01') {
    await page.goto(`${base}/?puzzle=${id}`);await controls();
    await page.waitForTimeout(300);
    if(await page.locator('#sheet').evaluate(d=>d.open))await page.getByRole('button',{name:'Close',exact:true}).click();
    await pause();assert.equal(await scene(s=>s.sys.isActive()),true);await placed();
}
async function reset(){await scene(s=>s.resetPuzzle());await pause();await placed();}
const fit=()=>page.getByRole('button',{name:'Fit all pieces in view',exact:true}),flip=()=>page.getByRole('button',{name:'Flip',exact:true});
const trayCentre=()=>scene(async s=>{const {worldToScreen}=await import('/src/ui/camera.js');const cells=s.def.container.cells;
    const corners=cells.flatMap(([x,y])=>[worldToScreen(s.def,s.camera,x,y),worldToScreen(s.def,s.camera,x+1,y+1)]);
    return [(Math.min(...corners.map(p=>p[0]))+Math.max(...corners.map(p=>p[0])))/2-s.camera.viewport.width/2,(Math.min(...corners.map(p=>p[1]))+Math.max(...corners.map(p=>p[1])))/2-s.camera.viewport.height/2];});
async function drag(from,to) {const a=await world(...from),b=await world(...to);await page.mouse.move(...a);await page.mouse.down();await page.mouse.move(...b,{steps:5});await page.mouse.up();await pause();}
try {
    await load();
    assert(await page.locator('#controls').isVisible());assert.equal(await page.getByRole('button',{name:'Flip',exact:true}).count(),0);
    const layout=await page.evaluate(()=>({host:document.querySelector('#game').getBoundingClientRect().toJSON(),canvas:document.querySelector('#game canvas').getBoundingClientRect().toJSON(),footer:document.querySelector('#controls').getBoundingClientRect().toJSON()}));
    assert.equal(layout.canvas.height,layout.host.height,'canvas must match measured play viewport');assert(layout.canvas.top>=0);assert(layout.canvas.bottom<=layout.footer.top+.01);
    // One dock at the bottom; Restart, Help and Home live in the More menu.
    assert.deepEqual(await page.locator('#controls .dock button').evaluateAll(b=>b.map(e=>e.getAttribute('aria-label'))),['Rotate left','Rotate right','Fit all pieces in view','More']);
    assert.equal(await page.locator('.progress').count(),0);
    for(const name of ['Restart','Home','Help'])assert.equal(await page.getByRole('button',{name,exact:true}).count(),0,name);
    // The tray opens in the middle of the board.
    const centre=await trayCentre();assert(Math.abs(centre[0])<.5&&Math.abs(centre[1])<.5,`tray off centre by ${centre}`);checks++;
    await page.getByRole('button',{name:'More',exact:true}).click();
    assert.deepEqual(await page.locator('#sheet .menu-item').evaluateAll(b=>b.map(e=>e.textContent)),['Restart','Help','Home']);
    await page.screenshot({path:out+'menu.png'});
    // A tap on the backdrop cancels: from the menu, and from Restart's confirmation.
    await page.mouse.click(8,8);await pause();assert.equal(await page.locator('#sheet').evaluate(d=>d.open),false);
    const untouched=await scene(s=>JSON.stringify(s.state));
    await page.getByRole('button',{name:'More',exact:true}).click();await page.locator('#sheet').getByRole('button',{name:'Restart',exact:true}).click();
    await page.getByRole('heading',{name:'Restart?',exact:true}).waitFor();await page.mouse.click(8,8);await pause();
    assert.equal(await page.locator('#sheet').evaluate(d=>d.open),false);assert.equal(await scene(s=>JSON.stringify(s.state)),untouched);
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'More');checks++;
    // Fractional preview: no state mutation/save before release, grab point preserved.
    const a=await world(...bar(.27,.63));await page.mouse.move(...a);await page.mouse.down();await page.mouse.move(a[0]+12.3,a[1]+8.7);await pause();
    const preview=await scene(s=>({g:s.gesture,state:s.state,c:s.camera}));
    assert.equal(preview.state.placements.bar.x,barStart.x);assert(Math.abs(preview.g.preview.x-(barStart.x+12.3/preview.c.size))<.001);assert(preview.g.moved);checks++;
    await page.screenshot({path:out+'dragging.png'});
    await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await scene(s=>s.gesture),null);assert.equal(await scene(s=>s.state.placements.bar.x),barStart.x);checks++;
    // Captured release outside the viewport commits at the finite workspace limit.
    const outsideStart=await world(...bar(.3,.5));await page.mouse.move(...outsideStart);await page.mouse.down();
    await page.mouse.move(-3000,-3000);await page.mouse.up();await pause();
    assert.equal(await scene(s=>s.gesture),null);
    const limit=await scene(async s=>{const {workspaceBounds}=await import('/src/core/workspace.js');return workspaceBounds(s.def);});
    assert.deepEqual(await scene(s=>[s.state.placements.bar.x,s.state.placements.bar.y]),[limit.minX,limit.minY]);checks++;
    await reset();
    // A turn while held preserves the exact local point and commits only on release.
    const held=await world(...bar(.27,.63));await page.mouse.move(...held);await page.mouse.down();await page.keyboard.press('r');await pause();
    assert.equal(await scene(s=>s.state.placements.bar.rotation),0);
    assert.equal(await scene(s=>s.gesture.preview.rotation),1);
    assert(Math.abs((await scene(s=>s.gesture.preview.x+s.gesture.grab[0]))-(barStart.x+.27))<.001);
    await page.mouse.up();await pause();assert.equal(await scene(s=>s.state.placements.bar.rotation),1);checks++;
    await reset();
    // A tap selects, a second tap turns clockwise; a drag that returns to its start is only a move.
    const tapped=await world(...bar(.5,.5));await scene(s=>{s.selectedId=null;});
    await page.mouse.click(...tapped);await pause();assert.equal(await scene(s=>s.selectedId),'bar');assert.equal(await scene(s=>s.state.placements.bar.rotation),0);
    await page.mouse.click(...tapped);await pause();assert.equal(await scene(s=>s.state.placements.bar.rotation),1);checks++;
    await reset();const home=await scene(s=>JSON.stringify(s.state));
    await page.mouse.move(...tapped);await page.mouse.down();await page.mouse.move(tapped[0]+40,tapped[1]+30,{steps:4});await page.mouse.move(...tapped,{steps:4});
    await page.waitForTimeout(600);await page.mouse.up();await pause();assert.equal(await scene(s=>JSON.stringify(s.state)),home);checks++;
    // A long press flips left to right on screen, whatever the piece's turn or the field's rotation.
    // The bundled puzzle forbids flips, so this fixture skips saving until the page reloads.
    for(const fieldRotation of [0,1]) for(const rotation of [0,1]) {
        await scene((s,[r,turn],game)=>{const def=structuredClone(s.def);def.rules.allowFlip=true;s.shell.committed=()=>{};s.shell.def=def;s.shell.buildDock(def);def.presentation.fieldRotation=r;game.scene.start('Play',{def,shell:s.shell});},[fieldRotation,rotation]);await pause();
        const shape=()=>scene(async s=>{const {placedCells}=await import('/src/core/puzzle.js'),{displayCell}=await import('/src/ui/camera.js'),{normalise}=await import('/src/core/geometry.js');
            return normalise(placedCells(s.def.pieces.find(p=>p.id==='ell'),s.state.placements.ell).map(([x,y])=>displayCell(s.def,x,y)));});
        const cell=await scene(async(s,turn)=>{const {setPlacement}=await import('/src/core/state.js'),{placedCells}=await import('/src/core/puzzle.js');
            s.commit(setPlacement(s.def,s.state,'ell',{...s.state.placements.ell,rotation:turn}));return placedCells(s.def.pieces.find(p=>p.id==='ell'),s.state.placements.ell)[0];},rotation);
        await pause();const shown=await shape(),press=await world(cell[0]+.5,cell[1]+.5);
        await page.mouse.move(...press);await page.mouse.down();await page.waitForTimeout(650);
        assert(await flip().isEnabled(),'a charged press enables Flip');assert(await page.getByRole('button',{name:'Rotate right',exact:true}).isDisabled());
        await page.mouse.up();await pause();
        const maxX=Math.max(...shown.map(c=>c[0]));
        assert.deepEqual(await shape(),[...shown.map(([x,y])=>[maxX-x,y])].sort((a,b)=>a[1]-b[1]||a[0]-b[0]),`flip at field rotation ${fieldRotation}, turn ${rotation}`);
    }
    checks++;
    // A charged press survives drift under a cell; moving a cell drops the charge and only moves.
    {
        const cell=await scene(async s=>{const {placedCells}=await import('/src/core/puzzle.js');return placedCells(s.def.pieces.find(p=>p.id==='ell'),s.state.placements.ell)[0];});
        const press=await world(cell[0]+.5,cell[1]+.5),size=await scene(s=>s.camera.size),before=await scene(s=>s.state.placements.ell);
        await page.mouse.move(...press);await page.mouse.down();await page.waitForTimeout(650);
        await page.mouse.move(press[0]+size*.6,press[1],{steps:3});await pause();assert(await flip().isEnabled(),'drift under a cell keeps the charge');
        await page.mouse.move(press[0]+size*1.6,press[1],{steps:3});await pause();assert(await flip().isDisabled(),'a cell of movement drops the charge');
        await page.mouse.move(...press,{steps:3});await page.mouse.up();await pause();
        assert.deepEqual(await scene(s=>s.state.placements.ell),before);checks++;
    }
    await load();await reset();
    // Real release straddles tray: exactly one darker cell, no split material.
    const straddle=tray(2,3);await drag(bar(.27,.63),[straddle[0]+.27,straddle[1]+.63]);assert.deepEqual(await scene(s=>s.state.placements.bar),{x:straddle[0],y:straddle[1],rotation:0,flipped:false});checks++;
    await page.screenshot({path:out+'player-390x844.png'});
    await page.reload();await controls();await pause();assert.equal(await scene(s=>s.state.placements.bar.x),straddle[0]);checks++;
    // Zoom, pan bounds and reframe without moving placements.
    const before=await scene(s=>JSON.stringify(s.state));await page.mouse.move(190,300);await page.mouse.wheel(0,-500);await pause();
    assert(await fit().isEnabled());
    await fit().click();assert.equal(await scene(s=>JSON.stringify(s.state)),before);assert(await fit().isDisabled());checks++;
    // Fit frames everything tightly: with every piece far above, the tray sits low.
    await scene(async s=>{const {movePiece}=await import('/src/core/state.js');let state=s.state;
        for(const [i,p] of s.def.pieces.entries())if(!p.locked)state=movePiece(s.def,state,p.id,s.state.placements[p.id].x,-6-i*3);s.commit(state);s.reframe();});
    await pause();assert((await trayCentre())[1]>20,'Fit must not centre the tray');checks++;
    await reset();const locked=await world(...tray(.5,.5));await page.mouse.click(...locked);assert.equal(await scene(s=>s.selectedId),null);checks++;
    // Cancellation on blur and resize restores committed placement.
    for(const cancel of ['blur','resize']) {
        const a=await world(...bar(.3,.5));await page.mouse.move(...a);await page.mouse.down();await page.mouse.move(a[0]+31,a[1]-19);
        if(cancel==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));else {await page.setViewportSize({width:391,height:845});await page.waitForTimeout(250);}
        assert.equal(await scene(s=>s.gesture),null);assert.equal(await scene(s=>s.state.placements.bar.x),barStart.x);await page.mouse.up();checks++;
    }
    await page.setViewportSize({width:390,height:844});await pause();await reset();
    // An untouched attempt is laid out again for a new screen shape; a touched one stays put.
    const extent=()=>scene(async s=>{const {placedCells}=await import('/src/core/puzzle.js');
        const cells=[...s.def.container.cells,...s.def.pieces.flatMap(p=>placedCells(p,s.state.placements[p.id]))];
        return Math.max(...cells.map(c=>c[0]))-Math.min(...cells.map(c=>c[0]))-(Math.max(...cells.map(c=>c[1]))-Math.min(...cells.map(c=>c[1])));});
    await load('pent01');assert((await extent())<0,'portrait arrangement is taller than wide');
    await page.setViewportSize({width:1280,height:800});await page.waitForTimeout(300);assert((await extent())>0,'landscape arrangement is wider than tall');
    const centred=await trayCentre();assert(Math.abs(centred[0])<.5&&Math.abs(centred[1])<.5);
    await page.screenshot({path:out+'pent01-1280x800-arranged.png'});
    await scene(s=>{s.selectedId=s.def.pieces.find(p=>!p.locked).id;s.transform(1);});const moved=await scene(s=>JSON.stringify(s.state));
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);assert.equal(await scene(s=>JSON.stringify(s.state)),moved);checks++;
    await load();await reset();
    // Touch pointer ownership: another finger cannot steal a piece; pinch only on canvas.
    const cdp=await context.newCDPSession(page),touch=(id,x,y)=>({id,x,y,radiusX:2,radiusY:2,force:1});
    const t=await world(...bar(.3,.5));
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(1,...t)]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch(1,t[0]+14,t[1]+11)]});
    const owner=await scene(s=>s.gesture.owner);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(1,t[0]+14,t[1]+11),touch(2,280,130)]});
    assert.equal(await scene(s=>s.gesture.owner),owner);assert.equal(await scene(s=>s.gesture.kind),'piece');checks++;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.equal(await scene(s=>s.gesture),null);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(1,130,100)]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(1,130,100),touch(2,240,100)]});
    const size=await scene(s=>s.camera.size);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch(1,105,100),touch(2,265,100)]});assert((await scene(s=>s.camera.size))>size);checks++;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await scene(s=>s.gesture),null);
    // Negative placements survive storage, all transforms and framing.
    await scene(async s=>{const {movePiece}=await import('/src/core/state.js');s.commit(movePiece(s.def,s.state,'bar',-3,-2));s.reframe();});
    await page.reload();await controls();await pause();assert.deepEqual(await scene(s=>[s.state.placements.bar.x,s.state.placements.bar.y]),[-3,-2]);checks++;
    // Rotated-field gesture fixtures use the exact same input/render transform.
    for(const rotation of [0,1,2,3]) {
        await scene((s,r,game)=>{const def=structuredClone(s.def);def.presentation.fieldRotation=r;game.scene.start('Play',{def,shell:s.shell});},rotation);await pause();await placed();
        await drag(bar(.3,.4),bar(1.3,-.6));assert.deepEqual(await scene(s=>[s.state.placements.bar.x,s.state.placements.bar.y]),bar(1,-1));checks++;
        await page.screenshot({path:out+`rotation-${rotation}.png`});
    }
    // Committed completion occurs once, survives resize/dismissal, preserves history.
    await load();await reset();
    await scene(async (s,[ox,oy])=>{
        const {setPlacement}=await import('/src/core/state.js');let state=s.state;
        for(const [id,x,y,rotation] of [['bar',4,0,1],['ell',2,0,2],['tee',0,2,0]])state=setPlacement(s.def,state,id,{x:x+ox,y:y+oy,rotation,flipped:false});s.commit(state);
    },origin);
    await page.getByRole('heading',{name:'Solved',exact:true}).waitFor();assert.equal(await scene(s=>s.solved),true);checks++;
    await page.screenshot({path:out+'completed.png'});await page.getByRole('button',{name:'Close',exact:true}).click();
    await page.setViewportSize({width:392,height:844});await page.waitForTimeout(300);assert.equal(await page.locator('#sheet').evaluate(d=>d.open),false);checks++;
    await page.getByRole('button',{name:'More',exact:true}).click();await page.locator('#sheet').getByRole('button',{name:'Restart',exact:true}).click();
    await page.getByRole('heading',{name:'Restart?',exact:true}).waitFor();await page.locator('#sheet').getByRole('button',{name:'Restart',exact:true}).click();
    assert.equal(await scene(s=>s.solved),false);await scene(async s=>{await s.shell.repo.flush();});assert.equal(await scene(s=>s.shell.repo.state.progress[s.shell.record.gameKey].solved),true);checks++;
    for(const id of ['demo01','pent01'])for(const [width,height] of [[320,568],[390,844],[844,390],[1280,800]]) {
        await page.setViewportSize({width,height});await load(id);await reset();
        if(id==='demo01')await drag(bar(.3,.4),[straddle[0]+.3,straddle[1]+.4]);
        const rects=await page.evaluate(()=>({canvas:document.querySelector('#game canvas').getBoundingClientRect().toJSON(),footer:document.querySelector('#controls').getBoundingClientRect().toJSON(),buttons:[...document.querySelectorAll('.dock button:not([hidden])')].map(b=>b.getBoundingClientRect().toJSON()),width:document.documentElement.scrollWidth}));
        assert(rects.canvas.top>=0);assert(rects.canvas.bottom<=rects.footer.top+.01);assert(rects.footer.bottom<=height+.01);assert(rects.width<=width);
        for(const b of rects.buttons) {assert(b.width>=44&&b.height>=44);assert(b.left>=0&&b.right<=width);}
        if(id==='pent01'&&width<=390) {
            const before=rects.canvas.height;await page.mouse.move(width/2,100);await page.mouse.wheel(0,-140);await pause();
            assert.equal(await page.locator('#game canvas').evaluate(c=>c.getBoundingClientRect().height),before,'revealing reframe must not resize the viewport');
            await page.screenshot({path:out+`pent01-zoom-${width}.png`});await reset();
        }
        await page.screenshot({path:out+`${id}-${width}x${height}.png`});
        await page.emulateMedia({colorScheme:'dark'});await pause();await page.screenshot({path:out+`${id}-${width}x${height}-dark.png`});await page.emulateMedia({colorScheme:'light'});checks++;
    }
    await page.goto(base);await page.getByRole('heading',{name:'Pakke',exact:true}).waitFor();await page.locator('[data-continue]').click();await controls();checks++;
    await page.goto(`${base}/?puzzle=unknown`);await page.getByRole('heading',{name:'Puzzle unavailable'}).waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('heading',{name:'Pakke',exact:true}).waitFor();checks++;
    assert.deepEqual(errors,[]);console.log(`PASS: ${checks} browser checks; screenshots in docs/verification. No page errors.`);
} finally {await browser.close();}
