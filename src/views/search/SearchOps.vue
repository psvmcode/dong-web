<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh, RefreshRight, Warning } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import StatCard from '@/components/StatCard.vue';
import ResultView from '@/components/ResultView.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/search';
import type { ConsistencyReport, RebuildResponse } from '@/api/types';
import { thousand } from '@/utils/format';

/**
 * 索引一致性与运维。
 *
 * <p>这一页的按钮都是会改数据的，所以按「先报告再修复」的顺序摆：
 * consistency 只看不改，repair 按报告结果补写与删除，sync / rebuild 才是重动作。
 */

const { result: countResult, call: callCount } = useApi<number>();
const { result: indexResult, call: callIndex } = useApi<string>();
const { loading: checkLoading, result: checkResult, call: callCheck } = useApi<ConsistencyReport>();
const { loading: repairLoading, result: repairResult, call: callRepair } = useApi<ConsistencyReport>();
const { loading: syncLoading, result: syncResult, call: callSync } = useApi<number>();
const { loading: rebuildLoading, result: rebuildResult, call: callRebuild } = useApi<RebuildResponse>();
const { result: syncOneResult, call: callSyncOne } = useApi<null>();

const syncId = ref(1);
const report = ref<ConsistencyReport | null>(null);

/**
 * 拉取文档数与索引别名。
 */
function loadMeta() {
    void callCount(api.docCount);
    void callIndex(api.currentIndex);
}

/**
 * 对账，只看不改。
 */
async function check() {
    const res = await callCheck(api.consistency);
    report.value = res.ok ? res.data : null;
}

/**
 * 按上一次报告结果修复。
 */
async function repair() {
    const res = await callRepair(api.repairConsistency);
    if (res.ok) {
        report.value = res.data;
        ElMessage.success(`已修复 ${res.data?.repairedCount ?? 0} 条`);
        loadMeta();
    }
}

/**
 * 全量重建索引。
 */
async function sync() {
    const res = await callSync(api.syncAll);
    if (res.ok) {
        ElMessage.success(`已重建 ${res.data} 条文档`);
        loadMeta();
    }
}

/**
 * 零停机重建：建新版本、搬数据、切别名、删旧索引。
 */
async function rebuild() {
    const res = await callRebuild(api.rebuild);
    if (res.ok) {
        ElMessage.success(`已切到 ${res.data?.toIndex ?? ''}`);
        loadMeta();
    }
}

/**
 * 重同步单个商品。
 */
function syncOne() {
    void callSyncOne(() => api.syncOne(syncId.value));
}

const consistent = computed(() => {
    const body = report.value;
    if (!body) {
        return null;
    }
    return body.missingIds.length === 0 && body.staleIds.length === 0 && body.orphanIds.length === 0;
});

onMounted(() => {
    loadMeta();
    void check();
});
</script>

<template>
    <div>
        <SectionHead
            title="一致性与运维"
            desc="ES 是可丢弃的检索视图：不一致就修、结构要变就重建。这里把「发现差异」与「按差异修复」做成两个独立按钮，避免一次误点直接改写数据。"
        >
            <template #actions>
                <el-button size="small" :icon="Refresh" @click="loadMeta()">刷新元信息</el-button>
                <el-button size="small" :icon="RefreshRight" @click="check()">重新对账</el-button>
            </template>
        </SectionHead>

        <el-alert
            v-if="consistent === false"
            type="warning"
            show-icon
            :closable="false"
            title="两侧不一致"
            description="缺失 = 库里有 ES 没有，过期 = ES 文档比库里旧，孤儿 = ES 里有但库里已删。点「按差异修复」让两侧重新收敛。"
            style="margin-bottom: 16px"
        />
        <el-alert
            v-else-if="consistent === true"
            type="success"
            show-icon
            :closable="false"
            title="两侧一致"
            description="MySQL 与 ES 的 id 集合、更新时间完全一致，无需修复。"
            style="margin-bottom: 16px"
        />

        <div class="lab-grid lab-grid--4">
            <StatCard label="ES 文档数" :value="thousand(countResult?.ok ? countResult.data : 0)" tone="accent" hint="索引里的文档总量" />
            <StatCard label="当前索引" :value="indexResult?.ok ? indexResult.data : '未获取'" hint="别名指向的真实索引" />
            <StatCard
                label="缺失 / 过期 / 孤儿"
                :value="
                    report
                        ? `${report.missingIds.length} / ${report.staleIds.length} / ${report.orphanIds.length}`
                        : '未对账'
                "
                :tone="consistent === false ? 'bad' : consistent === true ? 'good' : 'plain'"
                hint="以 MySQL 为权威源"
            />
            <StatCard label="上次修复条数" :value="report ? thousand(report.repairedCount) : '-'" hint="repair 只修报告里的差异" />
        </div>

        <div class="lab-card">
            <div class="lab-card__title">对账与修复</div>
            <div class="lab-card__desc">修复是一次性动作：补写缺失与过期文档、删除孤儿文档，结束后会 refresh 让结果立刻可查。</div>
            <div class="lab-row">
                <el-button type="primary" :loading="checkLoading" @click="check()">对账（只看不改）</el-button>
                <el-button type="warning" :loading="repairLoading" @click="repair()">按差异修复</el-button>
            </div>
            <ResultView :result="checkResult" title="对账报告" :max-height="260" style="margin-top: 12px" />
        </div>

        <div class="lab-grid lab-grid--2">
            <div class="lab-card">
                <div class="lab-card__title">全量同步</div>
                <div class="lab-card__desc">从 MySQL 全量重建索引并清理孤儿文档。数据量大时要跑一会儿，期间索引仍可查。</div>
                <el-button type="primary" :loading="syncLoading" @click="sync()">全量重建索引</el-button>
                <ResultView :result="syncResult" title="同步条数" :max-height="160" style="margin-top: 12px" />
            </div>

            <div class="lab-card">
                <div class="lab-card__title">单条重同步</div>
                <div class="lab-card__desc">库里有就覆盖文档，库里没有就删文档——单侧重放也是幂等的。</div>
                <div class="lab-row">
                    <el-input-number v-model="syncId" :min="1" size="small" controls-position="right" />
                    <el-button size="small" type="primary" @click="syncOne()">重同步该商品</el-button>
                </div>
                <ResultView :result="syncOneResult" title="重同步结果" :max-height="160" style="margin-top: 12px" />
            </div>
        </div>

        <div class="lab-card">
            <div class="lab-card__title">
                <el-icon><Warning /></el-icon>
                零停机重建索引
            </div>
            <div class="lab-card__desc">
                变更 mapping 只能重建：建 v(n+1) → 搬数据 → 切别名 → 删旧索引。全程不停服务，别名切换是原子动作。
            </div>
            <el-button type="danger" plain :loading="rebuildLoading" @click="rebuild()">执行重建</el-button>
            <ResultView :result="rebuildResult" title="重建结果" :max-height="220" style="margin-top: 12px" />
        </div>
    </div>
</template>
