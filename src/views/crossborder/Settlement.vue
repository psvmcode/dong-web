<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { RefreshRight } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import StatCard from '@/components/StatCard.vue';
import ResultView from '@/components/ResultView.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/crossborder';
import { money } from '@/utils/format';
import type { ChannelConfig, ReconDiffResponse, SettlementBatchResponse } from '@/api/types';

/**
 * 清算批次。
 *
 * <p>汇款扣款之后并不能立刻给收款方入账：要按渠道攒批，到 cutoff 再统一清算。
 * 这里能看到渠道配置（时效、限额、费率）、批次归集、清算与超期关闭。
 */

const batchForm = reactive({ channel: 'SWIFT', currency: 'CNY', cutoffMinutes: 60 });
const adjustForm = reactive({ channel: 1, etaMinutes: 30, perTxLimit: 100000, fixedFee: 10, rateFee: 0.001, enabled: 1 });
const collectLimit = ref(100);
const selectedBatch = ref('');
const reconBatch = ref('');

const { result: channelsResult, call: callChannels } = useApi<ChannelConfig[]>();
const { result: batchesResult, call: callBatches } = useApi<SettlementBatchResponse[]>();
const { result: batchResult, call: callBatchDetail } = useApi<SettlementBatchResponse>();
const { result: createResult, call: callCreate } = useApi<string>();
const { result: opResult, call: callOp } = useApi<unknown>();
const { result: statusResult, call: callStatus } = useApi<Record<string, unknown>>();
const { result: diffResult, call: callDiffs } = useApi<ReconDiffResponse[]>();

const channels = computed<ChannelConfig[]>(() => (channelsResult.value?.ok && channelsResult.value.data ? channelsResult.value.data : []));
const batches = computed<SettlementBatchResponse[]>(() =>
    batchesResult.value?.ok && batchesResult.value.data ? batchesResult.value.data : [],
);
const diffs = computed<ReconDiffResponse[]>(() => (diffResult.value?.ok && diffResult.value.data ? diffResult.value.data : []));

/**
 * 刷新渠道与批次。
 */
function refresh() {
    void callChannels(api.channels);
    void callBatches(api.batchList);
    void callStatus(api.batchStatus);
}

/**
 * 创建清算批次。
 */
async function createBatch() {
    const res = await callCreate(() => api.createBatch(batchForm.channel, batchForm.currency, batchForm.cutoffMinutes));
    if (res.ok && res.data) {
        selectedBatch.value = res.data;
        ElMessage.success(`批次已创建：${res.data}`);
        refresh();
    }
}

/**
 * 选中批次。
 *
 * @param batchNo 批次号
 */
function pick(batchNo: string) {
    selectedBatch.value = batchNo;
    void callBatchDetail(() => api.batchDetail(batchNo));
}

/**
 * 归集已扣款的汇款单。
 */
async function collect() {
    const res = await callOp(() => api.collect(selectedBatch.value, collectLimit.value));
    if (res.ok) {
        ElMessage.success(`已归集 ${res.data} 笔`);
        await pick(selectedBatch.value);
        refresh();
    }
}

/**
 * 执行清算。
 */
async function settle() {
    const res = await callOp(() => api.settle(selectedBatch.value));
    if (res.ok) {
        ElMessage.success(`已清算 ${res.data} 笔`);
        await pick(selectedBatch.value);
        refresh();
    }
}

/**
 * 调整渠道配置。
 */
async function adjust() {
    const res = await callOp(() => api.adjustChannel(adjustForm.channel, { ...adjustForm }));
    if (res.ok) {
        ElMessage.success('渠道配置已更新');
        void callChannels(api.channels);
    }
}

/**
 * 启停渠道。
 *
 * @param channel 渠道编码
 * @param enabled 目标状态
 */
async function toggle(channel: number, enabled: boolean) {
    const res = await callOp(() => api.toggleChannel(channel, enabled));
    if (res.ok) {
        ElMessage.success(enabled ? '渠道已启用' : '渠道已熔断');
        void callChannels(api.channels);
    }
}

onMounted(refresh);
</script>

