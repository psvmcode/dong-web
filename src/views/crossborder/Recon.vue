<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { RefreshRight } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import StatCard from '@/components/StatCard.vue';
import ResultView from '@/components/ResultView.vue';
import EChart from '@/components/EChart.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/crossborder';
import type { ReconDiffResponse, ReconReportResponse } from '@/api/types';
import { money } from '@/utils/format';

/**
 * 对账。
 *
 * <p>对账是唯一能证明「账真的平了」的环节。
 * 这里特意把差错注入做成参数：让渠道回单故意与本地不一致，
 * 才能看到系统在没有异常时根本不会暴露的那些分支。
 */

const batchNo = ref('');
const form = reactive({ errorRate: 0.1, statementErrorRate: 0.1 });
const handling = reactive({ id: 1, diffType: 'AMOUNT_MISMATCH', decision: 'ACCEPT' });

const { result: statementResult, call: callStatement } = useApi<Record<string, unknown>[]>();
const { result: reportResult, call: callReport } = useApi<ReconReportResponse>();
const { result: reportQueryResult, call: callReportQuery } = useApi<ReconReportResponse>();
const { result: handleResult, call: callHandle } = useApi<unknown>();
const { result: overviewResult, call: callOverview } = useApi<Record<string, unknown>>();

const report = computed(() => (reportResult.value?.ok ? reportResult.value.data : reportQueryResult.value?.ok ? reportQueryResult.value.data : null));
const reportRows = computed<ReconDiffResponse[]>(() => (report.value?.diffs ?? []));

const decisionOptions = ['ACCEPT', 'RETRY', 'REFUND', 'MANUAL'];
const diffTypeOptions = ['LONG', 'SHORT', 'AMOUNT_MISMATCH', 'MISSING_IN_CHANNEL', 'MISSING_IN_LOCAL'];

/**
 * 模拟渠道回单。
 */
async function statement() {
    const res = await callStatement(() => api.channelStatement(batchNo.value, form.statementErrorRate));
    if (res.ok) {
        ElMessage.success(`渠道回单已生成 ${res.data?.length ?? 0} 条`);
    }
}

/**
 * 执行一轮对账。
 */
async function run() {
    const res = await callReport(() => api.runRecon(batchNo.value, form.errorRate));
    if (res.ok) {
        batchNo.value = res.data?.batchNo ?? batchNo.value;
        ElMessage[res.data?.balanced ? 'success' : 'warning'](
            res.data?.balanced ? '对平了' : `发现 ${res.data?.diffCount ?? 0} 笔差异`,
        );
        void callOverview(api.reconOverview);
    }
}

/**
 * 查询已有报告。
 */
function loadReport() {
    void callReportQuery(() => api.reconReport(batchNo.value));
}

/**
 * 处理单笔差异。
 *
 * <p>差异列表不返回 id（后端响应体刻意不带），所以这里让用户手填，
 * 并把「差异类型」做成点一下就能从列表里选过来。
 */
async function handleOne() {
    const res = await callHandle(() => api.handleDiff(handling.id, handling.diffType, handling.decision));
    if (res.ok) {
        ElMessage.success('差异已标记处理');
        loadReport();
    }
}

/**
 * 把某一行的差异类型带到处理表单里。
 *
 * @param diffType 差异类型
 */
function useType(diffType: string) {
    handling.diffType = diffType;
    ElMessage.info(`已填入差异类型 ${diffType}，再填 id 就能提交`);
}

/**
 * 批量处理全部未处理差异。
 */
async function handleAll() {
    const res = await callHandle(() => api.handleAll(batchNo.value, handling.decision));
    if (res.ok) {
        ElMessage.success(`已批量处理 ${res.data} 笔`);
        loadReport();
    }
}

const diffChart = computed(() => {
    const data = report.value?.diffByType;
    if (!data || Object.keys(data).length === 0) {
        return null;
    }
    return {
        tooltip: { trigger: 'axis' },
        grid: { left: 90, right: 20, top: 24, bottom: 60 },
        xAxis: { type: 'category', data: Object.keys(data), axisLabel: { rotate: 18 } },
        yAxis: { type: 'value', minInterval: 1 },
        series: [
            {
                type: 'bar',
                data: Object.values(data),
                itemStyle: { color: '#dc4a4a', borderRadius: [6, 6, 0, 0] },
            },
        ],
    };
});

onMounted(() => {
    void callOverview(api.reconOverview);
});
</script>

