import {it,expect} from 'vitest';
import demo from '../puzzles/demo01.json';
import {createStorage,fingerprint,validSavedState} from './storage.js';
import {createState,movePiece} from '../core/state.js';
const backend=()=>{const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),data};};
it('resumes negative staging after reloading and rejects changed definitions',()=>{
    const db=backend(),a=createStorage(()=>db),state=movePiece(demo,createState(demo),'bar',-3,-2);a.save(demo,state);
    const b=createStorage(()=>db);expect(b.load(demo).state).toEqual(state);
    expect(b.load({...demo,field:{width:20,height:20}})).toBeNull();
});
it('survives denied reads/writes using memory',()=>{
    const s=createStorage(()=>{throw new Error('denied');});expect(s.load(demo)).toBeNull();s.save(demo,createState(demo));expect(s.load(demo).state).toEqual(createState(demo));s.clear([demo]);expect(s.load(demo)).toBeNull();
});
it('rejects corrupt JSON, fractional, out-of-bounds, extra and missing pieces, forbidden orientation and moved locked pieces',()=>{
    const db=backend();db.data.set('packing:v2:puzzle:demo01','{broken');expect(createStorage(()=>db).load(demo)).toBeNull();
    const invalid=[s=>s.placements.bar.x=.5,s=>s.placements.bar.x=-999,s=>delete s.placements.bar,s=>s.placements.extra={...s.placements.bar},s=>s.placements.bar.flipped=true,s=>{const locked=demo.pieces.find(p=>p.locked);s.placements[locked.id].x++;}];
    for(const change of invalid) {const state=createState(demo);change(state);expect(validSavedState(demo,state)).toBe(false);}
});
it('retains solved history on restart and only clears namespaced game data',()=>{
    const db=backend(),s=createStorage(()=>db);db.data.set('unrelated','keep');s.write('puzzle:demo01',{solved:true});s.save(demo,createState(demo));expect(s.solved('demo01')).toBe(true);s.clear([demo]);expect(s.solved('demo01')).toBe(false);expect(db.data.get('unrelated')).toBe('keep');
});
it('fingerprints do not depend on object key insertion order',()=>{
    expect(fingerprint({a:1,b:2})).toBe(fingerprint({b:2,a:1}));expect(fingerprint({a:1})).not.toBe(fingerprint({a:2}));
});
