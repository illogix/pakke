import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

// Cache the actual emitted production files, so HTML and hashed assets stay together.
export function offlinePlugin() {
    let output;
    return {
        name: 'packing-offline', apply: 'build',
        configResolved(config) { output = resolve(config.root, config.build.outDir); },
        async closeBundle() {
            const files = [];
            async function walk(dir) {
                for (const entry of await readdir(dir, { withFileTypes: true })) {
                    const path = resolve(dir, entry.name);
                    if (entry.isDirectory()) await walk(path);
                    else if (entry.name !== 'sw.js' && !entry.name.endsWith('.map')) files.push(relative(output, path).split('\\').join('/'));
                }
            }
            await walk(output); files.sort();
            const hash = createHash('sha256');
            for (const file of files) hash.update(await readFile(resolve(output, file)));
            const version = hash.digest('hex').slice(0, 20);
            await writeFile(resolve(output, 'sw.js'), `
const ROOT = new URL('./', self.location).href;
const PREFIX = 'packing-offline:' + ROOT + ':';
const CACHE = PREFIX + '${version}';
// Pages are cached under their directory URL: hosts such as Cloudflare redirect
// /index.html to /, and a redirected response fails a navigation.
const FILES = ${JSON.stringify(files)}.map(path => new URL(path.replace(/(^|\\/)index\\.html$/, '$1'), ROOT).href);
self.addEventListener('install', event => event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try { await cache.addAll(FILES); } catch (error) { await caches.delete(CACHE); throw error; }
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    const root = new URL(ROOT);
    if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return;
    const navigation = event.request.mode === 'navigate' && (url.pathname === root.pathname || url.pathname === root.pathname + 'index.html');
    if (!navigation && !FILES.includes(url.origin + url.pathname)) return;
    event.respondWith((async () => {
        const cache = await caches.open(CACHE);
        const response = await cache.match(navigation ? ROOT : url.origin + url.pathname);
        return response || fetch(event.request);
    })());
});
`);
        }
    };
}