<template>
    <div>
        <SectionHead
            title="对账"
            desc="本地账与渠道回单逐笔对齐。差错注入不是为了报错，而是为了让「平时看不见的处理分支」被迫出现一次。"
        >
            <template #actions>
                <el-button size="small" :icon="RefreshRight" @click="callOverview(api.reconOverview)">刷新总览</el-button>
            </template>
        </SectionHead>

        <div class="lab-card">
            <div class="lab-card__title">对账执行</div>
            <div class="lab-card__desc">
                先生成渠道回单（可注入差错率），再执行对账。差错率越高，差异越多，越能看清五种差异类型各自的形态。
            </div>
            <el-form size="small" inline label-width="110px">
                <el-form-item label="批次号">
                    <el-input v-model="batchNo" placeholder="清算页创建的批次号" style="width: 240px" />
                </el-form-item>
                <el-form-item label="回单差错率">
                    <el-input-number v-model="form.statementErrorRate" :min="0" :max="1" :step="0.05" :precision="2" controls-position="right" />
                </el-form-item>
                <el-form-item label="对账差错率">
                    <el-input-number v-model="form.errorRate" :min="0" :max="1" :step="0.05" :precision="2" controls-position="right" />
                </el-form-item>
                <el-form-item>
                    <el-button size="small" @click="statement">生成渠道回单</el-button>
                    <el-button type="primary" size="small" @click="run">执行对账</el-button>
                    <el-button size="small" @click="loadReport">查已有报告</el-button>
                </el-form-item>
            </el-form>
        </div>

        <div v-if="report" class="lab-grid lab-grid--4">
            <StatCard label="是否持平" :value="report.balanced ? '已对平' : '有差异'" :tone="report.balanced ? 'good' : 'bad'" />
            <StatCard label="本地 / 渠道笔数" :value="`${report.localCount} / ${report.channelCount}`" hint="两侧全量对比" />
            <StatCard label="匹配 / 差异笔数" :value="`${report.matchedCount} / ${report.diffCount}`" :tone="report.diffCount > 0 ? 'warn' : 'good'" />
            <StatCard label="未处理差异" :value="report.unhandledCount" :tone="report.unhandledCount > 0 ? 'warn' : 'plain'" />
        </div>

        <div class="lab-grid lab-grid--2">
            <div class="lab-card">
                <div class="lab-card__title">差异类型分布</div>
                <EChart v-if="diffChart" :option="diffChart" :height="240" />
                <div v-else class="lab-hint">暂无差异，把差错率调高再跑一次</div>
            </div>
            <div class="lab-card">
                <div class="lab-card__title">对账总览</div>
                <div class="lab-card__desc">跨批次的汇总视图，用来判断差异是偶发还是某个渠道的系统性问题。</div>
                <ResultView :result="overviewResult" :max-height="240" />
            </div>
        </div>

        <div class="lab-card">
            <div class="lab-card__title">差异明细与处理</div>
            <div class="lab-card__desc">
                decision 是自由文本：ACCEPT 接受渠道数据、RETRY 重推、REFUND 退款、MANUAL 转人工。后端只记录决策，不替业务做判断。
            </div>
            <el-form size="small" inline label-width="80px">
                <el-form-item label="决策">
                    <el-select v-model="handling.decision" style="width: 160px" allow-create filterable>
                        <el-option v-for="item in decisionOptions" :key="item" :label="item" :value="item" />
                    </el-select>
                </el-form-item>
                <el-form-item label="差异类型">
                    <el-select v-model="handling.diffType" style="width: 200px">
                        <el-option v-for="item in diffTypeOptions" :key="item" :label="item" :value="item" />
                    </el-select>
                </el-form-item>
                <el-form-item label="差异 id">
                    <el-input-number v-model="handling.id" :min="1" controls-position="right" />
                </el-form-item>
                <el-form-item>
                    <el-button size="small" @click="handleOne">处理单笔</el-button>
                    <el-button type="warning" size="small" @click="handleAll">批量处理全部</el-button>
                </el-form-item>
            </el-form>
            <el-table :data="reportRows" border stripe size="small" max-height="360">
                <el-table-column prop="remittanceNo" label="汇款单号" min-width="180" show-overflow-tooltip />
                <el-table-column prop="diffType" label="差异类型" min-width="160" />
                <el-table-column label="本地金额" width="120">
                    <template #default="{ row }">{{ money(row.localAmount) }}</template>
                </el-table-column>
                <el-table-column label="渠道金额" width="120">
                    <template #default="{ row }">{{ money(row.channelAmount) }}</template>
                </el-table-column>
                <el-table-column label="差额" width="120">
                    <template #default="{ row }">{{ money(row.diffAmount) }}</template>
                </el-table-column>
                <el-table-column label="处理状态" width="100">
                    <template #default="{ row }">
                        <el-tag :type="row.handleStatus === 1 ? 'success' : 'warning'" size="small">
                            {{ row.handleStatus === 1 ? '已处理' : '未处理' }}
                        </el-tag>
                    </template>
                </el-table-column>
                <el-table-column label="操作" min-width="140" fixed="right">
                    <template #default="{ row }">
                        <el-button size="small" @click="useType(row.diffType)">选用该类型</el-button>
                    </template>
                </el-table-column>
            </el-table>
            <ResultView :result="handleResult" title="处理返回" :max-height="160" style="margin-top: 10px" />
        </div>

        <div class="lab-card">
            <div class="lab-card__title">原始报告</div>
            <ResultView :result="reportResult" title="执行对账的返回" :max-height="240" />
            <ResultView :result="reportQueryResult" title="查询报告返回" :max-height="200" style="margin-top: 10px" />
            <ResultView :result="statementResult" title="渠道回单" :max-height="200" style="margin-top: 10px" />
        </div>
    </div>
</template>
