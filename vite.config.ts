import { defineConfig } from 'vite';

export default defineConfig({
    base: '/physbox3/',
    optimizeDeps: {
        exclude: ['box2d3-wasm'],
    },
    server: {
        headers: {
            // Required for SharedArrayBuffer (box2d3-wasm threading)
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
        },
    },
});
