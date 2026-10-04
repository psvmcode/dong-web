<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue';
import { ElMessage } from 'element-plus';
import SectionHead from '@/components/SectionHead.vue';
import StatCard from '@/components/StatCard.vue';
import ResultView from '@/components/ResultView.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/social';
import type { FeedResponse } from '@/api/types';

/**
 * 时间线推拉对比。
 *
 * <p>同一个用户在同一个数据上，推模式（写时扇出）与拉模式（读时聚合）
 * 应该看到同样的内容，差别只在耗时。这一页把两种模式的 elapsed 并排放，
 * 并把「谁的动态」一起显示出来，用来确认两份结果确实一致。
 */

const form = reactive({ authorId: 1, content: '今天读完了 Redis 源码里的 quicklist', feedId: 1, userId: 1, size: 20 });

const { result: publishResult, call: callPublish } = useApi<number>();
const { result: likeResult, call: callLike } = useApi<number>();
const { loading: pushLoading, result: pushResult, call: callPush } = useApi<FeedResponse[]>();
const { loading: pullLoading, result: pullResult, call: callPull } = useApi<FeedResponse[]>();
const { call: callFollow } = useApi<null>();

const pushList = computed<FeedResponse[]>(() => (pushResult.value?.ok && pushResult.value.data ? pushResult.value.data : []));
const pullList = computed<FeedResponse[]>(() => (pullResult.value?.ok && pullResult.value.data ? pullResult.value.data : []));

/**
 * 关注一批示例作者，让时间线里有东西可看。
 */
async function seedFollows() {
    await Promise.all([api.follow(1, 2), api.follow(1, 3)]);
    ElMessage.success('已关注作者 2、3');
}

/**
 * 发布动态。推模式下这一步会同时扇出给所有粉丝。
 */
async function publish() {
    const res = await callPublish(() => api.publishFeed(form.authorId, form.content));
    if (res.ok) {
        ElMessage.success('动态已发布');
        await compare();
    }
}

/**
 * 给动态点赞。
 */
async function like() {
    const res = await callLike(() => api.like(form.feedId));
    if (res.ok) {
        ElMessage.success(`点赞完成，当前 ${res.data} 个赞`);
        await compare();
    }
}

/**
 * 同时跑两种模式并按 elapsed 对比。
 */
async function compare() {
    await callPush(() => api.timelinePush(form.userId, form.size));
    await callPull(() => api.timelinePull(form.userId, 1, form.size));
}

const verdict = computed(() => {
    const push = pushResult.value;
    const pull = pullResult.value;
    if (!push?.ok || !pull?.ok) {
        return '-';
    }
    if (push.elapsed === pull.elapsed) {
        return '几乎持平';
    }
    return push.elapsed < pull.elapsed ? `推模式快 ${pull.elapsed - push.elapsed} ms` : `拉模式快 ${push.elapsed - pull.elapsed} ms`;
});

onMounted(compare);
</script>

<template>
    <div>
        <SectionHead
            title="时间线推拉对比"
            desc="推模式在写的时候就扇出给所有粉丝，读的时候直接拿结果；拉模式写时只落一条，读时才把关注者的动态聚合起来。同一份数据，两种代价。"
        >
            <template #actions>
                <el-button size="small" @click="seedFollows">关注示例作者</el-button>
                <el-button size="small" type="primary" @click="compare">刷新时间线</el-button>
            </template>
        </SectionHead>

        <div class="lab-grid lab-grid--3">
            <StatCard label="推模式条数" :value="pushList.length" tone="accent" :hint="`耗时 ${pushResult?.elapsed ?? '-'} ms`" />
            <StatCard label="拉模式条数" :value="pullList.length" tone="accent" :hint="`耗时 ${pullResult?.elapsed ?? '-'} ms`" />
            <StatCard label="谁更快" :value="verdict" hint="样本小，只看趋势不看绝对值" />
        </div>

        <div class="lab-grid lab-grid--2">
            <div class="lab-card">
                <div class="lab-card__title">发布动态</div>
                <div class="lab-card__desc">推模式下这一步会给所有粉丝各刷一份 feed，粉丝越多写越贵。</div>
                <el-form size="small" label-width="86px">
                    <el-form-item label="作者 id">
                        <el-input-number v-model="form.authorId" :min="1" controls-position="right" />
                    </el-form-item>
                    <el-form-item label="内容">
                        <el-input v-model="form.content" type="textarea" :rows="2" maxlength="4096" />
                    </el-form-item>
                    <el-form-item label="点赞 feed">
                        <el-input-number v-model="form.feedId" :min="1" controls-position="right" />
                    </el-form-item>
                    <el-form-item label="读者 id">
                        <el-input-number v-model="form.userId" :min="1" controls-position="right" />
                    </el-form-item>
                    <el-form-item label="拉取条数">
                        <el-input-number v-model="form.size" :min="1" :max="200" controls-position="right" />
                    </el-form-item>
                </el-form>
                <div class="lab-row">
                    <el-button type="primary" size="small" @click="publish">发布</el-button>
                    <el-button size="small" @click="like">点赞</el-button>
                </div>
                <ResultView :result="publishResult" title="发布结果" :max-height="120" style="margin-top: 10px" />
                <ResultView :result="likeResult" title="点赞结果" :max-height="120" style="margin-top: 10px" />
            </div>

            <div class="lab-card">
                <div class="lab-card__title">两种模式的结果是否一致</div>
                <div class="lab-card__desc">
                    <el-tag size="small" effect="plain">推模式 {{ pushList.length }} 条</el-tag>
                    <el-tag size="small" effect="plain" type="success">拉模式 {{ pullList.length }} 条</el-tag>
                    <el-tag :type="pushList.length === pullList.length ? 'success' : 'danger'" size="small" effect="dark">
                        {{ pushList.length === pullList.length ? '条数一致' : '条数不一致' }}
                    </el-tag>
                </div>
                <el-alert
                    type="info"
                    :closable="false"
                    show-icon
                    title="为什么会不一致"
                    description="推模式依赖发布时的粉丝快照：关注之前发布的动态不会出现，取关之后旧的动态也会残留。拉模式在读取时才聚合，所以永远是最新的关注关系。"
                />
                <ResultView :result="pushResult" title="推模式原始返回" :max-height="200" style="margin-top: 10px" />
            </div>
        </div>

        <div class="lab-grid lab-grid--2">
            <div class="lab-card">
                <div class="lab-card__title">推模式时间线</div>
                <el-table v-loading="pushLoading" :data="pushList" border stripe size="small" max-height="360">
                    <el-table-column prop="feedId" label="feed id" width="90" />
                    <el-table-column prop="authorId" label="作者" width="90" />
                    <el-table-column prop="content" label="内容" min-width="220" show-overflow-tooltip />
                    <el-table-column prop="likeCount" label="点赞" width="90" />
                    <el-table-column prop="createTime" label="时间" min-width="160" />
                </el-table>
            </div>
            <div class="lab-card">
                <div class="lab-card__title">拉模式时间线</div>
                <el-table v-loading="pullLoading" :data="pullList" border stripe size="small" max-height="360">
                    <el-table-column prop="feedId" label="feed id" width="90" />
                    <el-table-column prop="authorId" label="作者" width="90" />
                    <el-table-column prop="content" label="内容" min-width="220" show-overflow-tooltip />
                    <el-table-column prop="likeCount" label="点赞" width="90" />
                    <el-table-column prop="createTime" label="时间" min-width="160" />
                </el-table>
            </div>
        </div>
    </div>
</template>
