import { bounds, cellKey } from '../core/geometry.js';
import { silhouetteLoops } from './silhouette.js';
import { cssColor, gridAlpha, rgba, theme } from './theme.js';

export const MATERIAL_UNIT = 96;
export const MATERIAL_PAD = 24;
// Fractions of a cell: background-coloured separation edge (centred on the
// silhouette), the selection ring outside it, and the corner radii.
const EDGE = 0.07, RING = 0.05, PIECE_RADIUS = 0.065, TRAY_RADIUS = 0.16;

export function roundedPath(loops, unit, pad, radius) {
    const path = new Path2D();
    for (const loop of loops) {
        const points=loop.map(([x,y])=>[pad+x*unit,pad+y*unit]);
        if (!points.length) continue;
        const first=points[0], prev=points.at(-1);
        path.moveTo((first[0]+prev[0])/2,(first[1]+prev[1])/2);
        for(let i=0;i<points.length;i++) {
            const p=points[i], next=points[(i+1)%points.length];
            path.arcTo(p[0],p[1],next[0],next[1],radius);
        }
        path.closePath();
    }
    return path;
}
function sizeCanvas(canvas, cells) {
    const box=bounds(cells), unit=Math.min(MATERIAL_UNIT,2048/Math.max(box.width,box.height)), pad=MATERIAL_PAD;
    canvas.width=Math.ceil(box.width*unit+pad*2); canvas.height=Math.ceil(box.height*unit+pad*2);
    return { box, unit, pad, ctx: canvas.getContext('2d') };
}

/** Bake one entire piece to a reusable CanvasTexture; no per-frame filters. */
export function paintMaterial(canvas, cells, color, { locked=false, selected=false, lifted=false, invalid=[] }={}) {
    const { box, unit, pad, ctx }=sizeCanvas(canvas, cells);
    const path=roundedPath(silhouetteLoops(cells),unit,pad,unit*PIECE_RADIUS);
    const dark=theme.scheme==='dark';
    if (selected) {
        // Ink ring just outside the separation edge; the fill and edge cover its inner part.
        ctx.strokeStyle=cssColor(theme.ink); ctx.lineJoin='round';
        ctx.lineWidth=(EDGE+2*RING)*unit; ctx.stroke(path);
    }
    ctx.save();
    // Flat at rest; only a lifted piece casts a soft shadow. Locked pieces sit in a faint contact shade.
    if (lifted || locked) {
        ctx.shadowColor=dark?'rgba(0,0,0,.5)':locked?'rgba(20,20,20,.16)':'rgba(20,20,20,.22)';
        ctx.shadowBlur=lifted?14:3; ctx.shadowOffsetY=lifted?7:1.5;
    }
    ctx.fillStyle=cssColor(color); ctx.fill(path,'evenodd'); ctx.restore();
    ctx.save(); ctx.clip(path,'evenodd');
    if (locked) {
        // Deterministic fine micrograin: material, not a hatch or symbol.
        let seed=47;
        const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296;};
        for (let i=0;i<box.width*box.height*450;i++) {
            const x=pad+random()*box.width*unit, y=pad+random()*box.height*unit;
            ctx.fillStyle=i%2?'rgba(255,255,255,.2)':'rgba(20,20,20,.14)';
            ctx.fillRect(x,y,1.4,1.4);
        }
    }
    ctx.fillStyle=`rgba(0,0,0,${theme.invalidAlpha})`;
    for(const [x,y] of invalid) ctx.fillRect(pad+x*unit,pad+y*unit,unit,unit);
    // Faint identical seams, including the valid/invalid boundary.
    const keys=new Set(cells.map(c=>cellKey(...c)));
    ctx.strokeStyle='rgba(0,0,0,.06)'; ctx.lineWidth=1.2; ctx.beginPath();
    for(const [x,y] of cells) {
        if(keys.has(cellKey(x+1,y))) {ctx.moveTo(pad+(x+1)*unit,pad+y*unit);ctx.lineTo(pad+(x+1)*unit,pad+(y+1)*unit);}
        if(keys.has(cellKey(x,y+1))) {ctx.moveTo(pad+x*unit,pad+(y+1)*unit);ctx.lineTo(pad+(x+1)*unit,pad+(y+1)*unit);}
    }
    ctx.stroke(); ctx.restore();
    // The background-coloured edge separates neighbours, including same-coloured ones.
    ctx.strokeStyle=cssColor(theme.page); ctx.lineWidth=EDGE*unit; ctx.lineJoin='round'; ctx.stroke(path);
    return { unit, pad };
}

/** The tray: one flat rounded silhouette in the field colour with faint cell lines. */
export function paintTray(canvas, cells) {
    const { box, unit, pad, ctx }=sizeCanvas(canvas, cells);
    const local=cells.map(([x,y])=>[x-box.minX,y-box.minY]);
    const path=roundedPath(silhouetteLoops(local),unit,pad,unit*TRAY_RADIUS);
    ctx.fillStyle=cssColor(theme.field); ctx.fill(path,'evenodd');
    ctx.save(); ctx.clip(path,'evenodd');
    ctx.strokeStyle=rgba(theme.grid,gridAlpha); ctx.lineWidth=Math.max(1.5,unit*0.025); ctx.beginPath();
    for(let x=1;x<box.width;x++) {ctx.moveTo(pad+x*unit,0);ctx.lineTo(pad+x*unit,canvas.height);}
    for(let y=1;y<box.height;y++) {ctx.moveTo(0,pad+y*unit);ctx.lineTo(canvas.width,pad+y*unit);}
    ctx.stroke(); ctx.restore();
    return { unit, pad, box };
}
