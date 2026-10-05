<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { RefreshRight } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import { useApi } from '@/composables/useApi';
import { money, uuid } from '@/utils/format';
import * as api from '@/api/crossborder';
import type {
    ComplianceRecordResponse,
    RemittanceEventResponse,
    RemittanceResponse,
} from '@/api/types';

/**
 * 跨境汇款。
 *
 * <p>做成手机银行汇款单的样子：左边填汇款信息，右边是这一笔的履约进度。
 * 停在「待人工审核」说明金额或频次触发了风控，停在「合规拒绝」说明命中制裁或 KYC，
 * 这两个都不是异常，是设计好的分支。
 */

const form = reactive({
    idempotentKey: uuid('IDEM'),
    payerAccountNo: '',
    payeeAccountNo: '',
    sourceAmount: 1000,
    channel: 'SWIFT',
    urgent: false,
    quoteNo: '',
});

const target = ref('');

const review = reactive({ reviewer: 'ops-1', note: '资料齐全' });

const list = reactive({ pageNum: 1, pageSize: 10, status: '' });

const { result: createResult, call: callCreate } = useApi<RemittanceResponse>();

const { result: detailResult, call: callDetail } = useApi<RemittanceResponse>();

const { result: complianceResult, call: callCompliance } = useApi<ComplianceRecordResponse[]>();

const { result: eventsResult, call: callEvents } = useApi<RemittanceEventResponse[]>();

const { result: pageResult, call: callPage } = useApi<{ total: number; list: RemittanceResponse[] }>();

const { result: opResult, call: callOp } = useApi<unknown>();

const { result: runtimeResult, call: callRuntime } = useApi<Record<string, unknown>>();

const rows = computed<RemittanceResponse[]>(() =>
    pageResult.value?.ok && pageResult.value.data ? pageResult.value.data.list : [],
);

const created = computed(() => (createResult.value?.ok ? createResult.value.data : null));

const total = computed(() => (pageResult.value?.ok && pageResult.value.data ? pageResult.value.data.total : 0));

/** 履约进度节点，对应汇款状态机里的五个阶段。 */
const STAGES = ['已受理', '合规通过', '锁汇完成', '资金扣划', '清算完成'];

/**
 * 提交一笔汇款。成功后自动把返回的汇款单号带进右侧的进度视图。
 */
async function submit(): Promise<void> {
    const res = await callCreate(() =>
        api.createRemittance({
            idempotentKey: form.idempotentKey,
            payerAccountNo: form.payerAccountNo,
            payeeAccountNo: form.payeeAccountNo,
            sourceAmount: form.sourceAmount,
            channel: form.channel,
            urgent: form.urgent,
            quoteNo: form.quoteNo || undefined,
        }),
    );
    if (!res.ok || !res.data) {
        ElMessage.error(res.message);
        return;
    }
    target.value = res.data.remittanceNo;
    ElMessage.success(`汇款已受理：${res.data.remittanceNo} → ${res.data.status}`);
    await loadOne();
    loadList();
}

const stageIndex = computed(() => {
    const status = created.value?.status ?? '';
    if (status === 'CREATED') return 0;
    if (status === 'PENDING_REVIEW' || status === 'COMPLIANCE_REJECTED' || status === 'FAILED') return 1;
    if (status === 'QUOTE_LOCKED') return 2;
    if (status === 'FUNDS_DEBITED' || status === 'SETTLING') return 3;
    return 4;
});

const statusHint = computed(() => {
    const status = created.value?.status ?? '';
    const hints: Record<string, string> = {
        CREATED: '已受理，正在做合规筛查',
        PENDING_REVIEW: '触发人工审核，等待放行或驳回',
        COMPLIANCE_REJECTED: '合规筛查未通过，汇款被拒绝',
        QUOTE_LOCKED: '汇率已锁定，等待扣款',
        FUNDS_DEBITED: '资金已扣划，等待清算',
        SETTLING: '清算进行中',
        SETTLED: '清算完成，流程结束',
        REFUNDED: '已退款',
        RETURNING: '退汇处理中',
        RETURNED: '已退汇',
    };
    return hints[status] ?? created.value?.failReason ?? '';
});

/**
 * 加载一笔汇款的详情、合规记录与流转历史。
 *
 * @param remittanceNo 汇款单号
 */
async function loadOne(remittanceNo?: string): Promise<void> {
    if (remittanceNo) {
        target.value = remittanceNo;
    }
    if (!target.value) {
        return;
    }
    await Promise.all([
        callDetail(() => api.remittanceDetail(target.value as string)),
        callCompliance(() => api.complianceRecords(target.value as string)),
        callEvents(() => api.remittanceEvents(target.value as string)),
    ]);
}

