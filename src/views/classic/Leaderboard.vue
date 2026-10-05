<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { RefreshRight, Trophy } from '@element-plus/icons-vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/classic';
import type { RankItemResponse } from '@/api/types';
import { avatarColor } from '@/utils/scene';
import { toDateString } from '@/utils/format';

/**
 * 排行榜。
 *
 * <p>zset 一个结构同时解决「按分数排序」和「按成员反查」两件事，
 * 这一页就照着真实榜单的样子做：前三名上领奖台，后面是长列表，
 * 底部是「我在第几名」。这样才看得出 zrevrank 和 zscore 到底在回答什么问题。
 */

const board = ref('weekly');
const myName = ref('player-1');
const form = reactive({ member: 'player-1', score: 100, delta: 50, range: 2 });

const { result: topResult, call: callTop } = useApi<RankItemResponse[]>();
const { result: aroundResult, call: callAround } = useApi<RankItemResponse[]>();
const { result: sizeResult, call: callSize } = useApi<number>();
const { result: rankResult, call: callRank } = useApi<number>();
const { result: scoreResult, call: callScore } = useApi<number>();
const { result: writeResult, call: callWrite } = useApi<unknown>();

const top = computed<RankItemResponse[]>(() => (topResult.value?.ok && topResult.value.data ? topResult.value.data : []));
const around = computed<RankItemResponse[]>(() => (aroundResult.value?.ok && aroundResult.value.data ? aroundResult.value.data : []));
const podium = computed(() => top.value.slice(0, 3));
const rest = computed(() => top.value.slice(3));
const maxScore = computed(() => Math.max(1, ...top.value.map((item) => item.score)));

/**
 * 刷新榜单。
 */
async function refresh() {
    await Promise.all([callTop(() => api.top(board.value, 20)), callSize(() => api.boardSize(board.value))]);
    if (myName.value) {
        await Promise.all([
            callRank(() => api.rankOf(board.value, myName.value)),
            callScore(() => api.scoreOf(board.value, myName.value)),
        ]);
    }
}

/**
 * 提交分数（覆盖）。
 */
async function submit() {
    await callWrite(() => api.submitScore(board.value, form.member, form.score));
    ElMessage.success('成绩已覆盖');
    await refresh();
}

/**
 * 累加分数。
 */
async function add() {
    const res = await callWrite(() => api.addScore(board.value, form.member, form.delta));
    if (res.ok) {
        ElMessage.success(`已累加，当前 ${res.data}`);
        await refresh();
    }
}

/**
 * 查看我的前后范围。
 */
function queryAround() {
    void callAround(() => api.aroundRank(board.value, myName.value, form.range));
}

/**
 * 一键灌一批示例成绩，避免空榜单。
 */
async function seed() {
    const names = ['player-1', 'player-2', 'player-3', 'player-4', 'player-5', 'player-6', 'player-7', 'player-8'];
    await Promise.all(names.map((name, index) => api.submitScore(board.value, name, 900 - index * 110)));
    ElMessage.success('已写入 8 名选手的成绩');
    await refresh();
}

/**
 * 周榜结算：固化历史并清空当前榜单。
 */
async function settle() {
    await ElMessageBox.confirm('结算后当前榜单会被清空并固化为历史榜单，确认继续？', '周榜结算', { type: 'warning' });
    await callWrite(() => api.settleWeekly(board.value, toDateString(new Date())));
    ElMessage.success('已结算');
    await refresh();
}

/**
 * 清空榜单。
 */
async function clear() {
    await ElMessageBox.confirm('清空后所有人的名次都会消失，确认继续？', '清空榜单', { type: 'warning' });
    await callWrite(() => api.clearBoard(board.value));
    ElMessage.success('已清空');
    await refresh();
}

/**
 * 名次对应的奖牌样式。
 *
 * @param index 下标
 */
function medal(index: number): string {
    return ['🥇', '🥈', '🥉'][index] ?? '';
}

/**
 * 头像底色。
 *
 * @param member 成员名
 */
function color(member: string): string {
    let hash = 0;
    for (let index = 0; index < member.length; index += 1) {
        hash = (hash * 31 + member.charCodeAt(index)) % 100000;
    }
    return avatarColor(hash);
}

