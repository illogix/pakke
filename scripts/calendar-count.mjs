// Calendar research only. Uses a native counter for exhaustive enumeration;
// the existing JS solver and cell reconstruction provide separate cross-checks.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { bounds, normalise, orient } from '../src/core/geometry.js';
import { allowedOrientations, canonicalKey, shapeMultiset } from '../src/core/shapes.js';
import { countSolutions, createRegion } from '../src/core/solver.js';

const trimmed = process.argv.includes('--trimmed');
const directoryArg = process.argv.indexOf('--directory');
const directory = directoryArg >= 0 ? pathToFileURL(resolve(process.argv[directoryArg+1]) + '/') : new URL(trimmed ? '../plans/calendar/trimmed/' : '../plans/calendar/', import.meta.url);
const definition = JSON.parse(await readFile(new URL('board-pieces.json', directory), 'utf8'));
const { pieces } = definition;
const daysInMonth = [31,29,31,30,31,30,31,31,30,31,30,31];
const months = definition.board.labels.slice(0,2).flat().filter(Boolean);
const dates = daysInMonth.flatMap((n,m) => Array.from({ length:n }, (_,i) => ({ month:m+1, day:i+1 })));
const holesFor = ({ month,day }) => [Math.floor((month-1)/6)*7+(month-1)%6, 13+day];
const boardCells = definition.board.cells ?? Array.from({length:49},(_,i) => [i%7,Math.floor(i/7)]);
const boardIndices = new Set(boardCells.map(([x,y]) => y*7+x));
assert.equal(definition.board.width,7);
assert.equal(definition.board.height,7);
assert.equal(boardCells.length,boardIndices.size);
assert.ok(boardCells.every(([x,y]) => Number.isInteger(x) && Number.isInteger(y) && x>=0 && x<7 && y>=0 && y<7));
assert.equal(pieces.reduce((sum,piece) => sum+piece.cells.length,0),boardCells.length-2);
const removed = Array.from({length:49},(_,i) => i).filter((i) => !boardIndices.has(i));
assert.deepEqual(removed,trimmed ? [6,13] : []);
const blockedFor = (date) => [...removed,...holesFor(date)];
const FULL = boardCells.reduce((mask,[x,y]) => mask | 1n << BigInt(y*7+x),0n);
const CAP = (1n << 64n) - 1n;
const write = process.argv.includes('--write');
const screen = process.argv.includes('--screen-faces');
assert.ok(process.argv.slice(2).filter((_,i) => directoryArg < 0 || (i+2 !== directoryArg && i+2 !== directoryArg+1)).every((arg) => ['--write','--screen-faces','--trimmed'].includes(arg)), 'Usage: node scripts/calendar-count.mjs [--write] [--screen-faces] [--trimmed] [--directory PATH]');
const work = await mkdtemp(join(tmpdir(), 'pakke-calendar-'));
const executable = join(work, 'counter');
const build = spawnSync(process.env.CXX || 'c++', ['-O3','-std=c++17', new URL('calendar-count.cpp', import.meta.url).pathname, '-o', executable], { encoding:'utf8' });
assert.equal(build.status, 0, build.stderr || build.error?.message);

