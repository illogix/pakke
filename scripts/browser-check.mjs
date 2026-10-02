// Optional integration checks against a running Vite dev server.
// PLAYWRIGHT_MODULE can point to an existing Playwright installation.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const base=process.env.PUZZLE_URL || 'http://127.0.0.1:5173';
const out=new URL('../docs/verification/',import.meta.url).pathname;await mkdir(out,{recursive:true});
const errors=[];let checks=0;
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const scene=async(fn,arg)=>page.evaluate(async({source,arg})=>{
    const game=(await import(document.querySelector('script[src*="src/main.js"]').src)).default;
    return (new Function('game','s','arg',`return (${source})(s,arg,game)`))(game,game.scene.getScene('Play'),arg);
},{source:fn.toString(),arg});
const pause=()=>page.waitForTimeout(160);
const world=async(x,y)=>scene(async(s,p)=>{
    const {worldToScreen}=await import('/src/ui/camera.js');return worldToScreen(s.def,s.camera,...p);
},[x,y]);
async function load(id='demo01') {
    await page.goto(`${base}/?puzzle=${id}`);await page.locator('.progress').waitFor();
    await page.waitForTimeout(300);
    if(await page.locator('#sheet').evaluate(d=>d.open))await page.getByRole('button',{name:'Close',exact:true}).click();
    await pause();assert.equal(await scene(s=>s.sys.isActive()),true);
}
async function reset(){await scene(s=>s.resetPuzzle());await pause();}
async function drag(from,to) {const a=await world(...from),b=await world(...to);await page.mouse.move(...a);await page.mouse.down();await page.mouse.move(...b,{steps:5});await page.mouse.up();await pause();}
try {
    await load();
    assert(await page.locator('#controls').isVisible());assert.equal(await page.getByRole('button',{name:'Flip (F)',exact:true}).count(),0);
    const layout=await page.evaluate(()=>({host:document.querySelector('#game').getBoundingClientRect().toJSON(),canvas:document.querySelector('#game canvas').getBoundingClientRect().toJSON(),footer:document.querySelector('#controls').getBoundingClientRect().toJSON()}));
    assert.equal(layout.canvas.height,layout.host.height,'canvas must match measured play viewport');assert(layout.canvas.bottom<=layout.footer.top);checks++;
    // Fractional preview: no state mutation/save before release, grab point preserved.
    const a=await world(2.27,7.63);await page.mouse.move(...a);await page.mouse.down();await page.mouse.move(a[0]+12.3,a[1]+8.7);await pause();
    const preview=await scene(s=>({g:s.gesture,state:s.state,c:s.camera}));
    assert.equal(preview.state.placements.bar.x,2);assert(Math.abs(preview.g.preview.x-(2+12.3/preview.c.size))<.001);assert(preview.g.moved);checks++;
    await page.screenshot({path:out+'dragging.png'});
    await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await scene(s=>s.gesture),null);assert.equal(await scene(s=>s.state.placements.bar.x),2);checks++;
    // Captured release outside the viewport commits at the finite workspace limit.
    const outsideStart=await world(2.3,7.5);await page.mouse.move(...outsideStart);await page.mouse.down();
    await page.mouse.move(-100,-100);await page.mouse.up();await pause();
    assert.equal(await scene(s=>s.gesture),null);
    assert.deepEqual(await scene(s=>[s.state.placements.bar.x,s.state.placements.bar.y]),[-4,-4]);checks++;
    await reset();
    // A turn while held preserves the exact local point and commits only on release.
    const held=await world(2.27,7.63);await page.mouse.move(...held);await page.mouse.down();await page.keyboard.press('r');await pause();
    assert.equal(await scene(s=>s.state.placements.bar.rotation),0);
    assert.equal(await scene(s=>s.gesture.preview.rotation),1);
    assert(Math.abs((await scene(s=>s.gesture.preview.x+s.gesture.grab[0]))-2.27)<.001);
    await page.mouse.up();await pause();assert.equal(await scene(s=>s.state.placements.bar.rotation),1);checks++;
    await reset();
    // Real release straddles tray: exactly one darker cell, no split material.
    await drag([2.27,7.63],[4.27,5.63]);assert.deepEqual(await scene(s=>s.state.placements.bar),{x:4,y:5,rotation:0,flipped:false});checks++;
    await page.screenshot({path:out+'player-390x844.png'});
    await page.reload();await page.locator('.progress').waitFor();await pause();assert.equal(await scene(s=>s.state.placements.bar.x),4);checks++;
    // Zoom, pan bounds and reframe without moving placements.
    const before=await scene(s=>JSON.stringify(s.state));await page.mouse.move(190,300);await page.mouse.wheel(0,-500);await pause();
    assert(await page.getByRole('button',{name:'Fit all pieces in view',exact:true}).isVisible());
    await page.getByRole('button',{name:'Fit all pieces in view',exact:true}).click();assert.equal(await scene(s=>JSON.stringify(s.state)),before);checks++;
    await reset();const locked=await world(2.5,2.5);await page.mouse.click(...locked);assert.equal(await scene(s=>s.selectedId),null);checks++;
    // Cancellation on blur and resize restores committed placement.
    for(const cancel of ['blur','resize']) {
        const a=await world(2.3,7.5);await page.mouse.move(...a);await page.mouse.down();await page.mouse.move(a[0]+31,a[1]-19);
        if(cancel==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));else {await page.setViewportSize({width:391,height:845});await page.waitForTimeout(250);}
        assert.equal(await scene(s=>s.gesture),null);assert.equal(await scene(s=>s.state.placements.bar.x),2);await page.mouse.up();checks++;
    }
    await page.setViewportSize({width:390,height:844});await pause();await reset();
    // Touch pointer ownership: another finger cannot steal a piece; pinch only on canvas.
    const cdp=await context.newCDPSession(page),touch=(id,x,y)=>({id,x,y,radiusX:2,radiusY:2,force:1});
    const t=await world(2.3,7.5);
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
    await page.reload();await page.locator('.progress').waitFor();await pause();assert.deepEqual(await scene(s=>[s.state.placements.bar.x,s.state.placements.bar.y]),[-3,-2]);checks++;
    // Rotated-field gesture fixtures use the exact same input/render transform.
    for(const rotation of [0,1,2,3]) {
        await scene((s,r,game)=>{const def=structuredClone(s.def);def.presentation.fieldRotation=r;game.scene.start('Play',{def,shell:s.shell});},rotation);await pause();
        await drag([2.3,7.4],[3.3,6.4]);assert.deepEqual(await scene(s=>[s.state.placements.bar.x,s.state.placements.bar.y]),[3,6]);checks++;
        await page.screenshot({path:out+`rotation-${rotation}.png`});
    }
    // Committed completion occurs once, survives resize/dismissal, preserves history.
    await load();await reset();
    await scene(async s=>{
        const {setPlacement}=await import('/src/core/state.js');let state=s.state;
        for(const [id,x,y,rotation] of [['bar',6,2,1],['ell',4,2,2],['tee',2,4,0]])state=setPlacement(s.def,state,id,{x,y,rotation,flipped:false});s.commit(state);
    });
    await page.getByRole('heading',{name:'Beautifully fitted.'}).waitFor();assert.equal(await scene(s=>s.solved),true);checks++;
    await page.screenshot({path:out+'completed.png'});await page.getByRole('button',{name:'Close',exact:true}).click();
    await page.setViewportSize({width:392,height:844});await page.waitForTimeout(300);assert.equal(await page.locator('#sheet').evaluate(d=>d.open),false);checks++;
    await page.getByRole('button',{name:'Restart puzzle',exact:true}).click();await page.getByRole('button',{name:'Confirm restart',exact:true}).click();
    assert.equal(await scene(s=>s.solved),false);await scene(async s=>{await s.shell.repo.flush();});assert.equal(await scene(s=>s.shell.repo.state.progress[s.shell.record.gameKey].solved),true);checks++;
    for(const id of ['demo01','pent01'])for(const [width,height] of [[320,568],[390,844],[844,390],[1280,800]]) {
        await page.setViewportSize({width,height});await load(id);await reset();
        if(id==='demo01')await drag([2.3,7.4],[4.3,5.4]);
        const rects=await page.evaluate(()=>({canvas:document.querySelector('#game canvas').getBoundingClientRect().toJSON(),footer:document.querySelector('#controls').getBoundingClientRect().toJSON(),buttons:[...document.querySelectorAll('.dock button:not([hidden])')].map(b=>b.getBoundingClientRect().toJSON()),width:document.documentElement.scrollWidth}));
        assert(rects.canvas.bottom<=rects.footer.top+.01);assert(rects.footer.bottom<=height+.01);assert(rects.width<=width);
        for(const b of rects.buttons) {assert(b.width>=44&&b.height>=44);assert(b.left>=0&&b.right<=width);}
        if(id==='pent01'&&width<=390) {
            const before=rects.canvas.height;await page.mouse.move(width/2,100);await page.mouse.wheel(0,-140);await pause();
            assert.equal(await page.locator('#game canvas').evaluate(c=>c.getBoundingClientRect().height),before,'revealing reframe must not resize the viewport');
            await page.screenshot({path:out+`pent01-zoom-${width}.png`});await reset();
        }
        await page.screenshot({path:out+`${id}-${width}x${height}.png`});checks++;
    }
    await page.goto(base);await page.getByRole('heading',{name:'Your library',exact:true}).waitFor();await page.locator('.continue-card').click();await page.locator('.progress').waitFor();checks++;
    await page.goto(`${base}/?puzzle=unknown`);await page.getByRole('heading',{name:'Puzzle unavailable'}).waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('heading',{name:'Your library',exact:true}).waitFor();checks++;
    assert.deepEqual(errors,[]);console.log(`PASS: ${checks} browser checks; screenshots in docs/verification. No page errors.`);
} finally {await browser.close();}
