import { cpSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const laravelPublic = fileURLToPath(new URL('../public/', import.meta.url));
/** Files the page needs from the Laravel app's public folder: icons, the app manifest and the offline service worker. */
const SHARED_PUBLIC_FILES = ['icons', 'manifest.json', 'sw.js', 'favicon.ico', 'robots.txt'];

/**
 * Copy the shared public files into the build, so they live in one place (../public) for both versions.
 */
function sharedPublicFiles() {
    let outDir;
    return {
        name: 'shared-public-files',
        configResolved(config) {
            outDir = config.build.outDir;
        },
        closeBundle() {
            for (const file of SHARED_PUBLIC_FILES) {
                const source = laravelPublic + file;
                if (existsSync(source)) {
                    cpSync(source, `${outDir}/${file}`, { recursive: true });
                }
            }
        },
    };
}

export default defineConfig(({ command }) => ({
    plugins: [tailwindcss(), sharedPublicFiles()],
    // In development, serve the shared files straight from ../public; the build copies just the ones it needs.
    publicDir: command === 'serve' ? '../public' : false,
    server: {
        fs: { allow: ['..'] },
        proxy: {
            // `npm run dev` here talks to the API through `vercel dev` (port 3000) when it's running.
            '/api': 'http://localhost:3000',
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
}));
