<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue';
import { ElMessage } from 'element-plus';
import SectionHead from '@/components/SectionHead.vue';
import StatCard from '@/components/StatCard.vue';
import ResultView from '@/components/ResultView.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/social';

/**
 * 关注关系。
 *
 * <p>Redis set 的天然用法：关注列表与粉丝列表是两个独立集合，
 * 共同关注就是两个集合求交集。这一页把「写一对 _kv」与「读一对 _kv」分开摆，
 * 让人看清取关要同时改两个集合。
 */

const pair = reactive({ followerId: 1, followeeId: 2 });
const subject = reactive({ userId: 1, firstUserId: 1, secondUserId: 2 });

const { result: opResult, call: callOp } = useApi<null>();
const { result: followeesResult, call: callFollowees } = useApi<number[]>();
const { result: followersResult, call: callFollowers } = useApi<number[]>();
const { result: countsResult, call: callCounts } = useApi<Record<string, number>>();
const { result: commonResult, call: callCommon } = useApi<number[]>();
const { result: isFollowingResult, call: callIsFollowing } = useApi<boolean>();
const { result: summaryResult, call: callSummary } = useApi<Record<string, unknown>>();

const followees = computed<number[]>(() => (followeesResult.value?.ok && followeesResult.value.data ? followeesResult.value.data : []));
const followers = computed<number[]>(() => (followersResult.value?.ok && followersResult.value.data ? followersResult.value.data : []));
const common = computed<number[]>(() => (commonResult.value?.ok && commonResult.value.data ? commonResult.value.data : []));
const counts = computed(() => (countsResult.value?.ok ? countsResult.value.data : null));

/**
 * 加载某个用户的全部关系。
 */
async function loadUser() {
    await Promise.all([
        callFollowees(() => api.followees(subject.userId)),
        callFollowers(() => api.followers(subject.userId)),
        callCounts(() => api.counts(subject.userId)),
        callSummary(() => api.summary(subject.userId)),
    ]);
}

/**
 * 关注。
 */
async function follow() {
    const res = await callOp(() => api.follow(pair.followerId, pair.followeeId));
    if (res.ok) {
        ElMessage.success('已关注');
        await loadUser();
    }
}

/**
 * 取关。
 */
async function unfollow() {
    const res = await callOp(() => api.unfollow(pair.followerId, pair.followeeId));
    if (res.ok) {
        ElMessage.success('已取消关注');
        await loadUser();
    }
}

/**
 * 判断当前这对用户是否已是关注关系。
 */
function check() {
    void callIsFollowing(() => api.isFollowing(pair.followerId, pair.followeeId));
}

/**
 * 批量构造一组关系，方便直接看「共同关注」这类集合运算。
 */
async function seedGraph() {
    await Promise.all([
        api.follow(1, 3),
        api.follow(1, 4),
        api.follow(1, 5),
        api.follow(2, 3),
        api.follow(2, 5),
        api.follow(2, 6),
    ]);
    ElMessage.success('已构造示例关系：用户 1 与 2 共同关注了 3、5');
    await loadUser();
}

onMounted(loadUser);
</script>

<template>
    <div>
        <SectionHead
            title="关注关系"
            desc="关注列表与粉丝列表是两个独立的 set，共同关注是两个集合求交集。取关必须同时改两个集合，少改一个就会留下脏数据。"
        >
            <template #actions>
                <el-button size="small" @click="seedGraph">构造示例关系</el-button>
            </template>
        </SectionHead>

        <div class="lab-grid lab-grid--2">
            <div class="lab-card">
                <div class="lab-card__title">关注 / 取关</div>
                <div class="lab-card__desc">followerId 关注 followeeId，两个方向的重要性完全不同。</div>
                <el-form size="small" label-width="96px">
                    <div class="lab-grid lab-grid--2">
                        <el-form-item label="发起关注者">
                            <el-input-number v-model="pair.followerId" :min="1" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="被关注者">
                            <el-input-number v-model="pair.followeeId" :min="1" controls-position="right" />
                        </el-form-item>
                    </div>
                </el-form>
                <div class="lab-row">
                    <el-button type="primary" size="small" @click="follow">关注</el-button>
                    <el-button size="small" @click="unfollow">取消关注</el-button>
                    <el-button size="small" @click="check">判断是否已关注</el-button>
                    <el-tag v-if="isFollowingResult?.ok" :type="isFollowingResult.data ? 'success' : 'info'" size="small" effect="plain">
                        {{ isFollowingResult.data ? '已关注' : '未关注' }}
                    </el-tag>
                </div>
                <ResultView :result="opResult" title="写操作返回" :max-height="120" style="margin-top: 10px" />
            </div>

            <div class="lab-card">
                <div class="lab-card__title">查询对象</div>
                <div class="lab-card__desc">关注数、粉丝数、交集都围绕这一个用户展开。</div>
                <el-form size="small" label-width="96px">
                    <el-form-item label="用户 id">
                        <el-input-number v-model="subject.userId" :min="1" controls-position="right" />
                    </el-form-item>
                    <div class="lab-grid lab-grid--2">
                        <el-form-item label="用户 A">
                            <el-input-number v-model="subject.firstUserId" :min="1" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="用户 B">
                            <el-input-number v-model="subject.secondUserId" :min="1" controls-position="right" />
                        </el-form-item>
                    </div>
                </el-form>
                <div class="lab-row">
                    <el-button size="small" type="primary" @click="loadUser">加载关系</el-button>
                    <el-button size="small" @click="callCommon(() => api.commonFollowees(subject.firstUserId, subject.secondUserId))">
                        查共同关注
                    </el-button>
                </div>
                <div class="lab-grid lab-grid--2" style="margin-top: 12px">
                    <StatCard label="关注数" :value="counts?.following ?? counts?.followeeCount ?? followees.length" tone="accent" />
                    <StatCard label="粉丝数" :value="counts?.followerCount ?? followers.length" tone="accent" />
                </div>
                <ResultView :result="countsResult" title="counts 原始返回" :max-height="160" style="margin-top: 10px" />
            </div>
        </div>

        <div class="lab-grid lab-grid--3">
            <div class="lab-card">
                <div class="lab-card__title">关注的人</div>
                <el-tag v-for="id in followees" :key="id" size="small" effect="light" style="margin: 0 6px 6px 0">{{ id }}</el-tag>
                <div v-if="followees.length === 0" class="lab-hint">这个用户还没有关注别人</div>
            </div>
            <div class="lab-card">
                <div class="lab-card__title">粉丝</div>
                <el-tag v-for="id in followers" :key="id" size="small" effect="light" type="success" style="margin: 0 6px 6px 0">
                    {{ id }}
                </el-tag>
                <div v-if="followers.length === 0" class="lab-hint">还没有粉丝</div>
            </div>
            <div class="lab-card">
                <div class="lab-card__title">共同关注</div>
                <div class="lab-card__desc">sinter 的结果，顺序不保证。</div>
                <el-tag v-for="id in common" :key="id" size="small" effect="light" type="warning" style="margin: 0 6px 6px 0">
                    {{ id }}
                </el-tag>
                <div v-if="common.length === 0" class="lab-hint">点上面的「查共同关注」</div>
            </div>
        </div>

        <div class="lab-card">
            <div class="lab-card__title">用户关系总览</div>
            <div class="lab-card__desc">一次请求把该用户的社交位置兜出来，省掉前端多次往返。</div>
            <ResultView :result="summaryResult" :max-height="220" />
        </div>
    </div>
</template>
