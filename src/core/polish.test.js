import { it,expect } from 'vitest';
import demo from '../puzzles/demo01.json';
import { createState,movePiece,setPlacement,rotatePiece,flipPiece } from './state.js';
import { clampToWorkspace,snapPlacement,workspaceBounds } from './workspace.js';
import { placedCells } from './puzzle.js';
import { validProgress,progress } from './completion.js';
import { validatePuzzle } from './validate.js';

it('allows negative runtime staging but still rejects negative authored starts',()=>{
    const state=movePiece(demo,createState(demo),'bar',-3,-2);
    expect(state.placements.bar).toMatchObject({x:-3,y:-2});
    const def=structuredClone(demo);def.pieces.find(p=>p.id==='bar').start.x=-1;
    expect(validatePuzzle(def).valid).toBe(false);
});
it('clamps the whole shape after every rotation and flip at each workspace corner',()=>{
    const def={...demo,rules:{...demo.rules,allowFlip:true}},box=workspaceBounds(def);
    for(const x of [-999,999]) for(const y of [-999,999]) {
        let state=movePiece(def,createState(def),'bar',x,y);
        for(let r=0;r<4;r++) {
            state=rotatePiece(def,state,'bar');state=flipPiece(def,state,'bar');
            for(const [cx,cy] of placedCells(def.pieces.find(p=>p.id==='bar'),state.placements.bar)) {
                expect(cx).toBeGreaterThanOrEqual(box.minX);expect(cy).toBeGreaterThanOrEqual(box.minY);expect(cx).toBeLessThan(box.maxX);expect(cy).toBeLessThan(box.maxY);
            }
        }
    }
});
it('keeps previews fractional, snaps origins with deterministic negative ties, and never stores fractions',()=>{
    const p=demo.pieces.find(p=>p.id==='bar'),place={...p.start,x:-1.5,y:7.49};
    expect(clampToWorkspace(demo,p,place)).toMatchObject({x:-1.5,y:7.49});
    expect(snapPlacement(demo,p,place)).toMatchObject({x:-1,y:7});
    expect(setPlacement(demo,createState(demo),'bar',place).placements.bar).toMatchObject({x:-1,y:7});
});
it('honors orientation rules even through direct placement calls',()=>{
    const def={...demo,rules:{...demo.rules,allowRotation:false}},state=createState(def);
    expect(setPlacement(def,state,'bar',{...state.placements.bar,rotation:1})).toBe(state);
    expect(setPlacement(def,state,'bar',{...state.placements.bar,flipped:true})).toBe(state);
    expect(setPlacement(def,state,'bar',{...state.placements.bar,x:NaN})).toBe(state);
});
it('does not report an overlapped contained piece as progress',()=>{
    const state=movePiece(demo,createState(demo),'bar',2,2);
    expect(progress(demo,state).contained).toBe(2);expect(validProgress(demo,state).contained).toBe(0);
});
it.each([null,[],{},'bad', {...demo,pieces:null},{...demo,pieces:[null]}, {...demo,container:{cells:[[0]]}}, {...demo,field:{width:Infinity,height:1}}, {...demo,container:{cells:[[1,1],[1,1]]}}])('malformed definitions return a report without throwing (%#)',def=>{
    expect(()=>validatePuzzle(def)).not.toThrow();expect(validatePuzzle(def).valid).toBe(false);
});
