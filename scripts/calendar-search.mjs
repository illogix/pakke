// Persistent, resumable majority-date search. Baseline files are read-only.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { orient } from '../src/core/geometry.js';
import { canonicalKey } from '../src/core/shapes.js';
import { dates,blockedFor,canonical,placementsFor,buildCounter } from './calendar-native.mjs';
const root=new URL('../plans/calendar/trimmed/',import.meta.url);
const out=new URL('imbalance-search/',root);
await mkdir(out,{recursive:true});
const baseline=JSON.parse(await readFile(new URL('board-pieces.json',root),'utf8'));
const saved=JSON.parse(await readFile(new URL('side-counts.json',root),'utf8'));
const prior=JSON.parse(await readFile(new URL('prior-face-samples.json',root),'utf8'));
const screen=JSON.parse(await readFile(new URL('face-screen.json',root),'utf8'));
const rules={allowRotation:true,allowFlip:false};
const mapping=dates.map(d=>({a:canonical(blockedFor(d),[false]),b:canonical(blockedFor(d),[true])}));
const cases=new Map(mapping.flatMap(({a,b})=>[[a.key,a],[b.key,b]]));
let state;
try {state=JSON.parse(await readFile(new URL('search.json',out),'utf8'));}
catch(e) {if(e.code!=='ENOENT')throw e; state={objective:'Maximize max(A winning dates,B winning dates); both sides positive on every valid date.',baselineScore:259,bestScore:259,candidates:[],scope:[]};}
const run=await buildCounter();
let writes=Promise.resolve();
function persist() {const data=JSON.stringify(state)+'\n';writes=writes.then(async()=>{await writeFile(new URL('search.tmp.json',out),data);await rename(new URL('search.tmp.json',out),new URL('search.json',out));});return writes;}
function facesFor(pieces) {
    return pieces.map((p,i)=>canonicalKey(p.cells,rules)!==canonicalKey(orient(p.cells,0,true),rules)?i:null).filter(i=>i!==null);
}
function candidate(inventory,pieces,bits) {
    const chiral=facesFor(pieces);
    const flipped=chiral.filter((_,i)=>i>0&&(bits&2**(i-1)));
    const source=pieces.map((p,i)=>({...p,cells:orient(p.cells,0,flipped.includes(i))}));
    const id=`${inventory}-face-${bits}`;
    let c=state.candidates.find(c=>c.id===id);
    if(!c) {c={id,inventory,bits,flippedPieces:flipped.map(i=>pieces[i].id),pieces:source,counts:{},status:'pending'};state.candidates.push(c);}
    return c;
}
function seed(c,date,a,b) {
    const i=dates.findIndex(d=>d.month===date.month&&d.day===date.day);
    for(const [k,n] of [[mapping[i].a.key,a],[mapping[i].b.key,b]]) {
        if(c.counts[k]) assert.equal(c.counts[k].count,n);
        else c.counts[k]={count:n,exhausted:true,reused:true};
    }
}
const originals=Array.from({length:32},(_,bits)=>candidate('F-P-N-U-Y',baseline.pieces,bits));
for(const d of saved.dates)seed(originals[0],d,d.sideA.count,d.sideB.count);
for(const record of prior.records)for(const s of record.counts)seed(originals[record.bits],s.date,s.a,s.b);
for(const [bits,c] of screen.candidates.entries())seed(originals[bits],c.rejection,c.rejection.sideA,c.rejection.sideB);
function score(c) {
    let a=0,b=0,ties=0,unknown=0,zero=false;
    for(const m of mapping) {
        const ca=c.counts[m.a.key]?.count,cb=c.counts[m.b.key]?.count;
        if(ca===0||cb===0)zero=true;
        if(ca===undefined||cb===undefined)unknown++;
        else if(ca>cb)a++;else if(cb>ca)b++;else ties++;
    }
    return {aWins:a,bWins:b,ties,unknown,zero,score:Math.max(a,b),upperBound:Math.min(354,Math.max(a,b)+unknown)};
}
function update(c,prune=true) {
    c.summary=score(c);
    if(c.summary.zero)c.status='unsolvable';
    else if(!c.summary.unknown){c.status='complete';if(c.summary.score>state.bestScore){state.bestScore=c.summary.score;state.bestCandidate=c.id;console.log(`NEW BEST ${c.id}: ${c.summary.aWins}/${c.summary.bWins}/${c.summary.ties}`);}}
    else if(prune&&c.summary.upperBound<=state.bestScore)c.status='bounded';
}
// Spread probes across the year; exact bounds never assume sampled behavior persists.
const order=Array.from({length:366},(_,i)=>(i*137)%366);
async function profile(c,{prune=true,limit=366}={}) {
    update(c,prune);
    if(['complete','unsolvable','bounded'].includes(c.status))return;
    const rows=placementsFor(c.pieces,false);
    let tested=0;
    for(let offset=0;offset<366&&tested<limit;offset+=12) {
        const batch=order.slice(offset,offset+Math.min(12,limit-tested));
        const pending=new Map();
        for(const i of batch) for(const m of [mapping[i].a,mapping[i].b]) if(!c.counts[m.key])pending.set(m.key,m);
        const result=await run(rows,[...pending.values()],c.pieces.length);
        for(const r of result)c.counts[r.key]=r;
        tested+=batch.length;
        update(c,prune);await persist();
        if(['complete','unsolvable','bounded'].includes(c.status))break;
    }
    console.log(`${c.id} ${c.status} ${JSON.stringify(c.summary)}`);
}
async function pool(items,fn,width=4) {
    let cursor=0;
    await Promise.all(Array.from({length:width},async()=>{while(cursor<items.length){const item=items[cursor++];await fn(item);}}));
}
const mode=process.argv[2]||'faces';
if(mode==='faces') {
    state.scope.push({phase:'baseline faces',representatives:32,policy:'Exact-date majority upper bound; reuse baseline, prior samples, and global-order probes.'});
    await pool(originals,c=>profile(c));
} else if(mode==='inventories') {
    // All one-pentomino substitutions, each with every initial face up to global inversion.
    const catalog=JSON.parse(await readFile(new URL('catalog.json',out),'utf8'));
    const pent=baseline.pieces.filter(p=>p.cells.length===5);
    const tet=baseline.pieces.filter(p=>p.cells.length===4);
    const options=[];
    for(let i=0;i<pent.length;i++)for(const replacement of catalog.filter(p=>!pent.some(q=>p.id===q.id))) {
        const ps=[...tet,...pent.map((p,j)=>i===j?replacement:p)];
        const inventory=ps.filter(p=>p.cells.length===5).map(p=>p.id.replace('5','')).sort().join('-');
        for(let bits=0;bits<2**(facesFor(ps).length-1);bits++)options.push(candidate(inventory,ps,bits));
    }
    state.scope.push({phase:'one-pentomino substitutions',representatives:options.length,sampleDates:24,policy:'Sample rank then exact-date bounds for top candidates.'});
    await pool(options,c=>profile(c,{prune:false,limit:24}));
    const eligible=options.filter(c=>!c.summary.zero);
    eligible.sort((a,b)=>Math.max(b.summary.aWins,b.summary.bWins)-Math.max(a.summary.aWins,a.summary.bWins));
    await pool(eligible.slice(0,24),c=>{if(c.status==='bounded')c.status='pending';return profile(c);});
} else if(mode==='shortlist') {
    const limit=Number(process.argv[3]||100);
    const options=state.candidates.filter(c=>c.inventory!=='F-P-N-U-Y'&&!c.summary?.zero);
    function rank(c) {
        let a=0,b=0,log=0;
        for(const i of order.slice(0,24)) {
            const ca=c.counts[mapping[i].a.key]?.count,cb=c.counts[mapping[i].b.key]?.count;
            assert.ok(ca>0&&cb>0);
            if(ca>cb)a++;else if(cb>ca)b++;
            log+=Math.log(ca/cb);
        }
        return [Math.max(a,b), (a>=b?1:-1)*log];
    }
    for(const c of options)c.sampleRank=rank(c);
    options.sort((a,b)=>b.sampleRank[0]-a.sampleRank[0]||b.sampleRank[1]-a.sampleRank[1]);
    const selected=options.slice(0,limit);
    state.scope.push({phase:'extended sample shortlist',representatives:selected.length,selected:selected.map(c=>c.id),policy:'Rank first 24 dates by winning-day count, then supporting log count ratio; exact-date bounds during profiles.'});
    await pool(selected,c=>profile(c));
} else if(mode==='inventory-faces') {
    const inventory=process.argv[3]||state.candidates.find(c=>c.id===state.bestCandidate).inventory;
    const options=state.candidates.filter(c=>c.inventory===inventory);
    state.scope.push({phase:'all faces for selected inventory',inventory,representatives:options.length,policy:'Exact counts or safe majority upper bounds'});
    await pool(options,c=>profile(c));
} else if(mode==='finish') {
    const c=state.candidates.find(c=>c.id===process.argv[3]);assert.ok(c);
    if(c.status==='bounded')c.status='pending';await profile(c,{prune:false});
} else throw new Error('Usage: calendar-search.mjs faces | inventories | shortlist [N] | inventory-faces [INVENTORY] | finish ID');
await persist();
console.log(`Best score ${state.bestScore}, candidate ${state.bestCandidate||'baseline'}`);
