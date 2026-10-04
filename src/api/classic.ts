import { path, postJson, postQuery } from './http';
import type {
    ClassicIdGenerated,
    ClassicLockLabResult,
    ClassicRateLimitLabResult,
    NearbyPlaceResponse,
    RankItemResponse,
    ShortLinkResponse,
} from './types';

/**
 * Redis 经典玩法接口。
 *
 * <p>这一组实验的共同点是「同一个需求用 Redis 的哪种结构实现」：
 * bitmap 做签到、HyperLogLog 做 UV、zset 做排行榜、GEO 做附近的人、zset 做延迟队列。
 * 每个实验都配了历史记录接口，方便跨时间对比。
 */

// ------------------------------------------------------------------ 短链

/** 生成短链，返回短码。 */
export function createShortLink(url: string, expireMinutes?: number) {
    return postQuery<string>('/api/classic/short-link', { url, expireMinutes });
}

/** 查询短链详情。 */
export function shortLinkDetail(code: string) {
    return postJson<ShortLinkResponse>('/api/classic/short-link/detail', { code });
}

/** 解析短码为原始地址，并累加点击数。 */
export function resolveShortLink(code: string) {
    return postJson<string>('/api/classic/short-link/resolve', { code });
}

/** 查询点击次数。 */
export function shortLinkHits(code: string) {
    return postJson<number>('/api/classic/short-link/hits', { code });
}

/** 启停短链。 */
export function toggleShortLink(code: string, enabled: boolean) {
    return postQuery<null>('/api/classic/short-link/toggle', { code, enabled });
}

/** 把缓存中的点击计数回写数据库。 */
export function flushShortLinkHits() {
    return postJson<number>('/api/classic/short-link/flush-hits');
}

/** 按短码跳转式的解析，由调用方决定是否跳转。 */
export function shortLinkJump(code: string) {
    return postJson<string>(path('/api/classic/short-link/s/{code}', { code }));
}

// ------------------------------------------------------------------ 签到

/** 签到，false 表示当天已签过。 */
export function signIn(userId: string, date?: string) {
    return postQuery<boolean>('/api/classic/sign', { userId, date });
}

/** 查询指定日期是否已签到。 */
export function signStatus(userId: string, date: string) {
    return postJson<boolean>('/api/classic/sign/status', { userId, date });
}

/** 查询连续签到天数。 */
export function signStreak(userId: string, date: string) {
    return postJson<number>('/api/classic/sign/streak', { userId, date });
}

/** 查询当月累计签到天数。 */
export function signMonth(userId: string, month: string) {
    return postJson<number>('/api/classic/sign/month', { userId, month });
}

/** 查询当月签到日历。 */
export function signCalendar(userId: string, month: string) {
    return postJson<Record<string, boolean>>('/api/classic/sign/calendar', { userId, month });
}

// ------------------------------------------------------------------ UV

/** 记录一次访问，返回估算的独立访客数。 */
export function recordUv(page: string, visitorId: string, date?: string) {
    return postQuery<number>('/api/classic/uv/record', { page, visitorId, date });
}

/** 查询指定日期的独立访客数。 */
export function countUv(page: string, date: string) {
    return postJson<number>('/api/classic/uv/count', { page, date });
}

/** 查询日期区间的独立访客数，自动去重。 */
export function rangeUv(page: string, from: string, to: string) {
    return postJson<number>('/api/classic/uv/range', { page, from, to });
}

// ------------------------------------------------------------------ 排行榜

/** 提交分数，覆盖原有成绩。 */
export function submitScore(board: string, member: string, score: number) {
    return postQuery<null>('/api/classic/rank/submit', { board, member, score });
}

/** 累加分数。 */
export function addScore(board: string, member: string, delta: number) {
    return postQuery<number>('/api/classic/rank/add', { board, member, delta });
}

/** 查询前 N 名。 */
export function top(board: string, size: number) {
    return postJson<RankItemResponse[]>('/api/classic/rank/top', { board, size });
}

/** 查询某个成员的名次，从 0 开始。 */
export function rankOf(board: string, member: string) {
    return postJson<number>('/api/classic/rank/rank', { board, member });
}

