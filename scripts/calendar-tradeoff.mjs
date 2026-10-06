// Two-objective extension. Reuses exact counts but ignores old majority-only pruning.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {orient} from '../src/core/geometry.js';
import {canonicalKey} from '../src/core/shapes.js';
import {dates,blockedFor,canonical,placementsFor,buildCounter} from './calendar-native.mjs';
const root=new URL('../plans/calendar/trimmed/',import.meta.url);
const file=new URL('imbalance-search/search.json',root);
const state=JSON.parse(await readFile(file,'utf8'));
const reference=state.candidates.find(c=>c.id==='N-P-U-Y-Z-face-2');
const catalog=JSON.parse(await readFile(new URL('imbalance-search/catalog.json',root),'utf8'));
const baseline=JSON.parse(await readFile(new URL('board-pieces.json',root),'utf8'));
const maps=dates.map(d=>({a:canonical(blockedFor(d),[false]),b:canonical(blockedFor(d),[true])}));
const order=Array.from({length:366},(_,i)=>(i*137)%366);
const rules={allowRotation:true,allowFlip:false};
const shapeKey=p=>canonicalKey(p.cells,rules);
function inventoryKey(ps){const a=ps.map(shapeKey).sort().join('|'),b=ps.map(p=>shapeKey({...p,cells:orient(p.cells,0,true)})).sort().join('|');return a<b?a:b;}
const minWins=Number(process.argv[3]||300),maxMean=112.92896174863388*1.10;
const run=await buildCounter();let writes=Promise.resolve();
function save(){const data=JSON.stringify(state)+'\n';writes=writes.then(async()=>{await writeFile(new URL('imbalance-search/search.tmp.json',root),data);await rename(new URL('imbalance-search/search.tmp.json',root),file);});return writes;}
function summarize(c){
 let a=0,b=0,ties=0,unknown=0,sumA=0,sumB=0,zero=false;
 for(const m of maps){const ca=c.counts[m.a.key]?.count,cb=c.counts[m.b.key]?.count;
  if(ca===0||cb===0)zero=true;
  if(ca===undefined||cb===undefined)unknown++;
  else {sumA+=ca;sumB+=cb;if(ca>cb)a++;else if(cb>ca)b++;else ties++;}
 }
 const n=366-unknown,score=Math.max(a,b);
 return {aWins:a,bWins:b,ties,unknown,zero,score,upperBound:Math.min(354,score+unknown),mean:n?(sumA+sumB)/(2*n):null,normalMean:n?(a>=b?sumA:sumB)/n:null,hardMean:n?(a>=b?sumB:sumA)/n:null,meanLowerBound:(sumA+sumB+2*unknown)/732};
}
function update(c){
 const s=summarize(c);c.trade={...s,minWins,maxMean};
 if(s.zero){c.status='unsolvable';c.trade.status='unsolvable';}
 else if(!s.unknown){c.status='complete';c.summary={...s};c.trade.status='complete';if(s.score>state.bestScore){state.bestScore=s.score;state.bestCandidate=c.id;}}
 else if(s.upperBound<minWins)c.trade.status='wins-bound';
 else if(s.meanLowerBound>maxMean)c.trade.status='mean-bound';
 else c.trade.status='pending';
 return c.trade.status;
}
async function profile(c,limit=366){
 if(update(c)!=='pending')return;
 const rows=placementsFor(c.pieces,false);
 for(let off=0;off<limit;off+=12){
  const pending=new Map();
  for(const i of order.slice(off,Math.min(off+12,limit)))for(const m of [maps[i].a,maps[i].b])if(!c.counts[m.key])pending.set(m.key,m);
  for(const r of await run(rows,[...pending.values()],c.pieces.length))c.counts[r.key]=r;
  const status=update(c);await save();if(status!=='pending')break;
 }
 if(limit===366||c.trade.status==='unsolvable')console.log(c.id,JSON.stringify(c.trade));
}
async function pool(cs,fn){let next=0;await Promise.all(Array.from({length:4},async()=>{while(next<cs.length)await fn(cs[next++]);}));}
function sample(c){
 let a=0,b=0,total=0,n=0;
 for(const i of order.slice(0,24)){const ca=c.counts[maps[i].a.key]?.count,cb=c.counts[maps[i].b.key]?.count;if(ca===undefined||cb===undefined)continue;n++;total+=ca+cb;if(ca>cb)a++;else if(cb>ca)b++;}
 return {wins:Math.max(a,b),n,mean:total/(2*n)};
}
const mode=process.argv[2]||'existing';let options=[];
if(mode==='existing'){
 options=state.candidates.filter(c=>{const s=summarize(c),p=sample(c);return !s.zero&&s.unknown&&s.upperBound>=minWins&&p.n===24&&p.wins>=18&&p.mean<=125;});
 options.sort((a,b)=>sample(a).mean-sample(b).mean);
 options=options.slice(0,100);
 state.scope.push({phase:'tradeoff existing cache',minWins,maxMean,selected:options.map(c=>c.id)});
 await pool(options,c=>profile(c));
}else if(mode==='neighbors'){
 const anchorId=process.argv[4]||reference.id;
 const anchor=state.candidates.find(c=>c.id===anchorId);assert.ok(anchor);
 const existing=new Map(state.candidates.map(c=>[inventoryKey(c.pieces),c]));
 const oneSided=new Map();
 for(const p of [...baseline.pieces.filter(p=>p.cells.length===4),...catalog])for(const flip of [false,true]){
  const q={...p,cells:orient(p.cells,0,flip)};oneSided.set(shapeKey(q),q);
 }
 for(let i=0;i<anchor.pieces.length;i++)for(const replacement of oneSided.values()){
  if(replacement.cells.length!==anchor.pieces[i].cells.length)continue;
  const ps=anchor.pieces.map((p,j)=>i===j?replacement:p);
  if(new Set(ps.map(shapeKey)).size!==ps.length)continue;
  const key=inventoryKey(ps);let c=existing.get(key);
  if(!c){
   const seen=new Map();const pieces=ps.map(p=>{const n=(seen.get(p.id)||0)+1;seen.set(p.id,n);return {...p,id:n===1?p.id:`${p.id}b`};});
   const id='trade-'+createHash('sha256').update(key).digest('hex').slice(0,12);
   c={id,inventory:pieces.map(p=>p.id).join('-'),pieces,counts:{},status:'pending',origin:{anchor:anchor.id,replaced:anchor.pieces[i].id,with:replacement.id}};
   state.candidates.push(c);existing.set(key,c);
  }
  if(!options.includes(c))options.push(c);
 }
 state.scope.push({phase:'one-sided shape substitutions',anchor:anchor.id,candidates:options.length,minWins,maxMean,selected:options.map(c=>c.id)});
 await pool(options,c=>profile(c,24));
 options=options.filter(c=>{const p=sample(c);return c.trade.status==='pending'&&p.n===24&&p.wins>=18&&p.mean<=125;});
 options.sort((a,b)=>sample(b).wins-sample(a).wins||sample(a).mean-sample(b).mean);
 await pool(options,c=>profile(c));
}else if(mode==='faces'){
 const anchor=state.candidates.find(c=>c.id===process.argv[4]);assert.ok(anchor);
 const chiral=anchor.pieces.map((p,i)=>shapeKey(p)!==shapeKey({...p,cells:orient(p.cells,0,true)})?i:null).filter(i=>i!==null);
 const existing=new Map(state.candidates.map(c=>[inventoryKey(c.pieces),c]));
 for(let bits=0;bits<2**(chiral.length-1);bits++){
  const ps=anchor.pieces.map((p,i)=>({...p,cells:orient(p.cells,0,chiral.indexOf(i)>0&&!!(bits&2**(chiral.indexOf(i)-1)))}));
  if(new Set(ps.map(shapeKey)).size!==ps.length)continue;
  const key=inventoryKey(ps);let c=existing.get(key);
  if(!c){const id='trade-'+createHash('sha256').update(key).digest('hex').slice(0,12);c={id,inventory:anchor.inventory,pieces:ps,counts:{},status:'pending',origin:{anchor:anchor.id,faceBits:bits}};state.candidates.push(c);existing.set(key,c);}
  if(!options.includes(c))options.push(c);
 }
 state.scope.push({phase:'all one-sided face assignments',anchor:anchor.id,candidates:options.length,minWins,maxMean,selected:options.map(c=>c.id)});
 await pool(options,c=>profile(c));
}else if(mode==='inventory'){
 const inventory=process.argv[4];
 options=state.candidates.filter(c=>c.inventory===inventory);assert.ok(options.length);
 state.scope.push({phase:'tradeoff all inventory faces',inventory,minWins,maxMean,selected:options.map(c=>c.id)});
 await pool(options,c=>profile(c));
}else if(mode==='finish'){
 const c=state.candidates.find(c=>c.id===process.argv[4]);assert.ok(c);await profile(c);
}else throw new Error('Usage: calendar-tradeoff.mjs existing|neighbors|inventory|finish [MIN_WINS] [ANCHOR_OR_CANDIDATE]');
await save();
const complete=state.candidates.map(c=>({id:c.id,...summarize(c)})).filter(s=>!s.unknown&&!s.zero&&s.score>=minWins);
complete.sort((a,b)=>a.mean-b.mean);
await writeFile(new URL('tradeoff-summary.json',root),JSON.stringify({reference:reference.id,minWins,maxMean,complete},null,2)+'\n');
console.log('FULL-YEAR',JSON.stringify(complete));
