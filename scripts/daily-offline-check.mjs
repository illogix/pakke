// Run against `npm run preview`: production daily content must work offline.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
const page=await context.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.clock.install({time:new Date('2026-10-05T12:00:00')});
await page.addInitScript(()=>localStorage.setItem('packing:v2:help-seen','true'));
const base=process.env.PUZZLE_URL||'http://127.0.0.1:4173';
try {
    await page.goto(base);await page.getByRole('heading',{name:'Pakke',exact:true}).waitFor();
    await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();
    await page.getByRole('heading',{name:'Pakke',exact:true}).waitFor();
    assert(await page.evaluate(()=>!!navigator.serviceWorker.controller));
    await context.setOffline(true);await page.reload();
    await page.getByRole('heading',{name:'Pakke',exact:true}).waitFor();
    await page.getByRole('button',{name:'Daily Calendar Puzzles',exact:true}).click();
    await page.getByLabel('Month',{exact:true}).selectOption('1');
    await page.getByRole('group',{name:'Daily puzzle mode'}).getByRole('radio',{name:'Flips allowed',exact:true}).check();
    await page.locator('[data-date="2026-01-17"]').click();
    await page.locator('#controls .dock').waitFor();
    assert.equal(await page.getByRole('button',{name:'Flip',exact:true}).count(),1);
    await page.reload();await page.locator('#controls .dock').waitFor();
    assert.equal(await page.getByRole('button',{name:'Flip',exact:true}).count(),1);
    assert.deepEqual(errors,[]);console.log('Production daily calendar loads, derives a new date, and reloads offline; no page errors.');
} finally {await browser.close();}
