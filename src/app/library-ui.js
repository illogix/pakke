import { parseDailyId } from '../daily/calendar.js';
import { bounds } from '../core/geometry.js';
import { storage } from './storage.js';
import { parseFile, inspectContent } from '../library/format.js';
import { applyImport, applyRestore, allEntries, backupFile, collections, continuations, entries, packFile,
    previewImport, previewRestore, removeCollection, statusOf, validateBackup } from '../library/model.js';
import { newPuzzleSection } from './generate-ui.js';
import { icon, iconButton } from '../ui/icons.js';
import { silhouetteLoops } from '../ui/silhouette.js';
import { wordmark } from '../ui/wordmark.js';
import { setThemePreference } from '../ui/theme.js';
import { THEME_CHOICES, themePreference } from '../themes/preferences.js';

export const element = (tag, value = '', className = '') => {
    const node = document.createElement(tag); node.textContent = value; node.className = className; return node;
};
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const PAGE = 60;
const STATUS_FILTERS = ['All', 'In progress', 'Unsolved', 'Solved'];
// Sorting by creator returns once puzzles carry visible credits: ['author', 'Creator'].
const SORTS = [['authored', 'Collection order'], ['name', 'Name']];

export class LibraryUI {
    constructor(shell, repository) {
        this.shell = shell; this.repo = repository; this.page = null; this.scroll = new Map();
        this.view = { query: '', filter: 'All', sort: 'authored', expanded: new Set(), searchExpanded: new Set(), limits: new Map() };
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
        if (this.shell.screen.hidden || !this.page) return;
        this.scroll.set(this.page, { top: this.shell.screen.scrollTop, focus: document.activeElement?.dataset.entry || null });
    }
    /** Shared entry to a library page: leave the player and show the page layer. */
    show(page, label, params, push) {
        this.remember(); this.shell.navigationSerial++; this.shell.closeSheet(); this.shell.game.scene.stop('Play'); this.shell.def = null; this.shell.context = null;
        this.shell.url(params, push);
        this.shell.footer.hidden = true; this.shell.screen.hidden = false; this.shell.screen.setAttribute('aria-label', label);
        document.querySelector('#game').setAttribute('inert', '');
        this.page = page;
    }
    restore(main) {
        this.shell.screen.replaceChildren(main);
        const saved = this.scroll.get(this.page);
        requestAnimationFrame(() => {
            if (saved?.focus) [...main.querySelectorAll('[data-entry]')].find(e => e.dataset.entry === saved.focus)?.focus({ preventScroll: true });
            this.shell.screen.scrollTop = saved?.top || 0;
        });
    }
    refresh() { if (this.page === 'collections') this.collections(null, false); else if (this.page === 'calendar') this.shell.calendar.show(undefined, false); else this.home(false); }
    section(label, ...children) {
        const section = element('section', '', 'section'), heading = element('h2', label, 'section-label');
        heading.id = `section-${label.toLowerCase().replace(/\W+/g, '-')}`; section.setAttribute('aria-labelledby', heading.id);
        section.append(heading, ...children); return section;
    }

