// Exhaustive JS/native agreement for the smallest flippable puzzle and Feb 29.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { shapeMultiset } from '../src/core/shapes.js';
import { countSolutions,createRegion } from '../src/core/solver.js';
const directory=pathToFileURL(resolve(process.argv[2]||'plans/calendar/trimmed/improved')+'/');
const definition=JSON.parse(await readFile(new URL('board-pieces.json',directory),'utf8'));
const data=JSON.parse(await readFile(new URL('side-counts.json',directory),'utf8'));
const rules={allowRotation:true,allowFlip:true};
const smallest=data.dates.reduce((a,b)=>a.flippable.count<b.flippable.count?a:b);
for(const date of [smallest,data.dates.find(d=>d.month===2&&d.day===29)]) {
    const holes=new Set([Math.floor((date.month-1)/6)*7+(date.month-1)%6,13+date.day]);
    const region=createRegion(definition.board.cells.filter(([x,y])=>!holes.has(y*7+x)));
    region.symmetries=[{perm:Int32Array.from({length:region.n},(_,i)=>i)}];
    const result=countSolutions(region,shapeMultiset(definition.pieces,rules),rules,{cap:Infinity,breakSymmetry:false});
    assert.equal(result.exhausted,true);
    assert.equal(result.orbits,date.flippable.count);
    console.log(`${date.month}/${date.day}: independently verified ${result.orbits} flippable arrangements (${result.nodes} JS nodes).`);
}
