/// <reference types="vitest" />
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080';
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        port: 5173,
        strictPort: false,
        proxy: {
            '/v1': { target: apiTarget, changeOrigin: true, ws: true },
            '/auth': { target: apiTarget, changeOrigin: true },
            '/admin': { target: apiTarget, changeOrigin: true },
            '/fn': { target: apiTarget, changeOrigin: true },
            '/internal': { target: apiTarget, changeOrigin: true },
            '/openapi.yaml': { target: apiTarget, changeOrigin: true },
            '/healthz': { target: apiTarget, changeOrigin: true },
            '/readyz': { target: apiTarget, changeOrigin: true },
            '/metrics': { target: apiTarget, changeOrigin: true },
        },
    },
    build: {
        outDir: 'dist',
        sourcemap: true,
        target: 'es2022',
    },
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/test/setup.ts'],
        css: false,
        include: ['src/**/*.{test,spec}.{ts,tsx}'],
        exclude: ['node_modules', 'dist', 'tests/e2e/**'],
    },
});
