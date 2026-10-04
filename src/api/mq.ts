import { postJson, postQuery } from './http';
import type { MqMessageLog } from './types';

/**
 * 消息队列实验接口。
 *
 * <p>同一套接口背后可以是 RocketMQ、Kafka 或本地实现，
 * status 接口会告诉你当前生效的是哪一个，对比才有意义。
 */

/** 查看当前生效的消息传输实现。 */
export function status() {
    return postJson<Record<string, unknown>>('/api/mq/status');
}

/** 发送普通消息。 */
export function send(topic: string, key: string, payload: string) {
    return postQuery<null>('/api/mq/send', { topic, key, payload });
}

/** 发送延迟消息。 */
export function sendDelayed(topic: string, key: string, delaySeconds: number) {
    return postQuery<null>('/api/mq/send-delayed', { topic, key, delaySeconds });
}

/** 发送顺序消息。 */
export function sendOrdered(topic: string, key: string, shardingKey: string) {
    return postQuery<null>('/api/mq/send-ordered', { topic, key, shardingKey });
}

/** 批量发送消息。 */
export function sendBatch(topic: string, keyPrefix: string, count: number) {
    return postQuery<null>('/api/mq/send-batch', { topic, keyPrefix, count });
}

/** 查看投递日志。 */
export function logs(limit = 20) {
    return postJson<MqMessageLog[]>('/api/mq/logs', { limit });
}

/** 查看消费统计，含重复投递计数。 */
export function stats() {
    return postJson<Record<string, unknown>>('/api/mq/stats');
}