function transform(index, flipped, rotation) {
    let x = index % 7, y = Math.floor(index/7);
    if (flipped) x = 6-x;
    for (let i=0; i<rotation; i++) [x,y] = [6-y,x];
    return y*7+x;
}
function inverse(index, { flipped,rotation }) {
    let x = index % 7, y = Math.floor(index/7);
    for (let i=0; i<rotation; i++) [x,y] = [y,6-x];
    if (flipped) x = 6-x;
    return [x,y];
}
function canonical(indices, flips) {
    let best = null;
    for (const flipped of flips) for (let rotation=0; rotation<4; rotation++) {
        const cells = indices.map((i) => transform(i,flipped,rotation)).sort((a,b) => a-b);
        const key = cells.reduce((key,cell) => key*49+cell,0);
        if (best === null || key < best.key) best = { key, cells, flipped, rotation };
    }
    return best;
}
function placementsFor(sourcePieces, allowFlip) {
    const placements = [];
    sourcePieces.forEach((piece,pieceIndex) => {
        for (const shape of allowedOrientations(piece.cells, { allowRotation:true,allowFlip })) {
            const { width,height } = bounds(shape);
            for (let y=0; y<=7-height; y++) for (let x=0; x<=7-width; x++) {
                const cells = shape.map(([cx,cy]) => [x+cx,y+cy]);
                const mask = cells.reduce((mask,[cx,cy]) => mask | 1n << BigInt(cy*7+cx), 0n);
                placements.push({ piece:pieceIndex, cells, mask });
            }
        }
    });
    // Symmetric orientations must not create duplicate rows and inflate counts.
    assert.equal(new Set(placements.map(({piece,mask}) => `${piece}:${mask}`)).size, placements.length);
    return placements;
}
function inputFor(placements, cases, cells=49, pieceCount=pieces.length, cap=CAP) {
    return `${cells} ${pieceCount} ${placements.length}\n` +
        placements.map(({piece,mask}) => `${piece} ${mask}`).join('\n') + '\n' + cases.length + '\n' +
        cases.map(({key,cells}) => `${key} ${cells.reduce((mask,i) => mask | 1n << BigInt(i),0n)} ${cap}`).join('\n') + '\n';
}
async function run(placements, cases, name, cells=49, pieceCount=pieces.length, cap=CAP) {
    const path = join(work, `${name}.txt`);
    await writeFile(path,inputFor(placements,cases,cells,pieceCount,cap));
    return new Promise((resolve,reject) => {
        const child = spawn(executable,[path]);
        let stdout = '', stderr = '';
        child.stdout.on('data',(data) => { stdout += data; });
        child.stderr.on('data',(data) => { stderr += data; });
        child.on('error',reject);
        child.on('close',(code) => {
            if (code !== 0) return reject(new Error(stderr || `Counter exited ${code}`));
            const results = stdout.trim().split('\n').filter(Boolean).map(JSON.parse);
            assert.equal(results.length,cases.length);
            for (let i=0; i<results.length; i++) {
                assert.equal(results[i].key,cases[i].key);
                assert.ok(Number.isSafeInteger(results[i].count));
                if (cap === CAP) assert.equal(results[i].exhausted,true,'Count exceeded 64-bit range');
            }
            resolve(results);
        });
    });
}
async function sanityChecks() {
    // Two labeled dominoes on 2x2: two tilings, two assignments each. Board
    // symmetry must not collapse these four arrangements to a single orbit.
    const dominoRows = [3n,12n,5n,10n].flatMap((mask) => [0,1].map((piece) => ({piece,mask})));
    const [full] = await run(dominoRows,[{key:0,cells:[]}],'sanity-full',4,2);
    assert.equal(full.count,4);
    const [capped] = await run(dominoRows,[{key:0,cells:[]}],'sanity-cap',4,2,1n);
    assert.equal(capped.count,1);
    assert.equal(capped.exhausted,false);
    const [impossible] = await run(dominoRows,[{key:0,cells:[0]}],'sanity-empty',4,2);
    assert.equal(impossible.count,0);
    // Six uniquely labeled horizontal dominoes: 6! assignments and enough
    // depth to exercise memoized suffixes, including a shared suffix state.
    const six = Array.from({length:6},(_,piece) => Array.from({length:6},(_,x) => ({piece,mask:3n << BigInt(2*x)}))).flat();
    const [memoized] = await run(six,[{key:0,cells:[]}],'sanity-memo',12,6);
    assert.equal(memoized.count,720);
}
function placementFor(pieceIndex,cells,mode) {
    const piece = pieces[pieceIndex];
    const target = JSON.stringify(normalise(cells));
    const { minX:x,minY:y } = bounds(cells);
    const flips = mode === 'sideA' ? [false] : mode === 'sideB' ? [true] : [false,true];
    for (const flipped of flips) for (let rotation=0; rotation<4; rotation++) {
        if (JSON.stringify(orient(piece.cells,rotation,flipped)) === target)
            return { id:piece.id,x,y,rotation,flipped };
    }
    throw new Error(`Wrong face for ${piece.id} in ${mode}`);
}
function validate(data) {
    assert.equal(data.boardId,definition.id);
    assert.deepEqual(data.pieces,pieces);
    assert.equal(data.dates.length,366);
    for (let i=0; i<dates.length; i++) {
        const date = data.dates[i];
        assert.equal(date.month,dates[i].month); assert.equal(date.day,dates[i].day);
        const holes = holesFor(date);
        for (const mode of ['sideA','sideB','flippable']) {
            assert.ok(Number.isSafeInteger(date[mode].count) && date[mode].count > 0);
            const remaining = new Map(pieces.map((piece) => [piece.id,piece]));
            let occupied = 0n;
            assert.equal(date[mode].placements.length,pieces.length);
            for (const placement of date[mode].placements) {
                const piece = remaining.get(placement.id);
                assert.ok(piece); remaining.delete(placement.id);
                assert.ok(Number.isInteger(placement.x) && Number.isInteger(placement.y));
                assert.ok(Number.isInteger(placement.rotation) && placement.rotation >= 0 && placement.rotation < 4);
                assert.equal(typeof placement.flipped,'boolean');
                if (mode !== 'flippable') assert.equal(placement.flipped,mode === 'sideB');
                for (const [x,y] of orient(piece.cells,placement.rotation,placement.flipped)) {
                    const cx=x+placement.x,cy=y+placement.y;
                    assert.ok(cx>=0 && cx<7 && cy>=0 && cy<7);
                    const bit=1n << BigInt(cy*7+cx);
                    assert.equal(occupied & bit,0n,'Overlap');
                    occupied |= bit;
                }
            }
            assert.equal(remaining.size,0);
            assert.equal(occupied,FULL ^ holes.reduce((mask,i) => mask | 1n << BigInt(i),0n));
        }
        assert.ok(date.flippable.count >= Math.max(date.sideA.count,date.sideB.count));
    }
}
async function enumerate(allowFlip) {
    const placements=placementsFor(pieces,allowFlip), cases=new Map(), mapping=[];
    for (const date of dates) {
        const holes=blockedFor(date);
        const a=canonical(holes,allowFlip ? [false,true] : [false]);
        cases.set(a.key,a);
        const b=allowFlip ? null : canonical(holes,[true]);
        if (b) cases.set(b.key,b);
        mapping.push({a,b});
    }
    const groups=Array.from({length:4},() => []);
    [...cases.values()].forEach((c,i) => groups[i%4].push(c));
    const name=allowFlip ? 'flippable' : 'fixed';
    console.log(`Counting ${cases.size} ${name} regions (exact labeled-board counts).`);
    const results=await Promise.all(groups.map(async (group,i) => {
        const results=await run(placements,group,`${name}-${i}`);
        console.log(`${name}: completed group ${i+1}/4.`);
        return results;
    }));
    return {placements,mapping,results:new Map(results.flat().map((r) => [r.key,r]))};
}
function summarize(data) {
    const {dates}=data;
    const summary={sideAMore:0,sideBMore:0,tied:0};
    for (const date of dates) {
        if (date.sideA.count > date.sideB.count) summary.sideAMore++;
        else if (date.sideA.count < date.sideB.count) summary.sideBMore++;
        else summary.tied++;
    }
    for (const mode of ['sideA','sideB','flippable']) {
        const counts=dates.map((date) => date[mode].count).sort((a,b) => a-b);
        summary[mode]={min:counts[0],max:counts.at(-1),median:(counts[182]+counts[183])/2,total:counts.reduce((a,b) => a+b)};
    }
    if (trimmed) {
        const a=dates.map((date) => canonical(blockedFor(date),[false]).key);
        const b=dates.map((date) => canonical(blockedFor(date),[true]).key);
        const available=new Set(a);
        summary.geometry={forcedTies:a.filter((key,i) => key===b[i]).length,reflectionPairedDates:b.filter((key) => available.has(key)).length};
    }
    return summary;
}
async function crossCheck(data) {
    // Exhaustive independent JS searches on several dates. Disable the
    // solver's geometric orbit quotient: all calendar labels stay fixed.
    const rules={allowRotation:true,allowFlip:false};
    for (const [month,day] of [[1,1],[1,2],[1,3],[2,29]]) {
        const date=data.dates.find((d) => d.month===month && d.day===day);
        const holes=new Set(blockedFor(date));
        const region=createRegion(Array.from({length:49},(_,i) => [i%7,Math.floor(i/7)]).filter((_,i) => !holes.has(i)));
        region.symmetries=[{perm:Int32Array.from({length:region.n},(_,i) => i)}];
        for (const mode of ['sideA','sideB']) {
            const source=pieces.map((piece) => ({...piece,cells:orient(piece.cells,0,mode==='sideB')}));
            const result=countSolutions(region,shapeMultiset(source,rules),rules,{cap:Infinity,breakSymmetry:false});
            assert.equal(result.exhausted,true);
            assert.equal(result.orbits,date[mode].count,`${month}/${day} ${mode}: JS/native disagreement`);
        }
    }
    console.log('Independent JS counts agree on eight fixed-side puzzles.');
}

