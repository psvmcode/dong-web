import axios, { type AxiosResponse } from 'axios';
import { useTraceStore } from '@/stores/trace';

/**
 * 后端统一响应信封。后端的 Result<T> 序列化后就是这四个字段，
 * code 为 0 表示成功，其余是 Constants 里定义的业务错误码。
 */
export interface ApiEnvelope<T> {
    code: number;
    message: string;
    data: T;
    timestamp: number;
}

/**
 * 前端拿到的一次调用快照。比信封多了 elapsed，用来在同一屏对比不同方案的耗时。
 */
export interface ApiResult<T> {
    ok: boolean;
    code: number;
    message: string;
    data: T;
    elapsed: number;
}

/**
 * 允许出现在查询串与请求体里的参数值。
 */
export type ParamValue = string | number | boolean | null | undefined;

/**
 * 通用参数字典。
 */
export type Params = Record<string, ParamValue>;

const http = axios.create({
    baseURL: '/',
    timeout: 120_000,
    headers: { 'Content-Type': 'application/json' },
});

/**
 * 把参数拼成 query string。
 *
 * <p>后端的 POST 接口分两派：一派收 JSON body，另一派仍是 @RequestParam。
 * 后者没有 body，参数只能挂在 URL 上，所以这里统一用 query string 承载。
 * 空值与 undefined 一律丢掉，让后端的 defaultValue 与 @Size 校验生效，
 * 而不是发一个空字符串过去。
 */
function toQueryString(params?: Params): string {
    if (!params) {
        return '';
    }
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') {
            continue;
        }
        search.append(key, String(value));
    }
    const query = search.toString();
    return query ? `?${query}` : '';
}

/**
 * 抽取异常里的可读信息。业务异常由后端统一包装成 Result，
 * 走到这里的都是网络层失败，或者压根没进到 Controller。
 */
function readError(error: unknown): string {
    if (axios.isAxiosError(error)) {
        const response = error.response;
        if (response) {
            return `HTTP ${response.status} ${response.statusText || ''}`.trim();
        }
        if (error.code === 'ECONNABORTED') {
            return '请求超时，后端未在超时时间内响应';
        }
        return '无法连接后端，请确认 dong 后端已启动且代理地址正确';
    }
    return error instanceof Error ? error.message : String(error);
}

/**
 * 把一次 axios 调用收敛成不会抛异常的 ApiResult。
 *
 * <p>实验台大量用到「同一屏对比多个接口」，任何一个抛异常都会把 Promise.all 打断，
 * 所以这里把失败也当成一种结果返回，由页面决定怎么展示。
 */
async function unwrap<T>(
    method: string,
    url: string,
    run: () => Promise<AxiosResponse<ApiEnvelope<T>>>,
): Promise<ApiResult<T>> {
    const start = performance.now();
    const record = (result: ApiResult<T>) => {
        recordTrace(method, url, result);
        return result;
    };
    try {
        const response = await run();
        const body = response.data;
        return record({
            ok: body.code === 0,
            code: body.code,
            message: body.message,
            data: body.data,
            elapsed: Math.round(performance.now() - start),
        });
    } catch (error) {
        const message = readError(error);
        return record({
            ok: false,
            code: -1,
            message,
            data: null as T,
            elapsed: Math.round(performance.now() - start),
        });
    }
}

/**
 * 把一次调用写进链路记录。
 *
 * <p>放在这里而不是各个页面里，是为了保证「只要发过请求就一定有记录」——
 * 靠页面自己上报，漏一个就少一条，排查时最难的就是「少了的那一条」。
 *
 * @param method HTTP 方法
 * @param url 接口路径
 * @param result 调用结果
 */
function recordTrace(method: string, url: string, result: ApiResult<unknown>): void {
    try {
        useTraceStore().push({
            method,
            url,
            elapsed: result.elapsed,
            code: result.code,
            ok: result.ok,
            message: result.message,
            summary: summarize(result.data),
            path: typeof window === 'undefined' ? '' : window.location.pathname,
        });
    } catch {
        // 链路记录是旁路功能，Pinia 还没就绪时也不能影响业务请求
    }
}

/**
 * 把响应体压成一行摘要，方便在链路里扫一眼。
 *
 * @param data 响应数据
 */
function summarize(data: unknown): string {
    if (data === null || data === undefined) {
        return '';
    }
    if (typeof data === 'string') {
        return data.length > 80 ? `${data.slice(0, 80)}…` : data;
    }
    if (typeof data === 'number' || typeof data === 'boolean') {
        return String(data);
    }
    if (Array.isArray(data)) {
        return `${data.length} 条`;
    }
    const entries = Object.entries(data as Record<string, unknown>);
    return entries
        .slice(0, 5)
        .map(([key, value]) => `${key}=${typeof value === 'object' ? '…' : value}`)
        .join(' ');
}

/**
 * 发 JSON body 的 POST / PUT 请求。
 *
 * @param url 接口路径
 * @param body 请求体，后端对可空字段一律容忍 null
 */
export function postJson<T>(url: string, body?: unknown): Promise<ApiResult<T>> {
    return unwrap<T>('POST', url, () => http.post<ApiEnvelope<T>>(url, body ?? {}));
}

/**
 * 参数走 query string 的请求，对应后端的 @RequestParam 接口。
 *
 * @param url 接口路径
 * @param params 查询参数
 */
export function postQuery<T>(url: string, params?: Params): Promise<ApiResult<T>> {
    return unwrap<T>('POST', url + toQueryString(params), () => http.post<ApiEnvelope<T>>(url + toQueryString(params)));
}

/**
 * 带查询参数的自定义请求，用于 DELETE 这类需要 ?xxx= 的方法。
 *
 * @param url 接口路径
 * @param params 查询参数
 */
export function deleteQuery<T>(url: string, params?: Params): Promise<ApiResult<T>> {
    return unwrap<T>('DELETE', url + toQueryString(params), () =>
        http.delete<ApiEnvelope<T>>(url + toQueryString(params)),
    );
}

/**
 * PUT + JSON body。
 *
 * @param url 接口路径
 * @param body 请求体
 */
export function putJson<T>(url: string, body?: unknown): Promise<ApiResult<T>> {
    return unwrap<T>('PUT', url, () => http.put<ApiEnvelope<T>>(url, body ?? {}));
}

/**
 * GET 请求，只访问 actuator 这类非业务端点。
 *
 * @param url 接口路径
 */
export function getJson<T>(url: string): Promise<ApiResult<T>> {
    return unwrap<T>('GET', url, () => http.get<ApiEnvelope<T>>(url));
}

/**
 * 直接取原始响应体，用于 actuator 这种不套 Result 信封的端点。
 *
 * @param url 接口路径
 */
export async function getRaw<T>(url: string): Promise<T | null> {
    try {
        const response = await http.get<T>(url);
        return response.data;
    } catch {
        return null;
    }
}

/**
 * 把后端路径模板里的占位符替换成真实值。
 *
 * @param template 形如 /api/order/{orderNo}/events 的模板
 * @param values 占位符取值
 */
export function path(template: string, values: Params): string {
    return template.replace(/\{(\w+)\}/g, (_, key: string) => {
        const value = values[key];
        return value === undefined || value === null ? '' : encodeURIComponent(String(value));
    });
}

/**
 * 把 query string 拼到已经写好的路径上。
 *
 * @param url 接口路径
 * @param params 查询参数
 */
export function withQuery(url: string, params?: Params): string {
    return url + toQueryString(params);
}

export { http, toQueryString };
