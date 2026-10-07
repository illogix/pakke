import { canonical, definitionRecord, inspectContent, isObject, validateDefinitions } from './format.js';
import { validSavedState } from '../app/storage.js';
import { parseDailyId } from '../daily/calendar.js';
import { isSolved } from '../core/completion.js';
import { validThemePreference } from '../themes/preferences.js';

export function emptyLibrary() {
    return { version: 1, serial: 0, definitions: {}, packs: {}, loose: [], progress: {}, preferences: {}, drafts: {}, migrated: false };
}
export function packFile(state, packId) {
    const pack = state.packs[packId];
    if (!pack) throw new Error('This pack is no longer installed.');
    return { ...structuredClone(pack.envelope), puzzles: pack.keys.map(key => structuredClone(state.definitions[key].def)) };
}
export function collections(state) {
    const packs = Object.values(state.packs).map(p => ({ id: p.envelope.pack.id, ...p.envelope.pack, source: p.source, keys: p.keys }));
    if (state.loose.length) packs.push({ id: 'loose', name: 'Generated puzzles', description: 'Puzzles you generated or added individually.', keys: state.loose, source: 'loose' });
    return packs;
}
export function entries(state, packId) {
    const pack = collections(state).find(p => p.id === packId);
    return (pack?.keys || []).map(key => ({ ...state.definitions[key], packId }));
}
export function allEntries(state) { return collections(state).flatMap(p => entries(state, p.id)); }
export function statusOf(state, record) {
    const saved = state.progress[record.gameKey];
    return saved?.solved ? 'Solved' : saved ? 'In progress' : 'Not started';
}
/** Unsolved attempts that are still installed, most recently played first. */
export function continuations(state, limit = 5) {
    const available = [...allEntries(state), ...Object.values(state.definitions).filter(r => parseDailyId(r.def.id)).map(r => ({ ...r, packId: 'daily' }))];
    const saved = Object.entries(state.progress).filter(([, p]) => !p.solved).sort((a, b) => b[1].updatedAt - a[1].updatedAt);
    const found = [];
    for (const [gameKey, p] of saved) {
        if (found.length >= limit) break;
        const matches = available.filter(e => e.gameKey === gameKey);
        const match = matches.find(e => e.packId === p.context) || matches[0];
        if (match) found.push(match);
    }
    return found;
}
export function continuation(state) { return continuations(state, 1)[0] ?? null; }
export function previewImport(state, content) {
    const { standalone, file, records } = content;
    const old = standalone ? null : state.packs[file.pack.id];
    const oldKeys = standalone ? state.loose.filter(k => state.definitions[k].def.id === records[0].def.id) : old?.keys || [];
    const before = oldKeys.map(k => state.definitions[k]);
    const added = records.filter(r => !before.some(b => b.def.id === r.def.id));
    const removed = before.filter(b => !records.some(r => r.def.id === b.def.id));
    const changed = records.filter(r => before.some(b => b.def.id === r.def.id && b.key !== r.key));
    const fresh = changed.filter(r => before.some(b => b.def.id === r.def.id && b.gameKey !== r.gameKey));
    const identical = standalone ? oldKeys.includes(records[0].key) : old && canonical(packFile(state, file.pack.id)) === canonical(file);
    if (old?.source === 'bundled' && !identical) throw new Error('An imported file cannot replace a bundled pack. Give your adapted collection a new pack ID.');
    const conflictingRevision = !identical && old && file.pack.revision <= old.envelope.pack.revision;
    const shared = records.filter(r => allEntries(state).some(e => e.def.id === r.def.id && e.gameKey !== r.gameKey && e.packId !== file.pack?.id && !(standalone && e.packId === 'loose')));
    return { content, serial: state.serial, kind: identical ? 'identical' : (old || oldKeys.length) ? 'update' : 'add',
        added, removed, changed, fresh, shared, conflictingRevision: !!conflictingRevision,
        previousRevision: old?.envelope.pack.revision };
}
export function applyImport(state, plan, allowConflict = false, now = Date.now()) {
    if (plan.serial !== state.serial) throw new Error('The library changed while this preview was open. Please select the file again.');
    if (plan.conflictingRevision && !allowConflict) throw new Error('Confirm replacement by the same or an older declared revision.');
    if (plan.kind === 'identical') return state;
    const next = structuredClone(state), { content } = plan;
    for (const record of content.records) next.definitions[record.key] = structuredClone(record);
    if (content.standalone) {
        const record = content.records[0];
        const index = next.loose.findIndex(k => next.definitions[k].def.id === record.def.id);
        if (index < 0) next.loose.push(record.key); else next.loose[index] = record.key;
    } else {
        const { puzzles: _puzzles, ...envelope } = content.file;
        next.packs[envelope.pack.id] = { envelope, keys: content.records.map(r => r.key), source: 'imported', installedAt: now };
    }
    return next;
}
export function removeCollection(state, id) {
    const next = structuredClone(state);
    if (id === 'loose') next.loose = [];
    else {
        if (next.packs[id]?.source !== 'imported') throw new Error('Only imported packs can be removed.');
        delete next.packs[id];
    }
    // Archive definitions for retained progress and future draft references.
    return next;
}
export function saveAttempt(state, key, attempt, context, now = Date.now()) {
    const record = state.definitions[key];
    if (!record || !validSavedState(record.def, attempt)) throw new Error('This attempt cannot be saved for this puzzle revision.');
    const next = structuredClone(state), old = next.progress[record.gameKey];
    next.progress[record.gameKey] = { state: structuredClone(attempt), solved: old?.solved === true || isSolved(record.def, attempt), updatedAt: now, context: context || null };
    return next;
}
export function backupFile(state) {
    return { backupVersion: 1, createdAt: new Date().toISOString(), library: structuredClone(state) };
}
export async function validateBackup(file) {
    if (file?.backupVersion !== 1 || file.library?.version !== 1) throw new Error('Unsupported personal backup. Use a version 1 library backup.');
    const s = file.library;
    for (const k of ['definitions', 'packs', 'progress', 'preferences', 'drafts']) if (!isObject(s[k])) throw new Error(`Invalid backup ${k}.`);
    if (!Array.isArray(s.loose) || !Number.isSafeInteger(s.serial) || s.serial < 0) throw new Error('Invalid backup library.');
    const values = Object.values(s.definitions);
    validateDefinitions(values.map(r => r?.def));
    const rebuilt = await Promise.all(values.map(r => definitionRecord(r.def)));
    for (const r of rebuilt) {
        if (s.definitions[r.key]?.key !== r.key || s.definitions[r.key]?.gameKey !== r.gameKey) throw new Error('Backup definition identity does not match its content.');
    }
    const references = keys => {
        if (!Array.isArray(keys) || keys.some(k => !s.definitions[k])) throw new Error('Backup refers to a missing puzzle.');
        if (new Set(keys.map(k => s.definitions[k].def.id)).size !== keys.length) throw new Error('Backup collection contains duplicate puzzle IDs.');
    };
    references(s.loose);
    for (const [id, p] of Object.entries(s.packs)) {
        references(p.keys);
        if (p.envelope?.pack?.id !== id || !['bundled', 'imported'].includes(p.source)) throw new Error('Invalid backup pack.');
        await inspectContent(packFile(s, id));
    }
    const byGame = new Map(rebuilt.map(r => [r.gameKey, r.def]));
    for (const [key, saved] of Object.entries(s.progress)) {
        if (!byGame.has(key) || !validSavedState(byGame.get(key), saved?.state) || typeof saved.solved !== 'boolean'
            || !Number.isSafeInteger(saved.updatedAt) || saved.updatedAt < 0 || !(saved.context === null || typeof saved.context === 'string')) throw new Error('Backup has invalid saved progress.');
    }
    for (const [k, v] of Object.entries(s.preferences)) {
        const valid = k === 'theme' ? validThemePreference(v)
            : ['reduced-motion', 'help-seen', 'daily-allow-flip', 'generator-allow-flip'].includes(k) && typeof v === 'boolean';
        if (!valid) throw new Error('Backup has unsupported settings.');
    }
    // Reserved, separate draft data is never interpreted as playable content.
    return structuredClone(s);
}
export function previewRestore(state, incoming) {
    const packConflicts = Object.keys(incoming.packs).filter(id => state.packs[id] && canonical(packFile(state, id)) !== canonical(packFile(incoming, id)));
    const progressConflicts = Object.keys(incoming.progress).filter(key => state.progress[key] && canonical(state.progress[key]) !== canonical(incoming.progress[key]));
    const looseConflicts = incoming.loose.filter(k => state.loose.some(old => state.definitions[old].def.id === incoming.definitions[k].def.id && old !== k));
    const draftConflicts = Object.keys(incoming.drafts).filter(id => state.drafts[id] && canonical(state.drafts[id]) !== canonical(incoming.drafts[id]));
    return { incoming, serial: state.serial, packConflicts, progressConflicts, looseConflicts, draftConflicts };
}
export function applyRestore(state, plan, replace = false) {
    if (plan.serial !== state.serial) throw new Error('The library changed. Please preview the backup again.');
    const next = structuredClone(state), incoming = plan.incoming;
    Object.assign(next.definitions, structuredClone(incoming.definitions));
    for (const [id, p] of Object.entries(incoming.packs)) {
        if (next.packs[id]?.source === 'bundled') continue;
        if (!next.packs[id] || replace) next.packs[id] = { ...structuredClone(p), source: 'imported' };
    }
    for (const key of incoming.loose) {
        const index = next.loose.findIndex(k => next.definitions[k].def.id === next.definitions[key].def.id);
        if (index < 0) next.loose.push(key); else if (replace) next.loose[index] = key;
    }
    for (const [key, saved] of Object.entries(incoming.progress)) {
        const old = next.progress[key];
        next.progress[key] = structuredClone(!old || replace ? saved : old);
        next.progress[key].solved ||= old?.solved === true || saved.solved;
    }
    for (const [key, draft] of Object.entries(incoming.drafts)) if (!Object.hasOwn(next.drafts, key) || replace) next.drafts[key] = structuredClone(draft);
    next.preferences = replace ? { ...next.preferences, ...incoming.preferences } : { ...incoming.preferences, ...next.preferences };
    return next;
}
