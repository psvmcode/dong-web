<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { RefreshRight } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/order';
import type { OrderBenchmarkResponse, OrderResponse, OrderTransitionLogResponse } from '@/api/types';
import { money } from '@/utils/format';

/**
 * 订单详情页。
 *
 * <p>订单状态机的价值是「不允许跳步」，所以这一页做成电商订单详情的样子：
 * 顶部是状态步骤条，下面是订单信息，操作区只摆**当前状态真的能触发**的事件——
 * 按钮列表来自后端的 available-events，不是前端自己列的九个事件。
 * 点了不该点的事件会看到状态机把它拒绝，而拒绝本身也会记进流转日志。
 */

/** 正常履约链路的步骤。 */
const STEPS = [
    { key: 'WAIT_PAY', label: '待支付' },
    { key: 'WAIT_SHIP', label: '待发货' },
    { key: 'WAIT_RECEIVE', label: '待收货' },
    { key: 'FINISHED', label: '已完成' },
];

/** 需要额外字段的事件。 */
const FIELD_HINT: Record<string, string> = {
    PAY: '需要支付流水号',
    SHIP: '需要物流单号',
    APPLY_REFUND: '需要退款金额',
    REFUND_SUCCESS: '需要退款金额',
    REFUND_FAIL: '需要原因',
    CANCEL: '建议填原因',
    TIMEOUT: '建议填原因',
};

const orderNo = ref('');
const orders = ref<OrderResponse[]>([]);
const events = ref<string[]>([]);
const detail = ref<OrderResponse | null>(null);
const logs = ref<OrderTransitionLogResponse[]>([]);

const fireForm = reactive({ event: '', operator: 'console', payNo: '', trackingNo: '', refundAmount: 0, reason: '' });
const createForm = reactive({ userId: 1, productName: '无线降噪耳机', quantity: 1, payAmount: 999 });
const benchmarkForm = reactive({ threads: 8 });
const compare = ref<{ cas: OrderBenchmarkResponse | null; none: OrderBenchmarkResponse | null }>({ cas: null, none: null });
const compareLoading = ref(false);

const { loading: listLoading, call: callRecent } = useApi<OrderResponse[]>();
const { result: createResult, call: callCreate } = useApi<string>();
const { loading: detailLoading, call: callDetail } = useApi<OrderResponse>();
const { result: fireResult, call: callFire } = useApi<OrderResponse>();
const { result: benchmarkResult, call: callBenchmark } = useApi<OrderBenchmarkResponse>();

/**
 * 当前状态在步骤条上的位置。
 */
const stepIndex = computed(() => STEPS.findIndex((step) => step.key === detail.value?.status));

/**
 * 是否处于终态。
 */
const isFinalState = computed(() => ['FINISHED', 'CANCELLED', 'REFUNDED'].includes(detail.value?.status ?? ''));

/**
 * 状态的中文名。
 */
const statusLabel = computed(() => STEPS.find((step) => step.key === detail.value?.status)?.label ?? (detail.value?.status ?? '-'));

/**
 * 加载最近订单。
 */
async function loadRecent() {
    const res = await callRecent(() => api.recent(12));
    if (res.ok && res.data) {
        orders.value = res.data;
    }
}

/**
 * 加载某笔订单的详情、可用事件与日志。
 *
 * @param target 订单号
 */
async function loadOrder(target: string) {
    orderNo.value = target;
    const [detailRes, logRes] = await Promise.all([callDetail(() => api.detail(target)), api.logs(target)]);
    detail.value = detailRes.ok ? detailRes.data : null;
    logs.value = logRes.ok && logRes.data ? logRes.data : [];
    const eventRes = await api.availableEvents(target);
    events.value = eventRes.ok && eventRes.data ? eventRes.data : [];
    if (events.value.length > 0 && !events.value.includes(fireForm.event)) {
        fireForm.event = events.value[0];
    }
}

/**
 * 创建订单。
 */
async function create() {
    const res = await callCreate(() => api.create({ ...createForm }));
    if (res.ok && res.data) {
        ElMessage.success(`订单已创建：${res.data}`);
        await loadRecent();
        await loadOrder(res.data);
    }
}

