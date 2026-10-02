import { portableSHA256 } from './hash.js';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { bundledPacks, puzzleById } from '../puzzles/index.js';
import { createState, movePiece, setPlacement } from '../core/state.js';
import { isSolved } from '../core/completion.js';
import { createStorage } from '../app/storage.js';
import { canonical, definitionRecord, inspectContent, parseFile } from './format.js';
import { allEntries, applyImport, applyRestore, backupFile, collections, continuation, emptyLibrary, entries, packFile,
    previewImport, previewRestore, removeCollection, saveAttempt, statusOf, validateBackup } from './model.js';
import { LibraryRepository } from './repository.js';

const clone = structuredClone;
const def = () => clone(puzzleById('demo01'));
const file = (id = 'test-pack', revision = 1, puzzles = [def()]) => ({ packVersion: 1, pack: { id, revision, name: 'Test pack', author: 'A creator' }, puzzles });
const install = async (state, data) => applyImport(state, previewImport(state, await inspectContent(data)));
function memoryBackend() {
    let saved = null;
    return { read: async () => clone(saved), write: async (value, expected) => {
        if ((saved?.serial || 0) !== expected) throw new Error('another tab'); saved = clone(value);
    } };
}

describe('content identity and validation', () => {
    it('preserves gameplay identity for metadata, presentation, colors and serialization order', async () => {
        const a = def(), b = def(); b.meta.name = 'A new name'; b.meta.catalogNumber = '123'; b.presentation.fieldRotation = 2;
        b.pieces.reverse(); b.container.cells.reverse(); b.pieces.forEach(p => { p.cells.reverse(); p.color = '#abc'; });
        const [ra, rb] = await Promise.all([definitionRecord(a), definitionRecord(b)]);
        expect(ra.gameKey).toBe(rb.gameKey); expect(ra.key).not.toBe(rb.key);
    });
    it.each(['shape', 'rules', 'start', 'locked', 'field'])('separates %s changes from old progress', async kind => {
        const a = def(), b = def();
        if (kind === 'shape') b.pieces[1].cells.pop();
        if (kind === 'rules') b.rules.allowFlip = true;
        if (kind === 'start') b.pieces[1].start.x++;
        if (kind === 'locked') b.pieces[0].locked = false;
        if (kind === 'field') b.field.width++;
        expect((await definitionRecord(a)).gameKey).not.toBe((await definitionRecord(b)).gameKey);
    });
    it('round trips optional metadata and preserves explicit order', async () => {
        const data = file('test-pack', 2, [puzzleById('little-turn'), def()]); data.note = 'extension'; data.puzzles[0] = clone(data.puzzles[0]); data.puzzles[0].meta.contributor = 'Ported by someone';
        const state = await install(emptyLibrary(), data); expect(packFile(state, 'test-pack')).toEqual(data);
    });
    it('rejects all of a broken pack and gives puzzle-specific errors', async () => {
        const data = file('test-pack', 1, [def(), { ...def(), id: 'broken', pieces: [] }]);
        await expect(inspectContent(data)).rejects.toThrow('no pieces');
    });
    it.each([
        f => { f.packVersion = 9; }, f => { f.pack.revision = 0; }, f => { f.pack.id = '__proto__'; },
        f => { f.puzzles.push(def()); }, f => { f.requiredFeatures = ['script']; },
        f => { f.puzzles[0].requiredFeatures = ['new-rule']; }, f => { f.puzzles[0].meta.name = {}; },
        f => { f.puzzles[0].draft = true; }, f => { f.puzzles[0].rules.custom = true; }, f => { f.puzzles[0].pieces[0].allowFlip = false; }
    ])('refuses unsupported or malformed content', async change => { const data = file(); change(data); await expect(inspectContent(data)).rejects.toThrow(); });
    it('accepts warnings without claiming solvability', async () => { const d = def(); delete d.meta; const c = await inspectContent(file('warning', 1, [d])); expect(c.warnings).toContain('demo01: missing author'); });
    it('rejects invalid JSON, unsafe keys, deep nesting and oversized files before traversal', () => {
        expect(() => parseFile('{')).toThrow('JSON'); expect(() => parseFile('{"__proto__":{}}')).toThrow('object key');
        expect(() => parseFile('['.repeat(42) + '0' + ']'.repeat(42))).toThrow('nested');
        expect(() => parseFile(' '.repeat(10 * 1024 ** 2 + 1))).toThrow('too large');
    });
});

