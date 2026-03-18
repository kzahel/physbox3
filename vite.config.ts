import { defineConfig } from 'vitest/config';

const box2dWasmEntry = new URL('./reference/box2d3-wasm/box2d3-wasm/build/dist/es/entry.mjs', import.meta.url).pathname;

export default defineConfig({
    base: '/physbox3/',
    test: {
        include: ['src/**/*.test.ts'],
    },
    resolve: {
        alias: {
            'box2d3-wasm': box2dWasmEntry,
        },
    },
    optimizeDeps: {
        exclude: ['box2d3-wasm'],
    },
    worker: {
        format: 'es',
    },
    server: {
        port: 8900,
        headers: {
            // Required for SharedArrayBuffer (box2d3-wasm threading)
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
        },
    },
});