/**
 * 触发事件。
 */
async function fire() {
    if (!fireForm.event) {
        ElMessage.warning('当前状态没有可触发的事件');
        return;
    }
    const res = await callFire(() =>
        api.fire(orderNo.value, {
            event: fireForm.event,
            operator: fireForm.operator || undefined,
            payNo: fireForm.payNo || undefined,
            trackingNo: fireForm.trackingNo || undefined,
            refundAmount: ['APPLY_REFUND', 'REFUND_SUCCESS', 'REFUND_FAIL'].includes(fireForm.event)
                ? fireForm.refundAmount
                : undefined,
            reason: fireForm.reason || undefined,
        }),
    );
    if (res.ok) {
        ElMessage.success(`已触发 ${fireForm.event}`);
        await loadOrder(orderNo.value);
        await loadRecent();
    } else {
        ElMessage.warning(res.message);
    }
}

/**
 * 并发推进对照。
 */
async function runCompare() {
    if (!orderNo.value) {
        ElMessage.warning('先选一笔订单');
        return;
    }
    compareLoading.value = true;
    try {
        const cas = await callBenchmark(() => api.benchmark(orderNo.value, 'cas', benchmarkForm.threads));
        compare.value.cas = cas.ok ? cas.data : null;
        const none = await callBenchmark(() => api.benchmark(orderNo.value, 'none', benchmarkForm.threads));
        compare.value.none = none.ok ? none.data : null;
    } finally {
        compareLoading.value = false;
    }
}

/**
 * 事件按钮类型。
 *
 * @param event 事件名
 */
function eventTone(event: string): string {
    if (['CANCEL', 'TIMEOUT', 'REFUND_FAIL'].includes(event)) {
        return 'danger';
    }
    if (['PAY', 'SHIP', 'RECEIVE', 'REFUND_SUCCESS'].includes(event)) {
        return 'primary';
    }
    return 'warning';
}

onMounted(async () => {
    await loadRecent();
    if (orders.value.length > 0) {
        await loadOrder(orders.value[0].orderNo);
    }
});
</script>