async function verifyPairedAlternative() {
    const paired=JSON.parse(await readFile(new URL('paired-pieces.json',directory),'utf8'));
    assert.deepEqual(paired.board,definition.board);
    const rules={allowRotation:true,allowFlip:false};
    assert.deepEqual(paired.rules,rules);
    assert.equal(paired.pieces.length,10);
    assert.equal(paired.pieces.reduce((sum,p) => sum+p.cells.length,0),47);
    const keys=(pieces) => pieces.map((p) => canonicalKey(p.cells,rules)).sort();
    // Flipping the whole inventory permutes its shapes: every mirror partner
    // is already present. Relabeling that permutation gives a bijection of
    // A and B solutions for each individual date, proving identical counts.
    assert.deepEqual(keys(paired.pieces),keys(paired.pieces.map((p) => ({...p,cells:orient(p.cells,0,true)}))));
    const shapes=shapeMultiset(paired.pieces,rules);
    const cells=Array.from({length:49},(_,i) => [i%7,Math.floor(i/7)]);
    for (const date of dates) {
        const holes=new Set(holesFor(date));
        const region=cells.filter((_,i) => !holes.has(i));
        const result=countSolutions(region,shapes,rules,{cap:1,breakSymmetry:false});
        assert.equal(result.orbits,1);
        // Verify the witness directly, including the rotation-only shape
        // multiset, rather than relying on the solver's success flag alone.
        assert.deepEqual(result.solutions[0].pieces.map((p) => canonicalKey(p,rules)).sort(),keys(paired.pieces));
        const actual=result.solutions[0].pieces.flat().map(([x,y]) => y*7+x).sort((a,b) => a-b);
        assert.deepEqual(actual,region.map(([x,y]) => y*7+x));
    }
    console.log('Paired alternative: 366/366 dates solved; A = B for every date by inventory symmetry.');
}

