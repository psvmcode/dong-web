<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh, RefreshRight, Warning } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import EChart from '@/components/EChart.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/search';
import type { ConsistencyReport, RebuildResponse } from '@/api/types';
import { thousand } from '@/utils/format';

/**
 * 数据一致性看板。
 *
 * <p>MySQL 是权威源，ES 是可丢弃的检索视图，所以这一页的形状就是「两侧对照」：
 * 左边本地、右边索引，中间是差多少。所有会改数据的操作（修复、同步、重建）都排在下面，
 * 并且严格按「先报告再动手」的顺序。
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
 * 刷新元信息。
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
 * 按差异修复。
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
 * 全量重建。
 */
async function sync() {
    const res = await callSync(api.syncAll);
    if (res.ok) {
        ElMessage.success(`已重建 ${res.data} 条文档`);
        loadMeta();
        await check();
    }
}

/**
 * 零停机重建。
 */
async function rebuild() {
    const res = await callRebuild(api.rebuild);
    if (res.ok) {
        ElMessage.success(`已切到 ${res.data?.toIndex ?? ''}`);
        loadMeta();
    }
}

/**
 * 单条重同步。
 */
function syncOne() {
    void callSyncOne(() => api.syncOne(syncId.value));
}

const esCount = computed(() => (countResult.value?.ok ? countResult.value.data : null));
const dbCount = computed(() => (report.value ? report.value.dbCount : null));
const consistent = computed(() => {
    const body = report.value;
    if (!body) {
        return null;
    }
    return body.missingIds.length === 0 && body.staleIds.length === 0 && body.orphanIds.length === 0;
});

const compareChart = computed(() => {
    if (dbCount.value === null || esCount.value === null) {
        return null;
    }
    return {
        tooltip: { trigger: 'axis' },
        grid: { left: 70, right: 20, top: 30, bottom: 30 },
        xAxis: { type: 'category', data: ['MySQL（权威源）', 'Elasticsearch（检索视图）'] },
        yAxis: { type: 'value' },
        series: [
            {
                type: 'bar',
                barWidth: '38%',
                data: [
                    { value: dbCount.value, itemStyle: { color: '#3d6ff5', borderRadius: [6, 6, 0, 0] } },
                    { value: esCount.value, itemStyle: { color: '#f2b94b', borderRadius: [6, 6, 0, 0] } },
                ],
                label: { show: true, position: 'top', fontWeight: 600 },
            },
        ],
    };
});

onMounted(() => {
    loadMeta();
    void check();
});
</script>

