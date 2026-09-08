import {it,expect} from 'vitest';
import {silhouetteLoops} from './silhouette.js';
const signedArea=loop=>loop.reduce((area,p,i)=>{const q=loop[(i+1)%loop.length];return area+(p[0]*q[1]-q[0]*p[1])/2;},0);
it('a continuous bar has only four perimeter vertices, never a valid-cell group boundary',()=>{
    const loops=silhouetteLoops([[0,0],[1,0],[2,0],[3,0]]);expect(loops).toHaveLength(1);expect(loops[0]).toHaveLength(4);expect(signedArea(loops[0])).toBe(4);
});
it('retains concave corners, holes and disconnected components',()=>{
    const ring=[];for(let y=0;y<3;y++)for(let x=0;x<3;x++)if(x!==1||y!==1)ring.push([x,y]);
    const loops=silhouetteLoops(ring);expect(loops).toHaveLength(2);expect(loops.map(signedArea).sort((a,b)=>a-b)).toEqual([-1,9]);
    expect(silhouetteLoops([[0,0],[1,1]])).toHaveLength(2);
    const ell=silhouetteLoops([[0,0],[0,1],[0,2],[1,2]]);expect(ell).toHaveLength(1);expect(signedArea(ell[0])).toBe(4);
});
