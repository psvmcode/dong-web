<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { RefreshRight, Star } from '@element-plus/icons-vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/social';
import type { FeedResponse } from '@/api/types';
import { avatarColor, initialOf } from '@/utils/scene';

/**
 * 朋友圈 / 动态流。
 *
 * <p>这一页的看点是「同一份内容，两种读法」：
 * 推模式在发布时就把动态扇出给每个粉丝，拉模式在读的时候才把关注者的动态聚合起来。
 * 表面上看到的东西一样，代价完全不同——页面把两种模式的耗时并排放在右上角，
 * 切换一次就能体会到写扩散和读扩散的差别。
 */

const me = ref(1);
const mode = ref<'push' | 'pull'>('push');
const composer = reactive({ content: '' });

const { loading: pushLoading, result: pushResult, call: callPush } = useApi<FeedResponse[]>();
const { loading: pullLoading, result: pullResult, call: callPull } = useApi<FeedResponse[]>();
const { result: publishResult, call: callPublish } = useApi<number>();
const { result: likeResult, call: callLike } = useApi<number>();
const { result: countsResult, call: callCounts } = useApi<Record<string, number>>();
const { result: commonResult, call: callCommon } = useApi<number[]>();

const relation = reactive({ targetId: 2, firstId: 1, secondId: 2 });

const feed = computed<FeedResponse[]>(() => {
    const source = mode.value === 'push' ? pushResult.value : pullResult.value;
    return source?.ok && source.data ? source.data : [];
});
const loading = computed(() => (mode.value === 'push' ? pushLoading.value : pullLoading.value));
const elapsed = computed(() => {
    const source = mode.value === 'push' ? pushResult.value : pullResult.value;
    return source ? source.elapsed : null;
});
const pushElapsed = computed(() => (pushResult.value ? pushResult.value.elapsed : null));
const pullElapsed = computed(() => (pullResult.value ? pullResult.value.elapsed : null));
const common = computed<number[]>(() => (commonResult.value?.ok && commonResult.value.data ? commonResult.value.data : []));

/**
 * 读取当前模式的时间线。
 */
function loadFeed() {
    if (mode.value === 'push') {
        void callPush(() => api.timelinePush(me.value, 20));
    } else {
        void callPull(() => api.timelinePull(me.value, 1, 20));
    }
}

/**
 * 两种模式都读一次，用于对比耗时。
 */
async function loadBoth() {
    await callPush(() => api.timelinePush(me.value, 20));
    await callPull(() => api.timelinePull(me.value, 1, 20));
}

/**
 * 发布动态。推模式下这一步会同时扇出给所有粉丝。
 */
async function publish() {
    if (!composer.content.trim()) {
        ElMessage.warning('先写点什么');
        return;
    }
    const res = await callPublish(() => api.publishFeed(me.value, composer.content));
    if (res.ok) {
        composer.content = '';
        ElMessage.success('已发布');
        await loadBoth();
    }
}

/**
 * 点赞。
 *
 * @param feedId 动态 id
 */
async function like(feedId: number) {
    const res = await callLike(() => api.like(feedId));
    if (res.ok) {
        ElMessage.success(`点赞成功，当前 ${res.data} 个赞`);
        await loadBoth();
    }
}

/**
 * 关注或取关。
 *
 * @param follow 关注为 true，取关为 false
 */
async function toggleFollow(follow: boolean) {
    const runner = () => (follow ? api.follow(me.value, relation.targetId) : api.unfollow(me.value, relation.targetId));
    await runner();
    ElMessage.success(follow ? `已关注 ${relation.targetId}` : `已取关 ${relation.targetId}`);
    await loadBoth();
    void callCounts(() => api.counts(me.value));
}

/**
 * 一键准备演示关系与内容。
 */
async function seed() {
    await Promise.all([
        api.follow(1, 2),
        api.follow(1, 3),
        api.follow(2, 3),
        api.publishFeed(2, '今天把 Redis 的 zset 源码读完了，跳表实现比想象中简洁。'),
        api.publishFeed(3, '压测发现令牌桶在突发场景下放行量比滑动窗口高一倍，值得单独写一篇。'),
        api.publishFeed(2, '布隆过滤器误判率调到 1% 之后，穿透实验的回源次数降了一个数量级。'),
    ]);
    ElMessage.success('已关注 2、3 号并发了 3 条动态');
    await loadBoth();
    void callCounts(() => api.counts(me.value));
}

/**
 * 查共同关注。
 */
function queryCommon() {
    void callCommon(() => api.commonFollowees(relation.firstId, relation.secondId));
}

/**
 * 头像底色。
 *
 * @param id 用户 id
 */
