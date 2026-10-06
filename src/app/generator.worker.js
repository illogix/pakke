// Runs the puzzle generator off the main thread. Imports core and pure palette data, so
// the worker bundle stays small and never touches Phaser or the DOM.
import { generatePuzzle } from '../core/generate.js';

self.onmessage = ({ data }) => {
    if (data?.type !== 'generate') return;
    try {
        const result = generatePuzzle(data.options, { onProgress: progress => self.postMessage({ type: 'progress', ...progress }) });
        self.postMessage({ type: 'done', result });
    } catch (error) {
        self.postMessage({ type: 'error', message: error?.message || String(error) });
    }
};
