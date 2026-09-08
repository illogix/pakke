// Validation is advisory: it reports, it never blocks. Authoring is a walk
// through invalid states, so the editor shows these and still lets you export.
// The same function runs over the bundled set as a test, which is what actually
// keeps a broken puzzle from shipping.

import { structuralErrors } from './structure.js';
import { cellKey, isConnected } from './geometry.js';
import {
    SCHEMA_VERSION,
    containerArea,
    containerKeys,
    containment,
    deriveField,
    placedCells,
    slack,
    totalPieceArea
} from './puzzle.js';
import { COMPLETION_LABELS } from './completion.js';
import { createState } from './state.js';
import { computeViolations } from './violations.js';

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

export function validatePuzzle(def) {
    const errors = structuralErrors(def);
    const warnings = [];
    if (errors.length) return { errors, warnings, facts: {}, valid: false };

    if (def?.schemaVersion !== SCHEMA_VERSION) {
        errors.push(`schemaVersion must be ${SCHEMA_VERSION}, got ${def?.schemaVersion}`);

        return { errors, warnings, facts: {}, valid: false };
    }

    if (!ID_PATTERN.test(def.id ?? '')) {
        errors.push(`id "${def.id}" must be lowercase alphanumeric with dashes or underscores`);
    }

    if (!def.type) errors.push('missing type');
    if (!COMPLETION_LABELS[def.rules?.completion]) {
        errors.push(`unknown completion condition "${def.rules?.completion}"`);
    }

    if (!def.container?.cells?.length) errors.push('container has no cells');
    if (!def.pieces?.length) errors.push('puzzle has no pieces');

    if (errors.length > 0) return { errors, warnings, facts: {}, valid: false };

    const seen = new Set();

    for (const piece of def.pieces) {
        if (seen.has(piece.id)) errors.push(`duplicate piece id "${piece.id}"`);
        seen.add(piece.id);

        if (!piece.cells?.length) errors.push(`piece "${piece.id}" has no cells`);
        else if (!isConnected(piece.cells)) warnings.push(`piece "${piece.id}" is disconnected`);
    }

    const spare = slack(def);

    if (spare < 0) {
        errors.push(`pieces cover ${-spare} more cells than the tray has`);
    }

    checkField(def, errors);

    const keys = containerKeys(def);
    const state = createState(def);

    for (const piece of def.pieces) {
        const where = containment(piece, piece.start, keys);

        if (piece.locked && where !== 'contained') {
            errors.push(`locked piece "${piece.id}" does not start fully inside the tray`);
        }

        if (where === 'straddling') {
            errors.push(`piece "${piece.id}" starts straddling the tray edge`);
        }

        if (where === 'staged' && touchesContainer(piece, keys)) {
            warnings.push(`piece "${piece.id}" starts touching the tray, so it reads as placed`);
        }
    }

    const violations = computeViolations(def, state);

    for (const key of violations.overlap) {
        const message = keys.has(key)
            ? `pieces overlap inside the tray at ${key} in the starting layout`
            : `staged pieces overlap at ${key} in the starting layout`;
        const list = keys.has(key) ? errors : warnings;

        if (!list.includes(message)) list.push(message);
    }

    if (!def.meta?.author) warnings.push('missing author');
    if (!def.meta?.name) warnings.push('missing name');

    return {
        errors,
        warnings,
        valid: errors.length === 0,
        facts: {
            containerArea: containerArea(def),
            pieceArea: totalPieceArea(def),
            slack: spare,
            pieceCount: def.pieces.length,
            field: def.field,
            derivedField: deriveField(def)
        }
    };
}

function checkField(def, errors) {
    if (!def.field?.width || !def.field?.height) {
        errors.push('missing field dimensions');

        return;
    }

    const outside = (cells, what) => {
        for (const [x, y] of cells) {
            if (x < 0 || y < 0 || x >= def.field.width || y >= def.field.height) {
                errors.push(`${what} extends outside the field at ${cellKey(x, y)}`);

                return;
            }
        }
    };

    outside(def.container.cells, 'container');

    for (const piece of def.pieces) {
        outside(placedCells(piece, piece.start), `piece "${piece.id}"`);
    }
}

function touchesContainer(piece, keys) {
    return placedCells(piece, piece.start).some(([x, y]) =>
        [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => keys.has(cellKey(x + dx, y + dy)))
    );
}

/** Cross-puzzle checks over the whole bundled set. */
export function validateSet(defs) {
    const errors = [];
    const byId = new Map();

    for (const def of defs) {
        if (byId.has(def.id)) errors.push(`duplicate puzzle id "${def.id}"`);
        byId.set(def.id, def);
    }

    return { errors, valid: errors.length === 0 };
}