await sanityChecks();
if (!trimmed) await verifyPairedAlternative();
let data;
if (write) {
    const [fixed,easy]=await Promise.all([enumerate(false),enumerate(true)]);
    data={boardId:definition.id,pieces,countConvention:'Exact arrangements on the fixed labeled board; no board-symmetry quotient.',dates:dates.map((date,i) => {
        const result={...date};
        for (const mode of ['sideA','sideB','flippable']) {
            const study=mode==='flippable' ? easy : fixed;
            const mapping=study.mapping[i][mode==='sideB' ? 'b' : 'a'];
            const counted=study.results.get(mapping.key);
            const placements=counted.witness.map((rowIndex) => {
                const row=study.placements[rowIndex];
                return placementFor(row.piece,row.cells.map(([x,y]) => inverse(y*7+x,mapping)),mode);
            });
            result[mode]={count:counted.count,placements};
        }
        return result;
    })};
    validate(data);
    await crossCheck(data);
    data.summary=summarize(data);
    await writeFile(new URL('side-counts.json',directory),JSON.stringify(data,null,2)+'\n');
    let table='# Calendar solution counts\n\nExact arrangements on the labeled board. Side A uses the faces in\n[board-pieces.json](board-pieces.json); side B flips every piece. Both fixed\nsides permit rotations only. Flippable permits both faces independently.\n\n| Date | Side A | Side B | Flippable | Fewer fixed-side solutions |\n| --- | ---: | ---: | ---: | --- |\n';
    for (const date of data.dates) table+=`| ${months[date.month-1]} ${date.day} | ${date.sideA.count} | ${date.sideB.count} | ${date.flippable.count} | ${date.sideA.count < date.sideB.count ? 'A' : date.sideA.count > date.sideB.count ? 'B' : 'Tie'} |\n`;
    await writeFile(new URL('side-counts.md',directory),table);
} else {
    data=JSON.parse(await readFile(new URL('side-counts.json',directory),'utf8'));
    validate(data);
    await crossCheck(data);
    assert.deepEqual(data.summary,summarize(data));
}

