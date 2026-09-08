import { createState } from '../core/state.js';
import { clampToWorkspace } from '../core/workspace.js';
import { isSolved } from '../core/completion.js';

const PREFIX = 'packing:v2:';
// Definition identity, independent of filenames and object key insertion order.
export function fingerprint(def) {
    const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
        ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])) : v;
    const input = JSON.stringify(canonical(def));
    let hash = 2166136261;
    for (let i=0;i<input.length;i++) hash = Math.imul(hash ^ input.charCodeAt(i),16777619);
    return (hash >>> 0).toString(16);
}
export function validSavedState(def, state) {
    const placements = state?.placements;
    if (!placements || typeof placements !== 'object' || Array.isArray(placements) || Object.keys(placements).length !== def.pieces.length) return false;
    return def.pieces.every(piece => {
        const p = placements[piece.id];
        if (!p || !Number.isSafeInteger(p.x) || !Number.isSafeInteger(p.y) || !Number.isInteger(p.rotation)
            || p.rotation < 0 || p.rotation > 3 || typeof p.flipped !== 'boolean') return false;
        if ((piece.locked && ['x','y','rotation','flipped'].some(k => p[k] !== piece.start[k]))
            || (!def.rules.allowRotation && p.rotation !== piece.start.rotation)
            || (!def.rules.allowFlip && p.flipped !== piece.start.flipped)) return false;
        const clamped = clampToWorkspace(def,piece,p);
        return clamped.x === p.x && clamped.y === p.y;
    });
}
export function createStorage(getStorage = () => globalThis.localStorage) {
    const memory = new Map();
    let unavailable = false;
    const read = key => {
        if (memory.has(key)) return memory.get(key);
        if (unavailable) return null;
        try { const raw = getStorage()?.getItem(PREFIX+key); return raw ? JSON.parse(raw) : null; }
        catch { return null; }
    };
    const write = (key,value) => {
        memory.set(key,value);
        if (!unavailable) try { getStorage()?.setItem(PREFIX+key,JSON.stringify(value)); } catch { unavailable = true; }
    };
    return {
        read, write,
        load(def) {
            const record = read('puzzle:'+def.id);
            return record?.version === 2 && record.fingerprint === fingerprint(def) && validSavedState(def,record.state) ? record : null;
        },
        save(def,state) {
            const old = read('puzzle:'+def.id);
            const record = { version: 2, fingerprint: fingerprint(def), state, solved: old?.solved === true || isSolved(def,state), updatedAt: Date.now() };
            write('puzzle:'+def.id,record); write('last',def.id); return record;
        },
        solved(id) { return read('puzzle:'+id)?.solved === true; },
        clear(defs) {
            // Only this app's known keys; never clear another app's localStorage.
            for (const key of [...defs.map(d=>'puzzle:'+d.id),'last','help-seen']) {
                memory.set(key,null);
                try { getStorage()?.removeItem(PREFIX+key); } catch { unavailable = true; }
            }
        },
        initial(def) { return this.load(def)?.state ?? createState(def); }
    };
}
export const storage = createStorage();
