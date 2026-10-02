import { defineConfig } from 'vite';
import { offlinePlugin } from './scripts/offline-plugin.js';

export default defineConfig({
    plugins: [offlinePlugin()],
    server: {
        // Vite rejects requests whose Host header it does not recognise, so
        // reaching the dev server by mDNS name needs DEV_HOST set to that name.
        allowedHosts: process.env.DEV_HOST ? [process.env.DEV_HOST] : []
    }
});
