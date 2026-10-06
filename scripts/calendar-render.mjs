// Vector reference for the trimmed tray and stored fixed-side faces.
import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bounds } from '../src/core/geometry.js';
const directory=pathToFileURL(resolve(process.argv[2]||'plans/calendar/trimmed/improved')+'/');
const {board,pieces}=JSON.parse(await readFile(new URL('board-pieces.json',directory),'utf8'));
const data=JSON.parse(await readFile(new URL('side-counts.json',directory),'utf8'));
const palette=['#2a7a85','#916633','#8f5695','#438856','#a94656','#5565a4','#a46331','#606c38','#82565e','#526778'];
const text=(x,y,label,size=17,extra='')=>`<text x="${x}" y="${y}" font-size="${size}" ${extra}>${label}</text>`;
let body=text(36,44,'Calendar puzzle · side A faces',26,'font-weight="700"');
body+=text(36,76,`${data.summary.sideAMore} A wins · ${data.summary.sideBMore} B wins · ${data.summary.tied} ties · both sides solve every date`);
for(const [x,y] of board.cells){
    body+=`<rect x="${36+x*50}" y="${106+y*50}" width="50" height="50" fill="#fff" stroke="#b3bdc5"/>`;
    const label=board.labels[y]?.[x];
    if(label!==null&&label!==undefined)body+=text(61+x*50,135+y*50,label,16,'text-anchor="middle"');
}
body+=text(36,490,'47 tray cells; pieces cover 45. Four bottom blanks are usable.',15);
for(const [i,p] of pieces.entries()) {
    const column=i%5,row=Math.floor(i/5),x=425+column*122,y=115+row*185;
    body+=text(x,y,p.id,18,'font-weight="700"');
    const b=bounds(p.cells),pitch=22;
    for(const [cx,cy] of p.cells)body+=`<rect x="${x+cx*pitch}" y="${y+18+cy*pitch}" width="${pitch}" height="${pitch}" fill="${palette[i]}" stroke="#fff" stroke-width="1.5"/>`;
    if(b.width>5||b.height>5)throw new Error('Piece exceeds diagram slot');
}
body+=text(425,490,'Side B mirrors every piece. Flippable permits either face.',15);
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1050" height="525" viewBox="0 0 1050 525" role="img" aria-labelledby="title"><title id="title">Trimmed calendar board and exact side A piece faces</title><rect width="1050" height="525" fill="#eef2f4"/><g font-family="system-ui,sans-serif" fill="#273541">${body}</g></svg>\n`;
await writeFile(new URL('board-pieces.svg',directory),svg);
