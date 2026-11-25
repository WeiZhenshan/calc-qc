import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const root = new URL('./', import.meta.url);

function offlineShell() {
    let config;
    return {
        name: 'calc-qc-offline-shell',
        apply: 'build',
        configResolved(value) {
            config = value;
        },
        async closeBundle() {
            const folder = resolve(config.root, config.build.outDir);
            const files = (await readdir(folder, { recursive: true, withFileTypes: true }))
                .filter(entry => entry.isFile() && entry.name !== 'sw.js')
                .map(entry => join(entry.parentPath ?? entry.path, entry.name))
                .sort();
            const manifest = files.map(file => config.base + relative(folder, file).replaceAll('\\', '/'));
            const hash = createHash('sha256');
            for (const file of files) hash.update(await readFile(file));
            const source = await readFile(new URL('src/service-worker.js', root), 'utf8');
            hash.update(source);
            await writeFile(join(folder, 'sw.js'), source
                .replace('__CACHE_VERSION__', hash.digest('hex').slice(0, 16))
                .replace('__PRECACHE_FILES__', JSON.stringify(manifest)));
        },
    };
}

export default defineConfig({
    plugins: [vue(), offlineShell()],
    server: {
        proxy: { '/api': { target: process.env.CALC_QC_API_TARGET || 'http://127.0.0.1:8080' } },
        fs: { allow: [fileURLToPath(root), fileURLToPath(new URL('../docs/data/', root))] },
    },
});
