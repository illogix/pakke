// Materialize a searched candidate without recounting saved exact results.
// Validation uses calendar-count.mjs --trimmed --directory OUTPUT afterwards.
import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bounds,normalise,orient } from '../src/core/geometry.js';
import { canonicalKey } from '../src/core/shapes.js';
import { dates,blockedFor,canonical,placementsFor,inverse,buildCounter } from './calendar-native.mjs';
const root=new URL('../plans/calendar/trimmed/',import.meta.url);
const state=JSON.parse(await readFile(new URL('imbalance-search/search.json',root),'utf8'));
const candidate=state.candidates.find(c=>c.id===(process.argv[2]||state.bestCandidate));
assert.ok(candidate&&candidate.status==='complete'&&!candidate.summary.zero);
const directory=pathToFileURL(resolve(process.argv[3]||'plans/calendar/trimmed/improved')+'/');
await mkdir(directory,{recursive:true});
const baseline=JSON.parse(await readFile(new URL('board-pieces.json',root),'utf8'));
let oldCounts=JSON.parse(await readFile(new URL('side-counts.json',root),'utf8'));
// Choose A to be the fixed side with the greater winning-day count.
const exchange=candidate.summary.bWins>candidate.summary.aWins;
const pieces=candidate.pieces.map(p=>({...p,cells:orient(p.cells,0,exchange)}));
const definition={...baseline,id:`calendar-trimmed-${candidate.id}`,pieces};
const rows=placementsFor(candidate.pieces,false);
const mappings=dates.map(d=>({a:canonical(blockedFor(d),[false]),b:canonical(blockedFor(d),[true])}));
const fixed=new Map(Object.entries(candidate.counts).map(([k,r])=>[Number(k),r]));
const missing=new Map();
for(const {a,b} of mappings)for(const m of [a,b])if(!fixed.get(m.key)?.witness)missing.set(m.key,m);
const run=await buildCounter();
const refreshed=await run(rows,[...missing.values()],pieces.length);
for(const r of refreshed){assert.equal(r.count,fixed.get(r.key).count);fixed.set(r.key,r);}
console.log(`Reused fixed counts; reconstructed ${missing.size} previously unwitnessed cached regions.`);
function placementFor(pieceIndex,cells,mode) {
    const p=pieces[pieceIndex],target=JSON.stringify(normalise(cells));
    const {minX:x,minY:y}=bounds(cells);
    const flips=mode==='sideA'?[false]:mode==='sideB'?[true]:[false,true];
    for(const flipped of flips)for(let rotation=0;rotation<4;rotation++)if(JSON.stringify(orient(p.cells,rotation,flipped))===target)return {id:p.id,x,y,rotation,flipped};
    throw new Error(`Wrong shape/face ${p.id} ${mode}`);
}
const inventoryKey=ps=>ps.map(p=>canonicalKey(p.cells,{allowRotation:true,allowFlip:true})).sort().join('|');
let reusedDefinition=baseline,reusedPath='side-counts.json';
if(inventoryKey(pieces)!==inventoryKey(baseline.pieces)) {
    const alternative=JSON.parse(await readFile(new URL('inventory-best/board-pieces.json',root),'utf8'));
    if(inventoryKey(pieces)===inventoryKey(alternative.pieces)) {
        reusedDefinition=alternative;reusedPath='inventory-best/side-counts.json';
        oldCounts=JSON.parse(await readFile(new URL(reusedPath,root),'utf8'));
    }
}
if(inventoryKey(pieces)!==inventoryKey(reusedDefinition.pieces)&&process.argv[4]) {
    const reuseDirectory=pathToFileURL(resolve(process.argv[4])+'/');
    reusedDefinition=JSON.parse(await readFile(new URL('board-pieces.json',reuseDirectory),'utf8'));
    assert.equal(inventoryKey(pieces),inventoryKey(reusedDefinition.pieces));
    oldCounts=JSON.parse(await readFile(new URL('side-counts.json',reuseDirectory),'utf8'));
    reusedPath=process.argv[4]+'/side-counts.json';
}
const sameInventory=inventoryKey(pieces)===inventoryKey(reusedDefinition.pieces);
// Fixed faces must be distinct up to rotation. Mirror partners can become
// interchangeable in flippable mode; remove native physical-ID permutations.
assert.equal(new Set(pieces.map(p=>canonicalKey(p.cells,{allowRotation:true,allowFlip:false}))).size,pieces.length);
const multiplicities=new Map();
for(const p of pieces){const k=canonicalKey(p.cells,{allowRotation:true,allowFlip:true});multiplicities.set(k,(multiplicities.get(k)||0)+1);}
let easyDivisor=1;
for(const n of multiplicities.values())for(let i=2;i<=n;i++)easyDivisor*=i;
let easyRows,easyResults;
if(!sameInventory) {
    easyRows=placementsFor(pieces,true);
    const cases=new Map(dates.map(d=>{const m=canonical(blockedFor(d),[false,true]);return [m.key,m];}));
    const groups=Array.from({length:4},()=>[]);
    [...cases.values()].forEach((c,i)=>groups[i%4].push(c));
    console.log(`Counting ${cases.size} flippable regions for new inventory.`);
    const results=await Promise.all(groups.map(async(group,i)=>{const r=await run(easyRows,group,pieces.length);console.log(`Flippable group ${i+1}/4 complete.`);return r;}));
    easyResults=new Map(results.flat().map(r=>{assert.equal(r.count%easyDivisor,0);return [r.key,{...r,count:r.count/easyDivisor}];}));
} else console.log('Reusing all 366 saved flippable counts and witnesses (identical free inventory).');
const data={boardId:definition.id,pieces,countConvention:'Exact arrangements on the fixed labeled board; no board-symmetry quotient; congruent flippable pieces interchangeable.',source:{candidate:candidate.id,exchangedSides:exchange,search:'../imbalance-search/search.json',reusedFlippableFrom:sameInventory?reusedPath:null,flippableLabelDivisor:easyDivisor},dates:dates.map((date,i)=>{
    const result={...date};
    for(const mode of ['sideA','sideB']) {
        const mapping=mappings[i][(mode==='sideB')!==exchange?'b':'a'];
        const r=fixed.get(mapping.key);
        assert.ok(r.exhausted&&r.count>0);
        result[mode]={count:r.count,placements:r.witness.map(index=>{const row=rows[index];return placementFor(row.piece,row.cells.map(([x,y])=>inverse(y*7+x,mapping)),mode);})};
    }
    if(sameInventory) {
        const old=oldCounts.dates[i].flippable;
        result.flippable={count:old.count,placements:old.placements.map(p=>{
            const oldPiece=reusedDefinition.pieces.find(q=>q.id===p.id);
            const cells=orient(oldPiece.cells,p.rotation,p.flipped).map(([x,y])=>[x+p.x,y+p.y]);
            return placementFor(pieces.findIndex(q=>q.id===p.id),cells,'flippable');
        })};
    } else {
        const m=canonical(blockedFor(date),[false,true]),r=easyResults.get(m.key);
        assert.ok(r.exhausted&&r.count>0);
        result.flippable={count:r.count,placements:r.witness.map(index=>{const row=easyRows[index];return placementFor(row.piece,row.cells.map(([x,y])=>inverse(y*7+x,m)),'flippable');})};
    }
    return result;
})};
const summary={sideAMore:0,sideBMore:0,tied:0};
for(const d of data.dates)summary[d.sideA.count>d.sideB.count?'sideAMore':d.sideA.count<d.sideB.count?'sideBMore':'tied']++;
for(const mode of ['sideA','sideB','flippable']) {
    const c=data.dates.map(d=>d[mode].count).sort((a,b)=>a-b);
    summary[mode]={min:c[0],max:c.at(-1),median:(c[182]+c[183])/2,total:c.reduce((a,b)=>a+b)};
}
const a=mappings.map(m=>m.a.key),b=mappings.map(m=>m.b.key),available=new Set(a);
summary.geometry={forcedTies:a.filter((key,i)=>key===b[i]).length,reflectionPairedDates:b.filter(key=>available.has(key)).length};
data.summary=summary;
assert.equal(summary.sideAMore,candidate.summary.score);
await writeFile(new URL('board-pieces.json',directory),JSON.stringify(definition,null,2)+'\n');
await writeFile(new URL('side-counts.json',directory),JSON.stringify(data,null,2)+'\n');
const months=baseline.board.labels.slice(0,2).flat();
let table='# Improved calendar solution counts\n\nSide A has more solutions on '+summary.sideAMore+' dates. Both fixed sides permit rotations only; flippable permits either face independently. Exact arrangements on the fixed labeled board. See [piece geometry](board-pieces.json).\n\n| Date | Side A | Side B | Flippable | Fewer fixed-side solutions |\n| --- | ---: | ---: | ---: | --- |\n';
for(const d of data.dates)table+=`| ${months[d.month-1]} ${d.day} | ${d.sideA.count} | ${d.sideB.count} | ${d.flippable.count} | ${d.sideA.count<d.sideB.count?'A':d.sideA.count>d.sideB.count?'B':'Tie'} |\n`;
await writeFile(new URL('side-counts.md',directory),table);
console.log(JSON.stringify(summary,null,2));
