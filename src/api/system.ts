import { getRaw } from './http';

/**
 * 后端自身的运维端点。actuator 不套 Result 信封，所以单独走 getRaw。
 */

/** 健康检查元数据。 */
export interface HealthBody {
    status: string;
    components?: Record<string, { status: string; details?: Record<string, unknown> }>;
}

/**
 * 拉取健康检查。
 *
 * @returns health 响应体，后端不可达时返回 null
 */
export function health(): Promise<HealthBody | null> {
    return getRaw<HealthBody>('/actuator/health');
}