function color(id: number): string {
    return avatarColor(id);
}

/**
 * 昵称。真实系统里是昵称表，这里用 id 生成一个稳定的称呼。
 *
 * @param id 用户 id
 */
function nickname(id: number): string {
    return `实验员 ${id}`;
}

onMounted(() => {
    void loadBoth();
    void callCounts(() => api.counts(me.value));
});
</script>

<template>
    <div class="feed">
        <div class="feed__main">
            <div class="feed__composer">
                <div class="feed__composer-avatar" :style="{ background: color(me) }">{{ initialOf(nickname(me)) }}</div>
                <el-input
                    v-model="composer.content"
                    type="textarea"
                    :rows="2"
                    maxlength="4096"
                    placeholder="分享一条技术心得…"
                />
                <el-button type="primary" @click="publish">发布</el-button>
            </div>

            <div class="feed__switch">
                <div class="feed__tabs">
                    <span :class="{ 'is-on': mode === 'push' }" @click="mode = 'push'">推模式</span>
                    <span :class="{ 'is-on': mode === 'pull' }" @click="mode = 'pull'">拉模式</span>
                </div>
                <span class="lab-spacer" />
                <span class="feed__elapsed">
                    本次读取 {{ elapsed === null ? '-' : `${elapsed} ms` }}
                </span>
                <el-button size="small" :icon="RefreshRight" @click="loadBoth()">两种都读一次</el-button>
            </div>

            <el-skeleton :loading="loading && feed.length === 0" animated :count="2">
                <template #template>
                    <div class="feed__item">
                        <el-skeleton-item variant="circle" style="width: 42px; height: 42px" />
                        <div style="flex: 1">
                            <el-skeleton-item variant="text" style="width: 30%" />
                            <el-skeleton-item variant="text" />
                        </div>
                    </div>
                </template>
                <template #default>
                    <article v-for="item in feed" :key="item.feedId" class="feed__item">
                        <div class="feed__avatar" :style="{ background: color(item.authorId) }">
                            {{ initialOf(nickname(item.authorId)) }}
                        </div>
                        <div class="feed__body">
                            <div class="feed__author">
                                {{ nickname(item.authorId) }}
                                <el-tag v-if="item.authorId === me" size="small" type="danger" effect="plain">我</el-tag>
                            </div>
                            <p class="feed__content">{{ item.content }}</p>
                            <div class="feed__ops">
                                <span class="feed__time">{{ item.createTime }}</span>
                                <el-button link size="small" @click="like(item.feedId)">
                                    <el-icon><Star /></el-icon>
                                    赞 {{ item.likeCount }}
                                </el-button>
                            </div>
                        </div>
                    </article>
                    <div v-if="feed.length === 0" class="feed__empty">
                        <div>时间线还是空的</div>
                        <div class="lab-hint">点右边「一键准备演示数据」，会自动关注两个并发几条动态。</div>
                    </div>
                </template>
            </el-skeleton>
        </div>

        <aside class="feed__side">
            <div class="feed__card">
                <div class="feed__card-title">我的关系</div>
                <div class="feed__me">
                    <div class="feed__me-avatar" :style="{ background: color(me) }">{{ initialOf(nickname(me)) }}</div>
                    <div>
                        <div class="feed__me-name">{{ nickname(me) }}</div>
                        <div class="feed__me-meta">
                            关注 {{ countsResult?.ok ? (countsResult.data.following ?? 0) : '-' }} ·
                            粉丝 {{ countsResult?.ok ? (countsResult.data.followers ?? 0) : '-' }}
                        </div>
                    </div>
                </div>
                <div class="lab-row">
                    <el-input-number v-model="me" :min="1" size="small" controls-position="right" />
                    <el-button size="small" @click="loadBoth(); callCounts(() => api.counts(me))">切换身份</el-button>
                </div>
            </div>

            <div class="feed__card">
                <div class="feed__card-title">关注 / 取关</div>
                <div class="lab-row">
                    <el-input-number v-model="relation.targetId" :min="1" size="small" controls-position="right" />
                    <el-button size="small" type="primary" @click="toggleFollow(true)">关注</el-button>
                    <el-button size="small" @click="toggleFollow(false)">取关</el-button>
                </div>
                <el-divider style="margin: 14px 0" />
                <div class="feed__card-title">共同关注</div>
                <div class="lab-row">
                    <el-input-number v-model="relation.firstId" :min="1" size="small" controls-position="right" />
                    <el-input-number v-model="relation.secondId" :min="1" size="small" controls-position="right" />
                    <el-button size="small" @click="queryCommon">求交集</el-button>
                </div>
                <div class="lab-row" style="margin-top: 8px">
                    <el-tag v-for="id in common" :key="id" size="small" effect="light">实验员 {{ id }}</el-tag>
                    <span v-if="common.length === 0 && commonResult" class="lab-hint">没有共同关注</span>
                </div>
            </div>

            <div class="feed__card">
                <div class="feed__card-title">推拉两种模式的代价</div>
                <div class="feed__compare">
                    <div class="feed__compare-row">
                        <span>推模式（写时扇出）</span>
                        <span class="feed__compare-ms">{{ pushElapsed === null ? '-' : `${pushElapsed} ms` }}</span>
                    </div>
                    <div class="feed__compare-bar">
                        <div
                            class="feed__compare-fill feed__compare-fill--push"
                            :style="{ width: pushElapsed && pullElapsed ? `${Math.min(100, (pushElapsed / Math.max(pushElapsed, pullElapsed)) * 100)}%` : '0%' }"
                        ></div>
                    </div>
                    <div class="feed__compare-row">
                        <span>拉模式（读时聚合）</span>
                        <span class="feed__compare-ms">{{ pullElapsed === null ? '-' : `${pullElapsed} ms` }}</span>
                    </div>
                    <div class="feed__compare-bar">
                        <div
                            class="feed__compare-fill feed__compare-fill--pull"
                            :style="{ width: pushElapsed && pullElapsed ? `${Math.min(100, (pullElapsed / Math.max(pushElapsed, pullElapsed)) * 100)}%` : '0%' }"
                        ></div>
                    </div>
                </div>
                <el-alert
                    type="info"
                    :closable="false"
                    show-icon
                    title="为什么条数会不一样"
                    description="推模式依赖发布那一刻的粉丝快照：关注之前发的动态不会出现，取关之后旧的动态也会残留。拉模式读取时才聚合，永远反映最新的关注关系。"
                />
            </div>

            <div class="feed__card">
                <div class="feed__card-title">演示数据</div>
                <el-button size="small" type="primary" @click="seed">一键准备演示数据</el-button>
            </div>
        </aside>
    </div>
