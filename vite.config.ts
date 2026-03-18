import { defineConfig } from 'vitest/config';

export default defineConfig({
    base: '/physbox3/',
    test: {
        include: ['src/**/*.test.ts'],
    },
    optimizeDeps: {
        exclude: ['@physbox/box2d3-wasm'],
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
