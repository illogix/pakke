import { cellKey } from '../core/geometry.js';

/** Clockwise outer loops and counterclockwise holes, including disconnected shapes. */
export function silhouetteLoops(cells) {
    const occupied = new Set(cells.map(c=>cellKey(...c)));
    const edges = [];
    for (const [x,y] of cells) {
        if (!occupied.has(cellKey(x,y-1))) edges.push([[x,y],[x+1,y],0]);
        if (!occupied.has(cellKey(x+1,y))) edges.push([[x+1,y],[x+1,y+1],1]);
        if (!occupied.has(cellKey(x,y+1))) edges.push([[x+1,y+1],[x,y+1],2]);
        if (!occupied.has(cellKey(x-1,y))) edges.push([[x,y+1],[x,y],3]);
    }
    const starts = new Map();
    edges.forEach((edge,i)=> { const key=cellKey(...edge[0]); if (!starts.has(key)) starts.set(key,[]); starts.get(key).push(i); });
    const used = new Set(), loops = [];
    for (let i=0;i<edges.length;i++) {
        if (used.has(i)) continue;
        const loop=[]; let at=i;
        while (!used.has(at)) {
            used.add(at);
            const [a,b,d] = edges[at]; loop.push(a);
            const next = (starts.get(cellKey(...b)) ?? []).filter(n=>!used.has(n));
            if (!next.length) break;
            // Prefer a right turn at diagonal point contacts.
            const priority = n => [1,0,3,2].indexOf((edges[n][2]-d+4)%4);
            next.sort((a,b)=>priority(a)-priority(b)); at=next[0];
        }
        // Remove collinear intermediate cell vertices before rounding.
        loops.push(loop.filter((p,j)=> {
            const a=loop[(j+loop.length-1)%loop.length], b=loop[(j+1)%loop.length];
            return (p[0]-a[0])*(b[1]-p[1]) !== (p[1]-a[1])*(b[0]-p[0]);
        }));
    }
    return loops;
}
