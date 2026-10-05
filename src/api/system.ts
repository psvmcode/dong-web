import { getRawTolerant, postJson } from './http';

/**
 * 后端自身的运维端点。actuator 不套 Result 信封，所以单独走原始响应。
 */

/** 健康检查响应体。 */
export interface HealthBody {
    status: string;
    components?: Record<string, { status: string; details?: Record<string, unknown> }>;
}

/** 一次探活的结论。 */
export interface HealthProbe {
    /** 进程是否活着——只要拿到了响应就算活着 */
    reachable: boolean;
    /** actuator 给出的总状态：UP / DOWN / UNKNOWN */
    status: string;
    /** actuator 的 HTTP 状态码，503 表示有组件不可用 */
    httpStatus: number;
    /** 各组件状态 */
    components: Record<string, { status: string; details?: Record<string, unknown> }>;
    /** 探测方式与异常说明 */
    note: string;
}

/**
 * 探测后端健康状态。
 *
 * <p>分两层判断，避免把两件完全不同的事混为一谈：
 * <ol>
 *   <li>拿到 actuator 响应（含 503）→ 进程活着，status 原样透出，由页面提示「N 个组件不可用」</li>
 *   <li>actuator 拿不到 → 退回业务接口探活；业务通了说明只是 actuator 不可用，仍然算在线</li>
 * </ol>
 * 只有两层都失败，才判定为「连不上」。
 */
export async function probeHealth(): Promise<HealthProbe> {
    const raw = await getRawTolerant<HealthBody>('/actuator/health');
    if (raw && raw.body && typeof raw.body.status === 'string') {
        return {
            reachable: true,
            status: raw.body.status,
            httpStatus: raw.status,
            components: raw.body.components ?? {},
            note: raw.status === 200 ? '' : `actuator 返回 HTTP ${raw.status}，属降级运行`,
        };
    }

    const fallback = await postJson<Record<string, unknown>>('/api/mq/status');
    if (fallback.ok) {
        return {
            reachable: true,
            status: 'UNKNOWN',
            httpStatus: raw?.status ?? 0,
            components: {},
            note: 'actuator 不可用，但业务接口正常，判定为在线',
        };
    }

    return {
        reachable: false,
        status: 'DOWN',
        httpStatus: raw?.status ?? 0,
        components: {},
        note: fallback.message,
    };
}