<template>
    <div class="od">
        <SectionHead
            title="订单详情"
            desc="状态只能由事件推进，跳步与倒退都在状态机框架层被拦掉。操作区的按钮来自后端的可用事件查询，灰掉的分支就是不允许的迁移。"
        >
            <template #actions>
                <el-button size="small" :icon="RefreshRight" @click="loadRecent()">刷新订单</el-button>
            </template>
        </SectionHead>

        <div class="od__body">
            <div class="od__main">
                <div v-if="detail" class="od__state">
                    <div class="od__state-icon">
                        {{ isFinalState ? (detail.status === 'FINISHED' ? '✓' : '×') : '●' }}
                    </div>
                    <div>
                        <div class="od__state-title">
                            {{ statusLabel }}
                            <el-tag size="small" effect="plain">版本 v{{ detail.version }}</el-tag>
                            <el-tag v-if="detail.urgeCount > 0" size="small" type="warning" effect="dark">
                                催单 {{ detail.urgeCount }} 次
                            </el-tag>
                        </div>
                        <div class="od__state-desc">{{ detail.orderNo }}</div>
                    </div>
                </div>

                <el-steps v-if="detail && !isFinalState" :active="stepIndex" finish-status="success" align-center class="od__steps">
                    <el-step v-for="step in STEPS" :key="step.key" :title="step.label" />
                </el-steps>
                <el-alert
                    v-else-if="detail"
                    type="info"
                    :closable="false"
                    show-icon
                    :title="`订单已进入终态：${statusLabel}`"
                    description="终态不接受任何事件，这是幂等处理的前提——重复提交同一个事件不会把状态推歪。"
                    class="od__steps"
                />

                <div v-if="detail" class="od__goods">
                    <div class="od__goods-img">📦</div>
                    <div class="od__goods-info">
                        <div class="od__goods-name">{{ detail.productName }}</div>
                        <div class="od__goods-meta">数量 {{ detail.quantity }} · 用户 {{ detail.userId }}</div>
                        <div class="od__goods-meta">
                            支付流水 {{ detail.payNo || '—' }} · 物流单号 {{ detail.trackingNo || '—' }}
                        </div>
                    </div>
                    <div class="od__goods-amount">
                        <div class="od__amount-value">¥{{ money(detail.payAmount) }}</div>
                        <div v-if="detail.refundAmount > 0" class="od__amount-refund">
                            已退 ¥{{ money(detail.refundAmount) }}（自 {{ detail.refundFrom || '-' }}）
                        </div>
                    </div>
                </div>

                <div v-if="detail" class="od__actions">
                    <div class="od__actions-title">
                        当前可触发的事件
                        <span class="lab-hint">共 {{ events.length }} 个，其余都被状态机拦掉了</span>
                    </div>
                    <div class="lab-row">
                        <el-button
                            v-for="event in events"
                            :key="event"
                            size="small"
                            :type="eventTone(event)"
                            :plain="fireForm.event !== event"
                            @click="fireForm.event = event"
                        >
                            {{ event }}
                        </el-button>
                        <span v-if="events.length === 0" class="lab-hint">终态，没有可用事件</span>
                    </div>
                    <div v-if="fireForm.event" class="od__fire">
                        <div class="od__fire-hint">
                            即将触发 <b>{{ fireForm.event }}</b>
                            <span v-if="FIELD_HINT[fireForm.event]"> · {{ FIELD_HINT[fireForm.event] }}</span>
                        </div>
                        <el-form size="small" inline>
                            <el-form-item label="操作人">
                                <el-input v-model="fireForm.operator" style="width: 120px" />
                            </el-form-item>
                            <el-form-item v-if="fireForm.event === 'PAY'" label="支付流水">
                                <el-input v-model="fireForm.payNo" style="width: 180px" placeholder="PAY20261005xxx" />
                            </el-form-item>
                            <el-form-item v-if="fireForm.event === 'SHIP'" label="物流单号">
                                <el-input v-model="fireForm.trackingNo" style="width: 180px" placeholder="SF1234567890" />
                            </el-form-item>
                            <el-form-item v-if="['APPLY_REFUND', 'REFUND_SUCCESS', 'REFUND_FAIL'].includes(fireForm.event)" label="退款金额">
                                <el-input-number v-model="fireForm.refundAmount" :min="0" :precision="2" controls-position="right" />
                            </el-form-item>
                            <el-form-item v-if="['CANCEL', 'TIMEOUT', 'REFUND_FAIL'].includes(fireForm.event)" label="原因">
                                <el-input v-model="fireForm.reason" style="width: 200px" />
                            </el-form-item>
                            <el-form-item>
                                <el-button type="primary" size="small" @click="fire">触发</el-button>
                            </el-form-item>
                        </el-form>
                    </div>
                </div>

                <div class="od__panel">
                    <div class="od__panel-title">状态流转日志</div>
                    <el-timeline v-if="logs.length > 0" style="padding-left: 4px; max-height: 300px; overflow: auto">
                        <el-timeline-item
                            v-for="(log, index) in logs"
                            :key="index"
                            :type="log.accepted ? 'success' : 'danger'"
                            :timestamp="log.createTime"
                        >
                            {{ log.fromStatus }} → {{ log.toStatus }}（{{ log.event }}）
                            <span v-if="!log.accepted" class="od__rejected">被拒绝</span>
                            <div class="lab-hint">{{ log.reason || '无' }} · {{ log.operator }}</div>
                        </el-timeline-item>
                    </el-timeline>
                    <div v-else class="lab-hint">暂无流转日志</div>
                </div>
            </div>

            <aside class="od__side">
                <div class="od__panel">
                    <div class="od__panel-title">新建订单</div>
                    <el-form size="small" label-width="70px">
                        <el-form-item label="用户">
                            <el-input-number v-model="createForm.userId" :min="1" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="商品">
                            <el-input v-model="createForm.productName" maxlength="128" />
                        </el-form-item>
                        <el-form-item label="数量">
                            <el-input-number v-model="createForm.quantity" :min="1" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="金额">
                            <el-input-number v-model="createForm.payAmount" :min="0" :precision="2" controls-position="right" />
                        </el-form-item>
                        <el-button type="primary" size="small" @click="create">创建订单</el-button>
                    </el-form>
                </div>

                <div class="od__panel">
                    <div class="od__panel-title">最近订单</div>
                    <el-table
                        v-loading="listLoading"
                        :data="orders"
                        size="small"
                        max-height="300"
                        highlight-current-row
                        @row-click="(row: OrderResponse) => loadOrder(row.orderNo)"
                    >
                        <el-table-column prop="orderNo" label="订单号" min-width="180" show-overflow-tooltip />
                        <el-table-column prop="status" label="状态" width="110" />
                    </el-table>
                </div>

                <div class="od__panel">
                    <div class="od__panel-title">并发推进对照</div>
                    <div class="lab-row">
                        <el-input-number v-model="benchmarkForm.threads" :min="1" :max="100" size="small" controls-position="right" />
                        <el-button size="small" type="danger" :loading="compareLoading" @click="runCompare">跑两组</el-button>
                    </div>
                    <el-table v-if="compare.cas || compare.none" :data="[compare.cas, compare.none].filter(Boolean)" size="small" style="margin-top: 10px">
                        <el-table-column prop="mode" label="模式" width="80" />
                        <el-table-column prop="successCount" label="成功" width="70" />
                        <el-table-column prop="blockedCount" label="被拦" width="70" />
                        <el-table-column prop="finalVersion" label="版本" width="70" />
                        <el-table-column prop="elapsedMs" label="耗时" width="80" />
                    </el-table>
                    <div class="lab-hint" style="margin-top: 8px">
                        cas 带乐观锁（where version=?），none 不带。被拦次数多的一方才是正确的一方。
                    </div>
                </div>
            </aside>
        </div>
    </div>
