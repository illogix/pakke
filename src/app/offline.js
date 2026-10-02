export async function prepareOffline(report) {
    if (import.meta.env.DEV) { report('Development preview · offline caching disabled'); return; }
    if (!('serviceWorker' in navigator)) { report('Offline installation is unavailable in this browser.'); return; }
    report('Preparing offline play…');
    try {
        const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
        const update = () => { if (navigator.serviceWorker.controller) report('Ready for offline play'); };
        navigator.serviceWorker.addEventListener('controllerchange', update);
        update();
        const worker = registration.installing;
        if (worker) worker.addEventListener('statechange', () => {
            if (worker.state === 'redundant' && !navigator.serviceWorker.controller) report('Offline download did not finish. Reopen with a connection to retry.');
        });
        await navigator.serviceWorker.ready;
        update();
    } catch { report('Offline download unavailable. Reopen with a connection to retry.'); }
}
