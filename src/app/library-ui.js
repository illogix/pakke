import { bounds } from '../core/geometry.js';
import { storage } from './storage.js';
import { parseFile, inspectContent } from '../library/format.js';
import { applyImport, applyRestore, allEntries, backupFile, collections, continuation, entries, packFile,
    previewImport, previewRestore, removeCollection, statusOf, validateBackup } from '../library/model.js';
import { openGenerateSheet } from './generate-ui.js';

export const element = (tag, value = '', className = '') => {
    const node = document.createElement(tag); node.textContent = value; node.className = className; return node;
};
export class LibraryUI {
    constructor(shell, repository) {
        this.shell = shell; this.repo = repository; this.views = new Map(); this.packId = null;
        this.importInput = this.fileInput(false); this.backupInput = this.fileInput(true);
    }
    get state() { return this.repo.state; }
    action(label, callback, className = 'text-button') {
        const button = element('button', label, className); button.type = 'button';
        button.addEventListener('click', async () => {
            button.disabled = true;
            try { await callback(); } catch (e) { this.error(e); } finally { button.disabled = false; }
        });
        return button;
    }
    error(error) {
        this.shell.showSheet('Could not complete that action', body => body.append(element('p', error?.message || 'Please try again.', 'file-message')));
    }
    fileInput(backup) {
        const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json'; input.hidden = true;
        input.dataset.file = backup ? 'backup' : 'pack'; document.body.append(input);
        input.addEventListener('change', async () => {
            const file = input.files?.[0]; if (!file) return;
            try {
                if (file.size > (backup ? 50 : 10) * 1024 ** 2) throw new Error('This file is too large. Packs may be up to 10 MiB; backups up to 50 MiB.');
                const data = parseFile(await file.text(), backup);
                if (backup) await this.restorePreview(data); else await this.importPreview(data);
            } catch (e) { this.error(e); } finally { input.value = ''; }
        });
        return input;
    }
    remember() {
        if (this.shell.screen.hidden) return;
        const view = this.views.get(this.packId || 'library');
        if (view) { view.scroll = this.shell.screen.scrollTop; view.focus = document.activeElement?.dataset.entry || null; }
    }
    browse(packId = null, push = true) {
        this.remember(); this.shell.closeSheet(); this.shell.game.scene.stop('Play'); this.shell.def = null;
        this.packId = packId; this.shell.context = null;
        this.shell.url(null, push, packId);
        this.shell.footer.hidden = true; this.shell.screen.hidden = false;
        this.shell.screen.setAttribute('aria-label', packId ? 'Puzzle collection' : 'Puzzle library');
        document.querySelector('#game').setAttribute('inert', '');
        const pack = collections(this.state).find(p => p.id === packId);
        if (packId && !pack) { this.browse(null, false); this.error(new Error('This pack is no longer installed.')); return; }
        const viewKey = packId || 'library';
        if (!this.views.has(viewKey)) this.views.set(viewKey, { query: '', filter: 'All', sort: 'authored', limit: 60, scroll: 0 });
        const view = this.views.get(viewKey);
        const main = element('div', '', 'library');
        const top = element('header', '', 'library-top');
        top.append(this.action(pack ? '← Library' : 'Pakke', () => this.browse(), 'text-button quiet'), this.action('Settings', () => this.settings(), 'text-button quiet'));
        main.append(top, element('p', pack ? 'YOUR COLLECTION' : 'A LITTLE ROOM TO THINK', 'eyebrow'), element('h1', pack?.name || 'Your library'));
        main.append(element('p', pack?.description || 'Pick a puzzle. Make yourself some room.', 'library-description'));
        if (this.shell.storageNotice) main.append(element('p', this.shell.storageNotice, 'notice'));
        if (pack) {
            const count = entries(this.state, pack.id).filter(e => statusOf(this.state, e) === 'Solved').length;
            main.append(element('p', `${pack.author || 'Personal collection'} · ${count} / ${pack.keys.length} solved`, 'collection-summary'));
            const actions = element('div', '', 'library-actions');
            actions.append(this.action('Pack details', () => this.packDetails(pack)));
            if (pack.id !== 'loose') actions.append(this.action('Export pack', () => this.exportPack(pack.id)));
            if (pack.source === 'imported' || pack.id === 'loose') actions.append(this.action(pack.id === 'loose' ? 'Remove generated puzzles' : 'Remove pack', () => this.remove(pack)));
            main.append(actions);
        } else {
            const resume = continuation(this.state);
            if (resume) {
                const parent = collections(this.state).find(p => p.id === resume.packId);
                const button = this.action('', () => this.play(resume), 'continue-card');
                button.append(element('small', 'CONTINUE PLAYING'), element('strong', resume.def.meta?.name || resume.def.id), element('span', `${parent.name} →`)); main.append(button);
            }
            const actions = element('div', '', 'library-actions');
            actions.append(this.action('Generate puzzle', () => openGenerateSheet(this.shell, this)), this.action('Import pack or puzzle', () => this.importInput.click()));
            this.offlineLabel = element('span', this.shell.offlineStatus || 'Checking offline availability…', 'offline-status'); actions.append(this.offlineLabel); main.append(actions);
        }
        const controls = element('div', '', 'library-filters');
        const label = element('label', '', 'search-label'); label.append(element('span', 'Search', 'sr-only'));
        const search = document.createElement('input'); search.type = 'search'; search.placeholder = pack ? 'Search this pack' : 'Search puzzles, packs, creators…'; search.value = view.query; search.setAttribute('aria-label', 'Search library'); label.append(search);
        const select = (name, values, value) => {
            const control = document.createElement('select'); control.setAttribute('aria-label', name);
            for (const [key, title] of values) { const option = element('option', title); option.value = key; control.append(option); }
            control.value = value; return control;
        };
        const filter = select('Puzzle status', ['All', 'In progress', 'Unsolved', 'Solved'].map(v => [v, v]), view.filter);
        const sort = select('Sort puzzles', [['authored', 'Collection order'], ['name', 'Name'], ['author', 'Creator']], view.sort);
        controls.append(label, filter, sort); main.append(controls);
        const result = element('div'); main.append(result);
        const render = () => {
            result.replaceChildren();
            const query = view.query.trim().toLocaleLowerCase();
            const matches = (...values) => values.filter(v => typeof v === 'string').join(' ').toLocaleLowerCase().includes(query);
            const packs = collections(this.state);
            if (!pack && view.filter === 'All') {
                const matchingPacks = packs.filter(p => matches(p.name, p.author, p.catalogNumber));
                if (matchingPacks.length) {
                    result.append(element('h2', query ? 'Collections' : 'Find your next puzzle', 'section-title'));
                    const grid = element('div', '', 'pack-grid');
                    for (const p of matchingPacks.slice(0, view.limit)) grid.append(this.packCard(p));
                    result.append(grid);
                    if (matchingPacks.length > view.limit) result.append(this.action('Show more collections', () => { view.limit += 60; render(); }));
                }
                if (!query) return;
            }
            let list = pack ? entries(this.state, pack.id) : allEntries(this.state);
            list = list.filter(e => matches(e.def.meta?.name, e.def.id, e.def.meta?.author, e.def.meta?.contributor, e.def.meta?.catalogNumber)
                && (view.filter === 'All' || statusOf(this.state, e) === view.filter || view.filter === 'Unsolved' && statusOf(this.state, e) !== 'Solved'));
            if (view.sort !== 'authored') list.sort((a, b) => String(a.def.meta?.[view.sort] || '').localeCompare(String(b.def.meta?.[view.sort] || '')));
            const heading = element('h2', `${list.length} ${list.length === 1 ? 'puzzle' : 'puzzles'}`, 'section-title'); heading.setAttribute('aria-live', 'polite'); result.append(heading);
            const grid = element('div', '', 'puzzle-grid');
            for (const e of list.slice(0, view.limit)) grid.append(this.puzzleCard(e, !pack));
            result.append(grid);
            if (!list.length) result.append(element('p', 'No puzzles match. Try another search or status filter.', 'empty-state'));
            if (list.length > view.limit) result.append(this.action('Show more puzzles', () => { view.limit += 60; render(); }));
        };
        search.addEventListener('input', () => { view.query = search.value; view.limit = 60; render(); });
        filter.addEventListener('change', () => { view.filter = filter.value; view.limit = 60; render(); });
        sort.addEventListener('change', () => { view.sort = sort.value; render(); });
        this.shell.screen.replaceChildren(main); render();
        requestAnimationFrame(() => {
            if (view.focus) [...main.querySelectorAll('[data-entry]')].find(e => e.dataset.entry === view.focus)?.focus({ preventScroll: true });
            this.shell.screen.scrollTop = view.scroll;
        });
    }
    play(record) { this.remember(); this.shell.open(record.def, true, record.packId, record.key); }
    packCard(pack) {
        const items = entries(this.state, pack.id), count = items.filter(e => statusOf(this.state, e) === 'Solved').length;
        const button = this.action('', () => this.browse(pack.id), 'pack-card'); button.dataset.entry = pack.id;
        const art = element('div', '', 'pack-art'); art.append(this.thumbnail(items[0]?.def));
        const words = element('div', '', 'pack-words'); words.append(element('strong', pack.name), element('span', pack.author || 'Personal collection'), element('small', `${count} / ${items.length} solved`));
        const meter = element('div', '', 'pack-meter'); const fill = element('i'); fill.style.width = `${items.length ? count / items.length * 100 : 0}%`; meter.append(fill);
        button.append(art, words, meter); return button;
    }
    puzzleCard(record, showPack) {
        const row = element('div', '', 'puzzle-row');
        const button = this.action('', () => this.play(record), 'puzzle-card'); button.dataset.entry = record.key + ':' + record.packId;
        const words = element('span'); words.append(element('strong', record.def.meta?.name || record.def.id));
        if (showPack) words.append(element('small', collections(this.state).find(p => p.id === record.packId)?.name));
        words.append(element('small', `${record.def.pieces.length} ${record.def.pieces.length === 1 ? 'piece' : 'pieces'} · ${statusOf(this.state, record)}`, 'card-status'));
        button.append(this.thumbnail(record.def), words);
        const info = this.action('···', () => this.puzzleDetails(record), 'puzzle-more'); info.setAttribute('aria-label', `Details for ${record.def.meta?.name || record.def.id}`);
        row.append(button, info); return row;
    }
    thumbnail(def) {
        const canvas = document.createElement('canvas'); canvas.className = 'thumbnail'; canvas.width = 240; canvas.height = 160; canvas.setAttribute('aria-hidden', 'true');
        if (!def) return canvas;
        const ctx = canvas.getContext('2d'), b = bounds(def.container.cells), size = Math.min(200 / b.width, 124 / b.height);
        const ox = (240 - b.width * size) / 2, oy = (160 - b.height * size) / 2;
        ctx.fillStyle = '#bacabb'; ctx.shadowColor = '#374b3b22'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
        for (const [x, y] of def.container.cells) ctx.fillRect(ox + (x - b.minX) * size, oy + (y - b.minY) * size, size - 1, size - 1);
        return canvas;
    }
    credits(body, meta = {}) {
        for (const [key, label] of [['author', 'Designer'], ['contributor', 'Contributor'], ['catalogNumber', 'Catalog number'], ['attribution', 'Attribution'], ['source', 'Source'], ['license', 'License']]) if (meta[key]) body.append(element('h3', label), element('p', meta[key]));
    }
    packDetails(pack) {
        this.shell.showSheet(pack.name, body => {
            body.append(element('p', pack.description || 'A personal puzzle collection.'));
            this.credits(body, pack); body.append(element('p', pack.source === 'bundled' ? 'Included with the game.' : pack.source === 'loose' ? 'Puzzles you generated or added individually.' : `Added from a file · Revision ${pack.revision}`));
        });
    }
    puzzleDetails(record) {
        this.shell.showSheet(record.def.meta?.name || record.def.id, body => {
            body.append(element('p', record.def.meta?.description || 'Fit every piece inside the tray.')); this.credits(body, record.def.meta);
            const alternatives = allEntries(this.state).filter(e => e.def.id === record.def.id && e.gameKey !== record.gameKey);
            if (alternatives.length) body.append(element('p', 'Another gameplay revision is installed in a different collection. Each revision keeps its own progress.'));
            const archived = Object.values(this.state.definitions).filter(e => e.def.id === record.def.id && e.gameKey !== record.gameKey && this.state.progress[e.gameKey]);
            if (archived.length) body.append(element('p', `${new Set(archived.map(e => e.gameKey)).size} earlier gameplay revision(s) have retained progress. They are included in backups and restored if you reimport that content.`));
            body.append(this.action('Export puzzle', () => this.download(record.def, `${record.def.id}.json`)));
        });
    }
    async importPreview(data) {
        await this.repo.flush();
        const content = await inspectContent(data), plan = previewImport(this.state, content);
        const title = content.standalone ? content.records[0].def.meta?.name || content.records[0].def.id : content.file.pack.name;
        this.shell.showSheet(plan.kind === 'identical' ? 'Already installed' : plan.kind === 'update' ? 'Update preview' : 'Add to your library', body => {
            body.append(element('h3', title), element('p', content.standalone ? 'An individual puzzle, added to Generated puzzles.' : `${content.file.pack.author || 'Personal collection'} · ${content.records.length} puzzles · Revision ${content.file.pack.revision}`));
            if (content.file.pack?.description) body.append(element('p', content.file.pack.description));
            if (plan.kind === 'update') body.append(element('p', `${plan.added.length} added · ${plan.removed.length} removed · ${plan.changed.length} changed. ${plan.fresh.length} gameplay revision(s) start fresh. Earlier progress is retained; metadata-only changes keep current progress.`));
            if (plan.kind === 'update') {
                const changes = element('details'); changes.append(element('summary', 'Which puzzles change?'));
                for (const [label, records] of [['Added', plan.added], ['Removed', plan.removed], ['Changed', plan.changed]]) {
                    if (records.length) changes.append(element('h3', label), element('p', records.map(r => r.def.meta?.name || r.def.id).join(', ')));
                }
                if (!plan.added.length && !plan.removed.length && !plan.changed.length) changes.append(element('p', 'Only collection metadata or puzzle order changes.'));
                body.append(changes);
            }
            if (plan.shared.length) body.append(element('p', 'Other collections contain different gameplay revisions of these puzzles. Those collections and their attempts will stay intact.'));
            if (content.warnings.length) {
                const details = element('details'); details.append(element('summary', `${content.warnings.length} authoring warnings`), element('p', content.warnings.slice(0, 20).join('\n'), 'file-message')); body.append(details);
            }
            body.append(element('p', 'The file has been checked for supported puzzle data. Solvability has not been verified.'));
            let confirm;
            if (plan.conflictingRevision) {
                body.append(element('p', `Installed revision: ${plan.previousRevision}. This file declares the same or an older revision with different content.`));
                const label = element('label', '', 'preference'); confirm = document.createElement('input'); confirm.type = 'checkbox'; label.append(confirm, document.createTextNode('Replace this pack with the selected file')); body.append(label);
            }
            const packId = content.standalone ? 'loose' : content.file.pack.id;
            if (plan.kind === 'identical') body.append(this.action('Open pack', () => this.browse(packId)));
            else {
                const add = this.action(plan.kind === 'update' ? 'Update pack' : content.standalone ? 'Add puzzle' : 'Add pack', async () => {
                    await this.repo.mutate(s => applyImport(s, plan, confirm?.checked));
                    this.shell.showSheet('Saved to your library', result => { result.append(element('p', title), this.action('Open pack', () => this.browse(packId))); });
                }, 'text-button primary');
                if (confirm) { add.disabled = true; confirm.addEventListener('change', () => { add.disabled = !confirm.checked; }); }
                body.append(add);
            }
        });
    }
    remove(pack) {
        this.shell.showSheet(`Remove ${pack.name}?`, body => {
            body.append(element('p', 'This removes the collection from your library. Attempts and solved history are kept and will return if you import the same puzzles again. Other collections and drafts are kept.'));
            body.append(this.action('Remove from library', async () => { await this.repo.mutate(s => removeCollection(s, pack.id)); this.browse(); }, 'text-button danger'));
        });
    }
    async exportPack(id) { await this.repo.flush(); await this.download(packFile(this.state, id), `${id}.json`); }
    async download(data, name) {
        const file = new File([JSON.stringify(data, null, 2) + '\n'], name, { type: 'application/json' });
        // Native file sharing when available, ordinary downloads for local browsers.
        if (navigator.canShare?.({ files: [file] })) {
            try { await navigator.share({ files: [file], title: name }); return; } catch (error) { if (error.name === 'AbortError') return; }
        }
        const url = URL.createObjectURL(file), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
    async restorePreview(data) {
        await this.repo.flush(); const incoming = await validateBackup(data), plan = previewRestore(this.state, incoming);
        this.shell.showSheet('Restore backup', body => {
            body.append(element('p', `${Object.keys(incoming.packs).length} collections · ${Object.keys(incoming.definitions).length} puzzle definitions · ${Object.keys(incoming.progress).length} saved attempts.`));
            body.append(element('p', `${plan.packConflicts.length} pack, ${plan.looseConflicts.length} standalone puzzle, ${plan.progressConflicts.length} attempt, and ${plan.draftConflicts.length} draft conflicts. Existing content and attempts are kept by default. Solved histories are combined for matching gameplay revisions. Bundled collections stay as shipped.`));
            if (plan.packConflicts.length || plan.progressConflicts.length) {
                const details = element('details'); details.append(element('summary', 'Review conflicting content'));
                for (const id of plan.packConflicts) details.append(element('p', `${incoming.packs[id].envelope.pack.name}: local revision ${this.state.packs[id].envelope.pack.revision}, backup revision ${incoming.packs[id].envelope.pack.revision}.`));
                for (const key of plan.progressConflicts.slice(0, 30)) {
                    const record=Object.values(incoming.definitions).find(r=>r.gameKey===key);
                    details.append(element('p', `${record.def.meta?.name || record.def.id}: local attempt ${new Date(this.state.progress[key].updatedAt).toLocaleString()}, backup attempt ${new Date(incoming.progress[key].updatedAt).toLocaleString()}.`));
                }
                body.append(details);
            }
            const label = element('label', '', 'preference'); const replace = document.createElement('input'); replace.type = 'checkbox'; label.append(replace, document.createTextNode('Replace conflicting local content, attempts, drafts, and settings with this backup, even if local work is newer')); body.append(label);
            body.append(this.action('Restore into library', async () => {
                await this.repo.mutate(s => applyRestore(s, plan, replace.checked)); this.syncPreferences(); this.browse();
                this.shell.showSheet('Backup restored', result => result.append(element('p', 'Your restored puzzles and progress are available in the library.')));
            }, 'text-button primary'));
        });
    }
    syncPreferences() { for (const key of ['reduced-motion', 'help-seen']) storage.write(key, this.state.preferences[key] === true); }
    async preference(key, value) {
        await this.repo.mutate(s => ({ ...structuredClone(s), preferences: { ...s.preferences, [key]: value } })); storage.write(key, value);
    }
    settings() {
        this.shell.showSheet('Settings', body => {
            body.append(element('p', 'Your library and progress belong to this browser on this device. Use a backup to move them or keep an extra copy.'));
            const label = element('label', '', 'preference'), checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = this.state.preferences['reduced-motion'] === true;
            checkbox.addEventListener('change', async () => { try { await this.preference('reduced-motion', checkbox.checked); } catch (e) { checkbox.checked = !checkbox.checked; this.error(e); } });
            label.append(checkbox, document.createTextNode('Reduce motion')); body.append(label);
            body.append(this.action('Back up library', async () => { await this.repo.flush(); await this.download(backupFile(this.state), 'packing-library-backup.json'); }),
                this.action('Restore backup', () => this.backupInput.click()), this.action('Erase all saved progress', () => {
                    this.shell.showSheet('Erase all saved progress?', content => {
                        content.append(element('p', 'Erase all attempts and solved history, including progress retained for removed packs and earlier revisions. Installed puzzles, settings, and drafts are kept.'));
                        content.append(this.action('Erase progress', async () => {
                            await this.repo.mutate(s => ({ ...structuredClone(s), progress: {} })); this.browse();
                        }, 'text-button danger'));
                    });
                }));
            body.append(element('p', this.shell.offlineStatus || 'Checking offline availability…'));
        });
    }
}