onMounted(refresh);
</script>

<template>
    <div class="lb">
        <div class="lb__hero">
            <div>
                <div class="lb__title">
                    <el-icon><Trophy /></el-icon>
                    {{ board }} 排行榜
                </div>
                <div class="lb__sub">共 {{ sizeResult?.ok ? sizeResult.data : '-' }} 人上榜 · 按分数从高到低</div>
            </div>
            <div class="lab-row">
                <el-input v-model="board" size="small" style="width: 160px" />
                <el-button size="small" :icon="RefreshRight" @click="refresh()">刷新</el-button>
                <el-button size="small" @click="seed">灌示例成绩</el-button>
                <el-button size="small" type="warning" @click="settle">周榜结算</el-button>
                <el-button size="small" type="danger" @click="clear">清空</el-button>
            </div>
        </div>

        <div v-if="podium.length > 0" class="lb__podium">
            <div v-for="(item, index) in podium" :key="item.member" class="lb__podium-item" :class="`lb__podium-item--${index}`">
                <div class="lb__medal">{{ medal(index) }}</div>
                <div class="lb__podium-avatar" :style="{ background: color(item.member) }">
                    {{ item.member.slice(-1) }}
                </div>
                <div class="lb__podium-name">{{ item.member }}</div>
                <div class="lb__podium-score">{{ item.score.toFixed(0) }}</div>
                <div class="lb__podium-base">{{ ['冠军', '亚军', '季军'][index] }}</div>
            </div>
        </div>

        <div class="lb__panel">
            <div v-if="rest.length > 0" class="lb__list">
                <div v-for="(item, index) in rest" :key="item.member" class="lb__row">
                    <div class="lb__rank">{{ index + 4 }}</div>
                    <div class="lb__avatar" :style="{ background: color(item.member) }">{{ item.member.slice(-1) }}</div>
                    <div class="lb__name">{{ item.member }}</div>
                    <div class="lb__bar">
                        <div class="lb__bar-fill" :style="{ width: `${(item.score / maxScore) * 100}%` }"></div>
                    </div>
                    <div class="lb__score">{{ item.score.toFixed(0) }}</div>
                </div>
            </div>
            <div v-else-if="podium.length === 0" class="lb__empty">
                榜单还是空的，点右上角「灌示例成绩」先来一批数据。
            </div>
        </div>

        <div class="lb__bottom">
            <div class="lb__panel lb__me">
                <div class="lb__panel-title">我在第几名</div>
                <div class="lab-row">
                    <el-input v-model="myName" size="small" style="width: 180px" placeholder="成员名" />
                    <el-button size="small" @click="refresh()">查名次</el-button>
                    <el-button size="small" @click="queryAround">看前后 {{ form.range }} 名</el-button>
                </div>
                <div class="lb__me-nums">
                    <div>
                        <!-- 后端三个接口统一返回 1 基名次，直接用 -->
                        <div class="lb__me-value">{{ rankResult?.ok ? `#${rankResult.data}` : '-' }}</div>
                        <div class="lb__me-label">名次</div>
                    </div>
                    <div>
                        <div class="lb__me-value">{{ scoreResult?.ok ? scoreResult.data.toFixed(0) : '-' }}</div>
                        <div class="lb__me-label">分数</div>
                    </div>
                </div>
                <div v-if="around.length > 0" class="lb__around">
                    <div
                        v-for="item in around"
                        :key="item.member"
                        class="lb__around-row"
                        :class="{ 'lb__around-row--me': item.member === myName }"
                    >
                        <!-- around 接口返回的名次已经是 1 基，rankOf 才是 0 基，两边别混 -->
                        <span>#{{ item.rank }}</span>
                        <span>{{ item.member }}</span>
                        <span>{{ item.score.toFixed(0) }}</span>
                    </div>
                </div>
            </div>

            <div class="lb__panel lb__write">
                <div class="lb__panel-title">写入成绩</div>
                <el-form size="small" label-width="80px">
                    <el-form-item label="成员">
                        <el-input v-model="form.member" />
                    </el-form-item>
                    <div class="lab-grid lab-grid--2">
                        <el-form-item label="分数">
                            <el-input-number v-model="form.score" :precision="2" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="增量">
                            <el-input-number v-model="form.delta" :precision="2" controls-position="right" />
                        </el-form-item>
                    </div>
                    <div class="lab-row">
                        <el-button type="primary" size="small" @click="submit">submit 覆盖</el-button>
                        <el-button size="small" @click="add">add 累加</el-button>
                    </div>
                </el-form>
                <el-alert
                    type="info"
                    :closable="false"
                    show-icon
                    title="覆盖与累加的幂等性完全不同"
                    description="submit 是幂等的，重复提交同一个分数结果不变；add 每调一次就加一次，重复调用会把分数推上去。"
                />
            </div>
        </div>
    </div>
