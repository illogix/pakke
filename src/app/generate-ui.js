// New puzzle on Home: pick a board size, generate a unique-solution puzzle in a
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

export function newPuzzleSection(shell, library) {
    const section = element('section', '', 'section'), heading = element('h2', 'New puzzle', 'section-label');
    heading.id = 'new-puzzle'; section.setAttribute('aria-labelledby', heading.id);
    const steppers = element('div', '', 'steppers');
    // Future option: an "Allow holes" toggle belongs here; `session.allowHoles` is passed but ignored by the generator for now.
    const button = element('button', '', 'primary-button'); button.type = 'button'; button.dataset.generate = '';
    const label = () => { button.textContent = `Generate ${session.width} × ${session.height}`; };
    steppers.append(stepper('Width', 'width', label), stepper('Height', 'height', label));
    button.addEventListener('click', () => generate(shell, library)); label();
    section.append(heading, steppers, button);
    return section;
}

function stepper(label, key, changed) {
    const { minSize, maxSize } = GENERATOR_LIMITS;
    const row = element('div', '', 'stepper'), name = element('span', label, 'stepper-label'), controls = element('span', '', 'stepper-controls');
    row.setAttribute('role', 'group'); row.setAttribute('aria-label', label);
    const value = element('output'); value.setAttribute('aria-live', 'polite'); value.setAttribute('aria-label', label);
    const minus = iconButton('minus', `Decrease ${label.toLowerCase()}`, () => set(session[key] - 1));
    const plus = iconButton('plus', `Increase ${label.toLowerCase()}`, () => set(session[key] + 1));
    const set = next => {
        session[key] = Math.min(maxSize, Math.max(minSize, next)); value.textContent = session[key];
        minus.disabled = session[key] <= minSize; plus.disabled = session[key] >= maxSize; changed();
    };
    set(session[key]);
    controls.append(minus, value, plus); row.append(name, controls);
    return row;
}

function generate(shell, library) {
    const { width, height, allowHoles } = session;
    const seed = randomSeed();
    let worker = null, settled = false;
    const status = element('p', `${width} × ${height}`, 'secondary'); status.setAttribute('aria-live', 'polite');
    const stop = () => { settled = true; worker?.terminate(); };
    shell.showSheet('Generating', body => {
        body.append(status);
        const row = element('div', '', 'sheet-actions');
        row.append(library.action('Cancel', () => { stop(); shell.closeSheet(); }));
        body.append(row);
    });
    shell.dialog.addEventListener('close', stop, { once: true });
    const finish = async result => {
        if (settled) return;
        stop();
        if (!result.ok) { failed(shell, library, `No unique ${width} × ${height} puzzle found in time.`); return; }
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
            if (data.type === 'progress') status.textContent = `${width} × ${height} · ${data.pieces} pieces · ${data.merges} ${data.merges === 1 ? 'merge' : 'merges'}`;
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
        row.append(library.action('Try again', () => generate(shell, library), 'text-button primary'), library.action('Change size', () => {
            shell.closeSheet(); shell.screen.querySelector('.stepper button')?.focus();
        }));
        body.append(row);
    });
}

function randomSeed() {
    if (globalThis.crypto?.getRandomValues) return crypto.getRandomValues(new Uint32Array(1))[0];
    return Math.floor(Math.random() * 4294967296);
}
