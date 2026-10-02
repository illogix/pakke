import { iconButton } from '../ui/icons.js';
import { storage } from './storage.js';
import { bundledPacks } from '../puzzles/index.js';
import { LibraryRepository, openDatabase } from '../library/repository.js';
import { allEntries, entries, collections, saveAttempt, statusOf } from '../library/model.js';
import { LibraryUI } from './library-ui.js';
import { prepareOffline } from './offline.js';
import { validatePuzzle } from '../core/validate.js';
import { slack } from '../core/puzzle.js';

const text = (tag,value,className='') => { const e=document.createElement(tag);e.textContent=value;e.className=className;return e; };
export class Shell {
    constructor() {
        this.footer=document.querySelector('#controls');this.screen=document.querySelector('#screen');
        this.dialog=document.querySelector('#sheet');this.content=this.dialog.querySelector('.sheet-content');
        this.dialog.addEventListener('close',()=>this.returnFocus?.focus());
        window.addEventListener('popstate',()=>this.route());
    }
    connect(game) {
        this.game=game;
        game.events.once('ready',()=>requestAnimationFrame(()=>this.initialize()));
    }
    async initialize() {
        this.screen.hidden=false;this.screen.replaceChildren(text('p','Opening your library…'));
        try {
            let backend;
            try { backend=await openDatabase(); } catch (error) { this.storageNotice=`Local storage is unavailable. Bundled puzzles can be played temporarily; changes will not be saved. ${error.message}`; }
            this.repo=await new LibraryRepository(backend).initialize(bundledPacks,storage);
            this.library=new LibraryUI(this,this.repo);this.library.syncPreferences();this.ready=true;this.route();
            prepareOffline(message=>{this.offlineStatus=message;if(this.library.offlineLabel)this.library.offlineLabel.textContent=message;});
        } catch(error) {
            this.screen.replaceChildren(text('h1','Your library could not open'),text('p',error.message),text('p','Your existing data has not been replaced. Try closing other game tabs and reloading.'));
        }
    }
    scene() { return this.game.scene.isActive('Play') ? this.game.scene.getScene('Play') : null; }
    route() {
        if(!this.ready)return;
        const params=new URLSearchParams(location.search),id=params.get('puzzle'),packId=params.get('pack'),key=params.get('revision');
        if(id!==null) {
            let matches=(packId?entries(this.repo.state,packId):allEntries(this.repo.state)).filter(e=>e.def.id===id&&(!key||e.key===key));
            matches=[...new Map(matches.map(e=>[e.key,e])).values()];
            if(matches.length===1)this.open(matches[0].def,false,packId,matches[0].key);
            else {
                this.library.browse(null,false);
                this.showSheet(matches.length?'Choose a puzzle revision':'Puzzle unavailable',body=>{
                    body.append(text('p',matches.length?'This puzzle has several installed versions. Choose a collection to continue.':'That puzzle or collection is not installed. Import its pack to use this link.'));
                    for(const record of matches)body.append(this.library.puzzleCard(record,true));
                });
            }
        } else this.library.browse(packId,false);
    }
    url(id, push=true, packId=null, key=null) {
        const url=new URL(location.href);
        for(const [name,value] of [['puzzle',id],['pack',packId],['revision',key]]) {
            if(value)url.searchParams.set(name,value);else url.searchParams.delete(name);
        }
        if(push)history.pushState(null,'',url);
    }
    closeSheet() { if(this.dialog.open)this.dialog.close(); }
    showSheet(title,fill) {
        this.scene()?.cancelGesture();this.returnFocus=document.activeElement;
        this.content.replaceChildren();
        const header=document.createElement('header');const h=text('h2',title);h.id='sheet-title';
        header.append(h,iconButton('close','Close',()=>this.closeSheet()));this.content.append(header);fill(this.content);
        if(!this.dialog.open)this.dialog.showModal();
    }
    open(def,push=true,context=null,key=null) {
        if(!this.ready)return;
        this.library.remember();
        this.record=key?this.repo.state.definitions[key]:Object.values(this.repo.state.definitions).find(r=>r.def.id===def?.id);
        this.context=context;
        this.closeSheet();this.game.scene.stop('Play');
        if(!def || !validatePuzzle(def).valid) {
            this.home(false);this.showSheet('Puzzle unavailable',body=>{
                body.append(text('p',def?'This puzzle has invalid data and cannot be played.':'That puzzle link does not match an available puzzle.'));
                body.append(iconButton('puzzles','Choose a puzzle',()=>this.selector()));
            });return;
        }
        this.def=def;this.url(def.id,push,context,this.record?.key);this.screen.hidden=true;this.footer.hidden=false;
        document.querySelector('#game').removeAttribute('inert');
        this.buildDock(def);
        // Apply the measured player viewport before the first scene frame.
        // ResizeObserver still handles later orientation and window changes.
        const host=document.querySelector('#game'),ratio=this.game.registry.get('pixelRatio') || 1;
        this.game.scale.resize(host.clientWidth*ratio,host.clientHeight*ratio);
        const saved=this.repo.state.progress[this.record?.gameKey];
        if(saved)this.committed(def,saved.state);
        this.game.scene.start('Play',{def,state:saved?.state,shell:this});
        if(!this.repo.state.preferences['help-seen']) {
            // Defer until the scene is booted; the dialog also blocks board input.
            requestAnimationFrame(()=>{if(this.def===def&&this.scene())this.help();});
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
    committed(def,state) {
        const key=this.record?.key,context=this.context;
        if(!this.repo.backend) {
            this.repo.state=saveAttempt(this.repo.state,key,state,context);
            return; // Explicitly announced temporary play, never a successful install.
        }
        this.pendingSave=this.repo.mutate(s=>saveAttempt(s,key,state,context)).then(()=>true).catch(error=>{
            this.storageNotice=`Your latest attempt could not be saved. ${error.message}`;
            this.library.error(new Error(this.storageNotice));
            return false;
        });
    }
    async completion(def) {
        const saved=await this.pendingSave;
        if(saved===false||this.def!==def)return;
        const pack=collections(this.repo.state).find(p=>p.id===this.context);
        const sequence=entries(this.repo.state,this.context),index=sequence.findIndex(e=>e.key===this.record?.key),next=index>=0?sequence[index+1]:null;
        const remaining=sequence.filter(e=>statusOf(this.repo.state,e)!=='Solved').length;
        this.showSheet(pack&&remaining===0?'Collection complete.':'Beautifully fitted.',body=>{
            body.append(text('p',pack&&remaining===0?`Every puzzle in ${pack.name} has found its place.`:pack?`Every piece has found its place. ${remaining} puzzle${remaining===1?'':'s'} left in this collection.`:'Every piece has found its place.'));
            const row=document.createElement('div');row.className='sheet-actions';
            row.append(this.library.action(pack?'Return to pack':'Return to library',()=>this.selector()));
            if(next)row.append(this.library.action('Next puzzle',()=>this.library.play(next),'text-button primary'));
            body.append(row);
        });
    }
    help() {
        if(this.repo.backend)this.library.preference('help-seen',true).catch(()=>{});
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
    async selector() { await this.pendingSave;this.library.browse(this.context); }
    home(push=true) { this.library.browse(null,push); }
    settings() { this.library.settings(); }
}
