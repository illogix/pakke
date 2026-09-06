import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        // Vite rejects requests whose Host header it does not recognise, so
        // reaching the dev server by mDNS name needs DEV_HOST set to that name.
        allowedHosts: process.env.DEV_HOST ? [process.env.DEV_HOST] : []
    }
});
