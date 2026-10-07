import { icon, iconButton } from '../ui/icons.js';
import { storage } from './storage.js';
import { bundledPacks } from '../puzzles/index.js';
import { LibraryRepository, openDatabase } from '../library/repository.js';
import { allEntries, entries, collections, saveAttempt, statusOf } from '../library/model.js';
import { CalendarUI } from './calendar-ui.js';
import { parseDailyId } from '../daily/calendar.js';
import { LibraryUI } from './library-ui.js';
import { prepareOffline } from './offline.js';
import { validatePuzzle } from '../core/validate.js';
import { slack } from '../core/puzzle.js';
import { dockSide } from '../ui/layout.js';

const text = (tag,value,className='') => { const e=document.createElement(tag);e.textContent=value;e.className=className;return e; };
export class Shell {
    constructor() {
        this.navigationSerial=0;
        this.footer=document.querySelector('#controls');this.screen=document.querySelector('#screen');
        this.dialog=document.querySelector('#sheet');this.content=this.dialog.querySelector('.sheet-content');
        this.dialog.addEventListener('close',()=>this.returnFocus?.focus());
        // A tap on the backdrop cancels, like Escape. The content fills the dialog,
        // so only backdrop taps target the dialog itself, at both press and release.
        let backdrop=false;
        this.dialog.addEventListener('pointerdown',e=>{backdrop=e.target===this.dialog;});
        this.dialog.addEventListener('click',e=>{if(backdrop&&e.target===this.dialog)this.closeSheet();backdrop=false;});
        window.addEventListener('popstate',()=>this.route());
        // The dock follows the device's bottom edge when it is turned. A half
        // turn keeps the same size, so resize alone would miss it.
        const touch=matchMedia('(pointer: coarse)'),place=()=>this.placeDock(screen.orientation?.angle??window.orientation??0,touch.matches);
        screen.orientation?.addEventListener('change',place);window.addEventListener('orientationchange',place);
        window.addEventListener('resize',place);touch.addEventListener('change',place);place();
    }
    placeDock(angle,touch) {
        const app=document.querySelector('#app'),side=dockSide(angle,touch);
        if(side==='bottom')delete app.dataset.dock;else app.dataset.dock=side;
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
            this.library=new LibraryUI(this,this.repo);this.calendar=new CalendarUI(this,this.repo);this.library.syncPreferences();this.ready=true;this.route();
            prepareOffline();
        } catch(error) {
            this.screen.replaceChildren(text('h1','Your library could not open'),text('p',error.message),text('p','Your existing data has not been replaced. Try closing other game tabs and reloading.'));
        }
    }
    scene() { return this.game.scene.isActive('Play') ? this.game.scene.getScene('Play') : null; }
    route() {
        if(!this.ready)return;
        const params=new URLSearchParams(location.search),id=params.get('puzzle'),packId=params.get('pack'),key=params.get('revision'),view=params.get('view');
        if(view==='daily') {
            const flips=params.get('flips');
            this.calendar.openDate(params.get('date'),flips==='true',false).catch(error=>{this.library.home(false);this.library.error(error);});
        } else if(view==='calendar') this.calendar.show(Number(params.get('month')) || undefined,false);
        else if(id!==null) {
            let matches=(packId?entries(this.repo.state,packId):allEntries(this.repo.state)).filter(e=>e.def.id===id&&(!key||e.key===key));
            matches=[...new Map(matches.map(e=>[e.key,e])).values()];
            if(matches.length===1)this.open(matches[0].def,false,packId,matches[0].key);
            else {
                this.library.home(false);
                this.showSheet(matches.length?'Choose a collection':'Puzzle unavailable',body=>{
                    body.append(text('p',matches.length?'This puzzle has several installed versions.':'That puzzle or collection is not installed. Import its pack to use this link.'));
                    for(const record of matches)body.append(this.library.choiceRow(record));
                });
            }
        // An old pack link opens Collections with that collection expanded.
        } else if(view==='collections'||packId)this.library.collections(packId,false);
        else this.library.home(false);
    }
    url(params={}, push=true) {
        const url=new URL(location.href);
        for(const name of ['puzzle','pack','revision','view','date','flips','month','year']) {
            if(params[name])url.searchParams.set(name,params[name]);else url.searchParams.delete(name);
        }
        if(push)history.pushState(null,'',url);
    }
    closeSheet() { if(this.dialog.open)this.dialog.close(); }
    showSheet(title,fill) {
        this.scene()?.cancelGesture();if(!this.dialog.open)this.returnFocus=document.activeElement;
        this.content.replaceChildren();
        const header=document.createElement('header');const h=text('h2',title);h.id='sheet-title';
        header.append(h,iconButton('close','Close',()=>this.closeSheet()));this.content.append(header);fill(this.content);
        if(!this.dialog.open)this.dialog.showModal();
    }
    open(def,push=true,context=null,key=null) {
        if(!this.ready)return;
        this.navigationSerial++;
        this.library.remember();
        this.record=key?this.repo.state.definitions[key]:Object.values(this.repo.state.definitions).find(r=>r.def.id===def?.id);
        this.context=context;
        this.closeSheet();this.game.scene.stop('Play');
        if(!def || !validatePuzzle(def).valid) {
            this.library.home(false);this.showSheet('Puzzle unavailable',body=>{
                body.append(text('p',def?'This puzzle has invalid data and cannot be played.':'That puzzle link does not match an available puzzle.'));
            });return;
        }
        const daily=context==='daily' ? parseDailyId(def.id) : null;
        this.def=def;this.url(daily ? {view:'daily',date:daily.date,flips:String(daily.allowFlip)} : {puzzle:def.id,pack:context,revision:this.record?.key},push);this.screen.hidden=true;this.footer.hidden=false;
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
        this.status=text('p','','sr-only');this.status.setAttribute('aria-live','polite');
        this.detail=text('div','','sr-only');this.detail.setAttribute('aria-live','polite');
        const dock=document.createElement('nav');dock.className='dock';dock.setAttribute('aria-label','Puzzle controls');
        this.buttons={};
        const add=(key,glyph,label,shortcut,fn)=> {
            const b=iconButton(glyph,label,()=>{if(!this.scene()?.gesture)fn();},shortcut?`${label} (${shortcut})`:label);this.buttons[key]=b;dock.append(b);
        };
        add('left','left','Rotate left','Shift+R',()=>this.scene()?.transform(-1));
        add('right','right','Rotate right','R',()=>this.scene()?.transform(1));
        if(def.rules.allowFlip)add('flip','flip','Flip','F',()=>this.scene()?.transform('flip'));
        const divider=text('span','','dock-divider');divider.setAttribute('aria-hidden','true');dock.append(divider);
        add('reframe','reframe','Fit all pieces in view','',()=>this.scene()?.reframe());
        add('more','more','More','',()=>this.menu());
        this.buttons.more.setAttribute('aria-haspopup','dialog');
        this.footer.replaceChildren(dock,this.status,this.detail);
    }
    menu() {
        this.showSheet(this.def.meta?.name||'Puzzle',body=>{
            for(const [glyph,label,run] of [['restart','Restart',()=>this.restart()],['help','Help',()=>this.help()],...(this.context==='daily' ? [['calendar','Daily Calendar Puzzles',()=>this.leaveCalendar()]] : []),['home','Home',()=>this.leave()]]) {
                const b=document.createElement('button');b.type='button';b.className='menu-item';b.innerHTML=icon(glyph);
                b.append(text('span',label));b.addEventListener('click',run);body.append(b);
            }
        });
    }
    restart() {
        this.showSheet('Restart?',body=>{
            body.append(text('p','Pieces return to their starting positions. Solved history is kept.'));
            const row=text('div','','sheet-actions');
            row.append(this.library.action('Restart',()=>{this.closeSheet();this.scene()?.resetPuzzle();},'text-button primary'));body.append(row);
        });
    }
    update({contained,total,selected,dragging,charged,fitted,conflict,solved}) {
        if(!this.buttons)return;
        this.status.textContent=`${contained} of ${total} pieces placed${solved?', solved':''}`;
        for(const [name,b] of Object.entries(this.buttons)) b.disabled=(dragging && !(name==='flip' && charged)) || (['left','right'].includes(name) && (!selected || !this.def.rules.allowRotation)) || (name==='flip' && !selected) || (name==='reframe' && fitted);
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
        this.showSheet(pack&&remaining===0?`${pack.name} complete`:'Solved',body=>{
            if(pack&&remaining>0)body.append(text('p',`${remaining} left in ${pack.name}`,'secondary'));
            const row=text('div','','sheet-actions');
            if(this.context==='daily')row.append(this.library.action('Daily Calendar Puzzles',()=>this.leaveCalendar(),'text-button primary'));
            if(next)row.append(this.library.action('Next puzzle',()=>this.library.play(next),'text-button primary'));
            row.append(pack?this.library.action('Library',()=>this.leave(this.context)):this.library.action('Home',()=>this.leave()));
            body.append(row);
        });
    }
    help() {
        if(this.repo.backend)this.library.preference('help-seen',true).catch(()=>{});
        this.showSheet('How to play',body=>{
            for(const [title,copy] of [
                ['Goal','Fit every piece inside the tray without overlaps.'],
                ['Move','Drag a piece. It settles onto the grid when released.'],
                ['Turn',`Tap a piece to select it, then tap it again to turn it clockwise${this.def?.rules.allowFlip?'. Press and hold a piece to flip it':''}. The dock buttons and keys R, Shift+R or E${this.def?.rules.allowFlip?', F':''} also work.`],
                ['Marks','Darkened cells overlap or hang outside the tray. Grainy pieces are fixed in place.'],
                ['View','Drag empty space to pan. Pinch or scroll to zoom.']
            ]) {body.append(text('h3',title),text('p',copy));}
            if(this.def) {
                body.append(text('h3',this.def.meta?.name||'This puzzle'));
                if(this.def.meta?.description)body.append(text('p',this.def.meta.description));
                const spare=slack(this.def);if(spare>0)body.append(text('p',`${spare} tray ${spare===1?'cell stays':'cells stay'} empty.`,'secondary'));
                if(this.record)this.library.puzzleInfo(body,this.record);
            }
        });
    }
    /** Leave the player once the latest attempt is saved: Home, or Collections at a pack. */
    async leaveCalendar() { await this.pendingSave; this.calendar.show(); }
    async leave(packId=null) { await this.pendingSave;if(packId)this.library.collections(packId);else this.library.home(); }
    settings() { this.library.settings(); }
}
