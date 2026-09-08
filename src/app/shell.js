import { icon, iconButton } from '../ui/icons.js';
import { storage } from './storage.js';
import { puzzles, puzzleById, nextPuzzle } from '../puzzles/index.js';
import { validatePuzzle } from '../core/validate.js';
import { bounds } from '../core/geometry.js';
import { slack } from '../core/puzzle.js';

const text = (tag,value,className='') => { const e=document.createElement(tag);e.textContent=value;e.className=className;return e; };
export class Shell {
    constructor() {
        this.footer=document.querySelector('#controls');this.screen=document.querySelector('#screen');
        this.dialog=document.querySelector('#sheet');this.content=this.dialog.querySelector('.sheet-content');
        this.dialog.addEventListener('close',()=>this.returnFocus?.focus());
        window.addEventListener('popstate',()=>this.route());
    }
    connect(game) { this.game=game; game.events.once('ready',()=>requestAnimationFrame(()=>this.route())); }
    scene() { return this.game.scene.isActive('Play') ? this.game.scene.getScene('Play') : null; }
    route() {
        const id=new URLSearchParams(location.search).get('puzzle');
        if(id!==null) this.open(puzzleById(id),false); else this.home(false);
    }
    url(id, push=true) {
        const url=new URL(location.href); if(id) url.searchParams.set('puzzle',id); else url.searchParams.delete('puzzle');
        if(push) history.pushState(null,'',url);
    }
    closeSheet() { if(this.dialog.open)this.dialog.close(); }
    showSheet(title,fill) {
        this.scene()?.cancelGesture();this.returnFocus=document.activeElement;
        this.content.replaceChildren();
        const header=document.createElement('header');const h=text('h2',title);h.id='sheet-title';
        header.append(h,iconButton('close','Close',()=>this.closeSheet()));this.content.append(header);fill(this.content);
        if(!this.dialog.open)this.dialog.showModal();
    }
    open(def,push=true) {
        this.closeSheet();this.game.scene.stop('Play');
        if(!def || !validatePuzzle(def).valid) {
            this.home(false);this.showSheet('Puzzle unavailable',body=>{
                body.append(text('p',def?'This puzzle has invalid data and cannot be played.':'That puzzle link does not match an available puzzle.'));
                body.append(iconButton('puzzles','Choose a puzzle',()=>this.selector()));
            });return;
        }
        this.def=def;this.url(def.id,push);this.screen.hidden=true;this.footer.hidden=false;
        document.querySelector('#game').removeAttribute('inert');
        this.buildDock(def);
        const saved=storage.load(def);
        storage.write('last',def.id);
        this.game.scene.start('Play',{def,state:saved?.state,shell:this});
        if(!storage.read('help-seen')) {
            // Defer until the scene is booted; the dialog also blocks board input.
            requestAnimationFrame(()=>this.help());
        }
    }
    buildDock(def) {
        this.footer.replaceChildren();
        this.status=text('div','','progress');this.status.setAttribute('aria-live','polite');
        this.detail=text('div','','sr-only');this.detail.setAttribute('aria-live','polite');
        const dock=document.createElement('nav');dock.className='dock';dock.setAttribute('aria-label','Puzzle actions');
        this.buttons={};
        const add=(key,label,fn)=> {const b=iconButton(key,label,()=>{if(!this.scene()?.gesture)fn();});this.buttons[key]=b;dock.append(b);};
        add('left','Rotate counterclockwise (Shift+R)',()=>this.scene()?.transform(-1));
        add('right','Rotate clockwise (R)',()=>this.scene()?.transform(1));
        if(def.rules.allowFlip)add('flip','Flip (F)',()=>this.scene()?.transform('flip'));
        add('restart','Restart puzzle',()=>this.showSheet('Start again?',body=>{
            body.append(text('p','Return every piece to its starting position. Your solved history will be kept.'));
            body.append(iconButton('restart','Confirm restart',()=>{this.closeSheet();this.scene()?.resetPuzzle();}));
        }));this.buttons.restart.classList.add('utility-start');
        add('puzzles','Choose a puzzle',()=>this.selector());
        add('help','How to play',()=>this.help());
        add('reframe','Fit all pieces in view',()=>this.scene()?.reframe());
        this.buttons.reframe.hidden=true;
        const slot=document.createElement('div');slot.className='dock-slot';slot.append(dock);
        this.footer.classList.toggle('has-flip',def.rules.allowFlip);
        this.footer.append(this.status,slot,this.detail);
    }
    update({contained,total,selected,dragging,initial,conflict,solved}) {
        if(!this.buttons)return;
        this.status.textContent=`${contained} / ${total}`;this.status.setAttribute('aria-label',`${contained} of ${total} pieces placed${solved?', solved':''}`);
        this.status.classList.toggle('is-solved',solved);
        for(const [name,b] of Object.entries(this.buttons)) b.disabled=dragging || (['left','right'].includes(name) && (!selected || !this.def.rules.allowRotation)) || (name==='flip' && !selected);
        this.buttons.reframe.hidden=initial;
        this.detail.textContent=conflict ? 'Selected piece needs adjustment: overlapping or partly outside the tray.' : selected ? 'Piece selected.' : '';
    }
    committed(def,state) {storage.save(def,state);}
    completion(def) {
        this.showSheet('Beautifully fitted.',body=>{
            body.append(text('p','Every piece has found its place.'));
            const row=document.createElement('div');row.className='sheet-actions';
            row.append(iconButton('home','Home',()=>this.home()),iconButton('puzzles','Choose a puzzle',()=>this.selector()));
            const next=nextPuzzle(def.id);if(next)row.append(iconButton('next','Next puzzle',()=>this.open(next)));
            body.append(row);
        });
    }
    help() {
        storage.write('help-seen',true);
        this.showSheet('A place for every piece',body=>{
            for(const [title,copy] of [
                ['Move naturally','Drag a piece; it follows your finger and settles onto the grid when released.'],
                ['Turn it around',`Select a piece and use the turn${this.def?.rules.allowFlip?' or flip':''} controls below. On a keyboard, use R, Shift+R or E to turn, and F to flip when available.`],
                ['Read the materials','Darkened cells overlap another piece or hang outside the tray. Matte, seated pieces are fixed. Pieces parked entirely outside the tray are fine.'],
                ['Make some room','Drag empty canvas to pan. Pinch or use the mouse wheel to zoom. The corner-bracket button brings all pieces into view.'],
                ['Finish the puzzle','Fit every piece inside the tray without overlaps. Empty tray cells may be allowed.']
            ]) {body.append(text('h3',title),text('p',copy));}
            if(this.def) {
                const spare=slack(this.def);if(spare>0)body.append(text('p',`This puzzle intentionally leaves ${spare} tray cells empty.`));
                if(this.def.meta?.description)body.append(text('p',this.def.meta.description,'puzzle-note'));
            }
        });
    }
    selector() {
        this.showSheet('Choose a puzzle',body=>{
            const list=document.createElement('div');list.className='puzzle-list';
            if(!puzzles.length)list.append(text('p','No puzzles are available.'));
            for(const def of puzzles) {
                const valid=validatePuzzle(def).valid, card=document.createElement('button');card.type='button';card.className='puzzle-card';card.disabled=!valid;
                card.append(this.thumbnail(def,valid));
                const words=document.createElement('span');words.append(text('strong',def.meta?.name??def.id));
                words.append(text('small',`${def.meta?.author || 'Original puzzle'} · Square-grid packing`));
                words.append(text('small','Fit every piece into the tray'));
                words.append(text('small',!valid?'Unavailable':storage.solved(def.id)?'Solved':storage.load(def)?'In progress':`${def.pieces.length} pieces`,'card-status'));
                card.append(words);card.addEventListener('click',()=>this.open(def));list.append(card);
            }
            body.append(list,iconButton('home','Home',()=>this.home()));
        });
    }
    thumbnail(def,valid) {
        const canvas=document.createElement('canvas');canvas.className='thumbnail';canvas.width=144;canvas.height=112;canvas.setAttribute('aria-hidden','true');
        if(!valid)return canvas;const ctx=canvas.getContext('2d');const b=bounds(def.container.cells);const size=Math.min(120/b.width,88/b.height);
        ctx.fillStyle='#d8dcd3';for(const [x,y] of def.container.cells)ctx.fillRect(12+(x-b.minX)*size,12+(y-b.minY)*size,size-1,size-1);
        return canvas;
    }
    home(push=true) {
        this.closeSheet();this.game.scene.stop('Play');this.def=null;this.url(null,push);
        this.footer.hidden=true;this.screen.hidden=false;document.querySelector('#game').setAttribute('inert','');
        this.screen.replaceChildren();const card=document.createElement('div');card.className='home-card';
        const mark=document.createElement('div');mark.className='home-mark';mark.innerHTML='<i></i><i></i><i></i><i></i>';
        card.append(mark,text('h1','A little room to think.'),text('p','Arrange the pieces. Find their place.'));
        const choices=document.createElement('div');choices.className='home-choices';
        const last=puzzleById(storage.read('last'));if(last&&storage.load(last))choices.append(this.homeAction('play','Resume puzzle',()=>this.open(last)));
        choices.append(this.homeAction('puzzles','Choose a puzzle',()=>this.selector()),this.homeAction('settings','Settings',()=>this.settings()));
        card.append(choices);this.screen.append(card);
    }
    homeAction(name,label,run) {
        const b=document.createElement('button');b.type='button';b.className='home-action';b.innerHTML=icon(name);b.append(text('span',label));b.addEventListener('click',run);return b;
    }
    settings() {
        this.showSheet('Settings',body=>{
            body.append(text('p','Progress is saved in this browser on this device.'));
            const label=document.createElement('label');label.className='preference';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=storage.read('reduced-motion')===true;
            checkbox.addEventListener('change',()=>storage.write('reduced-motion',checkbox.checked));label.append(checkbox,document.createTextNode('Reduce motion'));body.append(label);
            body.append(this.homeAction('restart','Clear saved progress',()=>this.showSheet('Clear all progress?',content=>{
                content.append(text('p','This removes saved attempts and solved history for every puzzle in this browser.'));
                content.append(iconButton('restart','Confirm clear all progress',()=>{storage.clear(puzzles);this.home();}));
            })));
        });
    }
}
