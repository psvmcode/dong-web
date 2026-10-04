/// <reference types="vite/client" />

/**
 * 让 TypeScript 认识 .vue 单文件组件。
 * 不声明的话每个 import Xxx from './Xxx.vue' 都会报「找不到模块」。
 */
declare module '*.vue' {
    import type { DefineComponent } from 'vue';

    const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
    export default component;
}