    /** Home's sections each take one piece colour for their buttons, in order. */
    accentSection(label, accent, ...children) {
        const section = this.section(label, ...children); section.dataset.accent = String(accent); return section;
    }
    home(push = true) {
        this.show('home', 'Home', {}, push);
        const main = element('div', '', 'page home'), header = element('header', '', 'home-header');
        const title = element('h1', '', 'wordmark'); title.append(element('span', 'Pakke', 'sr-only')); title.insertAdjacentHTML('beforeend', wordmark());
        const row = element('div', '', 'home-title'); row.append(title, iconButton('settings', 'Settings', () => this.settings()));
        header.append(row);
        main.append(header);
        if (this.shell.storageNotice) main.append(element('p', this.shell.storageNotice, 'notice'));
        const recent = continuations(this.state);
        if (recent.length) main.append(this.lastPlayed(recent[0]));
        const daily = this.shell.calendar.homeSection(), generator = newPuzzleSection(this.shell, this);
        daily.dataset.accent = '2'; generator.dataset.accent = '3';
        main.append(daily, generator, this.accentSection('Library', 4, this.action('Browse library', () => this.collections(), 'primary-button')));
        this.restore(main);
    }
    lastPlayed(record) {
        const details = element('p', '', 'last-played');
        details.append(element('span', record.def.meta?.name || record.def.id, 'last-played-name'), element('span', this.setName(record), 'meta'));
        const resume = this.action('Continue puzzle', () => this.play(record), 'primary-button'); resume.dataset.continue = '';
        const history = iconButton('history', 'Recent puzzles', () => this.recent()); history.classList.add('square-action');
        const row = element('div', '', 'action-row'); row.append(resume, history);
        return this.accentSection('Last played', 1, details, row);
    }
    /** The five most recent unsolved puzzles; choosing one opens it. */
    recent() {
        this.shell.showSheet('Recent puzzles', body => { for (const record of continuations(this.state)) body.append(this.choiceRow(record)); });
    }
    setName(record) {
        return record.packId === 'daily' ? 'Calendar Puzzles' : collections(this.state).find(p => p.id === record.packId)?.name || '';
    }