</template>

<style scoped>
.feed {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 16px;
    align-items: start;
}

.feed__main {
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    overflow: hidden;
}

.feed__composer {
    display: flex;
    gap: 10px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--lab-border);
    align-items: flex-start;
}

.feed__composer-avatar {
    width: 42px;
    height: 42px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-weight: 600;
    flex: 0 0 42px;
}

.feed__switch {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    background: #fafbfd;
    border-bottom: 1px solid var(--lab-border);
}

.feed__tabs {
    display: flex;
    gap: 4px;
    background: #eef1f6;
    border-radius: 8px;
    padding: 3px;
}

.feed__tabs span {
    padding: 5px 16px;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    color: #4e5969;
}

.feed__tabs .is-on {
    background: #fff;
    color: var(--lab-primary);
    font-weight: 600;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.feed__elapsed {
    font-size: 12px;
    color: var(--lab-muted);
}

.feed__item {
    display: flex;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid #f2f4f8;
}

.feed__item:last-child {
    border-bottom: none;
}

.feed__avatar {
    width: 42px;
    height: 42px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-weight: 600;
    flex: 0 0 42px;
}

.feed__body {
    flex: 1;
    min-width: 0;
}

.feed__author {
    font-size: 13px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
}

.feed__content {
    margin: 6px 0 8px;
    font-size: 14px;
    line-height: 1.7;
    color: #2b3444;
    word-break: break-word;
}

.feed__ops {
    display: flex;
    align-items: center;
    gap: 12px;
}

.feed__time {
    font-size: 12px;
    color: #a3acbb;
}

.feed__empty {
    padding: 60px 20px;
    text-align: center;
    color: var(--lab-muted);
}

.feed__side {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.feed__card {
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    padding: 14px 16px;
}

.feed__card-title {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 10px;
}

.feed__me {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
}

.feed__me-avatar {
    width: 44px;
    height: 44px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-weight: 600;
}

.feed__me-name {
    font-size: 14px;
    font-weight: 600;
}

.feed__me-meta {
    font-size: 12px;
    color: var(--lab-muted);
    margin-top: 2px;
}

.feed__compare-row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: #4e5969;
    margin-bottom: 4px;
}

.feed__compare-ms {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
}

.feed__compare-bar {
    height: 8px;
    background: #f0f2f6;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 10px;
}

.feed__compare-fill {
    height: 100%;
    border-radius: 4px;
}

.feed__compare-fill--push {
    background: linear-gradient(90deg, #6f8cf7, #3d6ff5);
}

.feed__compare-fill--pull {
    background: linear-gradient(90deg, #ffd15c, #f2b94b);
}

@media (max-width: 1100px) {
    .feed {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
