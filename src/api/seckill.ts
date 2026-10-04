import { path, postJson, postQuery } from './http';
import type {
    SeckillActivityRequest,
    SeckillActivityResponse,
    SeckillOrderResponse,
    SeckillReceiptResponse,
} from './types';

/**
 * 秒杀实验接口。
 *
 * <p>这里的重点不是下单本身，而是四道防线的顺序：
 * 限流 → 本地售罄标记 → Lua 原子扣减 → DB 唯一索引。
 * 前端可以一次性放 N 个并发请求过去，看 receipte 里每道防线各拦下多少。
 */

/** 创建秒杀活动。 */
export function createActivity(body: SeckillActivityRequest) {
    return postJson<number>('/api/seckill/activities', body);
}

/** 查询全部活动。 */
export function listActivities() {
    return postJson<SeckillActivityResponse[]>('/api/seckill/activities/list');
}

/** 预热库存到 Redis 并开启活动。 */
export function prepare(id: number) {
    return postJson<number>(path('/api/seckill/activities/{id}/prepare', { id }));
}

/** 查询 Redis 剩余库存。 */
export function stock(id: number) {
    return postJson<number>(path('/api/seckill/activities/{id}/stock', { id }));
}

/** 秒杀下单。userId 变化才会绕过「同一用户限购」这道去重。 */
export function seckill(id: number, userId: number, quantity = 1) {
    return postQuery<SeckillReceiptResponse>(path('/api/seckill/activities/{id}/seckill', { id }), {
        userId,
        quantity,
    });
}

/** 查询秒杀订单。 */
export function orderDetail(orderNo: string) {
    return postJson<SeckillOrderResponse>(path('/api/seckill/orders/{orderNo}', { orderNo }));
}

/** 支付秒杀订单。 */
export function payOrder(orderNo: string) {
    return postJson<null>(path('/api/seckill/orders/{orderNo}/pay', { orderNo }));
}

/** 取消订单并回滚库存。 */
export function cancelOrder(orderNo: string) {
    return postJson<null>(path('/api/seckill/orders/{orderNo}/cancel', { orderNo }));
}

/** 秒杀运行时状态。 */
export function runtime() {
    return postJson<Record<string, unknown>>('/api/seckill/runtime');
}
