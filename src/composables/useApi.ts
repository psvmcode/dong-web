import { ref, shallowRef, type Ref, type ShallowRef } from 'vue';
import { ElMessage } from 'element-plus';
import type { ApiResult } from '@/api/http';

/**
 * 统一的「调用 → 装载 → 结果」状态容器。
 *
 * <p>实验台的页面几乎都是同一个形状：一个表单、一个按钮、一个结果面板。
 * 把 loading / result / call 抽出来之后，页面里就只剩业务本身，
 * 也不用担心忘记在 finally 里关 loading。
 *
 * <p>result 用 shallowRef：结果对象一经落地不会再改，深层响应式在这里纯属浪费。
 */
export interface UseApi<T> {
    loading: Ref<boolean>;
    result: ShallowRef<ApiResult<T> | null>;
    call: (runner: () => Promise<ApiResult<T>>, options?: { toast?: boolean }) => Promise<ApiResult<T>>;
    reset: () => void;
}

/**
 * 创建一次接口调用的状态容器。
 *
 * @returns loading / result / call / reset
 */
export function useApi<T = unknown>(): UseApi<T> {
    const loading = ref(false);
    const result = shallowRef<ApiResult<T> | null>(null);

    /**
     * 执行一次接口调用，把结果放进 result。
     *
     * @param runner 真正发请求的函数
     * @param options toast 为 true 时在业务失败时弹提示
     */
    async function call(runner: () => Promise<ApiResult<T>>, options?: { toast?: boolean }) {
        loading.value = true;
        try {
            const value = await runner();
            result.value = value;
            if (options?.toast && !value.ok) {
                ElMessage.error(`${value.code} ${value.message}`);
            }
            return value;
        } finally {
            loading.value = false;
        }
    }

    /**
     * 清空上一次结果。
     */
    function reset() {
        result.value = null;
    }

    return { loading, result, call, reset };
}

/**
 * 并发压测的统一执行器。
 *
 * <p>一次性放出 concurrency 个请求，不做分批：
 * 既然实验目的就是看同一瞬间的竞争，加延迟等于把实验本身改了。
 * 结果不逐条塞进响应式对象，只在最后汇总，避免几百个 proxy 拖慢页面。
 *
 * @param concurrency 并发数
 * @param factory 按下标生成单次调用
 */
export interface BurstSummary {
    total: number;
    success: number;
    failed: number;
    elapsedMs: number;
    messages: Record<string, number>;
}

/**
 * 执行一轮并发压测。
 *
 * @param concurrency 并发数
 * @param factory 按下标生成一次请求
 */
export async function runBurst<T>(
    concurrency: number,
    factory: (index: number) => Promise<ApiResult<T>>,
): Promise<BurstSummary> {
    const start = performance.now();
    const tasks = Array.from({ length: concurrency }, (_, index) => factory(index));
    const settled = await Promise.allSettled(tasks);
    const messages: Record<string, number> = {};
    let success = 0;
    let failed = 0;

    settled.forEach((item) => {
        if (item.status === 'rejected') {
            failed += 1;
            messages['网络异常'] = (messages['网络异常'] ?? 0) + 1;
            return;
        }
        const value = item.value;
        if (value.ok) {
            success += 1;
            return;
        }
        failed += 1;
        const key = `${value.code} ${value.message}`;
        messages[key] = (messages[key] ?? 0) + 1;
    });

    return {
        total: concurrency,
        success,
        failed,
        elapsedMs: Math.round(performance.now() - start),
        messages,
    };
}

/**
 * 把并发结果按某个谓词归类，用于「成功 N 份 / 库存不足 M 份」这类展示。
 *
 * @param values 每次调用的结果
 * @param pick 从成功结果里取出用于统计的键
 */
export function groupByMessage<T>(values: ApiResult<T>[]): Record<string, number> {
    const bucket: Record<string, number> = {};
    for (const value of values) {
        const key = value.ok ? '成功' : `${value.code} ${value.message}`;
        bucket[key] = (bucket[key] ?? 0) + 1;
    }
    return bucket;
}

/**
 * 按数值区间做直方图分桶，页面用它把 100 次并发的耗时分布画出来。
 *
 * @param values 数值序列
 * @param bucketCount 桶数
 */
export function histogram(values: number[], bucketCount = 8): { label: string; count: number }[] {
    if (values.length === 0) {
        return [];
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const width = (max - min) / bucketCount || 1;
    const buckets = Array.from({ length: bucketCount }, () => 0);
    for (const value of values) {
        const index = Math.min(bucketCount - 1, Math.floor((value - min) / width));
        buckets[index] += 1;
    }
    return buckets.map((count, index) => ({
        label: `${Math.round(min + index * width)}~${Math.round(min + (index + 1) * width)}`,
        count,
    }));
}
