// The Generate sheet: pick a board size, generate a unique-solution puzzle in a
// worker, save it to Generated puzzles, and open it.
import { iconButton } from '../ui/icons.js';
import { GENERATOR_LIMITS, generatePuzzle } from '../core/generate.js';
import { inspectContent } from '../library/format.js';
import { applyImport, previewImport } from '../library/model.js';

const element = (tag, value = '', className = '') => {
    const node = document.createElement(tag); node.textContent = value; node.className = className; return node;
};
// Remembered for the session only; library preferences allowlist just player settings.
const session = { width: GENERATOR_LIMITS.defaultWidth, height: GENERATOR_LIMITS.defaultHeight, allowHoles: false };

export function openGenerateSheet(shell, library) {
    shell.showSheet('Generate a puzzle', body => {
        body.append(element('p', 'A fresh tray with exactly one way to fill it. Pieces can be turned and flipped. They are saved under Generated puzzles.'));
        body.append(stepper('Width', 'width'), stepper('Height', 'height'));
        // Future option: an "Allow holes" checkbox belongs here; `session.allowHoles` is passed but ignored by the generator for now.
        const row = element('div', '', 'sheet-actions');
        row.append(library.action('Generate', () => generate(shell, library), 'text-button primary'));
        body.append(row);
    });
}

function stepper(label, key) {
    const { minSize, maxSize } = GENERATOR_LIMITS;
    const row = element('div', '', 'stepper'), id = `generate-${key}`;
    const name = element('label', label); name.htmlFor = id;
    const input = document.createElement('input');
    input.type = 'number'; input.id = id; input.inputMode = 'numeric'; input.min = minSize; input.max = maxSize; input.step = 1; input.value = session[key];
    const minus = iconButton('minus', `Decrease ${label.toLowerCase()}`, () => set(session[key] - 1));
    const plus = iconButton('plus', `Increase ${label.toLowerCase()}`, () => set(session[key] + 1));
    const set = value => {
        const clamped = Math.min(maxSize, Math.max(minSize, Number.isInteger(value) ? value : session[key]));
        session[key] = clamped; input.value = clamped; minus.disabled = clamped <= minSize; plus.disabled = clamped >= maxSize;
    };
    input.addEventListener('input', () => { const value = Number(input.value); if (Number.isInteger(value) && value >= minSize && value <= maxSize) set(value); });
    input.addEventListener('blur', () => set(Number(input.value)));
    set(session[key]);
    row.append(name, minus, input, plus);
    return row;
}

function generate(shell, library) {
    const { width, height, allowHoles } = session;
    const seed = randomSeed();
    let worker = null, settled = false;
    const status = element('p', `Generating ${width}×${height}…`); status.setAttribute('aria-live', 'polite');
    const stop = () => { settled = true; worker?.terminate(); };
    shell.showSheet('Generating', body => {
        body.append(status);
        const row = element('div', '', 'sheet-actions');
        row.append(library.action('Cancel', () => { stop(); openGenerateSheet(shell, library); }));
        body.append(row);
    });
    shell.dialog.addEventListener('close', stop, { once: true });
    const finish = async result => {
        if (settled) return;
        stop();
        if (!result.ok) { failed(shell, library, `Couldn't find a unique ${width}×${height} puzzle in time. Try a smaller board.`); return; }
        try {
            const content = await inspectContent(result.def);
            await shell.repo.mutate(state => applyImport(state, previewImport(state, content)));
            shell.open(result.def, true, 'loose', content.records[0].key);
        } catch (error) { library.error(error); }
    };
    const fail = message => { if (!settled) { stop(); library.error(new Error(message)); } };
    const options = { width, height, seed, allowHoles };
    try {
        worker = new Worker(new URL('./generator.worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }) => {
            if (data.type === 'progress') status.textContent = `Generating ${width}×${height}… ${data.pieces} pieces, ${data.merges} ${data.merges === 1 ? 'merge' : 'merges'}`;
            else if (data.type === 'done') finish(data.result);
            else if (data.type === 'error') fail(data.message);
        };
        worker.onerror = event => fail(event.message || 'The generator could not start.');
        worker.postMessage({ type: 'generate', options });
    } catch {
        // No worker support: generate on the main thread after the sheet has painted.
        setTimeout(() => { try { finish(generatePuzzle(options)); } catch (error) { fail(error.message); } }, 50);
    }
}

function failed(shell, library, message) {
    shell.showSheet('No puzzle this time', body => {
        body.append(element('p', message));
        const row = element('div', '', 'sheet-actions');
        row.append(library.action('Try again', () => generate(shell, library), 'text-button primary'), library.action('Change size', () => openGenerateSheet(shell, library)));
        body.append(row);
    });
}

function randomSeed() {
    if (globalThis.crypto?.getRandomValues) return crypto.getRandomValues(new Uint32Array(1))[0];
    return Math.floor(Math.random() * 4294967296);
}