</template>

<style scoped>
.lb {
    background: #f6f8fc;
    padding: 18px;
    border-radius: var(--lab-radius);
}

.lb__hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    background: linear-gradient(135deg, #2b3350, #4b3a72);
    border-radius: 14px;
    padding: 20px 24px;
    color: #fff;
    flex-wrap: wrap;
    box-shadow: 0 8px 24px rgba(43, 51, 80, 0.24);
}

.lb__title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 22px;
    font-weight: 700;
}

.lb__sub {
    margin-top: 6px;
    font-size: 13px;
    opacity: 0.7;
}

.lb__podium {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    margin-top: 16px;
    align-items: end;
}

.lb__podium-item {
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    padding: 16px 12px 0;
    text-align: center;
}

.lb__podium-item--0 {
    order: 2;
    padding-top: 26px;
    background: linear-gradient(180deg, #fff9e6, #fff);
    border-color: #ffe08a;
}

.lb__podium-item--1 {
    order: 1;
}

.lb__podium-item--2 {
    order: 3;
}

.lb__medal {
    font-size: 28px;
}

.lb__podium-avatar {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    margin: 6px auto 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 20px;
    font-weight: 600;
}

.lb__podium-name {
    font-size: 14px;
    font-weight: 600;
}

.lb__podium-score {
    margin: 4px 0 8px;
    font-size: 22px;
    font-weight: 700;
    color: #e1251b;
}

.lb__podium-base {
    background: #f2f4f8;
    border-radius: 10px 10px 0 0;
    padding: 8px 0;
    font-size: 12px;
    color: var(--lab-muted);
    margin: 0 -12px;
}

.lb__podium-item--0 .lb__podium-base {
    background: #ffe08a;
    color: #8a5a00;
    font-weight: 600;
}

.lb__panel {
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    padding: 14px 16px;
    margin-top: 14px;
}

.lb__panel-title {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 10px;
}

.lb__row {
    display: grid;
    grid-template-columns: 44px 36px 160px 1fr 80px;
    align-items: center;
    gap: 10px;
    padding: 9px 0;
    border-bottom: 1px solid #f2f4f8;
}

.lb__row:last-child {
    border-bottom: none;
}

.lb__rank {
    font-size: 15px;
    font-weight: 700;
    color: var(--lab-muted);
    text-align: center;
}

.lb__avatar {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-weight: 600;
}

.lb__name {
    font-size: 13px;
    font-weight: 500;
}

.lb__bar {
    height: 10px;
    background: #f0f2f6;
    border-radius: 5px;
    overflow: hidden;
}

.lb__bar-fill {
    height: 100%;
    border-radius: 5px;
    background: linear-gradient(90deg, #b9cdf7, #3d6ff5);
}

.lb__score {
    text-align: right;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
}

.lb__empty {
    padding: 40px 20px;
    text-align: center;
    color: var(--lab-muted);
}

.lb__bottom {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 14px;
}

.lb__me-nums {
    display: flex;
    gap: 28px;
    margin: 12px 0;
}

.lb__me-value {
    font-size: 26px;
    font-weight: 700;
    color: #3d6ff5;
}

.lb__me-label {
    font-size: 12px;
    color: var(--lab-muted);
}

.lb__around-row {
    display: grid;
    grid-template-columns: 60px 1fr 80px;
    padding: 6px 8px;
    border-radius: 6px;
    font-size: 13px;
}

.lb__around-row--me {
    background: var(--lab-primary-soft);
    font-weight: 600;
    color: #3d6ff5;
}

.lb__around-row span:last-child {
    text-align: right;
}
</style>
