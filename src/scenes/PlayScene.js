import Phaser from 'phaser';
import { bounds, cellKey, orient, outlineEdges } from '../core/geometry.js';
import { findPiece, orientedBounds, placedCells } from '../core/puzzle.js';
import { createState, flipPiece, rotatePiece, setPlacement } from '../core/state.js';
import { computeViolations } from '../core/violations.js';
import { isSolved, validProgress } from '../core/completion.js';
import { clampToWorkspace, snapPlacement } from '../core/workspace.js';
import { rotatedGrabPoint, flippedGrabPoint } from '../ui/interaction.js';
import { createCamera, displayCell, displayToScreen, screenToDisplay, screenToWorld, panCamera, zoomAt, reframeCamera, cameraIsInitial, clampCamera } from '../ui/camera.js';
import { paintMaterial } from '../ui/materials.js';
import { theme } from '../ui/theme.js';
import { storage } from '../app/storage.js';

// Phaser owns the rendering loop. Native captured Pointer Events own gestures.
// Only committed integer placements enter the pure core or storage.
export default class PlayScene extends Phaser.Scene {
    constructor() { super('Play'); }
    init(data={}) { this.def=data.def;this.shell=data.shell;this.saved=data.state; }
    create() {
        if(!this.def) {this.scene.stop();return;}
        this.camera=null;
        this.pixelRatio=this.registry.get('pixelRatio')??1;
        this.cameras.main.setOrigin(0,0).setZoom(this.pixelRatio);
        this.state=this.saved??createState(this.def);this.selectedId=null;this.gesture=null;this.settling=null;
        this.pointers=new Map();this.solved=isSolved(this.def,this.state);this.pendingCompletion=0;
        this.zOrder=this.def.pieces.map(p=>p.id);this.visuals=new Map();this.geometry=new Map();this.dirty=true;
        this.board=this.add.graphics();this.footprint=this.add.graphics().setDepth(1);
        this.cameras.main.setBackgroundColor(theme.page);
        this.abort=new AbortController();const signal=this.abort.signal;const canvas=this.game.canvas;
        canvas.tabIndex=0;canvas.setAttribute('aria-label','Puzzle board. Drag pieces, pan empty canvas, pinch or scroll to zoom.');
        const on=(target,name,fn,options={})=>target.addEventListener(name,fn,{...options,signal});
        on(canvas,'pointerdown',e=>this.pointerDown(e));on(canvas,'pointermove',e=>this.pointerMove(e));
        on(canvas,'pointerup',e=>this.pointerUp(e));
        on(canvas,'pointercancel',e=>{if(this.pointers.has(e.pointerId))this.cancelGesture();});
        on(canvas,'lostpointercapture',e=>{if(this.pointers.has(e.pointerId))this.cancelGesture();});
        on(canvas,'contextmenu',e=>e.preventDefault());
        on(canvas,'wheel',e=>{
            if(e.ctrlKey||e.metaKey||this.gesture||this.shell.dialog.open)return;
            e.preventDefault();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?this.camera.viewport.height:1);
            this.camera=zoomAt(this.camera,Math.exp(-Math.max(-200,Math.min(200,delta))*.0025),this.point(e));this.cameraChanged();
        },{passive:false});
        on(window,'keydown',e=>this.keyDown(e));on(window,'blur',()=>this.cancelGesture());
        on(document,'visibilitychange',()=>{if(document.hidden)this.cancelGesture();});
        this.scale.on('resize',this.resize,this);
        this.observer=new ResizeObserver(()=>{
            const host=document.querySelector('#game');
            if(host.clientWidth && host.clientHeight) {
                const width=host.clientWidth*this.pixelRatio,height=host.clientHeight*this.pixelRatio;
                if(width!==this.scale.width||height!==this.scale.height)this.scale.resize(width,height);
            }
        });this.observer.observe(document.querySelector('#game'));
        this.events.once('shutdown',()=>{
            this.cancelGesture();this.abort.abort();this.observer.disconnect();this.scale.off('resize',this.resize,this);
            for(const v of this.visuals.values()) {v.image.destroy();this.textures.remove(v.key);}
            this.visuals.clear();this.pendingCompletion=0;
        });
        this.resize();
        if(this.saved) {this.camera=reframeCamera(this.def,this.state,this.camera);this.cameraChanged();}
        this.refreshStatus();
    }
    reducedMotion() {return storage.read('reduced-motion')===true || matchMedia('(prefers-reduced-motion: reduce)').matches;}
    resize() {
        this.cancelGesture();
        const viewport={width:Math.max(1,this.scale.width/this.pixelRatio),height:Math.max(1,this.scale.height/this.pixelRatio)};
        const next=createCamera(this.def,viewport);
        this.camera=this.camera && !cameraIsInitial(this.camera) ? clampCamera({...next,x:this.camera.x,y:this.camera.y,size:this.camera.size}) : next;
        this.settling=null;this.cameraChanged();
    }
    point(event) {
        const box=this.game.canvas.getBoundingClientRect();
        return [(event.clientX-box.left)*this.camera.viewport.width/box.width,(event.clientY-box.top)*this.camera.viewport.height/box.height];
    }
    cameraChanged() {this.drawBoard();this.dirty=true;this.refreshStatus();}
    drawBoard() {
        if(!this.camera)return;
        const g=this.board,c=this.camera,s=c.size,{width,height}=c.viewport;g.clear();
        const [left,top]=screenToDisplay(c,0,0);const [right,bottom]=screenToDisplay(c,width,height);
        g.lineStyle(.7,theme.gridLine,.6);
        for(let x=Math.floor(left);x<=Math.ceil(right);x++) {const [px]=displayToScreen(c,x,0);g.lineBetween(px,0,px,height);}
        for(let y=Math.floor(top);y<=Math.ceil(bottom);y++) {const [,py]=displayToScreen(c,0,y);g.lineBetween(0,py,width,py);}
        const cells=this.def.container.cells.map(([x,y])=>displayCell(this.def,x,y));
        g.fillStyle(theme.trayFill);g.lineStyle(1,theme.trayGridLine,.8);
        for(const [x,y] of cells) {const [px,py]=displayToScreen(c,x,y);g.fillRect(px,py,s,s);g.strokeRect(px,py,s,s);}
        // Recessed perimeter decorates the shared lattice; it never resizes it.
        for(const e of outlineEdges(cells)) {
            const [x1,y1]=displayToScreen(c,e.x1,e.y1),[x2,y2]=displayToScreen(c,e.x2,e.y2);
            g.lineStyle(4,0x6d776c,.055);g.lineBetween(x1,y1+1,x2,y2+1);
            g.lineStyle(1.2,this.solved?0x759777:theme.trayStroke,.9);g.lineBetween(x1,y1,x2,y2);
        }
    }
    visualPlacement(id,now=performance.now()) {
        if(this.gesture?.kind==='piece'&&this.gesture.id===id)return this.gesture.preview;
        const settle=this.settling;
        if(settle?.id===id) {
            const t=Math.min(1,(now-settle.time)/110),k=(1-t)**3;
            const target=this.state.placements[id];return {...target,x:target.x+settle.dx*k,y:target.y+settle.dy*k};
        }
        return this.state.placements[id];
    }
    localGeometry(piece,placement) {
        const key=`${piece.id}:${placement.rotation}:${placement.flipped}:${this.def.presentation?.fieldRotation??0}`;
        if(this.geometry.has(key))return this.geometry.get(key);
        const canonical=orient(piece.cells,placement.rotation,placement.flipped);
        const display=canonical.map(([x,y])=>displayCell(this.def,x,y));const box=bounds(display);
        const cells=display.map(([x,y])=>[x-box.minX,y-box.minY]);
        const result={canonical,cells};this.geometry.set(key,result);return result;
    }
    drawPieces() {
        const active=this.gesture?.kind==='piece' && this.gesture.moved ? this.gesture : null;
        const candidate=active ? snapPlacement(this.def,findPiece(this.def,active.id),active.preview) : null;
        const signature=active?`${active.id}:${JSON.stringify(candidate)}`:'committed';
        if(this.violationSignature!==signature) {
            const temporary=active?{placements:{...this.state.placements,[active.id]:candidate}}:this.state;
            this.renderViolations=computeViolations(this.def,temporary);this.violationSignature=signature;
        }
        this.footprint.clear();
        if(active) {
            const cells=placedCells(findPiece(this.def,active.id),candidate);
            this.footprint.fillStyle(0x344c42,.07);this.footprint.lineStyle(1,0x344c42,.14);
            for(const [x,y] of cells) {const [px,py]=displayToScreen(this.camera,...displayCell(this.def,x,y));this.footprint.fillRect(px,py,this.camera.size,this.camera.size);}
            for(const e of outlineEdges(cells.map(([x,y])=>displayCell(this.def,x,y)))) {
                this.footprint.lineBetween(...displayToScreen(this.camera,e.x1,e.y1),...displayToScreen(this.camera,e.x2,e.y2));
            }
        }
        this.zOrder.forEach((id,index)=>{
            const piece=findPiece(this.def,id),placement=this.visualPlacement(id);
            const check=active?.id===id?candidate:this.state.placements[id];
            const geometry=this.localGeometry(piece,placement);
            const invalid=geometry.canonical.flatMap(([x,y],i)=>this.renderViolations.cells.has(cellKey(x+check.x,y+check.y))?[geometry.cells[i]]:[]);
            const options={locked:piece.locked,selected:this.selectedId===id,lifted:active?.id===id,invalid};
            const signature=JSON.stringify([placement.rotation,placement.flipped,options]);
            let visual=this.visuals.get(id);
            if(!visual) {
                const key=`piece:${this.def.id}:${id}`;const canvas=document.createElement('canvas');
                const metrics=paintMaterial(canvas,geometry.cells,piece.color,options);
                this.textures.addCanvas(key,canvas);
                visual={key,image:this.add.image(0,0,key).setOrigin(0),metrics,signature,canvas};this.visuals.set(id,visual);
            } else if(visual.signature!==signature) {
                // One texture per piece, bounded memory even after many invalid placements.
                const scratch=visual.scratch??(visual.scratch=document.createElement('canvas'));
                visual.metrics=paintMaterial(scratch,geometry.cells,piece.color,options);
                const texture=this.textures.get(visual.key);texture.setSize(scratch.width,scratch.height);
                texture.context.clearRect(0,0,scratch.width,scratch.height);texture.context.drawImage(scratch,0,0);texture.refresh();
                visual.image.setTexture(visual.key);visual.signature=signature;
            }
            const display=placedCells(piece,placement).map(([x,y])=>displayCell(this.def,x,y));const box=bounds(display);
            const [px,py]=displayToScreen(this.camera,box.minX,box.minY),scale=this.camera.size/visual.metrics.unit;
            visual.image.setPosition(px-visual.metrics.pad*scale,py-visual.metrics.pad*scale).setScale(scale).setDepth(2+index);
        });
    }
    refreshStatus() {
        if(!this.camera||!this.shell)return;
        const v=computeViolations(this.def,this.state);
        this.shell.update({...validProgress(this.def,this.state),selected:!!this.selectedId,dragging:!!this.gesture,initial:cameraIsInitial(this.camera),conflict:v.pieces.has(this.selectedId),solved:this.solved});
    }
    hit(world) {
        for(const id of [...this.zOrder].reverse()) {
            const p=findPiece(this.def,id),placement=this.visualPlacement(id);
            const x=Math.floor(world[0]-placement.x),y=Math.floor(world[1]-placement.y);
            if(orient(p.cells,placement.rotation,placement.flipped).some(c=>c[0]===x&&c[1]===y))return p;
        }
        return null;
    }
    pointerDown(e) {
        if(this.shell.dialog.open||this.gesture?.kind==='piece'||this.pointers.size>=2)return;
        const point=this.point(e);const world=screenToWorld(this.def,this.camera,...point);const piece=this.hit(world);
        if(e.button===2) {if(piece&&!piece.locked){this.selectedId=piece.id;this.transform(1);}return;}
        if(e.button!==0)return;
        this.game.canvas.focus({preventScroll:true});
        this.game.canvas.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,point);
        if(this.pointers.size===2) {
            const [a,b]=[...this.pointers.values()];this.gesture={kind:'pinch',distance:Math.max(1,Math.hypot(a[0]-b[0],a[1]-b[1])),mid:[(a[0]+b[0])/2,(a[1]+b[1])/2],camera:this.camera};this.refreshStatus();return;
        }
        const common={owner:e.pointerId,start:point,last:point,moved:false,threshold:e.pointerType==='touch'?6:4};
        if(piece&&!piece.locked) {
            const preview={...this.visualPlacement(piece.id)};this.settling=null;this.selectedId=piece.id;
            this.zOrder=[...this.zOrder.filter(id=>id!==piece.id),piece.id];
            this.gesture={...common,kind:'piece',id:piece.id,preview,grab:[world[0]-preview.x,world[1]-preview.y]};
        } else {
            this.gesture={...common,kind:piece?.locked?'blocked':'pan',camera:this.camera};
        }
        this.dirty=true;this.refreshStatus();
    }
    pointerMove(e) {
        if(!this.pointers.has(e.pointerId))return;
        const point=this.point(e);this.pointers.set(e.pointerId,point);const g=this.gesture;if(!g)return;
        if(g.kind==='pinch') {
            const [a,b]=[...this.pointers.values()];if(!b)return;
            const distance=Math.max(1,Math.hypot(a[0]-b[0],a[1]-b[1])),mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
            this.camera=zoomAt(g.camera,distance/g.distance,g.mid,mid);this.cameraChanged();return;
        }
        if(e.pointerId!==g.owner)return;g.last=point;
        if(Math.hypot(point[0]-g.start[0],point[1]-g.start[1])>=g.threshold)g.moved=true;
        if(!g.moved)return;
        if(g.kind==='piece') {
            const world=screenToWorld(this.def,this.camera,...point);
            g.preview=clampToWorkspace(this.def,findPiece(this.def,g.id),{...g.preview,x:world[0]-g.grab[0],y:world[1]-g.grab[1]});
            this.dirty=true;
        } else if(g.kind==='pan') {this.camera=panCamera(g.camera,point[0]-g.start[0],point[1]-g.start[1]);this.cameraChanged();}
    }
    pointerUp(e) {
        if(!this.pointers.has(e.pointerId))return;
        this.pointerMove(e);const g=this.gesture;
        this.pointers.delete(e.pointerId);
        if(this.game.canvas.hasPointerCapture(e.pointerId))this.game.canvas.releasePointerCapture(e.pointerId);
        if(!g)return;
        if(g.kind==='pinch') {this.cancelGesture();return;}
        if(g.owner!==e.pointerId)return;
        this.gesture=null;
        if(g.kind==='piece'&&g.moved) {
            const piece=findPiece(this.def,g.id),candidate=snapPlacement(this.def,piece,g.preview);
            this.commit(setPlacement(this.def,this.state,g.id,candidate));
            if(!this.reducedMotion())this.settling={id:g.id,dx:g.preview.x-candidate.x,dy:g.preview.y-candidate.y,time:performance.now()};
        } else if(g.kind==='pan'&&!g.moved)this.selectedId=null;
        this.violationSignature=null;this.dirty=true;this.refreshStatus();
    }
    cancelGesture() {
        this.gesture=null;this.violationSignature=null;
        if(this.pointers) {
            const ids=[...this.pointers.keys()];this.pointers.clear();
            for(const id of ids)if(this.game.canvas.hasPointerCapture(id))this.game.canvas.releasePointerCapture(id);
        }
        this.dirty=true;if(this.camera)this.refreshStatus();
    }
    keyDown(e) {
        if(this.shell.dialog.open||e.ctrlKey||e.metaKey||e.altKey||e.repeat||e.target?.matches?.('input,textarea,select,[contenteditable="true"]'))return;
        if(e.key==='Escape') {if(this.gesture)this.cancelGesture();else{this.selectedId=null;this.dirty=true;this.refreshStatus();}return;}
        if(e.key.toLowerCase()==='r')this.transform(e.shiftKey?-1:1);
        if(e.key.toLowerCase()==='e')this.transform(-1);
        if(e.key.toLowerCase()==='f')this.transform('flip');
    }
    transform(action) {
        const piece=findPiece(this.def,this.selectedId);if(!piece||piece.locked)return;
        if(action==='flip'?!this.def.rules.allowFlip:!this.def.rules.allowRotation)return;
        const g=this.gesture;
        if(g&&g.kind!=='piece')return;
        if(g?.kind==='piece') {
            const p=g.preview,box=orientedBounds(piece,p);
            g.grab=action==='flip'?flippedGrabPoint(box,g.grab,p.rotation):rotatedGrabPoint(box,g.grab,action);
            const world=screenToWorld(this.def,this.camera,...g.last);
            const next=action==='flip'?{...p,flipped:!p.flipped}:{...p,rotation:(p.rotation+action+4)%4};
            g.preview=clampToWorkspace(this.def,piece,{...next,x:world[0]-g.grab[0],y:world[1]-g.grab[1]});g.moved=true;this.dirty=true;
        } else {
            this.settling=null;this.commit(action==='flip'?flipPiece(this.def,this.state,piece.id):rotatePiece(this.def,this.state,piece.id,action));
        }
    }
    commit(state) {
        if(state===this.state)return;
        this.state=state;const solved=isSolved(this.def,state);
        if(!solved)this.pendingCompletion=0;
        else if(!this.solved)this.pendingCompletion=performance.now()+(this.reducedMotion()?0:180);
        this.solved=solved;this.drawBoard();this.shell.committed(this.def,state);this.violationSignature=null;this.dirty=true;this.refreshStatus();
    }
    resetPuzzle() {
        this.cancelGesture();this.settling=null;this.selectedId=null;this.zOrder=this.def.pieces.map(p=>p.id);
        this.commit(createState(this.def));this.camera=createCamera(this.def,this.camera.viewport);this.cameraChanged();
    }
    reframe() {this.cancelGesture();this.camera=reframeCamera(this.def,this.state,this.camera);this.cameraChanged();}
    update() {
        if(!this.def||!this.camera)return;
        const now=performance.now();
        if(this.settling) {this.dirty=true;if(now-this.settling.time>=110)this.settling=null;}
        if(this.dirty) {this.drawPieces();this.dirty=false;}
        if(this.pendingCompletion && now>=this.pendingCompletion && !this.gesture && !this.shell.dialog.open) {
            this.pendingCompletion=0;this.shell.completion(this.def);
        }
    }
}
