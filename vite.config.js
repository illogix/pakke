import { defineConfig } from 'vite';
import { themePlugin } from './scripts/theme-plugin.js';
import { offlinePlugin } from './scripts/offline-plugin.js';
import { privacyPlugin } from './scripts/privacy-plugin.js';

export default defineConfig({
    plugins: [themePlugin(), privacyPlugin(), offlinePlugin()],
    server: {
        // Vite rejects requests whose Host header it does not recognise, so
        // reaching the dev server by mDNS name needs DEV_HOST set to that name.
        allowedHosts: process.env.DEV_HOST ? [process.env.DEV_HOST] : []
    }
});
