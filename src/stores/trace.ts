import { defineStore } from 'pinia';

/**
 * 接口调用链路记录。
 *
 * <p>页面主体是产品界面，但实验台必须能看到「这次点击背后发生了什么」：
 * 命中了哪一层缓存、走了几次回源、耗时多少、返回码是什么。
 * 这些信息统一收在这里，由右下角的可折叠抽屉展示，不占产品界面的视觉重心。
 */

/** 一次调用的记录。 */
export interface TraceEntry {
    id: number;
    method: string;
    url: string;
    elapsed: number;
    code: number;
    ok: boolean;
    message: string;
    summary: string;
    path: string;
    at: number;
}

/** 最多保留多少条。再多是内存浪费，也看不过来。 */
const MAX_ENTRIES = 80;

let seq = 0;

export const useTraceStore = defineStore('trace', {
    state: () => ({
        entries: [] as TraceEntry[],
        /** 是否继续记录，关掉之后新请求不再进列表 */
        enabled: true,
        /** 抽屉是否展开 */
        open: false,
        onlyCurrentPage: true,
    }),
    getters: {
        /**
         * 按当前页面过滤后的记录。
         *
         * @param state 当前状态
         * @returns 过滤后的记录
         */
        visible(state): TraceEntry[] {
            if (!state.onlyCurrentPage) {
                return state.entries;
            }
            const current = typeof window === 'undefined' ? '' : window.location.pathname;
            return state.entries.filter((item: TraceEntry) => item.path === current);
        },
        /**
         * 最近 N 条的平均耗时。
         *
         * @returns 平均毫秒数
         */
        avgElapsed(): number {
            const list = this.visible.slice(0, 10);
            if (list.length === 0) {
                return 0;
            }
            return Math.round(list.reduce((sum, item) => sum + item.elapsed, 0) / list.length);
        },
    },
    actions: {
        /**
         * 追加一条记录。
         *
         * @param entry 调用信息
         */
        push(entry: Omit<TraceEntry, 'id' | 'at'>) {
            if (!this.enabled) {
                return;
            }
            seq += 1;
            this.entries.unshift({ ...entry, id: seq, at: Date.now() });
            if (this.entries.length > MAX_ENTRIES) {
                this.entries = this.entries.slice(0, MAX_ENTRIES);
            }
        },
        /**
         * 清空记录。
         */
        clear() {
            this.entries = [];
        },
    },
});
