<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { RefreshRight, User } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import StatCard from '@/components/StatCard.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/social';
import { avatarColor } from '@/utils/scene';

/**
 * 关注关系。
 *
 * <p>关注列表与粉丝列表是两个独立的 set，共同关注就是两个集合求交集。
 * 所以「取关」必须同时改两个集合，少改一个就会留下「他还关注着，但对方粉丝列表里没有他」的脏数据。
 */

const me = ref(1);
const followees = ref<number[]>([]);
const followers = ref<number[]>([]);
const common = ref<number[]>([]);
const checking = ref(false);
const isFollowing = ref<boolean | null>(null);

const pair = reactive({ followerId: 1, followeeId: 2, firstId: 1, secondId: 2 });

const { loading: listLoading, call: callFollowees } = useApi<number[]>();
const { call: callFollowers } = useApi<number[]>();
const { call: callCommon } = useApi<number[]>();
const { result: countsResult, call: callCounts } = useApi<Record<string, number>>();
const { call: callWrite } = useApi<null>();

const following = computed(() => countsResult.value?.data?.following ?? followees.value.length);
const followerCount = computed(() => countsResult.value?.data?.followers ?? followers.value.length);

/**
 * 刷新关系列表。
 */
async function loadRelations() {
    const [followeeRes, followerRes] = await Promise.all([
        callFollowees(() => api.followees(me.value)),
        callFollowers(() => api.followers(me.value)),
    ]);
    followees.value = followeeRes.ok && followeeRes.data ? followeeRes.data : [];
    followers.value = followerRes.ok && followerRes.data ? followerRes.data : [];
    void callCounts(() => api.counts(me.value));
}

/**
 * 关注或取关。
 *
 * @param follow 关注为 true，取关为 false
 */
async function toggleFollow(follow: boolean) {
    const res = await callWrite(() =>
        follow ? api.follow(pair.followerId, pair.followeeId) : api.unfollow(pair.followerId, pair.followeeId),
    );
    if (res.ok) {
        ElMessage.success(follow ? `已关注 ${pair.followeeId}` : `已取关 ${pair.followeeId}`);
        await loadRelations();
    }
}

/**
 * 判断是否已关注。
 */
async function checkRelation() {
    checking.value = true;
    try {
        const res = await api.isFollowing(pair.followerId, pair.followeeId);
        isFollowing.value = res.ok ? Boolean(res.data) : null;
    } finally {
        checking.value = false;
    }
}

/**
 * 求两个用户的共同关注。
 */
function queryCommon() {
    void callCommon(() => api.commonFollowees(pair.firstId, pair.secondId));
}

/**
 * 头像底色。
 *
 * @param id 用户 id
 */
function color(id: number): string {
    return avatarColor(id);
}

onMounted(loadRelations);
</script>

<template>
    <div class="rl">
        <SectionHead
            title="关注关系"
            desc="关注列表与粉丝列表是两个独立的 set。取关要同时改两个集合，共同关注则是两个集合求交集。"
        >
            <template #actions>
                <el-button size="small" :icon="RefreshRight" @click="loadRelations()">刷新</el-button>
            </template>
        </SectionHead>

        <div class="rl__body">
            <div class="rl__main">
                <div class="rl__panel">
                    <div class="rl__panel-title">我关注的人（{{ followees.length }}）</div>
                    <div v-if="followees.length > 0" class="rl__users">
                        <div v-for="id in followees" :key="id" class="rl__user">
                            <div class="rl__user-avatar" :style="{ background: color(id) }">
                                {{ id % 100 }}
                            </div>
                            <div class="rl__user-name">实验员 {{ id % 100 }}</div>
                            <el-tag size="small" effect="plain" type="success">已关注</el-tag>
                            <el-button
                                size="small"
                                plain
                                @click="pair.followerId = me; pair.followeeId = id; toggleFollow(false)"
                            >
                                取关
                            </el-button>
                        </div>
                    </div>
                    <div v-else class="rl__empty">
                        还没有关注任何人。在下面填入一个用户 id 关注试试。
                    </div>
                </div>

                <div class="rl__panel">
                    <div class="rm__panel-title">我的粉丝（{{ followerCount }}）</div>
                    <div v-if="followers.length > 0" class="rl__users">
                        <div v-for="id in followers" :key="id" class="rl__user">
                            <div class="rl__user-avatar" :style="{ background: color(id) }">
                                {{ id % 100 }}
                            </div>
                            <div class="rl__user-name">实验员 {{ id % 100 }}</div>
                            <el-tag size="small" effect="plain" type="info">粉丝</el-tag>
                        </div>
                    </div>
                    <div v-else class="rl__empty">还没有粉丝</div>
                </div>
            </div>

            <aside class="rl__side">
                <div class="rl__panel">
                    <div class="rl__panel-title">
                        <el-icon><User /></el-icon>
                        身份
                    </div>
                    <div class="lab-row">
                        <el-input-number v-model="me" :min="1" size="small" controls-position="right" />
                        <el-button size="small" @click="loadRelations()">切换</el-button>
                    </div>
                </div>

                <div class="rl__panel">
                    <div class="rl__panel-title">关注 / 取关</div>
                    <el-form size="small" label-width="70px">
                        <el-form-item label="发起方">
                            <el-input-number v-model="pair.followerId" :min="1" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="目标方">
                            <el-input-number v-model="pair.followeeId" :min="1" controls-position="right" />
                        </el-form-item>
                    </el-form>
                    <div class="lab-row">
                        <el-button size="small" type="primary" @click="toggleFollow(true)">关注</el-button>
                        <el-button size="small" @click="toggleFollow(false)">取关</el-button>
                    </div>
                </div>

                <div class="rl__panel">
                    <div class="rl__panel-title">共同关注</div>
                    <el-form size="small" inline label-width="56px">
                        <el-form-item label="用户 A">
                            <el-input-number v-model="pair.firstId" :min="1" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="用户 B">
                            <el-input-number v-model="pair.secondId" :min="1" controls-position="right" />
                        </el-form-item>
                        <el-form-item>
                            <el-button size="small" @click="queryCommon">求交集</el-button>
                        </el-form-item>
                        <el-button size="small" :icon="RefreshRight" @click="loadRelations">刷新关系</el-button>
                    </el-form>
                    <div class="lab-row" style="margin-top: 8px">
                        <el-tag v-for="id in common" :key="id" size="small" effect="light" type="warning">
                            实验员 {{ id % 100 }}
                        </el-tag>
                        <span v-if="common.length === 0" class="lab-hint">没有共同关注，或还没查询</span>
                    </div>
                </div>
            </aside>
        </div>
    </div>
</template>

<style scoped>
.rl__body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 14px;
    align-items: start;
}

.rl__main,
.rl__side {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.rl__panel {
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    padding: 14px 16px;
}

.rl__panel-title {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 6px;
}

.rl__users {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.rl__user {
    display: flex;
    align-items: center;
    gap: 10px;
}

.rl__user-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-weight: 600;
    flex: 0 0 32px;
}

.rl__user-name {
    flex: 1;
    font-size: 13px;
    font-weight: 500;
}

.rl__empty {
    padding: 20px;
    text-align: center;
    color: var(--lab-muted);
    font-size: 13px;
}

@media (max-width: 1000px) {
    .rl__body {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
