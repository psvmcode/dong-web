<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { RefreshRight } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import StatCard from '@/components/StatCard.vue';
import ResultView from '@/components/ResultView.vue';
import EChart from '@/components/EChart.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/classic';
import type { RankItemResponse } from '@/api/types';
import { toDateString } from '@/utils/format';

/**
 * zset 排行榜。
 *
 * <p>zset 同时给「按分数有序」和「按成员反查」两件事：
 * 这一页把两件分开摆，上半区是写与单点查询，下半区是范围查询与周榜结算。
 */

const form = reactive({ board: 'weekly', member: 'player-1', score: 100, topSize: 10, range: 2 });
const target = reactive({ board: 'weekly', member: 'player-1' });

const { result: topResult, call: callTop } = useApi<RankItemResponse[]>();
const { result: aroundResult, call: callAround } = useApi<RankItemResponse[]>();
const { result: sizeResult, call: callSize } = useApi<number>();
const { result: rankResult, call: callRank } = useApi<number>();
const { result: scoreResult, call: callScore } = useApi<number>();
const { result: writeResult, call: callWrite } = useApi<unknown>();

const top = computed<RankItemResponse[]>(() => (topResult.value?.ok && topResult.value.data ? topResult.value.data : []));
const around = computed<RankItemResponse[]>(() =>
    aroundResult.value?.ok && aroundResult.value.data ? aroundResult.value.data : [],
);

/**
 * 刷新榜单概览与榜单主体。
 */
async function refresh() {
    await Promise.all([
        callTop(() => api.top(form.board, form.topSize)),
        callSize(() => api.boardSize(form.board)),
    ]);
}

/**
 * 提交分数（覆盖）。
 */
async function submit() {
    await callWrite(() => api.submitScore(form.board, form.member, form.score));
    ElMessage.success('已覆盖成绩');
    await refresh();
}

/**
 * 累加分数。
 */
async function add() {
    await callWrite(() => api.addScore(form.board, form.member, form.score));
    ElMessage.success('已累加');
    await refresh();
}

/**
 * 查询单个成员的名次与分数。
 */
function queryMember() {
    void callRank(() => api.rankOf(target.board, target.member));
    void callScore(() => api.scoreOf(target.board, target.member));
}

/**
 * 查询成员前后范围。
 */
function queryAround() {
    void callAround(() => api.aroundRank(target.board, target.member, form.range));
}

/**
 * 周榜结算：固化历史并清空当前榜单。
 */
async function settle() {
    await ElMessageBox.confirm('结算后当前榜单会被清空，并固化为历史榜单，确认继续？', '周榜结算', { type: 'warning' });
    await callWrite(() => api.settleWeekly(form.board, toDateString(new Date())));
    ElMessage.success('已结算');
    await refresh();
}

/**
 * 清空榜单。
 */
async function clear() {
    await ElMessageBox.confirm('清空后所有人名次都会消失，确认继续？', '清空榜单', { type: 'warning' });
    await callWrite(() => api.clearBoard(form.board));
    ElMessage.success('已清空');
    await refresh();
}

const topChart = computed(() => {
    if (top.value.length === 0) {
        return null;
    }
    return {
        tooltip: { trigger: 'axis' },
        grid: { left: 70, right: 20, top: 24, bottom: 60 },
        xAxis: { type: 'category', data: top.value.map((item) => item.member), axisLabel: { rotate: 24 } },
        yAxis: { type: 'value' },
        series: [
            {
                type: 'bar',
                data: top.value.map((item) => item.score),
                itemStyle: { color: '#6f8cf7', borderRadius: [6, 6, 0, 0] },
            },
        ],
    };
});

onMounted(refresh);
</script>

<template>
    <div>
        <SectionHead
            title="排行榜"
            desc="zset 一个结构同时解决排序与反查：写进来的分数立刻有序，按成员也能立刻拿到名次。"
        >
            <template #actions>
                <el-button size="small" :icon="RefreshRight" @click="refresh()">刷新榜单</el-button>
            </template>
        </SectionHead>

        <div class="lab-grid lab-grid--3">
            <StatCard label="榜单人数" :value="sizeResult?.ok ? sizeResult.data : '-'" tone="accent" hint="zcard" />
            <StatCard
                :label="`${target.member} 的名次`"
                :value="rankResult?.ok ? rankResult.data : '-'"
                hint="从 0 开始，查不到会报错"
            />
            <StatCard :label="`${target.member} 的分数`" :value="scoreResult?.ok ? scoreResult.data : '-'" tone="good" />
        </div>

        <div class="lab-grid lab-grid--2">
            <div class="lab-card">
                <div class="lab-card__title">写分数</div>
                <div class="lab-card__desc">submit 覆盖旧成绩，add 在旧成绩上累加——两者的幂等性完全不同。</div>
                <el-form size="small" label-width="86px">
                    <el-form-item label="榜单">
                        <el-input v-model="form.board" style="width: 200px" />
                    </el-form-item>
                    <el-form-item label="成员">
                        <el-input v-model="form.member" style="width: 200px" />
                    </el-form-item>
                    <el-form-item label="分数">
                        <el-input-number v-model="form.score" :precision="2" controls-position="right" />
                    </el-form-item>
                    <div class="lab-row">
                        <el-button type="primary" size="small" @click="submit">submit 覆盖</el-button>
                        <el-button size="small" @click="add">add 累加</el-button>
                        <el-button size="small" type="warning" @click="settle">结算周榜</el-button>
                        <el-button size="small" type="danger" @click="clear">清空榜单</el-button>
                    </div>
                </el-form>
                <ResultView :result="writeResult" title="写操作返回" :max-height="140" style="margin-top: 10px" />
            </div>

            <div class="lab-card">
                <div class="lab-card__title">单点查询</div>
                <div class="lab-card__desc">名次与分数分开查：zrevrank 与 zscore 是两条命令，代价不同。</div>
                <el-form size="small" label-width="86px">
                    <el-form-item label="榜单">
                        <el-input v-model="target.board" style="width: 200px" />
                    </el-form-item>
                    <el-form-item label="成员">
                        <el-input v-model="target.member" style="width: 200px" />
                    </el-form-item>
                    <el-form-item label="前后范围">
                        <el-input-number v-model="form.range" :min="1" :max="20" controls-position="right" />
                    </el-form-item>
                </el-form>
                <div class="lab-row">
                    <el-button size="small" type="primary" @click="queryMember">查名次与分数</el-button>
                    <el-button size="small" @click="queryAround">查前后范围</el-button>
                </div>
                <ResultView :result="aroundResult" title="前后范围" :max-height="200" style="margin-top: 10px" />
            </div>
        </div>

        <div class="lab-card">
            <div class="lab-card__title">榜单前 {{ form.topSize }} 名</div>
            <div class="lab-row" style="margin-bottom: 10px">
                <el-input-number v-model="form.topSize" :min="1" :max="200" size="small" controls-position="right" />
                <el-button size="small" @click="refresh()">刷新</el-button>
            </div>
            <EChart v-if="topChart" :option="topChart" :height="260" />
            <el-table :data="top" border stripe size="small" max-height="320" style="margin-top: 12px">
                <el-table-column label="名次" width="90">
                    <template #default="{ $index }">{{ $index + 1 }}</template>
                </el-table-column>
                <el-table-column prop="member" label="成员" min-width="160" />
                <el-table-column prop="score" label="分数" min-width="120" />
                <el-table-column prop="rank" label="zset 下标" min-width="120" />
            </el-table>
        </div>
    </div>
</template>
