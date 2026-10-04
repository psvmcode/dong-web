import { postJson, postQuery } from './http';
import type { UserAccount } from './types';

/**
 * 第二数据源（MariaDB）接口。
 *
 * <p>多数据源的价值在于把「没环号的本地事务」和「有延迟的读」分开看，
 * consistency 接口连读两次，就是为了把复制延迟显式地暴露出来。
 */

/** 创建账户。 */
export function create(userId: number, username: string, balance = 0) {
    return postQuery<number>('/api/replica/accounts', { userId, username, balance });
}

/** 查询全部账户。 */
export function all() {
    return postJson<UserAccount[]>('/api/replica/accounts/all');
}

/** 按用户 id 查询账户。 */
export function detail(userId: number) {
    return postJson<UserAccount>('/api/replica/accounts/detail', { userId });
}

/** 两个账户之间转账，在单个本地事务内完成。 */
export function transfer(fromUserId: number, toUserId: number, amount: number) {
    return postQuery<number>('/api/replica/accounts/transfer', { fromUserId, toUserId, amount });
}

/** 连续读两次，观察是否存在延迟。 */
export function consistency(userId: number) {
    return postJson<Record<string, unknown>>('/api/replica/accounts/consistency', { userId });
}
