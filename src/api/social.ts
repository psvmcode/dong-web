import { postJson, postQuery } from './http';
import type { FeedResponse } from './types';

/**
 * 社交关系与时间线接口。
 *
 * <p>关注关系是 Redis set 的典型用法，时间线则是推 / 拉两种模式的对照：
 * 同样的结果，一个在写时扇出，一个在读时聚合。
 */

/** 关注某个用户。 */
export function follow(followerId: number, followeeId: number) {
    return postQuery<null>('/api/social/follow', { followerId, followeeId });
}

/** 取消关注。 */
export function unfollow(followerId: number, followeeId: number) {
    return postQuery<null>('/api/social/unfollow', { followerId, followeeId });
}

/** 判断是否已关注。 */
export function isFollowing(followerId: number, followeeId: number) {
    return postJson<boolean>('/api/social/is-following', { followerId, followeeId });
}

/** 查询关注的人。 */
export function followees(userId: number) {
    return postJson<number[]>('/api/social/followees', { userId });
}

/** 查询粉丝。 */
export function followers(userId: number) {
    return postJson<number[]>('/api/social/followers', { userId });
}

/** 查询关注数与粉丝数。 */
export function counts(userId: number) {
    return postJson<Record<string, number>>('/api/social/counts', { userId });
}

/** 查询共同关注。 */
export function commonFollowees(firstUserId: number, secondUserId: number) {
    return postJson<number[]>('/api/social/common-followees', { firstUserId, secondUserId });
}

/** 查询用户关系总览。 */
export function summary(userId: number) {
    return postJson<Record<string, unknown>>('/api/social/summary', { userId });
}

/** 发布动态，同时触发推模式扇出。 */
export function publishFeed(authorId: number, content: string) {
    return postQuery<number>('/api/social/feed', { authorId, content });
}

/** 给动态点赞。 */
export function like(feedId: number) {
    return postQuery<number>('/api/social/feed/like', { feedId });
}

/** 推模式时间线。 */
export function timelinePush(userId: number, size: number) {
    return postJson<FeedResponse[]>('/api/social/timeline/push', { userId, size });
}

/** 拉模式时间线。 */
export function timelinePull(userId: number, pageNum: number, pageSize: number) {
    return postJson<FeedResponse[]>('/api/social/timeline/pull', { userId, pageNum, pageSize });
}
