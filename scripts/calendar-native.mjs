// Shared calendar research geometry and native exact-cover adapter.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { bounds } from '../src/core/geometry.js';
import { allowedOrientations } from '../src/core/shapes.js';
export const CAP = (1n << 64n) - 1n;
export const dates = [31,29,31,30,31,30,31,31,30,31,30,31].flatMap((n,m) => Array.from({length:n},(_,i)=>({month:m+1,day:i+1})));
export const blockedFor = ({month,day}) => [6,13,Math.floor((month-1)/6)*7+(month-1)%6,13+day];
export function transform(index, flipped, rotation) {
    let x=index%7,y=Math.floor(index/7);
    if(flipped) x=6-x;
    for(let i=0;i<rotation;i++) [x,y]=[6-y,x];
    return y*7+x;
}
export function inverse(index,{flipped,rotation}) {
    let x=index%7,y=Math.floor(index/7);
    for(let i=0;i<rotation;i++) [x,y]=[y,6-x];
    if(flipped) x=6-x;
    return [x,y];
}
export function canonical(indices,flips) {
    let best=null;
    for(const flipped of flips) for(let rotation=0;rotation<4;rotation++) {
        const cells=indices.map(i=>transform(i,flipped,rotation)).sort((a,b)=>a-b);
        const key=cells.reduce((key,cell)=>key*49+cell,0);
        if(best===null||key<best.key) best={key,cells,flipped,rotation};
    }
    return best;
}
export function placementsFor(pieces,allowFlip) {
    const rows=[];
    pieces.forEach((piece,pieceIndex)=>{
        for(const shape of allowedOrientations(piece.cells,{allowRotation:true,allowFlip})) {
            const {width,height}=bounds(shape);
            for(let y=0;y<=7-height;y++) for(let x=0;x<=7-width;x++) {
                const cells=shape.map(([cx,cy])=>[x+cx,y+cy]);
                const mask=cells.reduce((m,[cx,cy])=>m|1n<<BigInt(cy*7+cx),0n);
                rows.push({piece:pieceIndex,cells,mask});
            }
        }
    });
    assert.equal(new Set(rows.map(({piece,mask})=>`${piece}:${mask}`)).size,rows.length);
    return rows;
}
export async function buildCounter() {
    const work=await mkdtemp(join(tmpdir(),'pakke-calendar-search-'));
    const executable=join(work,'counter');
    const build=spawnSync(process.env.CXX||'c++',['-O3','-std=c++17',new URL('calendar-count.cpp',import.meta.url).pathname,'-o',executable],{encoding:'utf8'});
    assert.equal(build.status,0,build.stderr||build.error?.message);
    let serial=0;
    return async function run(rows,cases,pieceCount,cap=CAP) {
        if(!cases.length) return [];
        const path=join(work,`${serial++}.txt`);
        const input=`49 ${pieceCount} ${rows.length}\n`+rows.map(({piece,mask})=>`${piece} ${mask}`).join('\n')+'\n'+cases.length+'\n'+cases.map(({key,cells})=>`${key} ${cells.reduce((m,i)=>m|1n<<BigInt(i),0n)} ${cap}`).join('\n')+'\n';
        await writeFile(path,input);
        return new Promise((resolve,reject)=>{
            const child=spawn(executable,[path]);
            let stdout='',stderr='';
            child.stdout.on('data',data=>{stdout+=data;});
            child.stderr.on('data',data=>{stderr+=data;});
            child.on('error',reject);
            child.on('close',code=>{
                if(code!==0) return reject(new Error(stderr||`Counter exited ${code}`));
                try {
                    const result=stdout.trim().split('\n').filter(Boolean).map(JSON.parse);
                    assert.equal(result.length,cases.length);
                    result.forEach((r,i)=>{assert.equal(r.key,cases[i].key);assert.ok(Number.isSafeInteger(r.count));if(cap===CAP)assert.equal(r.exhausted,true);});
                    resolve(result);
                } catch(e) {reject(e);}
            });
        });
    };
}