<template>
    <div>
        <SectionHead
            title="数据一致性看板"
            desc="MySQL 是权威源，ES 是可丢弃的检索视图。这里把两侧的数量摆在一起，先看差多少，再决定要不要动手修。"
        >
            <template #actions>
                <el-button size="small" :icon="Refresh" @click="loadMeta()">刷新元信息</el-button>
                <el-button size="small" type="primary" :icon="RefreshRight" :loading="checkLoading" @click="check()">
                    对账
                </el-button>
            </template>
        </SectionHead>

        <div class="cs__state" :class="{ 'cs__state--ok': consistent === true, 'cs__state--bad': consistent === false }">
            <div class="cs__state-icon">{{ consistent === null ? '…' : consistent ? '✓' : '!' }}</div>
            <div>
                <div class="cs__state-title">
                    {{ consistent === null ? '尚未对账' : consistent ? '两侧完全一致' : '两侧不一致' }}
                </div>
                <div class="cs__state-desc">
                    <template v-if="consistent === false">
                        缺失 {{ report?.missingIds.length ?? 0 }} 条（库里有 ES 没有）· 过期
                        {{ report?.staleIds.length ?? 0 }} 条（ES 文档比库里旧）· 孤儿
                        {{ report?.orphanIds.length ?? 0 }} 条（ES 里有但库里已删）
                    </template>
                    <template v-else-if="consistent === true">
                        id 集合与更新时间完全对齐，无需修复
                    </template>
                    <template v-else>点右上角「对账」开始</template>
                </div>
            </div>
            <span class="lab-spacer" />
            <div class="cs__state-meta">
                <div>当前索引</div>
                <div class="cs__state-index">{{ indexResult?.ok ? indexResult.data : '-' }}</div>
            </div>
        </div>

        <div class="cs__body">
            <div class="cs__chart">
                <EChart v-if="compareChart" :option="compareChart" :height="240" />
                <div v-else class="lab-hint">还没有两侧的数量</div>
            </div>
            <div class="cs__diffs">
                <div class="cs__diff">
                    <div class="cs__diff-value cs__diff-value--miss">{{ report?.missingIds.length ?? '-' }}</div>
                    <div class="cs__diff-label">缺失（需补写）</div>
                </div>
                <div class="cs__diff">
                    <div class="cs__diff-value cs__diff-value--stale">{{ report?.staleIds.length ?? '-' }}</div>
                    <div class="cs__diff-label">过期（需覆盖）</div>
                </div>
                <div class="cs__diff">
                    <div class="cs__diff-value cs__diff-value--orphan">{{ report?.orphanIds.length ?? '-' }}</div>
                    <div class="cs__diff-label">孤儿（需删除）</div>
                </div>
                <div class="cs__diff">
                    <div class="cs__diff-value">{{ report?.repairedCount ?? '-' }}</div>
                    <div class="cs__diff-label">上次修复条数</div>
                </div>
            </div>
        </div>

        <div class="cs__ops">
            <div class="cs__op">
                <div class="cs__op-title">按差异修复</div>
                <div class="cs__op-desc">只处理报告里列出的那些 id：补写缺失与过期文档、删除孤儿文档，结束后 refresh。</div>
                <el-button type="warning" :loading="repairLoading" @click="repair()">执行修复</el-button>
                <div v-if="repairResult" class="cs__op-result">
                    <el-tag size="small" :type="repairResult.ok ? 'success' : 'danger'" effect="dark">
                        {{ repairResult.ok ? `修复 ${repairResult.data?.repairedCount ?? 0} 条` : `code ${repairResult.code}` }}
                    </el-tag>
                </div>
            </div>
            <div class="cs__op">
                <div class="cs__op-title">全量重建</div>
                <div class="cs__op-desc">从 MySQL 全量重建索引并清理孤儿文档，期间索引仍可查。</div>
                <el-button type="primary" :loading="syncLoading" @click="sync()">从 MySQL 同步</el-button>
                <div v-if="syncResult" class="cs__op-result">
                    <el-tag size="small" :type="syncResult.ok ? 'success' : 'danger'" effect="dark">
                        {{ syncResult.ok ? `同步 ${syncResult.data} 条` : `code ${syncResult.code}` }}
                    </el-tag>
                </div>
            </div>
            <div class="cs__op">
                <div class="cs__op-title">
                    <el-icon><Warning /></el-icon>
                    零停机重建
                </div>
                <div class="cs__op-desc">建 v(n+1) → 搬数据 → 切别名 → 删旧索引。mapping 改不了，只能换索引。</div>
                <el-button type="danger" plain :loading="rebuildLoading" @click="rebuild()">执行重建</el-button>
                <div v-if="rebuildResult?.ok && rebuildResult.data" class="cs__op-result">
                    <el-tag size="small" effect="plain">{{ rebuildResult.data.fromIndex }}</el-tag>
                    <span>→</span>
                    <el-tag size="small" type="success" effect="dark">{{ rebuildResult.data.toIndex }}</el-tag>
                    <el-tag size="small" effect="plain">{{ thousand(rebuildResult.data.movedDocs) }} 条</el-tag>
                </div>
            </div>
            <div class="cs__op">
                <div class="cs__op-title">单条重同步</div>
                <div class="cs__op-desc">库里有就覆盖，库里没有就删文档——单条重放也是幂等的。</div>
                <div class="lab-row">
                    <el-input-number v-model="syncId" :min="1" size="small" controls-position="right" />
                    <el-button size="small" @click="syncOne()">重同步</el-button>
                </div>
                <div v-if="syncOneResult" class="cs__op-result">
                    <el-tag size="small" :type="syncOneResult.ok ? 'success' : 'danger'" effect="dark">
                        {{ syncOneResult.ok ? '已完成' : `code ${syncOneResult.code}` }}
                    </el-tag>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.cs__state {
    display: flex;
    align-items: center;
    gap: 14px;
    background: #fff;
    border: 1px solid var(--lab-border);
    border-left: 4px solid #c9cdd6;
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    padding: 16px 18px;
    margin-bottom: 14px;
}

.cs__state--ok {
    border-left-color: #16a34a;
}

.cs__state--bad {
    border-left-color: #dc4a4a;
    background: #fffbfb;
}

.cs__state-icon {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    font-weight: 700;
    background: #f0f2f6;
    color: #7a869a;
}

.cs__state--ok .cs__state-icon {
    background: #e6f7ee;
    color: #16a34a;
}

.cs__state--bad .cs__state-icon {
    background: #ffece8;
    color: #dc4a4a;
}

.cs__state-title {
    font-size: 15px;
    font-weight: 600;
}

.cs__state-desc {
    font-size: 12px;
    color: var(--lab-muted);
    margin-top: 4px;
    line-height: 1.6;
}

.cs__state-meta {
    text-align: right;
    font-size: 12px;
    color: var(--lab-muted);
}

.cs__state-index {
    font-family: Menlo, Consolas, monospace;
    font-size: 12px;
    color: var(--lab-text);
    margin-top: 2px;
}

.cs__body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 14px;
    margin-bottom: 14px;
}

.cs__chart {
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    padding: 12px 14px;
}

.cs__diffs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    align-content: start;
}

.cs__diff {
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    padding: 12px;
    text-align: center;
}

.cs__diff-value {
    font-size: 24px;
    font-weight: 700;
}

.cs__diff-value--miss {
    color: #3d6ff5;
}

.cs__diff-value--stale {
    color: #d98900;
}

.cs__diff-value--orphan {
    color: #dc4a4a;
}

.cs__diff-label {
    font-size: 12px;
    color: var(--lab-muted);
    margin-top: 2px;
}

.cs__ops {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 12px;
}

.cs__op {
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
}

.cs__op-title {
    font-size: 13px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
}

.cs__op-desc {
    font-size: 12px;
    color: var(--lab-muted);
    line-height: 1.7;
    flex: 1;
}

.cs__op-result {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
}

@media (max-width: 1000px) {
    .cs__body {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
