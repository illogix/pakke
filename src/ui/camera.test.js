import { describe,it,expect } from 'vitest';
import { bounds } from '../core/geometry.js';
import demo from '../puzzles/demo01.json';
import pent from '../puzzles/pent01.json';
import { createState, movePiece } from '../core/state.js';
import { workspaceBounds } from '../core/workspace.js';
import { placedCells } from '../core/puzzle.js';
import { createCamera as cameraFor, openingState, clampCamera, displayPoint, canonicalPoint, worldToScreen, screenToWorld, displayCell, displayToScreen, zoomAt, panCamera, reframeCamera } from './camera.js';

const createCamera=(def,viewport)=>cameraFor(def,viewport,openingState(def,viewport));
const cellsOnScreen=(def,state,c)=>[...def.container.cells,...def.pieces.flatMap(p=>placedCells(p,state.placements[p.id]))]
    .flatMap(([x,y])=>[worldToScreen(def,c,x,y),worldToScreen(def,c,x+1,y+1)]);

for(const rotation of [0,1,2,3]) describe(`camera rotation ${rotation}`,()=>{
    const def={...demo,presentation:{fieldRotation:rotation}};
    it('round-trips fractional points in negative staging at fractional zoom/pan',()=>{
        const c=clampCamera({...createCamera(def,{width:390,height:715}),size:48.7,x:4.36,y:5.72});
        for(const p of [[-3.24,-2.77],[0,0],[3.999,7.001],[12.7,16.9]]) {
            const result=screenToWorld(def,c,...worldToScreen(def,c,...p));
            expect(result[0]).toBeCloseTo(p[0],10);expect(result[1]).toBeCloseTo(p[1],10);
            const direct=canonicalPoint(def.field,rotation,...displayPoint(def.field,rotation,...p));
            expect(direct[0]).toBeCloseTo(p[0],10);expect(direct[1]).toBeCloseTo(p[1],10);
        }
    });
    it('uses exactly the same phase and pitch for pieces and grid lines',()=>{
        const c=createCamera(def,{width:320,height:430});
        for(const [x,y] of [[-3,-2],[2,2],[6,5]]) {
            const cell=displayCell(def,x,y);expect(cell.every(Number.isInteger)).toBe(true);
            const corner=displayToScreen(c,...cell),center=worldToScreen(def,c,x+.5,y+.5);
            expect(center[0]-corner[0]).toBeCloseTo(c.size/2);expect(center[1]-corner[1]).toBeCloseTo(c.size/2);
        }
    });
    it('bounds every camera extreme and centers axes wider than the workspace',()=>{
        const c=createCamera(def,{width:844,height:290});
        for(const size of [.001,1e6]) for(const sign of [-1,1]) {
            const actual=clampCamera({...c,size,x:sign*1e9,y:-sign*1e9});
            expect(actual.size).toBeGreaterThanOrEqual(c.minSize);expect(actual.size).toBeLessThanOrEqual(c.maxSize);
            for(const [axis,extent,min,max] of [['x','width','minX','maxX'],['y','height','minY','maxY']]) {
                const half=c.viewport[extent]/actual.size/2;
                if(half*2>c.workspace[max]-c.workspace[min]) expect(actual[axis]).toBe((c.workspace[min]+c.workspace[max])/2);
                else {expect(actual[axis]-half).toBeGreaterThanOrEqual(c.workspace[min]-1e-10);expect(actual[axis]+half).toBeLessThanOrEqual(c.workspace[max]+1e-10);}
            }
        }
    });
});
it('zooms around a pointer anchor and pinches around a moving centroid without jumping',()=>{
    const c={...createCamera(demo,{width:320,height:400}),size:45}, point=[133.3,175.7],dest=[140.1,164.2];
    const world=screenToWorld(demo,c,...point),after=zoomAt(c,1.2,point,dest);
    const actual=worldToScreen(demo,after,...world);expect(actual[0]).toBeCloseTo(dest[0]);expect(actual[1]).toBeCloseTo(dest[1]);
});
it('reframes a saved piece at the negative workspace boundary without moving it',()=>{
    const initial=createState(demo),workspace=workspaceBounds(demo),state=movePiece(demo,initial,'bar',workspace.minX,workspace.minY);
    const before=JSON.stringify(state),c=reframeCamera(demo,state,createCamera(demo,{width:320,height:430}));
    expect(JSON.stringify(state)).toBe(before);
    for(const p of [[workspace.minX,workspace.minY],[7,6]]) {
        const [x,y]=worldToScreen(demo,c,...p);expect(x).toBeGreaterThanOrEqual(0);expect(x).toBeLessThanOrEqual(320);expect(y).toBeGreaterThanOrEqual(0);expect(y).toBeLessThanOrEqual(430);
    }
});
it.each([demo,pent])('opens on the arranged pieces without a clipping minimum cell size ($id)',def=>{
    for(const viewport of [{width:320,height:350},{width:844,height:270},{width:90,height:30}]) {
        const state=openingState(def,viewport),c=cameraFor(def,viewport,state);
        for(const [x,y] of cellsOnScreen(def,state,c)) {
            expect(x).toBeGreaterThanOrEqual(-1e-9);expect(x).toBeLessThanOrEqual(viewport.width+1e-9);
            expect(y).toBeGreaterThanOrEqual(-1e-9);expect(y).toBeLessThanOrEqual(viewport.height+1e-9);
        }
        expect(panCamera(c,1e9,-1e9).x).toBeLessThan(c.workspace.maxX);
    }
});
const trayCentre=(d,c)=>{
    const corners=d.container.cells.flatMap(([x,y])=>[worldToScreen(d,c,x,y),worldToScreen(d,c,x+1,y+1)]);
    const xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]);
    return [(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2];
};
it.each([demo,pent])('opens with the tray in the middle of the view ($id)',def=>{
    for(const rotation of [0,1]) for(const viewport of [{width:390,height:600},{width:1280,height:720},{width:2400,height:1600}]) {
        const d={...def,presentation:{fieldRotation:rotation}};
        const [x,y]=trayCentre(d,createCamera(d,viewport));expect(x).toBeCloseTo(viewport.width/2,6);expect(y).toBeCloseTo(viewport.height/2,6);
    }
});
it.each([0,1])('fits tightly around the tray and pieces, wherever they are (rotation %i)',rotation=>{
    const d={...pent,presentation:{fieldRotation:rotation}},viewport={width:390,height:600};
    const c=createCamera(d,viewport),tray=bounds(d.container.cells);
    // Every free piece in a block above the tray as displayed: Fit no longer centres the tray.
    let state=openingState(d,viewport);
    for(const [i,p] of d.pieces.entries()) if(!p.locked) {
        const along=i%3*4,away=4+Math.floor(i/3)*4;
        state=movePiece(d,state,p.id,rotation?tray.minX-away:tray.minX+along,rotation?tray.minY+along:tray.minY-away);
    }
    const fitted=reframeCamera(d,state,c),points=cellsOnScreen(d,state,fitted);
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(28-1e-9);expect(Math.max(...xs)).toBeLessThanOrEqual(viewport.width-28+1e-9);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(28-1e-9);expect(Math.max(...ys)).toBeLessThanOrEqual(viewport.height-28+1e-9);
    // Tight on at least one axis.
    expect(Math.min(Math.min(...xs)-28,viewport.width-28-Math.max(...xs),Math.min(...ys)-28,viewport.height-28-Math.max(...ys))).toBeLessThan(1e-6);
    // Pieces above the tray push it below the middle of the view.
    expect(trayCentre(d,fitted)[1]).toBeGreaterThan(viewport.height/2+10);
});