</template>

<style scoped>
.od__body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 14px;
    align-items: start;
}

.od__main {
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    padding: 16px 18px;
}

.od__state {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 14px;
    border-bottom: 1px solid #f2f4f8;
}

.od__state-icon {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: linear-gradient(135deg, #3d6ff5, #6f8cf7);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    font-weight: 700;
}

.od__state-title {
    font-size: 18px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
}

.od__state-desc {
    font-size: 12px;
    color: var(--lab-muted);
    font-family: Menlo, Consolas, monospace;
    margin-top: 2px;
}

.od__steps {
    margin: 18px 0;
}

.od__goods {
    display: flex;
    gap: 12px;
    align-items: center;
    background: #fafbfd;
    border: 1px solid var(--lab-border);
    border-radius: 10px;
    padding: 12px 14px;
}

.od__goods-img {
    width: 56px;
    height: 56px;
    border-radius: 8px;
    background: #eef1f6;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 26px;
    flex: 0 0 56px;
}

.od__goods-info {
    flex: 1;
    min-width: 0;
}

.od__goods-name {
    font-size: 14px;
    font-weight: 600;
}

.od__goods-meta {
    font-size: 12px;
    color: var(--lab-muted);
    margin-top: 3px;
}

.od__goods-amount {
    text-align: right;
}

.od__amount-value {
    font-size: 20px;
    font-weight: 700;
    color: #e1251b;
}

.od__amount-refund {
    font-size: 12px;
    color: var(--lab-muted);
    margin-top: 2px;
}

.od__actions {
    margin-top: 14px;
}

.od__actions-title {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.od__fire {
    margin-top: 12px;
    background: #fafbfd;
    border: 1px dashed var(--lab-border);
    border-radius: 10px;
    padding: 12px;
}

.od__fire-hint {
    font-size: 13px;
    margin-bottom: 8px;
}

.od__rejected {
    color: #dc4a4a;
    font-size: 12px;
    margin-left: 6px;
}

.od__panel {
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    padding: 14px 16px;
    margin-bottom: 12px;
}

.od__panel-title {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 10px;
}

@media (max-width: 1100px) {
    .od__body {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