describe('library lifecycle', () => {
    it('makes identical reimports no-ops', async () => { const data = file(), state = await install(emptyLibrary(), data); const plan = previewImport(state, await inspectContent(data)); expect(plan.kind).toBe('identical'); expect(applyImport(state, plan)).toBe(state); });
    it('preserves progress on rename/reorder and pins another pack to its previous definition', async () => {
        const data = file(); let state = await install(emptyLibrary(), data); state = await install(state, file('another'));
        const original = entries(state, 'test-pack')[0]; state = saveAttempt(state, original.key, createState(original.def), 'test-pack', 10);
        const update = file('test-pack', 2); update.pack.name = 'Renamed'; update.puzzles[0].meta.name = 'New title';
        const plan = previewImport(state, await inspectContent(update)); expect(plan.fresh).toHaveLength(0); state = applyImport(state, plan);
        expect(statusOf(state, entries(state, 'test-pack')[0])).toBe('In progress'); expect(entries(state, 'another')[0].def.meta.name).toBe('Corner Stone');
    });
    it('keeps gameplay revisions and historical attempts independent', async () => {
        let state = await install(emptyLibrary(), file()); state = await install(state, file('another'));
        const old = entries(state, 'test-pack')[0]; state = saveAttempt(state, old.key, createState(old.def), 'test-pack');
        const update = file('test-pack', 2); update.puzzles[0].rules.allowFlip = true;
        const plan = previewImport(state, await inspectContent(update)); expect(plan.fresh).toHaveLength(1); expect(plan.shared).toHaveLength(1);
        state = applyImport(state, plan); expect(statusOf(state, entries(state, 'test-pack')[0])).toBe('Not started'); expect(statusOf(state, entries(state, 'another')[0])).toBe('In progress');
        expect(state.progress[old.gameKey]).toBeDefined();
    });
    it('requires explicit same/older revision replacement and rejects stale previews', async () => {
        const state = await install(emptyLibrary(), file('test-pack', 3)), data = file('test-pack', 2);
        const plan = previewImport(state, await inspectContent(data)); expect(plan.conflictingRevision).toBe(true);
        expect(() => applyImport(state, plan)).toThrow('Confirm'); expect(applyImport(state, plan, true).packs['test-pack'].envelope.pack.revision).toBe(2);
        expect(() => applyImport({ ...state, serial: 1 }, plan, true)).toThrow('changed');
    });
    it('refuses replacement of a bundled collection', async () => {
        const repo = await new LibraryRepository(memoryBackend()).initialize(bundledPacks);
        const changed=clone(bundledPacks[0]);changed.pack.name='An adaptation';
        expect(() => previewImport(repo.state, { standalone: false, file: changed, records: [] })).toThrow('bundled');
        const identical=previewImport(repo.state,await inspectContent(bundledPacks[0]));expect(identical.kind).toBe('identical');
    });
    it('preserves progress and drafts across removal/reinstall and across shared memberships', async () => {
        let state = await install(emptyLibrary(), file()); state = await install(state, file('another')); state.drafts.example = { unfinished: true };
        const record = entries(state, 'test-pack')[0]; state = saveAttempt(state, record.key, createState(record.def), 'test-pack');
        state = removeCollection(state, 'test-pack'); expect(collections(state)).toHaveLength(1); expect(entries(state, 'another')).toHaveLength(1); expect(state.drafts.example).toBeDefined();
        state = await install(state, file()); expect(statusOf(state, entries(state, 'test-pack')[0])).toBe('In progress');
    });
    it('supports standalone puzzles without fabricated pack metadata', async () => {
        let state = await install(emptyLibrary(), def()); expect(state.packs).toEqual({}); expect(entries(state, 'loose')).toHaveLength(1);
        const d = def(); d.meta.name = 'Renamed'; state = await install(state, d); expect(state.loose).toHaveLength(1);
    });
    it('resumes the most recent available unfinished puzzle and keeps solved precedence', async () => {
        let state = await install(emptyLibrary(), file('test-pack', 1, [def(), clone(puzzleById('first-fit'))]));
        const [a, b] = entries(state, 'test-pack'); state = saveAttempt(state, a.key, createState(a.def), null, 10); state = saveAttempt(state, b.key, createState(b.def), 'test-pack', 20);
        expect(continuation(state).key).toBe(b.key); state.progress[b.gameKey].solved = true;
        expect(statusOf(state, b)).toBe('Solved'); expect(continuation(state).key).toBe(a.key);
        state = removeCollection(state, 'test-pack'); expect(continuation(state)).toBeNull();
    });
});

