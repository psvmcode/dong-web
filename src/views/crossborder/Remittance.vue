<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { RefreshRight } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import ResultView from '@/components/ResultView.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/crossborder';
import type {
    ComplianceRecordResponse,
    RemittanceEventResponse,
    RemittanceResponse,
} from '@/api/types';
import { money, uuid } from '@/utils/format';

/**
 * 汇款与合规。
 *
 * <p>这一页是整条跨境链路的主干：幂等提交 → 合规筛查 → 锁汇 → 扣款 → 清算。
 * 幂等键被刻意做成「可一键重新生成」：换个键再提交一次，用来验证
 * 同键第二次提交会被挡（1006），而不是再建一单。
 */

const form = reactive({
    idempotentKey: uuid(),
    payerAccountNo: '',
    payeeAccountNo: '',
    sourceAmount: 1000,
    channel: 'SWIFT',
    urgent: false,
    quoteNo: '',
});

const target = ref('');
const review = reactive({ reviewer: 'ops-1', note: '资料齐全' });
const returnForm = reactive({ reason: '收款账户有误', operator: 'ops-1' });
const list = reactive({ pageNum: 1, pageSize: 10, status: '' });

const { result: createResult, call: callCreate } = useApi<RemittanceResponse>();
const { result: detailResult, call: callDetail } = useApi<RemittanceResponse>();
const { result: complianceResult, call: callCompliance } = useApi<ComplianceRecordResponse[]>();
const { result: eventsResult, call: callEvents } = useApi<RemittanceEventResponse[]>();
const { result: pageResult, call: callPage } = useApi<{ list: RemittanceResponse[]; total: number }>();
const { result: opResult, call: callOp } = useApi<unknown>();
const { result: runtimeResult, call: callRuntime } = useApi<Record<string, unknown>>();

const rows = computed<RemittanceResponse[]>(() => (pageResult.value?.ok && pageResult.value.data ? pageResult.value.data.list : []));
const compliance = computed<ComplianceRecordResponse[]>(() =>
    complianceResult.value?.ok && complianceResult.value.data ? complianceResult.value.data : [],
);
const events = computed<RemittanceEventResponse[]>(() =>
    eventsResult.value?.ok && eventsResult.value.data ? eventsResult.value.data : [],
);
const created = computed(() => (createResult.value?.ok ? createResult.value.data : null));
const total = computed(() => (pageResult.value?.ok && pageResult.value.data ? pageResult.value.data.total : 0));

/**
 * 发起汇款。
 */
async function submit() {
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
    if (res.ok && res.data) {
        target.value = res.data.remittanceNo;
        ElMessage.success(`汇款已受理：${res.data.remittanceNo} → ${res.data.status}`);
        await loadOne();
        loadList();
    }
}

/**
 * 换一个幂等键，便于连发两次验证去重。
 */
function rotateKey() {
    form.idempotentKey = uuid();
}

/**
 * 加载单笔详情与其合规、流水。
 */
async function loadOne() {
    if (!target.value) {
        return;
    }
    await Promise.all([
        callDetail(() => api.remittanceDetail(target.value)),
        callCompliance(() => api.complianceRecords(target.value)),
        callEvents(() => api.remittanceEvents(target.value)),
    ]);
}

/**
 * 加载列表。
 */
function loadList() {
    void callPage(() => api.pageRemittance({ pageNum: list.pageNum, pageSize: list.pageSize, status: list.status || undefined }));
}

/**
 * 按幂等键查询。
 */
function byIdempotent() {
    void callDetail(() => api.remittanceByIdempotent(form.idempotentKey));
}

/**
 * 人工审核放行。
 */
async function approve() {
    const res = await callOp(() => api.approve(target.value, review.reviewer, review.note));
    if (res.ok) {
        ElMessage.success('已放行');
        await loadOne();
    }
}

/**
 * 人工审核驳回。
 */
async function reject() {
    const res = await callOp(() => api.reject(target.value, review.reviewer, review.note));
    if (res.ok) {
        ElMessage.warning('已驳回，日限额占用已释放');
        await loadOne();
    }
}

/**
 * 发起退汇。
 */
async function doReturn() {
    const res = await callOp(() => api.returnRemittance(target.value, returnForm.reason, returnForm.operator));
    if (res.ok) {
        ElMessage.success('已退汇');
        await loadOne();
    }
}

/**
 * 重置重试计数并重新投递清算消息。
 */
