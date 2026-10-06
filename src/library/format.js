import { portableSHA256 } from './hash.js';
import { validatePuzzle } from '../core/validate.js';

export const SUPPORTED_FEATURES = ['board-labels', 'visible-holes', 'flipped-color'];
const unsupportedFeatures = value => value !== undefined && (!Array.isArray(value) || value.some(f => !SUPPORTED_FEATURES.includes(f)));

export const LIMITS = { importBytes: 10 * 1024 ** 2, backupBytes: 50 * 1024 ** 2, definitions: 2000, cells: 500000 };
export const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const validId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(value)
    && !['constructor', 'prototype', '__proto__', 'loose'].includes(value);
export const canonical = value => JSON.stringify(normalize(value));
function normalize(value) {
    if (Array.isArray(value)) return value.map(normalize);
    if (!isObject(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])]));
}
export async function digest(value) {
    const bytes = new TextEncoder().encode(canonical(value));
    if(!globalThis.crypto?.subtle)return portableSHA256(bytes);
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
}
const cells = value => [...value].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
export function gameplay(def) {
    return { id: def.id, schemaVersion: def.schemaVersion, type: def.type, field: def.field,
        container: cells(def.container.cells), rules: def.rules,
        ...(def.container.holes?.length ? { visibleHoles: cells(def.container.holes) } : {}),
        pieces: def.pieces.map(p => ({ id: p.id, cells: cells(p.cells), start: p.start, locked: p.locked }))
            .sort((a, b) => a.id.localeCompare(b.id)) };
}
export async function definitionRecord(def) {
    return { key: await digest(def), gameKey: await digest(gameplay(def)), def: structuredClone(def) };
}
export function parseFile(source, backup = false) {
    if (new TextEncoder().encode(source).length > (backup ? LIMITS.backupBytes : LIMITS.importBytes)) throw new Error('This file is too large. Packs may be up to 10 MiB; backups up to 50 MiB.');
    let data;
    try { data = JSON.parse(source); } catch { throw new Error('This is not a valid JSON file.'); }
    // Keep future extension fields as plain data, without prototype-sensitive keys.
    const walk = (v, depth = 0) => {
        if (depth > 40) throw new Error('This file is nested too deeply.');
        if (v && typeof v === 'object') for (const [key, item] of Object.entries(v)) {
            if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('This file contains an unsupported object key.');
            walk(item, depth + 1);
        }
    };
    walk(data);
    return data;
}
export function validateDefinitions(defs) {
    if (!Array.isArray(defs) || !defs.length || defs.length > LIMITS.definitions) throw new Error('A file must contain between 1 and 2,000 puzzle definitions.');
    let area = 0;
    const errors = [], warnings = [];
    for (const def of defs) {
        if (def?.draft || def?.kind === 'draft') { errors.push('Drafts need an editor and cannot be installed as playable puzzles.'); continue; }
        const name = typeof def?.meta?.name === 'string' ? def.meta.name : def?.id || 'Puzzle';
        if (unsupportedFeatures(def?.requiredFeatures)) errors.push(`${name}: unsupported required features.`);
        const result = validatePuzzle(def);
        errors.push(...result.errors.map(e => `${name}: ${e}`));
        warnings.push(...result.warnings.map(w => `${name}: ${w}`));
        if (result.valid) {
            const unknownRules=Object.keys(def.rules).filter(key=>!['allowRotation','allowFlip','completion'].includes(key));
            if(unknownRules.length) errors.push(`${name}: unsupported rules: ${unknownRules.join(', ')}.`);
            for(const piece of def.pieces) {
                const unknown=Object.keys(piece).filter(key=>!['id','cells','color','flippedColor','start','locked','meta'].includes(key));
                if(unknown.length) errors.push(`${name}: piece ${piece.id} has unsupported features: ${unknown.join(', ')}.`);
            }
            area += def.container.cells.length + (def.container.holes?.length ?? 0) + def.pieces.reduce((sum, p) => sum + p.cells.length, 0);
            if (def.meta !== undefined && !isObject(def.meta)) errors.push(`${name}: metadata must be an object.`);
            for (const key of ['name', 'author', 'description', 'contributor', 'attribution', 'source', 'license', 'catalogNumber']) {
                const value = def.meta?.[key];
                if (value !== undefined && (typeof value !== 'string' || value.length > 10000)) errors.push(`${name}: invalid ${key}.`);
            }
        }
    }
    if (area > LIMITS.cells) errors.push('This file exceeds the 500,000-cell limit.');
    if (errors.length) throw new Error(errors.slice(0, 30).join('\n') + (errors.length > 30 ? '\nAdditional errors omitted.' : ''));
    return warnings;
}
export async function inspectContent(data) {
    if (!isObject(data)) throw new Error('Expected a pack or puzzle object.');
    if (data.draft || data.kind === 'draft') throw new Error('This is an authoring draft. A future editor is needed to open it.');
    if (data.backupVersion !== undefined) throw new Error('This is a personal backup. Use Restore backup in Settings.');
    if (unsupportedFeatures(data.requiredFeatures)) throw new Error('This file requires unsupported features.');
    const standalone = data.schemaVersion !== undefined && data.packVersion === undefined;
    if (!standalone) {
        if (data.packVersion !== 1) throw new Error('Unsupported pack format. Expected packVersion 1.');
        if (!isObject(data.pack) || !validId(data.pack.id) || typeof data.pack.name !== 'string' || !data.pack.name.trim()
            || data.pack.name.length > 500 || !Number.isSafeInteger(data.pack.revision) || data.pack.revision < 1) throw new Error('A pack needs a valid id, name, and positive integer revision.');
        for (const key of ['author', 'description', 'attribution', 'source', 'license', 'contributor']) {
            if (data.pack[key] !== undefined && (typeof data.pack[key] !== 'string' || data.pack[key].length > 10000)) throw new Error(`Invalid pack ${key}.`);
        }
    }
    const defs = standalone ? [data] : data.puzzles;
    const warnings = validateDefinitions(defs);
    if (new Set(defs.map(d => d.id)).size !== defs.length) throw new Error('A pack cannot contain the same puzzle ID more than once.');
    return { standalone, file: structuredClone(data), records: await Promise.all(defs.map(definitionRecord)), warnings };
}