/** 查询某个成员的分数。 */
export function scoreOf(board: string, member: string) {
    return postJson<number>('/api/classic/rank/score', { board, member });
}

/** 查询某个成员前后指定范围内的排名。 */
export function aroundRank(board: string, member: string, range: number) {
    return postJson<RankItemResponse[]>('/api/classic/rank/around', { board, member, range });
}

/** 查询排行榜总人数。 */
export function boardSize(board: string) {
    return postJson<number>('/api/classic/rank/size', { board });
}

/** 结算周榜。 */
export function settleWeekly(board: string, date?: string) {
    return postQuery<number>('/api/classic/rank/settle-weekly', { board, date });
}

/** 清空排行榜。 */
export function clearBoard(board: string) {
    return postQuery<null>('/api/classic/rank/clear', { board });
}

// ------------------------------------------------------------------ GEO

/** 添加地理位置坐标。 */
export function addGeo(city: string, member: string, longitude: number, latitude: number) {
    return postQuery<number>('/api/classic/geo', { city, member, longitude, latitude });
}

/** 查询指定坐标附近范围内的成员。 */
export function nearbyGeo(city: string, longitude: number, latitude: number, radiusKm: number, limit: number) {
    return postJson<NearbyPlaceResponse[]>('/api/classic/geo/nearby', { city, longitude, latitude, radiusKm, limit });
}

/** 计算两个成员之间的距离。 */
export function geoDistance(city: string, first: string, second: string) {
    return postJson<number>('/api/classic/geo/distance', { city, first, second });
}

// ------------------------------------------------------------------ 延迟队列

/** 投递延迟任务。 */
export function offerDelay(payload: string, delaySeconds: number) {
    return postQuery<null>('/api/classic/delay-queue/offer', { payload, delaySeconds });
}

/** 取出已到期的延迟任务。 */
export function takeDelay(limit: number) {
    return postJson<string[]>('/api/classic/delay-queue/take', { limit });
}

/** 查询待消费数量。 */
export function delaySize() {
    return postJson<number>('/api/classic/delay-queue/size');
}

// ------------------------------------------------------------------ 发号器 / 锁 / 限流

/** 按策略批量生成 id。 */
export function generateIds(strategy: string, count: number) {
    return postJson<Record<string, unknown>>('/api/classic/id', { strategy, count });
}

/** 查询发号器历史记录。 */
export function idRecords(strategy: string, limit = 10) {
    return postJson<ClassicIdGenerated[]>('/api/classic/lab-record/id', { strategy, limit });
}

/** 不加锁的并发自增，对照组。 */
export function lockWithout(threads: number, loops: number) {
    return postJson<Record<string, unknown>>('/api/classic/lock/without-lock', { threads, loops });
}

/** 加 Redisson 锁的并发自增。 */
export function lockWith(threads: number, loops: number) {
    return postJson<Record<string, unknown>>('/api/classic/lock/with-lock', { threads, loops });
}

/** 查询锁实验历史结果。 */
export function lockRecords(mode: string, limit = 10) {
    return postJson<ClassicLockLabResult[]>('/api/classic/lab-record/lock', { mode, limit });
}

/** 用指定算法尝试获取一次配额。 */
export function limiterTry(key: string, algorithm: string, limit: number, windowSeconds: number, distributed: boolean) {
    return postJson<boolean>('/api/classic/limiter/try', { key, algorithm, limit, windowSeconds, distributed });
}

/** 对比四种限流算法的两轮突发表现。 */
export function limiterCompare(body: {
    bizKey: string;
    limit: number;
    windowSeconds: number;
    attempts: number;
    distributed: boolean;
    gapMillis: number;
}) {
    return postJson<Record<string, unknown>>('/api/classic/limiter/compare', body);
}

/** 查询限流对比历史结果。 */
export function limiterRecords(bizKey: string, limit = 10) {
    return postJson<ClassicRateLimitLabResult[]>('/api/classic/lab-record/limiter', { bizKey, limit });
}
