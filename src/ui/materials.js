import { bounds, cellKey } from '../core/geometry.js';
import { silhouetteLoops } from './silhouette.js';
import { cssColor, darken, theme } from './theme.js';

export const MATERIAL_UNIT = 96;
export const MATERIAL_PAD = 24;

function roundedPath(loops, unit, pad) {
    const path = new Path2D(), radius = unit * 0.065;
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

/** Bake one entire piece to a reusable CanvasTexture; no per-frame filters. */
export function paintMaterial(canvas, cells, color, { locked=false, selected=false, lifted=false, invalid=[] }={}) {
    const box=bounds(cells);
    const unit=Math.min(MATERIAL_UNIT,2048/Math.max(box.width,box.height));
    const pad=MATERIAL_PAD;
    canvas.width=Math.ceil(box.width*unit+pad*2);
    canvas.height=Math.ceil(box.height*unit+pad*2);
    const ctx=canvas.getContext('2d');
    const path=roundedPath(silhouetteLoops(cells),unit,pad);
    ctx.save();
    ctx.shadowColor=locked?'rgba(39,45,39,.22)':'rgba(44,52,44,.24)';
    ctx.shadowBlur=locked?3:lifted?16:8;
    ctx.shadowOffsetY=locked?2:lifted?10:5;
    ctx.fillStyle=cssColor(color); ctx.fill(path,'evenodd'); ctx.restore();
    ctx.save(); ctx.clip(path,'evenodd');
    const gradient=ctx.createLinearGradient(0,pad,0,canvas.height-pad);
    gradient.addColorStop(0,cssColor(color)); gradient.addColorStop(1,cssColor(darken(color,locked?.025:.06)));
    ctx.fillStyle=gradient; ctx.fillRect(0,0,canvas.width,canvas.height);
    if (locked) {
        // Deterministic fine micrograin: material, not a hatch or symbol.
        let seed=47;
        const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296;};
        for (let i=0;i<box.width*box.height*450;i++) {
            const x=pad+random()*box.width*unit, y=pad+random()*box.height*unit;
            ctx.fillStyle=i%2?'rgba(255,255,255,.23)':'rgba(48,43,35,.17)';
            ctx.fillRect(x,y,1.4,1.4);
        }
    }
    ctx.fillStyle=`rgba(25,32,35,${theme.invalidAlpha})`;
    for(const [x,y] of invalid) ctx.fillRect(pad+x*unit,pad+y*unit,unit,unit);
    // Faint identical seams, including the valid/invalid boundary.
    const keys=new Set(cells.map(c=>cellKey(...c)));
    ctx.strokeStyle='rgba(20,35,35,.055)'; ctx.lineWidth=1.2; ctx.beginPath();
    for(const [x,y] of cells) {
        if(keys.has(cellKey(x+1,y))) {ctx.moveTo(pad+(x+1)*unit,pad+y*unit);ctx.lineTo(pad+(x+1)*unit,pad+(y+1)*unit);}
        if(keys.has(cellKey(x,y+1))) {ctx.moveTo(pad+x*unit,pad+(y+1)*unit);ctx.lineTo(pad+(x+1)*unit,pad+(y+1)*unit);}
    }
    ctx.stroke();
    // A single inset light edge follows the entire silhouette, including tinted cells.
    ctx.translate(0,locked?1.2:2.4); ctx.strokeStyle=locked?'rgba(255,255,255,.17)':'rgba(255,255,255,.43)';
    ctx.lineWidth=locked?2:3.2;ctx.stroke(path);ctx.restore();
    ctx.strokeStyle=cssColor(darken(color,selected?.58:.30));ctx.lineWidth=selected?3.8:2;ctx.stroke(path);
    return { unit, pad };
}