/**
 * 加载汇款单列表。
 */
function loadList(): void {
    void callPage(() =>
        api.pageRemittance({
            pageNum: list.pageNum,
            pageSize: list.pageSize,
            status: list.status || undefined,
        }),
    );
}
</script>

<template>
    <div>
        <SectionHead
            title="跨境汇款"
            desc="幂等提交 → 合规筛查 → 锁汇 → 扣款 → 清算。同一幂等键提交两次应当只有一单，这是超时重试敢重发的前提。"
        >
            <template #actions>
                <el-button size="small" :icon="RefreshRight" @click="loadList()">刷新列表</el-button>
            </template>
        </SectionHead>

        <div class="rm__hero">
            <div class="rm__amount">
                <div class="rm__amount-label">本笔汇出</div>
                <div class="rm__amount-value">
                    <span>¥</span>{{ money(form.sourceAmount) }}
                </div>
            </div>
            <div class="rm__hero-meta">
                <div>{{ form.channel }} · {{ form.urgent ? '加急' : '普通' }}</div>
                <div class="rm__hero-hint">换一个幂等键再提交，可以验证重复提交会被挡</div>
            </div>
        </div>

        <div class="rm__body">
            <div class="rm__panel">
                <div class="rm__panel-title">填写汇款单</div>
                <el-form size="small" label-width="88px">
                    <el-form-item label="付款账号">
                        <el-input v-model="form.payerAccountNo" placeholder="从账户页复制" />
                    </el-form-item>
                    <el-form-item label="收款账号">
                        <el-input v-model="form.payeeAccountNo" placeholder="从账户页复制" />
                    </el-form-item>
                    <el-form-item label="汇出金额">
                        <el-input-number v-model="form.sourceAmount" :min="1" :precision="2" controls-position="right" />
                    </el-form-item>
                    <el-form-item label="渠道">
                        <el-select v-model="form.channel" style="width: 140px">
                            <el-option label="SWIFT" value="SWIFT" />
                            <el-option label="CIPS" value="CIPS" />
                            <el-option label="LOCAL" value="LOCAL" />
                        </el-select>
                    </el-form-item>
                    <el-form-item label="加急">
                        <el-switch v-model="form.urgent" />
                    </el-form-item>
                    <el-form-item label="幂等键">
                        <el-input v-model="form.idempotentKey" />
                    </el-form-item>
                    <el-form-item label="锁汇报价">
                        <el-input v-model="form.quoteNo" placeholder="留空则由后端询价" />
                    </el-form-item>
                    <el-button type="primary" size="large" class="rm__submit" @click="submit">提交汇款</el-button>
                </el-form>
                <div v-if="createResult" class="rm__result">
                    <el-tag :type="createResult.ok ? 'success' : 'danger'" effect="dark">
                        {{ createResult.ok ? '受理成功' : `code ${createResult.code}` }}
                    </el-tag>
                    <span>{{ createResult.message }}</span>
                </div>
            </div>

            <div class="rm__panel">
                <div class="rm__panel-title">履约进度</div>
                <el-steps :active="stageIndex" direction="vertical" finish-status="success" space="38px" class="rm__steps">
                    <el-step v-for="stage in STAGES" :key="stage" :title="stage" />
                </el-steps>
                <div v-if="statusHint" class="rm__hint">{{ statusHint }}</div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.rm__body {
    display: grid;
    grid-template-columns: 380px minmax(0, 1fr);
    gap: 12px;
    align-items: start;
}

.rm__panel {
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    padding: 14px 16px;
    margin-bottom: 12px;
}

.rm__panel-title {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 10px;
}

.rm__hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    background: linear-gradient(135deg, #123f5e, #1b7fa6);
    border-radius: 14px;
    padding: 20px 24px;
    color: #fff;
    margin-bottom: 14px;
}

.rm__amount-label {
    font-size: 12px;
    opacity: 0.75;
}

.rm__amount-value {
    font-size: 34px;
    font-weight: 700;
    margin-top: 6px;
}

.rm__amount-value span {
    font-size: 17px;
    margin-right: 3px;
    opacity: 0.85;
}

.rm__hero-meta {
    text-align: right;
}

.rm__hero-hint {
    font-size: 12px;
    opacity: 0.72;
    margin-top: 4px;
}

.rm__hint {
    margin-top: 12px;
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.16);
    border-radius: 8px;
    font-size: 12px;
}

.rm__steps {
    margin-top: 6px;
}

@media (max-width: 1000px) {
    .rm__body {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
