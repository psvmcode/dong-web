import { path, postJson, postQuery } from './http';
import type { TccBranch, TccOrderRequest, TccResultResponse } from './types';

/**
 * TCC 分布式事务接口。
 *
 * <p>Try / Confirm / Cancel 三个阶段都不能假想成功，
 * 所以每个接口都把 xid 暴露出来，方便「看分支状态 → 手工 recover」这条恢复链路。
 */

/** 初始化库存与账户。 */
export function seed(userId: number, productId: number, available = 100, balance = 100000) {
    return postQuery<null>('/api/tcc/seed', { userId, productId, available, balance });
}

/** 提交分布式订单。 */
export function submit(body: TccOrderRequest) {
    return postJson<TccResultResponse>('/api/tcc/order', body);
}

/** 查询事务状态。 */
export function status(xid: string) {
    return postJson<Record<string, unknown>>(path('/api/tcc/{xid}', { xid }));
}

/** 查询事务分支。 */
export function branches(xid: string) {
    return postJson<TccBranch[]>(path('/api/tcc/{xid}/branches', { xid }));
}

/** 手工恢复停留在中间状态的事务。 */
export function recover() {
    return postJson<number>('/api/tcc/recover');
}