if (screen) {
    const rules={allowRotation:true,allowFlip:false};
    const chiral=pieces.map((piece,index) => ({index,a:JSON.stringify(allowedOrientations(piece.cells,rules).sort()),b:JSON.stringify(allowedOrientations(orient(piece.cells,0,true),rules).sort())})).filter(({a,b}) => a!==b).map(({index}) => index);
    assert.equal(chiral.length,trimmed ? 6 : 7);
    const results=[];
    // Complementary face assignments swap A and B. Fix the first chiral face
    // to remove that redundancy. Every candidate must tie on every reflected
    // pair of valid dates to satisfy A(date) >= B(date) throughout the year.
    for (let mask=0; mask<2**(chiral.length-1); mask++) {
        const faces=chiral.filter((_,i) => i>0 && mask & 2**(i-1));
        const source=pieces.map((piece,index) => ({...piece,cells:orient(piece.cells,0,faces.includes(index))}));
        const placements=placementsFor(source,false);
        let rejection=null;
        const probes=trimmed ? [{month:6,day:2},{month:6,day:3},{month:6,day:4}] : [{month:2,day:1},{month:2,day:2},{month:3,day:1}];
        for (const date of probes) {
            const holes=blockedFor(date);
            const a=canonical(holes,[false]),b=canonical(holes,[true]);
            const [ra,rb]=await run(placements,[a,b],`screen-${mask}-${date.month}-${date.day}`);
            if (ra.count!==rb.count) { rejection={...date,sideA:ra.count,sideB:rb.count}; break; }
        }
        results.push({flippedPieces:faces.map((index) => pieces[index].id),rejection});
    }
    assert.ok(results.every(({rejection}) => rejection),'Some face choices need further investigation');
    await writeFile(new URL('face-screen.json',directory),JSON.stringify({scope:`All ${results.length} face assignments for this specific ten-shape set, up to simultaneously flipping all pieces. Other shape sets were not exhausted.`,candidates:results},null,2)+'\n');
    console.log(`All ${results.length} face assignments fail the global A >= B condition on a reflected pair.`);
}
console.log(JSON.stringify(summarize(data),null,2));
console.log('Verified witnesses for 366 dates × 3 modes, including the fixed-face restrictions.');
