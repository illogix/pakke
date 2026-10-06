// Guard every geometry traversal, including imported/malformed JSON.
const integer = n => Number.isSafeInteger(n) && Math.abs(n) <= 1024;
const id = s => typeof s === 'string' && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(s)
    && !['__proto__','constructor','prototype'].includes(s);
export function structuralErrors(def) {
    const errors = [];
    if (!def || typeof def !== 'object') return ['puzzle must be an object'];
    if (def.schemaVersion !== 1) errors.push('schemaVersion must be 1');
    if (!id(def.id)) errors.push('id must be a lowercase alphanumeric identifier');
    if (def.type !== 'square-grid-packing') errors.push('unsupported puzzle type');
    if (!integer(def.field?.width) || !integer(def.field?.height) || def.field.width <= 0 || def.field.height <= 0) errors.push('field dimensions must be positive integers, at most 1024');
    if (typeof def.rules?.allowRotation !== 'boolean' || typeof def.rules?.allowFlip !== 'boolean'
        || def.rules?.completion !== 'all-pieces-contained') errors.push('invalid puzzle rules or completion condition');
    if (def.presentation !== undefined && (!Number.isInteger(def.presentation?.fieldRotation) || def.presentation.fieldRotation < 0 || def.presentation.fieldRotation > 3)) errors.push('invalid fieldRotation');
    const cells = (value, name, optional = false) => {
        if (optional && Array.isArray(value) && !value.length) return;
        if (!Array.isArray(value) || !value.length || value.length > 4096) { errors.push(`${name} has no cells or exceeds 4096 cells`); return; }
        if (!value.every(c => Array.isArray(c) && c.length === 2 && c.every(n => integer(n) && n >= 0))) { errors.push(`${name} needs nonnegative integer coordinate pairs`); return; }
        if (new Set(value.map(c => c.join(','))).size !== value.length) errors.push(`${name} has duplicate cells`);
    };
    cells(def.container?.cells, 'container');
    if (def.container?.holes !== undefined) cells(def.container.holes, 'container holes', true);
    const playable = new Set((Array.isArray(def.container?.cells) ? def.container.cells : []).filter(Array.isArray).map(c => c.join(',')));
    const holes = new Set((Array.isArray(def.container?.holes) ? def.container.holes : []).filter(Array.isArray).map(c => c.join(',')));
    if ([...holes].some(key => playable.has(key))) errors.push('container cells and holes must be disjoint');
    if (def.container?.labels !== undefined) {
        const labels = def.container.labels;
        if (!Array.isArray(labels) || labels.length > 4096) errors.push('container labels must be an array of at most 4096 labels');
        else {
            const seen = new Set();
            for (const label of labels) {
                const c = label?.cell;
                if (!Array.isArray(c) || c.length !== 2 || !c.every(n => integer(n) && n >= 0)
                    || typeof label.text !== 'string' || !label.text.trim() || label.text.length > 80) {
                    errors.push('invalid container label'); continue;
                }
                const key = c.join(',');
                if (!playable.has(key) && !holes.has(key)) errors.push('label must reference a playable cell or visible hole');
                if (seen.has(key)) errors.push('container has duplicate labels');
                seen.add(key);
            }
        }
    }
    if (!Array.isArray(def.pieces) || !def.pieces.length || def.pieces.length > 128) { errors.push('puzzle has no pieces or exceeds 128 pieces'); return errors; }
    let count = 0;
    const seen = new Set();
    for (const p of def.pieces) {
        if (!p || typeof p !== 'object') { errors.push('piece must be an object'); continue; }
        if (!id(p.id)) errors.push('piece id is invalid');
        if (seen.has(p.id)) errors.push(`duplicate piece id "${p.id}"`);
        seen.add(p.id);
        cells(p.cells, `piece "${p.id}"`);
        count += Array.isArray(p.cells) ? p.cells.length : 0;
        const s = p.start;
        if (!s || !integer(s.x) || !integer(s.y) || s.x < 0 || s.y < 0 || !Number.isInteger(s.rotation) || s.rotation < 0 || s.rotation > 3 || typeof s.flipped !== 'boolean') errors.push(`piece "${p.id}" has an invalid start`);
        if (typeof p.locked !== 'boolean') errors.push(`piece "${p.id}" has invalid locked flag`);
        // Optional: pieces without a colour take the theme's palette.
        for (const key of ['color', 'flippedColor']) if (p[key] !== undefined && (typeof p[key] !== 'string' || !/^#([a-f0-9]{3}|[a-f0-9]{6})$/i.test(p[key]))) errors.push(`piece "${p.id}" has invalid ${key}`);
    }
    if (count > 4096) errors.push('total piece area exceeds 4096 cells');
    return errors;
}
