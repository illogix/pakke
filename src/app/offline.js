// Production builds always register the caching service worker; the app never
// needs the network after the first load, so nothing about it is shown. The iOS
// app bundles every file already, and its web view has no service workers.
export async function prepareOffline() {
    if (import.meta.env.DEV || globalThis.Capacitor?.isNativePlatform() || !('serviceWorker' in navigator)) return;
    try { await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`); } catch { /* Retried on the next launch. */ }
}
