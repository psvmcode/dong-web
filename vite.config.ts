import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/**
 * 后端标识符与端口，dev 代理把 /api、/actuator、/v3 都转发过去。
 * 不改后端任何配置，避免为一个前端引入 CORS 与 CSRF 变更。
 */
const BACKEND_TARGET = process.env.DONG_BACKEND_TARGET ?? 'http://127.0.0.1:8090';

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    server: {
        host: '127.0.0.1',
        port: 5178,
        proxy: {
            '/api': { target: BACKEND_TARGET, changeOrigin: true },
            '/actuator': { target: BACKEND_TARGET, changeOrigin: true },
            '/v3': { target: BACKEND_TARGET, changeOrigin: true },
        },
    },
    build: {
        chunkSizeWarningLimit: 1500,
    },
});
