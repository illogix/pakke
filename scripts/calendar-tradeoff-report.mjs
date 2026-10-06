import fs from 'node:fs';
import assert from 'node:assert/strict';
import {canonicalKey} from '../src/core/shapes.js';
import {dates,blockedFor,canonical} from './calendar-native.mjs';
const root='plans/calendar/trimmed/';
const state=JSON.parse(fs.readFileSync(root+'imbalance-search/search.json'));
const maps=dates.map(d=>({a:canonical(blockedFor(d),[false]).key,b:canonical(blockedFor(d),[true]).key}));
for(const c of state.candidates){
 let a=0,b=0,ties=0,unknown=0,zero=false;
 for(const m of maps){const ca=c.counts[m.a]?.count,cb=c.counts[m.b]?.count;if(ca===0||cb===0)zero=true;if(ca===undefined||cb===undefined)unknown++;else if(ca>cb)a++;else if(cb>ca)b++;else ties++;}
 c.summary={aWins:a,bWins:b,ties,unknown,zero,score:Math.max(a,b),upperBound:Math.min(354,Math.max(a,b)+unknown)};
 if(zero)c.status='unsolvable';else if(!unknown)c.status='complete';
}
state.tradeoffReference='N-P-U-Y-Z-face-2';
state.tradeoffRecommended='trade-d9cca81d1356';
state.tradeoffPreferences={minWins:290,noCongruentPiecesOnFixedSide:true,noncongruentMirrorsAllowed:true,averageConvention:'All 366 dates for each mode separately',searchMeanCeiling:112.92896174863388*1.1};
fs.writeFileSync(root+'imbalance-search/search.json',JSON.stringify(state)+'\n');
const ids=['tradeoff-reference','tradeoff-309','tradeoff-308','tradeoff-306','tradeoff-300','tradeoff-296','tradeoff-290'];
const records=ids.map(directory=>{
 const data=JSON.parse(fs.readFileSync(root+directory+'/side-counts.json'));
 assert.equal(new Set(data.pieces.map(p=>canonicalKey(p.cells,{allowRotation:true,allowFlip:false}))).size,data.pieces.length);
 assert.equal(new Set(data.pieces.map(p=>canonicalKey(p.cells,{allowRotation:true,allowFlip:true}))).size,data.pieces.length);
 const s=data.summary;
 const modes=['sideA','sideB','flippable'];
 return {directory,candidate:data.source.candidate,pieces:data.pieces.map(p=>p.id),wins:s.sideAMore,losses:s.sideBMore,ties:s.tied,means:Object.fromEntries(modes.map(m=>[m,s[m].total/366])),min:Object.fromEntries(modes.map(m=>[m,s[m].min])),uniqueFreeShapes:true};
});
const ref=records[0],recommended=records[1];
const round=x=>x.toFixed(2);
fs.mkdirSync(root+'tradeoffs',{recursive:true});
const scope=state.scope.filter(p=>p.phase.startsWith('tradeoff')||['one-sided shape substitutions','all one-sided face assignments'].includes(p.phase));
const chosenScope=scope.at(-1);
assert.equal(chosenScope.candidates,64);
const faceStatuses=state.candidates.filter(c=>chosenScope.selected.includes(c.id)).reduce((o,c)=>(o[c.trade.status]=(o[c.trade.status]||0)+1,o),{});
assert.deepEqual(faceStatuses,{unsolvable:37,complete:1,'wins-bound':26});
const summary={reference:ref,recommended,records,scope,faceStatuses,totalCachedCandidates:state.candidates.length,totalCanonicalObservations:state.candidates.reduce((n,c)=>n+Object.keys(c.counts).length,0)};
fs.writeFileSync(root+'tradeoffs/summary.json',JSON.stringify(summary,null,2)+'\n');
let md='# Calendar trade-offs against the retained 310-win reference\n\nRecommended: **309 wins / 51 losses / 6 ties**, all five tetrominoes plus\n**F/L/N/Y/Z** pentominoes. One fewer win than the reference, with far fewer\nsolutions in every mode. A is the scored side in these normalized artifacts.\nA win means A has more solutions than B. Means below use all 366 dates,\nnot just winning dates.\n\n| Set | W / L / T | Mean side A | Mean side B | Mean flippable |\n| --- | ---: | ---: | ---: | ---: |\n';
for(const r of records)md+=`| [${r.directory.replace('tradeoff-','')}](${`../${r.directory}/README.md`}) | ${r.wins} / ${r.losses} / ${r.ties} | ${round(r.means.sideA)} | ${round(r.means.sideB)} | ${round(r.means.flippable)} |\n`;
md+='\nThe 309 set reduces means by '+['sideA','sideB','flippable'].map(m=>round(100*(1-recommended.means[m]/ref.means[m]))+'%').join(' / ')+' for A / B / flippable. It is the recommended balance. The 290 set lowers flippable counts further, but loses 20 winning dates relative to the reference. All listed sets have distinct free shapes, satisfying the stricter condition of no duplicates even if mirrors are treated as equivalent.\n\n## Search and verification\n\nThe user retained `N-P-U-Y-Z-face-2` as the reference and explicitly allowed as few as 290 wins for a substantial solution-count reduction. Opposite mirror partners on a fixed side were allowed. The existing exact-count cache was reused; former 311-win pruning does not reject candidates for this new objective.\n\nSearch stages: 91 cached candidates extended at a 300-win floor; 64 more/continued candidates at the accepted 290 floor; all 76 unique one-sided substitutions around the reference and 76 around the 296-win intermediate were sampled, with promising samples extended. These neighborhoods include both tetromino and pentomino changes and permitted mirror pairs. Sample ranking is heuristic and never proves rejection. Finally all 64 face representatives of the recommended inventory were resolved: 37 have an exact zero count, 26 have winning-date upper bounds below 290, and only the recommended representative solves all dates and reaches 290 wins. Thus 309 is optimal for these free shapes among sets solving every date on both sides. The full inventory space was not exhausted.\n\nAll seven listed artifacts contain exact counts and 1,098 validated witnesses. Each passed independent exhaustive JS counts for January 1/2/3 and February 29 on both fixed sides. New freely flippable inventories were independently checked on two dates each; other face choices reused that inventory’s exact easy counts and witnesses. For the recommendation, April 6 has 586 flippable solutions (127,431 JS nodes), and February 29 has 9,599 (1,168,521 nodes).\n\nFor mirror-pair candidates, native physical-ID permutations must be divided out in flippable mode; the finalizer now handles this. None of the recommended/table artifacts require that correction. Current broader native counts, pending candidates, and witnesses remain in `../imbalance-search/search.json`. `summary.json` records this task’s scope. No computation remains running and no game integration was performed.\n\n```sh\nnode scripts/calendar-count.mjs --trimmed --directory plans/calendar/trimmed/tradeoff-309\nnode scripts/calendar-verify-easy.mjs plans/calendar/trimmed/tradeoff-309\nnode scripts/calendar-tradeoff.mjs neighbors 290 CANDIDATE_ID\nnode scripts/calendar-tradeoff.mjs faces 290 CANDIDATE_ID\n```\n';
fs.writeFileSync(root+'tradeoffs/README.md',md);
for(const r of records.slice(1)){
 const data=JSON.parse(fs.readFileSync(root+r.directory+'/side-counts.json'));
 let text=`# Calendar candidate: ${r.wins}–${r.losses}–${r.ties}\n\nInventory: ${r.pieces.join(', ')}. Exact side A faces are defined in\n[board-pieces.json](board-pieces.json). Side B mirrors every piece.\nBoth fixed sides use rotations only and solve all 366 valid dates; flippable\nplay also solves every date. There are no duplicate free shapes.\n\nAcross all 366 dates, mean solution counts are A=${round(r.means.sideA)},\nB=${round(r.means.sideB)}, flippable=${round(r.means.flippable)}.\nA has more solutions on ${r.wins} dates, fewer on ${r.losses}, and ties on ${r.ties}.\n\n[Daily count table](side-counts.md), [counts and 1,098 validated witnesses](side-counts.json),\n[reference and trade-off comparison](../tradeoffs/README.md).\n\nAll witnesses were independently reconstructed and checked for exact coverage,\nnonoverlap, piece identities, and correct fixed faces. Eight independent JS\nexact fixed-side counts agree. Flippable counts were independently checked\nfor each distinct free inventory and reused for alternate starting faces.\n\nCache candidate: \`${r.candidate}\`; global side exchange: ${data.source.exchangedSides}.\n\n\`\`\`sh\nnode scripts/calendar-count.mjs --trimmed --directory plans/calendar/trimmed/${r.directory}\n\`\`\`\n`;
 if(r.directory==='tradeoff-309')text+='\n[Board and exact side A faces](board-pieces.svg). All 64 face representatives\nfor these shapes were resolved: 37 insoluble, 26 below 290 wins by safe bounds,\nand this representative at 309. This establishes the best all-date-solvable\nwinning-day score for these shapes; other inventories remain unexplored.\n';
 fs.writeFileSync(root+r.directory+'/README.md',text);
}
console.log(JSON.stringify({recommended,scope:scope.map(({selected,...p})=>p),faceStatuses,totalCachedCandidates:summary.totalCachedCandidates,totalCanonicalObservations:summary.totalCanonicalObservations},null,2));
