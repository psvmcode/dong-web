import { postJson, postQuery } from './http';
import type {
    GrabResultResponse,
    RedPacketRecord,
    RedPacketResponse,
    RedPacketSendRequest,
} from './types';

/**
 * 红包接口。
 *
 * <p>份额表是权威源，Redis 队列只是副本。
 * 前端并发抢的重点在于验证「同一份额不会被两个人拿到」，
 * 以及副本丢失后 rebuild 能否把队列补回来。
 */

/** 发红包，金额预先分配并写入 Redis。 */
export function send(body: RedPacketSendRequest) {
    return postJson<string>('/api/red-packet/send', body);
}

/** 抢红包。 */
export function grab(packetNo: string, userId: number) {
    return postQuery<GrabResultResponse>('/api/red-packet/grab', { packetNo, userId });
}

/** 查询红包详情。 */
export function detail(packetNo: string) {
    return postJson<RedPacketResponse>('/api/red-packet', { packetNo });
}

/** 查询领取记录。 */
export function records(packetNo: string) {
    return postJson<RedPacketRecord[]>('/api/red-packet/records', { packetNo });
}

/** 查询剩余份数与金额。 */
export function remain(packetNo: string) {
    return postJson<Record<string, unknown>>('/api/red-packet/remain', { packetNo });
}

/** 从数据库重建库存副本。 */
export function rebuild(packetNo: string) {
    return postQuery<boolean>('/api/red-packet/rebuild', { packetNo });
}

/** 抢红包运行时状态。 */
export function runtime() {
    return postJson<Record<string, unknown>>('/api/red-packet/runtime');
}
