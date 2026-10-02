import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createState } from '../src/core/state.js';
import { fingerprint } from '../src/app/storage.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const base=process.env.PUZZLE_URL || 'http://127.0.0.1:5173';
const first=JSON.parse(await readFile(new URL('../src/puzzles/first-fit.json',import.meta.url),'utf8'));
const make=(id,count=1)=>({packVersion:1,pack:{id,name:id,revision:1},puzzles:Array.from({length:count},(_,i)=>({...structuredClone(first),id:`${id}-${i}`}))});
const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();let checks=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
const app=async (page,fn)=>page.evaluate(async source=>{const game=(await import(document.querySelector('script[src*="src/main.js"]').src)).default;return (new Function('shell',`return (${source})(shell)`))(game.registry.get('shell'));},fn.toString());
const home=async p=>{await p.goto(base);await p.getByRole('heading',{name:'Your library',exact:true}).waitFor();};
const upload=async(p,data)=>p.locator('input[data-file="pack"]').setInputFiles({name:'pack.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
const add=async(p,data)=>{await upload(p,data);await p.getByRole('button',{name:'Add pack',exact:true}).click();await p.getByRole('heading',{name:'Saved to your library'}).waitFor();await p.getByRole('button',{name:'Close',exact:true}).click();};
try {
 await home(page);
 const start=performance.now();await add(page,make('large-pack',1000));const elapsed=Math.round(performance.now()-start);
 await page.goto(`${base}/?pack=large-pack`);await page.getByRole('heading',{name:'large-pack',exact:true}).waitFor();assert.equal(await page.locator('.puzzle-card').count(),60);await page.getByRole('button',{name:'Show more puzzles'}).click();assert.equal(await page.locator('.puzzle-card').count(),120);checks++;
 await page.getByRole('searchbox').fill('large-pack-999');assert.equal(await page.locator('.puzzle-card').count(),1);checks++;
 // A backend failure must not publish the attempted change to memory or IndexedDB.
 await app(page,s=>{s.repo.savedWrite=s.repo.backend.write;s.repo.backend.write=async()=>{throw new Error('Simulated storage quota failure');};});
 await upload(page,make('failed-pack'));await page.getByRole('button',{name:'Add pack',exact:true}).click();await page.getByRole('heading',{name:'Could not complete that action'}).waitFor();assert.equal(await app(page,s=>!!s.repo.state.packs['failed-pack']),false);await page.getByRole('button',{name:'Close',exact:true}).click();await app(page,s=>{s.repo.backend.write=s.repo.savedWrite;});checks++;
 // Two tabs really share IndexedDB; a stale writer cannot overwrite the newer snapshot.
 const other=await context.newPage();other.on('pageerror',e=>errors.push(e.message));await home(other);await upload(other,make('stale-pack'));await other.getByRole('heading',{name:'Add to your library'}).waitFor();
 await add(page,make('newer-pack'));await other.getByRole('button',{name:'Add pack',exact:true}).click();await other.getByRole('heading',{name:'Could not complete that action'}).waitFor();assert((await other.locator('.file-message').textContent()).includes('another tab'));await other.reload();await other.getByRole('heading',{name:'Your library',exact:true}).waitFor();assert.equal(await app(other,s=>!!s.repo.state.packs['newer-pack']),true);assert.equal(await app(other,s=>!!s.repo.state.packs['stale-pack']),false);checks++;await other.close();
 // Closing and reopening the app retains imported definitions without rewriting the catalog.
 const serial=await app(page,s=>s.repo.state.serial);await page.reload();await page.getByRole('heading',{name:'large-pack',exact:true}).waitFor();assert.equal(await app(page,s=>s.repo.state.serial),serial);checks++;
 const denied=await browser.newContext();await denied.addInitScript(()=>Object.defineProperty(globalThis,'indexedDB',{get(){throw new Error('Storage denied');}}));const temporary=await denied.newPage();await home(temporary);assert((await temporary.locator('.notice').textContent()).includes('temporarily'));await upload(temporary,make('unsaved-pack'));await temporary.getByRole('button',{name:'Add pack',exact:true}).click();await temporary.getByRole('heading',{name:'Could not complete that action'}).waitFor();assert((await temporary.locator('.file-message').textContent()).includes('cannot be saved'));checks++;await denied.close();
 const lan=await browser.newContext();await lan.addInitScript(()=>Object.defineProperty(crypto,'subtle',{value:undefined}));const lanPage=await lan.newPage();await home(lanPage);assert.equal(await app(lanPage,s=>Object.keys(s.repo.state.definitions).length),5);checks++;await lan.close();
 const migrated=await browser.newContext();const legacy={version:2,fingerprint:fingerprint(first),state:createState(first),solved:false,updatedAt:123};legacy.state.placements.a.x=0;
 await migrated.addInitScript(record=>{if(!localStorage.getItem('migration-fixture')){localStorage.setItem('packing:v2:puzzle:first-fit',JSON.stringify(record));localStorage.setItem('migration-fixture','true');}},legacy);
 const old=await migrated.newPage();await home(old);assert.equal(await app(old,s=>Object.values(s.repo.state.progress)[0].state.placements.a.x),0);assert(await old.locator('.continue-card').isVisible());checks++;await migrated.close();
 assert.deepEqual(errors,[]);console.log(`PASS: ${checks} reliability checks. 1,000-puzzle import and preview took ${elapsed} ms on this desktop host; lists page at 60 cards. No page errors.`);
} finally {await browser.close();}
