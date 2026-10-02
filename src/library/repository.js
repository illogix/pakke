import { emptyLibrary } from './model.js';
import { inspectContent, LIMITS } from './format.js';

export function checkCapacity(state) {
    const definitions=Object.values(state.definitions);
    const cells=definitions.reduce((total,r)=>total+r.def.container.cells.length+r.def.pieces.reduce((sum,p)=>sum+p.cells.length,0),0);
    if(definitions.length>LIMITS.definitions||cells>LIMITS.cells||new TextEncoder().encode(JSON.stringify(state)).length>LIMITS.backupBytes-1024) {
        throw new Error('This library would exceed its backup capacity (2,000 retained definitions, 500,000 cells, or 50 MiB). The change was not saved.');
    }
}

export function openDatabase(factory = globalThis.indexedDB) {
    return new Promise((resolve, reject) => {
        if (!factory) return reject(new Error('Local storage is unavailable.'));
        const request = factory.open('packing-library', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('library');
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Close other game tabs, then reload to open local storage.'));
        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => db.close();
            resolve({
                read: () => new Promise((res, rej) => {
                    const tx = db.transaction('library', 'readonly'), get = tx.objectStore('library').get('current');
                    tx.oncomplete = () => res(get.result || null); tx.onabort = () => rej(tx.error);
                }),
                write: (value, expectedSerial) => new Promise((res, rej) => {
                    const tx = db.transaction('library', 'readwrite'), store = tx.objectStore('library');
                    let conflict = false;
                    const get = store.get('current');
                    get.onsuccess = () => {
                        if ((get.result?.serial || 0) !== expectedSerial) { conflict = true; tx.abort(); return; }
                        store.put(value, 'current');
                    };
                    tx.oncomplete = () => res();
                    tx.onabort = () => rej(conflict ? new Error('The library changed in another tab. Reload before saving more changes.') : tx.error || new Error('Local storage could not save this change.'));
                }),
                close: () => db.close()
            });
        };
    });
}
export class LibraryRepository {
    constructor(backend) { this.backend = backend; this.state = emptyLibrary(); this.queue = Promise.resolve(); }
    async initialize(bundled, legacy) {
        const saved = await this.backend?.read();
        if (saved && saved.version !== 1) throw new Error('This library needs a newer version of the app.');
        this.state = saved || emptyLibrary();
        let next = structuredClone(this.state);
        for (const file of bundled) {
            const content = await inspectContent(file);
            const { puzzles: _puzzles, ...envelope } = content.file;
            for (const r of content.records) next.definitions[r.key] = r;
            next.packs[file.pack.id] = { envelope, keys: content.records.map(r => r.key), source: 'bundled', installedAt: 0 };
            if (!next.migrated && legacy) for (const r of content.records) {
                const old = legacy.load(r.def);
                if (old && !next.progress[r.gameKey]) next.progress[r.gameKey] = { state: old.state, solved: old.solved === true, updatedAt: old.updatedAt || 0, context: file.pack.id };
            }
        }
        if (!next.migrated) {
            for (const key of ['reduced-motion', 'help-seen']) if (typeof legacy?.read(key) === 'boolean') next.preferences[key] = legacy.read(key);
            next.migrated = true;
        }
        // Don't rewrite on every boot: this also permits multiple read-only tabs.
        if (JSON.stringify(next) !== JSON.stringify(this.state)) {
            checkCapacity(next);
            next.serial = this.state.serial + 1;
            if (this.backend) await this.backend.write(next, this.state.serial);
            this.state = next;
        }
        return this;
    }
    mutate(change) {
        const job = this.queue.then(async () => {
            if (!this.backend) throw new Error('Changes cannot be saved on this device. Enable browser storage, then reload.');
            const next = await change(this.state);
            if (next === this.state) return this.state;
            checkCapacity(next);
            next.serial = this.state.serial + 1;
            await this.backend.write(next, this.state.serial);
            this.state = next;
            return next;
        });
        this.queue = job.catch(() => {});
        return job;
    }
    async flush() { await this.queue; }
}