async function retry() {
    const res = await callOp(() => api.retry(target.value));
    if (res.ok) {
        ElMessage.success('已重新投递清算消息');
        await loadOne();
    }
}

const statusOptions = [
    'CREATED',
    'COMPLIANCE_REJECTED',
    'QUOTE_LOCKED',
    'FUNDS_DEBITED',
    'SETTLING',
    'SETTLED',
    'FAILED',
    'REFUNDED',
    'PENDING_REVIEW',
    'RETURNING',
    'RETURNED',
];

onMounted(() => {
    loadList();
    void callRuntime(api.remittanceRuntime);
});
</script>

<template>
    <div>
        <SectionHead
            title="汇款与合规"
            desc="幂等提交 → 五级合规筛查 → 锁汇 → 扣款 → 清算。同一幂等键提交两次应当只有一单，这是超时重试敢重发的全部前提。"
        >
            <template #actions>
                <el-button size="small" :icon="RefreshRight" @click="loadList(); callRuntime(api.remittanceRuntime)">刷新</el-button>
            </template>
        </SectionHead>

        <div class="lab-grid lab-grid--2">
            <div class="lab-card">
                <div class="lab-card__title">发起汇款</div>
                <div class="lab-card__desc">
                    金额超过单笔限额会进入待人工审核；命中制裁名单会被直接拒绝；两者都不是异常，是设计。
                </div>
                <el-form size="small" label-width="96px">
                    <el-form-item label="幂等键">
                        <div class="lab-row" style="flex: 1">
                            <el-input v-model="form.idempotentKey" style="flex: 1" />
                            <el-button size="small" @click="rotateKey">换一个</el-button>
                        </div>
                    </el-form-item>
                    <el-form-item label="付款账号">
                        <el-input v-model="form.payerAccountNo" placeholder="从账户页复制" />
                    </el-form-item>
                    <el-form-item label="收款账号">
                        <el-input v-model="form.payeeAccountNo" placeholder="从账户页复制" />
                    </el-form-item>
                    <div class="lab-grid lab-grid--2">
                        <el-form-item label="金额">
                            <el-input-number v-model="form.sourceAmount" :min="1" :precision="2" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="渠道">
                            <el-select v-model="form.channel">
                                <el-option label="SWIFT" value="SWIFT" />
                                <el-option label="CIPS" value="CIPS" />
                                <el-option label="LOCAL" value="LOCAL" />
                            </el-select>
                        </el-form-item>
                    </div>
                    <el-form-item label="加急">
                        <el-switch v-model="form.urgent" />
                    </el-form-item>
                    <el-form-item label="报价号">
                        <el-input v-model="form.quoteNo" placeholder="留空则由后端询价" />
                    </el-form-item>
                </el-form>
                <div class="lab-row">
                    <el-button type="primary" size="small" @click="submit">发起汇款</el-button>
                    <el-button size="small" @click="byIdempotent">按幂等键回查</el-button>
                </div>
                <div v-if="created" class="lab-row" style="margin-top: 10px">
                    <el-tag size="small" effect="plain">状态 {{ created.status }}</el-tag>
                    <el-tag size="small" effect="plain">汇率 {{ created.exchangeRate }}</el-tag>
                    <el-tag size="small" effect="plain">到账 {{ money(created.targetAmount) }}</el-tag>
                    <el-tag size="small" effect="plain">手续费 {{ money(created.feeAmount) }}</el-tag>
                    <el-tag v-if="created.failReason" size="small" type="danger">{{ created.failReason }}</el-tag>
                </div>
            </div>

            <div class="lab-card">
                <div class="lab-card__title">合规筛查记录</div>
                <div class="lab-card__desc">SANCTION / KYC / AML / LIMIT / MANUAL_REVIEW 各占一行，任何一项不通过都会拦下这笔汇款。</div>
                <el-input v-model="target" placeholder="汇款单号" size="small" style="margin-bottom: 10px" />
                <div class="lab-row">
                    <el-button size="small" type="primary" @click="loadOne">加载详情</el-button>
                </div>
                <el-table :data="compliance" border stripe size="small" max-height="240" style="margin-top: 10px">
                    <el-table-column prop="checkType" label="检查项" min-width="140" />
                    <el-table-column label="结果" width="130">
                        <template #default="{ row }">
                            <el-tag
                                :type="row.result === 'PASS' ? 'success' : row.result === 'REJECT' ? 'danger' : 'warning'"
                                size="small"
                            >
                                {{ row.result }}
                            </el-tag>
                        </template>
                    </el-table-column>
                    <el-table-column prop="hitDetail" label="命中详情" min-width="180" show-overflow-tooltip />
                </el-table>
                <ResultView :result="detailResult" title="汇款单详情" :max-height="200" style="margin-top: 10px" />
            </div>
        </div>

        <div class="lab-card">
            <div class="lab-card__title">人工介入</div>
            <div class="lab-card__desc">审核通过会继续锁汇扣款清算，驳回会释放日限额占用，退汇把资金从收款方退回来。</div>
            <el-form size="small" inline label-width="86px">
                <el-form-item label="审核人">
                    <el-input v-model="review.reviewer" style="width: 160px" />
                </el-form-item>
                <el-form-item label="意见">
                    <el-input v-model="review.note" style="width: 220px" />
                </el-form-item>
                <el-form-item label="退汇原因">
                    <el-input v-model="returnForm.reason" style="width: 200px" />
                </el-form-item>
                <el-form-item label="退汇操作人">
                    <el-input v-model="returnForm.operator" style="width: 160px" />
                </el-form-item>
            </el-form>
            <div class="lab-row">
                <el-button type="success" size="small" @click="approve">审核放行</el-button>
                <el-button type="danger" size="small" @click="reject">审核驳回</el-button>
                <el-button type="warning" size="small" @click="doReturn">发起退汇</el-button>
                <el-button size="small" @click="retry">重置重试并重投</el-button>
            </div>
            <ResultView :result="opResult" title="操作返回" :max-height="200" style="margin-top: 10px" />
        </div>

        <div class="lab-card">
            <div class="lab-card__title">汇款单列表</div>
            <div class="lab-row" style="margin-bottom: 10px">
                <el-select v-model="list.status" placeholder="全部状态" clearable size="small" style="width: 200px" @change="loadList">
                    <el-option v-for="item in statusOptions" :key="item" :label="item" :value="item" />
                </el-select>
                <el-button size="small" @click="loadList">查询</el-button>
                <el-tag size="small" effect="plain">共 {{ total }} 条</el-tag>
            </div>
            <el-table :data="rows" border stripe size="small" max-height="400">
                <el-table-column label="汇款单号" min-width="180">
                    <template #default="{ row }">
                        <el-link type="primary" @click="target = row.remittanceNo; loadOne()">{{ row.remittanceNo }}</el-link>
                    </template>
                </el-table-column>
                <el-table-column label="状态" min-width="150">
                    <template #default="{ row }">
                        <el-tag size="small" :type="row.status === 'SETTLED' ? 'success' : row.status.endsWith('REJECTED') || row.status === 'FAILED' ? 'danger' : 'warning'">
                            {{ row.status }}
                        </el-tag>
                    </template>
                </el-table-column>
                <el-table-column label="源金额" width="120">
                    <template #default="{ row }">{{ money(row.sourceAmount) }}</template>
                </el-table-column>
                <el-table-column label="到账金额" width="120">
                    <template #default="{ row }">{{ money(row.targetAmount) }}</template>
                </el-table-column>
                <el-table-column prop="channel" label="渠道" width="90" />
                <el-table-column prop="batchNo" label="清算批次" min-width="160" show-overflow-tooltip />
                <el-table-column prop="createTime" label="创建时间" min-width="160" />
            </el-table>
            <el-pagination
                v-model:current-page="list.pageNum"
                v-model:page-size="list.pageSize"
                :total="total"
                small
                background
                layout="prev, pager, next"
                style="margin-top: 10px"
                @current-change="loadList"
            />
        </div>

        <div class="lab-grid lab-grid--2">
            <div class="lab-card">
                <div class="lab-card__title">状态流转历史</div>
                <el-timeline v-if="events.length > 0" style="padding-left: 4px; max-height: 320px; overflow: auto">
                    <el-timeline-item
                        v-for="(event, index) in events"
                        :key="index"
                        :type="event.result === 1 ? 'success' : 'danger'"
                        :timestamp="event.createTime"
                    >
                        {{ event.fromStatusName }} → {{ event.toStatusName }}（{{ event.event }}）
                        <div class="lab-hint">{{ event.reason }} · {{ event.operator }}</div>
                    </el-timeline-item>
                </el-timeline>
                <div v-else class="lab-hint">加载一笔汇款后显示</div>
            </div>
            <div class="lab-card">
                <div class="lab-card__title">运行时统计</div>
                <ResultView :result="runtimeResult" :max-height="300" />
            </div>
        </div>
    </div>
</template>