describe('backup and repository reliability', () => {
    it('restores content, attempts, preferences and reserved drafts on a fresh installation', async () => {
        let state = await install(emptyLibrary(), file()); const record = entries(state, 'test-pack')[0];
        state = saveAttempt(state, record.key, movePiece(record.def, createState(record.def), 'bar', -3, -2), 'test-pack');
        state.preferences['reduced-motion'] = true; state.drafts.example = { title: 'Unfinished work' };
        const incoming = await validateBackup(backupFile(state)), restored = applyRestore(emptyLibrary(), previewRestore(emptyLibrary(), incoming));
        expect(restored.progress).toEqual(state.progress); expect(restored.drafts).toEqual(state.drafts); expect(restored.preferences).toEqual(state.preferences); expect(packFile(restored, 'test-pack')).toEqual(file());
    });
    it('keeps conflicting local work by default, allows explicit replacement and unions solved history', async () => {
        let local = await install(emptyLibrary(), file('test-pack', 3)); const r = entries(local, 'test-pack')[0];
        local = saveAttempt(local, r.key, createState(r.def), 'test-pack', 200); let old = await install(emptyLibrary(), file());
        old = saveAttempt(old, r.key, movePiece(r.def, createState(r.def), 'bar', 0, 0), 'test-pack', 100); old.progress[r.gameKey].solved = true;
        const plan = previewRestore(local, old); expect(plan.packConflicts).toHaveLength(1); expect(plan.progressConflicts).toHaveLength(1);
        const kept = applyRestore(local, plan); expect(kept.progress[r.gameKey].state).toEqual(local.progress[r.gameKey].state); expect(kept.progress[r.gameKey].solved).toBe(true);
        expect(kept.packs['test-pack'].envelope.pack.revision).toBe(3); const replaced = applyRestore(local, plan, true); expect(replaced.progress[r.gameKey].updatedAt).toBe(100);
    });
    it.each(['definition', 'reference', 'attempt', 'setting', 'key'])('rejects corrupt backup %s before writing', async kind => {
        let state = await install(emptyLibrary(), file()); const r = entries(state, 'test-pack')[0]; state = saveAttempt(state, r.key, createState(r.def), null);
        const backup = backupFile(state);
        if (kind === 'definition') backup.library.definitions[r.key].def.pieces = [];
        if (kind === 'reference') backup.library.packs['test-pack'].keys = ['missing'];
        if (kind === 'attempt') backup.library.progress[r.gameKey].state.placements.bar.x = -999;
        if (kind === 'setting') backup.library.preferences.unknown = true;
        if (kind === 'key') backup.library.definitions[r.key].gameKey = 'wrong';
        await expect(validateBackup(backup)).rejects.toThrow();
    });
    it('migrates legacy attempts once without deleting originals or resurrecting erased progress', async () => {
        const map = new Map(), legacy = createStorage(() => ({ getItem: k => map.get(k), setItem: (k, v) => map.set(k, v) }));
        const d = def(); legacy.save(d, movePiece(d, createState(d), 'bar', -2, -1)); legacy.write('reduced-motion', true);
        const backend = memoryBackend(), repo = await new LibraryRepository(backend).initialize(bundledPacks, legacy);
        expect(Object.values(repo.state.progress)[0].state.placements.bar.x).toBe(-2); expect(repo.state.preferences['reduced-motion']).toBe(true);
        await repo.mutate(s => ({ ...s, progress: {} })); const reopened = await new LibraryRepository(backend).initialize(bundledPacks, legacy);
        expect(reopened.state.progress).toEqual({}); expect(legacy.load(d)).not.toBeNull();
    });
    it('publishes state only after a successful atomic write and recovers its queue after failure', async () => {
        const backend = memoryBackend(), repo = await new LibraryRepository(backend).initialize(bundledPacks), before = canonical(repo.state);
        const write = backend.write; backend.write = async () => { throw new Error('quota'); };
        await expect(repo.mutate(s => ({ ...s, preferences: { 'reduced-motion': true } }))).rejects.toThrow('quota'); expect(canonical(repo.state)).toBe(before);
        backend.write = write; await repo.mutate(s => ({ ...s, preferences: { 'reduced-motion': true } })); expect(repo.state.preferences['reduced-motion']).toBe(true);
    });
    it('rejects stale tabs without overwriting saved content', async () => {
        const backend = memoryBackend(), a = await new LibraryRepository(backend).initialize(bundledPacks), b = await new LibraryRepository(backend).initialize(bundledPacks);
        await a.mutate(s => ({ ...s, preferences: { 'reduced-motion': true } })); await expect(b.mutate(s => ({ ...s, preferences: {} }))).rejects.toThrow('another tab');
    });
    it('does not report imports as saved when durable storage is unavailable', async () => {
        const repo = await new LibraryRepository().initialize(bundledPacks);
        const plan = previewImport(repo.state, await inspectContent(file())); await expect(repo.mutate(s => applyImport(s, plan))).rejects.toThrow('cannot be saved');
        expect(repo.state.packs['test-pack']).toBeUndefined();
    });
});

it('the three introductory puzzles have simple, verified solutions', () => {
    for (const [id, placements] of [
        ['first-fit', [['a', 2, 2, 0, false], ['b', 2, 3, 0, false]]],
        ['little-turn', [['a', 2, 2, 0, false]]], ['other-side', [['a', 2, 2, 0, true]]]
    ]) {
        const d = puzzleById(id); let state = createState(d);
        for (const [piece, x, y, rotation, flipped] of placements) state = setPlacement(d, state, piece, { x, y, rotation, flipped });
        expect(isSolved(d, state), id).toBe(true);
    }
});

 it.each(['', 'abc', 'A puzzle 🧩', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'x'.repeat(1000000)])('portable content hash agrees with SHA-256 (%#)', value => {
    expect(portableSHA256(new TextEncoder().encode(value))).toBe(createHash('sha256').update(value).digest('hex'));
});
