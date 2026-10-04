import { deleteQuery, path, postJson, postQuery } from './http';
import type {
    OrderBenchmarkResponse,
    OrderCreateRequest,
    OrderFireRequest,
    OrderResponse,
    OrderTransitionLogResponse,
} from './types';

/**
 * 订单状态机接口。
 *
 * <p>状态只能由事件推进，前端因此要先查 available-events 再决定按钮，
 * 而不是把 nine 个事件全列出来让用户试错。
 */

/** 创建订单，返回订单号。 */
export function create(body: OrderCreateRequest) {
    return postJson<string>('/api/order', body);
}

/** 查询订单详情。 */
export function detail(orderNo: string) {
    return postJson<OrderResponse>(path('/api/order/{orderNo}', { orderNo }));
}

/** 查询当前状态可触发的事件。 */
export function availableEvents(orderNo: string) {
    return postJson<string[]>(path('/api/order/{orderNo}/available-events', { orderNo }));
}

/** 触发事件推进状态。 */
export function fire(orderNo: string, body: OrderFireRequest) {
    return postJson<OrderResponse>(path('/api/order/{orderNo}/events', { orderNo }), body);
}

/** 查询状态流转日志。 */
export function logs(orderNo: string) {
    return postJson<OrderTransitionLogResponse[]>(path('/api/order/{orderNo}/logs', { orderNo }));
}

/** 查询最近创建的订单。 */
export function recent(limit = 10) {
    return postJson<OrderResponse[]>('/api/order/recent', { limit });
}

/** 并发推进对比实验，mode 传 cas 或 none。 */
export function benchmark(orderNo: string, mode: string, threads = 8) {
    return postQuery<OrderBenchmarkResponse>('/api/order/benchmark', { orderNo, mode, threads });
}

/** 导出 PlantUML 状态机图。 */
export function plantuml() {
    return postJson<string>('/api/order/state-machine/plantuml');
}

/** 删除订单及其流转日志。 */
export function remove(orderNo: string) {
    return deleteQuery<null>(path('/api/order/{orderNo}', { orderNo }));
}