<template>
    <div>
        <SectionHead
            title="清算批次"
            desc="汇款扣款成功之后要按渠道攒批、到点统一清算。这里能看到渠道被熔断、批次归集、执行清算与超期关闭这条完整流程。"
        >
            <template #actions>
                <el-button size="small" :icon="RefreshRight" @click="refresh()">刷新</el-button>
                <el-button size="small" type="warning" @click="callOp(api.closeOverdue)">关闭超期批次</el-button>
            </template>
        </SectionHead>

        <div class="lab-grid lab-grid--3">
            <StatCard label="渠道数" :value="channels.length" tone="accent" hint="含已熔断的渠道" />
            <StatCard label="批次总数" :value="batches.length" hint="全部历史批次" />
            <StatCard
                label="当前选中批次"
                :value="selectedBatch || '-'"
                :tone="selectedBatch ? 'good' : 'plain'"
                hint="详情里的操作都针对它"
            />
        </div>

        <div class="lab-card">
            <div class="lab-card__title">清算渠道配置</div>
            <div class="lab-card__desc">
                时效、限额与费率直接决定渠道路由的评分。渠道故障时可以把它熔断，路由会自动绕开。
            </div>
            <el-table :data="channels" border stripe size="small">
                <el-table-column prop="channel" label="编码" width="90" />
                <el-table-column prop="etaMinutes" label="时效(分)" width="110" />
                <el-table-column label="单笔限额" width="130">
                    <template #default="{ row }">{{ money(row.perTxLimit) }}</template>
                </el-table-column>
                <el-table-column prop="fixedFee" label="固定费" width="110" />
                <el-table-column prop="rateFee" label="费率" width="110" />
                <el-table-column label="状态" width="100">
                    <template #default="{ row }">
                        <el-tag :type="row.enabled === 1 ? 'success' : 'danger'" size="small">
                            {{ row.enabled === 1 ? '启用' : '熔断' }}
                        </el-tag>
                    </template>
                </el-table-column>
                <el-table-column label="操作" min-width="160">
                    <template #default="{ row }">
                        <el-button size="small" @click="Object.assign(adjustForm, row)">填到表单</el-button>
                        <el-button size="small" :type="row.enabled === 1 ? 'danger' : 'success'" @click="toggle(row.channel, row.enabled !== 1)">
                            {{ row.enabled === 1 ? '熔断' : '启用' }}
                        </el-button>
                    </template>
                </el-table-column>
            </el-table>

            <el-divider content-position="left" style="margin: 16px 0 12px">调整渠道参数</el-divider>
            <el-form size="small" inline label-width="90px">
                <el-form-item label="渠道编码">
                    <el-input-number v-model="adjustForm.channel" :min="1" controls-position="right" />
                </el-form-item>
                <el-form-item label="时效(分)">
                    <el-input-number v-model="adjustForm.etaMinutes" :min="0" controls-position="right" />
                </el-form-item>
                <el-form-item label="单笔限额">
                    <el-input-number v-model="adjustForm.perTxLimit" :min="0" :precision="2" controls-position="right" />
                </el-form-item>
                <el-form-item label="固定费">
                    <el-input-number v-model="adjustForm.fixedFee" :min="0" :precision="2" controls-position="right" />
                </el-form-item>
                <el-form-item label="费率">
                    <el-input-number v-model="adjustForm.rateFee" :min="0" :precision="4" :step="0.001" controls-position="right" />
                </el-form-item>
                <el-form-item label="启用">
                    <el-input-number v-model="adjustForm.enabled" :min="0" :max="1" controls-position="right" />
                </el-form-item>
                <el-form-item>
                    <el-button type="primary" size="small" @click="adjust">保存配置</el-button>
                </el-form-item>
            </el-form>
        </div>

        <div class="lab-grid lab-grid--2">
            <div class="lab-card">
                <div class="lab-card__title">创建清算批次</div>
                <div class="lab-card__desc">cutoffMinutes 决定了批次的截止时间，超过之后会被 close-overdue 自动关闭。</div>
                <el-form size="small" label-width="96px">
                    <el-form-item label="渠道">
                        <el-select v-model="batchForm.channel">
                            <el-option label="SWIFT" value="SWIFT" />
                            <el-option label="CIPS" value="CIPS" />
                            <el-option label="LOCAL" value="LOCAL" />
                        </el-select>
                    </el-form-item>
                    <el-form-item label="币种">
                        <el-input v-model="batchForm.currency" />
                    </el-form-item>
                    <el-form-item label="截止分钟">
                        <el-input-number v-model="batchForm.cutoffMinutes" :min="1" controls-position="right" />
                    </el-form-item>
                    <el-button type="primary" size="small" @click="createBatch">创建批次</el-button>
                </el-form>
                <ResultView :result="createResult" title="批次号" :max-height="120" style="margin-top: 10px" />
            </div>

            <div class="lab-card">
                <div class="lab-card__title">批次操作</div>
                <div class="lab-card__desc">归集把已扣款的汇款单并入批次，清算给收款方入账并推进状态。</div>
                <el-form size="small" label-width="96px">
                    <el-form-item label="批次号">
                        <el-input v-model="selectedBatch" placeholder="创建后自动填入" />
                    </el-form-item>
                    <el-form-item label="归集条数">
                        <el-input-number v-model="collectLimit" :min="1" :max="1000" controls-position="right" />
                    </el-form-item>
                </el-form>
                <div class="lab-row">
                    <el-button size="small" @click="pick(selectedBatch)">查详情</el-button>
                    <el-button size="small" type="primary" @click="collect">归集</el-button>
                    <el-button size="small" type="success" @click="settle">执行清算</el-button>
                </div>
                <ResultView :result="batchResult" title="批次详情" :max-height="200" style="margin-top: 10px" />
            </div>
        </div>

        <div class="lab-card">
            <div class="lab-card__title">批次列表</div>
            <el-table :data="batches" border stripe size="small" max-height="360">
                <el-table-column label="批次号" min-width="180">
                    <template #default="{ row }">
                        <el-link type="primary" @click="pick(row.batchNo)">{{ row.batchNo }}</el-link>
                    </template>
                </el-table-column>
                <el-table-column prop="channel" label="渠道" width="90" />
                <el-table-column prop="currency" label="币种" width="80" />
                <el-table-column prop="totalCount" label="笔数" width="90" />
                <el-table-column label="金额" width="130">
                    <template #default="{ row }">{{ money(row.totalAmount) }}</template>
                </el-table-column>
                <el-table-column label="状态" width="110">
                    <template #default="{ row }">
                        <el-tag :type="row.status === 'SETTLED' ? 'success' : row.status === 'CLOSED' ? 'info' : 'warning'" size="small">
                            {{ row.status }}
                        </el-tag>
                    </template>
                </el-table-column>
                <el-table-column prop="cutoffTime" label="截止时间" min-width="160" />
            </el-table>
        </div>

        <div class="lab-grid lab-grid--2">
            <div class="lab-card">
                <div class="lab-card__title">批次状态分布</div>
                <ResultView :result="statusResult" :max-height="200" />
            </div>
            <div class="lab-card">
                <div class="lab-card__title">按批次查对账差异</div>
                <div class="lab-row" style="margin-bottom: 10px">
                    <el-input v-model="reconBatch" placeholder="批次号，留空查全部" style="width: 240px" clearable />
                    <el-button size="small" @click="callDiffs(() => api.reconDiffs(reconBatch || undefined))">查询</el-button>
                </div>
                <el-table :data="diffs" border stripe size="small" max-height="260">
                    <el-table-column prop="remittanceNo" label="汇款单号" min-width="180" show-overflow-tooltip />
                    <el-table-column prop="diffType" label="差异类型" min-width="140" />
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
                </el-table>
                <ResultView :result="opResult" title="操作返回" :max-height="160" style="margin-top: 10px" />
            </div>
        </div>

        <el-alert
            type="info"
            :closable="false"
            show-icon
            title="流程顺序"
            description="先在账户页开户，再到汇款页汇出并走到 FUNDS_DEBITED，最后回到这里创建批次并归集清算——三个阶段缺一步，批次里就是空的。"
        />
    </div>
</template>