    collections(packId = null, push = true) {
        const view = this.view;
        if (packId) { view.expanded.add(packId); this.scroll.delete('collections'); }
        this.show('collections', 'Library', packId ? { view: 'collections', pack: packId } : { view: 'collections' }, push);
        const main = element('div', '', 'page collections');
        const back = this.action('Home', () => this.home(), 'back-link'); back.insertAdjacentHTML('afterbegin', icon('back'));
        main.append(back, element('h1', 'Library', 'page-title'));
        const controls = element('div', '', 'search-row'), label = element('label', '', 'search');
        label.insertAdjacentHTML('beforeend', icon('search')); label.append(element('span', 'Search library', 'sr-only'));
        const search = document.createElement('input'); search.type = 'search'; search.placeholder = 'Search'; search.value = view.query;
        search.setAttribute('aria-label', 'Search library'); label.append(search);
        const filter = iconButton('filter', 'Filter and sort', () => this.filterSheet(() => { render(); mark(); }));
        filter.classList.add('filter-button');
        const mark = () => { const on = view.filter !== 'All' || view.sort !== 'authored'; filter.classList.toggle('is-active', on); filter.setAttribute('aria-pressed', String(on)); };
        controls.append(label, filter); mark();
        const tree = element('div', '', 'tree'), footer = element('div', '', 'page-footer');
        const add = this.action('Import a collection', () => this.importInput.click(), 'link-button'); add.insertAdjacentHTML('afterbegin', icon('plus'));
        footer.append(add); main.append(controls, tree, footer);
        const render = () => this.renderTree(tree, render);
        search.addEventListener('input', () => {
            view.query = search.value; view.limits.clear(); view.searchExpanded = new Set(); render();
        });
        render(); this.restore(main);
    }
    renderTree(tree, render) {
        const view = this.view, state = this.state, query = view.query.trim().toLocaleLowerCase();
        const matches = (...values) => values.filter(v => typeof v === 'string').join(' ').toLocaleLowerCase().includes(query);
        const filtering = !!query || view.filter !== 'All';
        const packs = collections(state);
        if (!packs.some(p => p.id === 'loose')) packs.push({ id: 'loose', name: 'Generated puzzles', keys: [], source: 'loose', placeholder: true });
        tree.replaceChildren();
        let shown = 0;
        for (const pack of packs) {
            const items = entries(state, pack.id), packMatch = !!query && matches(pack.name, pack.author, pack.catalogNumber);
            let visible = items.filter(e => (!query || packMatch || matches(e.def.meta?.name, e.def.id, e.def.meta?.author, e.def.meta?.contributor, e.def.meta?.catalogNumber))
                && (view.filter === 'All' || statusOf(state, e) === view.filter || view.filter === 'Unsolved' && statusOf(state, e) !== 'Solved'));
            if (filtering && !visible.length && !(packMatch && view.filter === 'All')) continue;
            if (view.sort !== 'authored') visible = [...visible].sort((a, b) => String(a.def.meta?.[view.sort] || '').localeCompare(String(b.def.meta?.[view.sort] || '')));
            // While searching, matching groups open by default; toggles apply to the active set.
            const openSet = query ? view.searchExpanded : view.expanded;
            const open = query ? !openSet.has(pack.id) : openSet.has(pack.id);
            const solved = items.filter(e => statusOf(state, e) === 'Solved').length;
            const group = element('div', '', 'group'), head = element('div', '', 'group-head'), listId = `group-${shown}`;
            const toggle = element('button', '', 'group-toggle'); toggle.type = 'button'; toggle.dataset.entry = `pack:${pack.id}`;
            toggle.setAttribute('aria-expanded', String(open)); toggle.setAttribute('aria-controls', listId);
            const chevron = element('span', '', 'chevron'); chevron.innerHTML = icon('next');
            toggle.append(chevron, element('span', pack.name, 'group-name'), element('span', items.length ? `${solved} of ${items.length}` : '0', 'meta'));
            toggle.addEventListener('click', () => { if (openSet.has(pack.id)) openSet.delete(pack.id); else openSet.add(pack.id); render(); });
            head.append(toggle);
            if (!pack.placeholder) head.append(iconButton('more', `${pack.name} actions`, () => this.packActions(pack)));
            group.append(head);
            if (open) {
                const list = element('div', '', 'group-items'); list.id = listId;
                const limit = view.limits.get(pack.id) || PAGE;
                for (const record of visible.slice(0, limit)) list.append(this.puzzleRow(record));
                if (!visible.length) list.append(element('p', 'None yet', 'empty'));
                if (visible.length > limit) list.append(this.action('Show more', () => { view.limits.set(pack.id, limit + PAGE); render(); }, 'text-button quiet more-button'));
                group.append(list);
            }
            tree.append(group); shown++;
        }
        if (!shown) tree.append(element('p', 'No matches', 'empty'));
    }
    puzzleRow(record) {
        const status = statusOf(this.state, record);
        const button = this.action('', () => this.play(record), 'puzzle-row'); button.dataset.entry = record.key + ':' + record.packId;
        button.append(trayThumbnail(record.def, status), element('span', record.def.meta?.name || record.def.id, 'puzzle-name'));
        if (status === 'Solved') { const s = element('span', 'Solved', 'status solved'); s.insertAdjacentHTML('afterbegin', icon('solved')); button.append(s); }
        if (status === 'In progress') { const s = element('span', 'Started', 'status started'); s.insertAdjacentHTML('afterbegin', icon('started')); button.append(s); }
        return button;
    }
    /** A puzzle choice inside a sheet, naming its collection. */
    choiceRow(record) {
        const button = this.action('', () => this.play(record), 'choice-row');
        button.append(trayThumbnail(record.def, statusOf(this.state, record)), element('span', record.def.meta?.name || record.def.id, 'puzzle-name'),
            element('span', this.setName(record), 'meta'));
        return button;
    }
    filterSheet(changed) {
        const view = this.view;
        this.shell.showSheet('Filter and sort', body => {
            const select = (name, values, value, set) => {
                const label = element('label', '', 'field'), control = document.createElement('select'); control.setAttribute('aria-label', name);
                for (const [key, title] of values) { const option = element('option', title); option.value = key; control.append(option); }
                control.value = value; control.addEventListener('change', () => { set(control.value); view.limits.clear(); changed(); });
                label.append(element('span', name), control); return label;
            };
            body.append(select('Status', STATUS_FILTERS.map(v => [v, v]), view.filter, v => { view.filter = v; }),
                select('Sort', SORTS, view.sort, v => { view.sort = v; }));
        });
    }
    play(record) {
        this.remember();
        const daily = record.packId === 'daily' && parseDailyId(record.def.id);
        if (daily) return this.shell.calendar.openDate(daily.date, daily.allowFlip);
        this.shell.open(record.def, true, record.packId, record.key);
    }
    packActions(pack) {
        this.shell.showSheet(pack.name, body => {
            const count = plural(pack.keys.length, 'puzzle');
            body.append(element('p', [count, pack.source === 'bundled' ? 'Bundled' : pack.source === 'imported' ? `Revision ${pack.revision}` : null].filter(Boolean).join(' · '), 'secondary'));
            if (pack.source !== 'loose' && pack.description) body.append(element('p', pack.description));
            const row = element('div', '', 'sheet-actions');
            if (pack.id !== 'loose') row.append(this.action('Export pack', () => this.exportPack(pack.id)));
            if (pack.source === 'imported' || pack.id === 'loose') row.append(this.action(pack.id === 'loose' ? 'Remove generated puzzles' : 'Remove pack', () => this.remove(pack)));
            body.append(row);
        });
    }
    /** Revision notes and export for the open puzzle; shown in Help. */
    puzzleInfo(body, record) {
        const alternatives = allEntries(this.state).filter(e => e.def.id === record.def.id && e.gameKey !== record.gameKey);
        if (alternatives.length) body.append(element('p', 'Another gameplay revision is installed in a different collection. Each revision keeps its own progress.', 'secondary'));
        const archived = Object.values(this.state.definitions).filter(e => e.def.id === record.def.id && e.gameKey !== record.gameKey && this.state.progress[e.gameKey]);
        if (archived.length) body.append(element('p', `${new Set(archived.map(e => e.gameKey)).size} earlier gameplay revision(s) have retained progress. They are included in backups and restored if you reimport that content.`, 'secondary'));
        body.append(this.action('Export puzzle', () => this.download(record.def, `${record.def.id}.json`)));
    }
    async importPreview(data) {
        await this.repo.flush();
        const content = await inspectContent(data), plan = previewImport(this.state, content);
        const title = content.standalone ? content.records[0].def.meta?.name || content.records[0].def.id : content.file.pack.name;
        this.shell.showSheet(plan.kind === 'identical' ? 'Already installed' : plan.kind === 'update' ? 'Update preview' : 'Add to your library', body => {
            body.append(element('h3', title), element('p', content.standalone ? 'Single puzzle · Generated puzzles' : `${content.file.pack.author || 'No creator'} · ${plural(content.records.length, 'puzzle')} · Revision ${content.file.pack.revision}`));
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
            body.append(element('p', 'Checked for supported puzzle data. Solvability is not verified.', 'secondary'));
            let confirm;
            if (plan.conflictingRevision) {
                body.append(element('p', `Installed revision: ${plan.previousRevision}. This file declares the same or an older revision with different content.`));
                const label = element('label', '', 'preference'); confirm = document.createElement('input'); confirm.type = 'checkbox'; label.append(confirm, document.createTextNode('Replace this pack with the selected file')); body.append(label);
            }
            const packId = content.standalone ? 'loose' : content.file.pack.id;
            const row = element('div', '', 'sheet-actions');
            if (plan.kind === 'identical') row.append(this.action('Open collection', () => this.collections(packId)));
            else {
                const add = this.action(plan.kind === 'update' ? 'Update pack' : content.standalone ? 'Add puzzle' : 'Add pack', async () => {
                    await this.repo.mutate(s => applyImport(s, plan, confirm?.checked));
                    if (this.page === 'collections' && !this.shell.screen.hidden) this.collections(null, false);
                    this.shell.showSheet('Saved to your library', result => {
                        const actions = element('div', '', 'sheet-actions');
                        actions.append(this.action('Open collection', () => this.collections(packId), 'text-button primary'));
                        result.append(element('p', title), actions);
                    });
                }, 'text-button primary');
                if (confirm) { add.disabled = true; confirm.addEventListener('change', () => { add.disabled = !confirm.checked; }); }
                row.append(add);
            }
            body.append(row);
        });
    }
    remove(pack) {
        this.shell.showSheet(`Remove ${pack.name}?`, body => {
            body.append(element('p', 'Attempts and solved history are kept and return if you import the same puzzles again.'));
            const row = element('div', '', 'sheet-actions');
            row.append(this.action('Remove from library', async () => { await this.repo.mutate(s => removeCollection(s, pack.id)); this.collections(null, false); }, 'text-button primary'));
            body.append(row);
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
            body.append(element('p', `${plural(Object.keys(incoming.packs).length, 'collection')} · ${plural(Object.keys(incoming.definitions).length, 'puzzle definition')} · ${plural(Object.keys(incoming.progress).length, 'saved attempt')}`));
            body.append(element('p', `${plan.packConflicts.length} pack, ${plan.looseConflicts.length} standalone puzzle, ${plan.progressConflicts.length} attempt, and ${plan.draftConflicts.length} draft conflicts. Existing content and attempts are kept by default. Solved histories are combined for matching gameplay revisions. Bundled collections stay as shipped.`, 'secondary'));
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
            const row = element('div', '', 'sheet-actions');
            row.append(this.action('Restore into library', async () => {
                await this.repo.mutate(s => applyRestore(s, plan, replace.checked)); this.syncPreferences(); this.home(false);
                this.shell.showSheet('Backup restored', () => {});
            }, 'text-button primary'));
            body.append(row);
        });
    }
    syncPreferences() {
        for (const key of ['reduced-motion', 'help-seen']) storage.write(key, this.state.preferences[key] === true);
        const value = themePreference(this.state.preferences.theme);
        storage.write('theme', value); setThemePreference(value);
    }
    async preference(key, value) {
        await this.repo.mutate(s => ({ ...structuredClone(s), preferences: { ...s.preferences, [key]: value } })); storage.write(key, value);
        if (key === 'theme') setThemePreference(value);
    }
    settings() {
        this.shell.showSheet('Settings', body => {
            const themeField = element('label', '', 'field'), select = document.createElement('select');
            select.setAttribute('aria-label', 'Theme');
            for (const [value, name] of THEME_CHOICES) { const option = element('option', name); option.value = value; select.append(option); }
            select.value = themePreference(this.state.preferences.theme);
            select.addEventListener('change', async () => {
                select.disabled = true;
                try { await this.preference('theme', select.value); }
                catch (error) { select.value = themePreference(this.state.preferences.theme); this.error(error); }
                finally { select.disabled = false; }
            });
            themeField.append(document.createTextNode('Theme'), select); body.append(themeField);
            body.append(element('h3', 'Library'));
            const row = element('div', '', 'sheet-actions');
            row.append(this.action('Back up library', async () => { await this.repo.flush(); await this.download(backupFile(this.state), 'pakke-backup.json'); }),
                this.action('Restore backup', () => this.backupInput.click()), this.action('Erase all saved progress', () => {
                    this.shell.showSheet('Erase all saved progress?', content => {
                        content.append(element('p', 'Erases all attempts and solved history, including progress retained for removed packs and earlier revisions. Installed puzzles, settings, and drafts are kept.'));
                        const actions = element('div', '', 'sheet-actions');
                        actions.append(this.action('Erase progress', async () => {
                            await this.repo.mutate(s => ({ ...structuredClone(s), progress: {} })); this.refresh();
                        }, 'text-button primary'));
                        content.append(actions);
                    });
                }));
            body.append(row);
        });
    }
}

/** A 26 px outline of the puzzle's real tray, filled by its status. */
export function trayThumbnail(def, status) {
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), path = document.createElementNS(ns, 'path');
    const cells = def.container.cells, b = bounds(cells), m = Math.max(b.width, b.height);
    const dx = (m - b.width) / 2 - b.minX, dy = (m - b.height) / 2 - b.minY;
    path.setAttribute('d', silhouetteLoops(cells).map(loop => 'M' + loop.map(([x, y]) => `${x + dx} ${y + dy}`).join('L') + 'Z').join(''));
    path.setAttribute('fill-rule', 'evenodd'); path.setAttribute('stroke-width', String(0.035 * m + 0.05));
    svg.setAttribute('viewBox', `-0.3 -0.3 ${m + 0.6} ${m + 0.6}`); svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('tray-thumb', status === 'Solved' ? 'solved' : status === 'In progress' ? 'started' : 'new');
    svg.append(path); return svg;
}
