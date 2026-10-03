// Production builds always register the caching service worker; the app never
// needs the network after the first load, so nothing about it is shown.
export async function prepareOffline() {
    if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;
    try { await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`); } catch { /* Retried on the next launch. */ }
}
