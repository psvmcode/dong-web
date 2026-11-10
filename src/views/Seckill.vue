<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh, Timer } from '@element-plus/icons-vue';
import { runBurst, useApi } from '@/composables/useApi';
import * as api from '@/api/seckill';
import type { SeckillActivityResponse, SeckillOrderResponse, SeckillReceiptResponse } from '@/api/types';
import { money, toDateTimeString } from '@/utils/format';

/**
 * 秒杀活动。
 *
 * <p>核心是「点下去那一刻的结果」：抢到了、手慢了、还是重复下单，
 * 用一个真实的抢购动作直接给结论，再配库存、状态与并发压测数据。
 * 会场式的红黑配色与假商品图只占屏幕不提供信息，已经全部去掉。
 */

const activities = ref<SeckillActivityResponse[]>([]);
const listLoading = ref(false);
const buying = ref(false);
const now = ref(Date.now());
const userId = ref(1001);
const burstForm = reactive({ threads: 20 });

const { result: prepareResult, call: callPrepare } = useApi<number>();
const { result: createResult, call: callCreate } = useApi<number>();
const { result: runtimeResult, call: callRuntime } = useApi<Record<string, unknown>>();
const { result: orderResult, call: callOrder } = useApi<SeckillOrderResponse>();
const { call: callPay } = useApi<null>();
const { call: callCancel } = useApi<null>();

const receipt = ref<{ visible: boolean; ok: boolean; title: string; message: string; orderNo: string }>({
    visible: false,
    ok: false,
    title: '',
    message: '',
    orderNo: '',
});

const burst = ref<{ total: number; success: number; failed: number; elapsedMs: number; rows: { key: string; value: number }[] } | null>(null);
const burstVisible = ref(false);
const burstLoading = ref(false);

const createForm = reactive({
    productId: 1807,
    title: '华为 Mate 限时秒杀',
    totalStock: 100,
    unitPrice: 999,
    startTime: toDateTimeString(new Date()),
    endTime: toDateTimeString(new Date(Date.now() + 2 * 3600_000)),
});

/**
 * 解析后端返回的时间字符串，兼容 yyyy-MM-dd HH:mm:ss 与 ISO 两种形态。
 *
 * @param text 时间字符串
 */
function parseTime(text: string): number {
    const normalized = text.replace('T', ' ').slice(0, 19);
    const parsed = new Date(normalized.replace(/-/g, '/')).getTime();
    return Number.isNaN(parsed) ? Date.now() : parsed;
}

/**
 * 倒计时文本。
 *
 * @param endTime 结束时间字符串
 */
function countdown(endTime: string): string {
    const diff = parseTime(endTime) - now.value;
    if (diff <= 0) {
        return '已结束';
    }
    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const clock = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    // 超过一天的活动把天数单独拎出来，否则「2072:51:29」这种数字比活动时长本身还抢眼
    return days > 0 ? `${days} 天 ${clock}` : clock;
}

/**
 * 是否已抢完。
 *
 * @param row 活动
 */
function soldOut(row: SeckillActivityResponse): boolean {
    return row.availableStock <= 0;
}

/**
 * 按钮文案。
 *
 * @param row 活动
 */
function buttonText(row: SeckillActivityResponse): string {
    if (row.status === 'DRAFT') {
        return '待开启';
    }
    if (row.status === 'FINISHED') {
        return '已结束';
    }
    return soldOut(row) ? '已抢完' : '立即抢购';
}

/**
 * 按钮是否可点。
 *
 * @param row 活动
 */
function clickable(row: SeckillActivityResponse): boolean {
    return row.status === 'PREPARED' || row.status === 'ONLINE' ? !soldOut(row) : false;
}

/**
 * 已抢百分比。
 *
 * @param row 活动
 */
function soldPercent(row: SeckillActivityResponse): number {
    if (row.totalStock <= 0) {
        return 100;
    }
    return Math.min(100, Math.round(((row.totalStock - row.availableStock) / row.totalStock) * 100));
}

/**
 * 刷新活动列表。
 */
async function loadActivities() {
    listLoading.value = true;
    try {
        const res = await api.listActivities();
        activities.value = res.ok && res.data ? res.data : [];
    } finally {
        listLoading.value = false;
    }
}

/**
 * 抢购。
 *
 * @param row 活动
 */
async function buy(row: SeckillActivityResponse) {
    if (buying.value) {
        return;
    }
    buying.value = true;
    try {
        const res = await api.seckill(row.id, userId.value, 1);
        const data = res.ok ? (res.data as SeckillReceiptResponse) : null;
        receipt.value = {
            visible: true,
            ok: res.ok,
            title: res.ok ? '抢购成功' : '抢购未成功',
            message: data?.message ?? res.message,
            orderNo: data?.orderNo ?? '',
        };
        await loadActivities();
        void callRuntime(api.runtime);
    } finally {
        buying.value = false;
    }
}

/**
 * 复制订单号，便于直接粘到下面的查询框或去日志里检索。
 */
async function copyOrderNo(text: string) {
    if (!text) {
        return;
    }
    try {
        await navigator.clipboard.writeText(text);
        ElMessage.success('订单号已复制');
    } catch {
        ElMessage.warning('浏览器未授权剪贴板，请手动复制');
    }
}

/**
 * 预热活动。
 *
 * @param row 活动
 */
async function prepare(row: SeckillActivityResponse) {
    const res = await callPrepare(() => api.prepare(row.id));
    if (res.ok) {
        ElMessage.success(`已预热 ${res.data} 份库存`);
        await loadActivities();
    }
}

/**
 * 一键准备一个示例活动并开启，避免空页面。
 */
async function seedActivity() {
    const res = await callCreate(() => api.createActivity({ ...createForm }));
    if (!res.ok || !res.data) {
        return;
    }
    await api.prepare(res.data);
    ElMessage.success('示例活动已创建并开启');
    await loadActivities();
    void callRuntime(api.runtime);
}

/**
 * 并发压测：一次性放 threads 个不同用户过去抢。
 */
async function runBurstTest(row: SeckillActivityResponse) {
    burstLoading.value = true;
    try {
        const summary = await runBurst<SeckillReceiptResponse>(burstForm.threads, (index) =>
            api.seckill(row.id, 90000 + index, 1),
        );
        burst.value = {
            total: summary.total,
            success: summary.success,
            failed: summary.failed,
            elapsedMs: summary.elapsedMs,
            rows: Object.entries(summary.messages).map(([key, value]) => ({ key, value: value as number })),
        };
        await loadActivities();
        void callRuntime(api.runtime);
        burstVisible.value = true;
    } finally {
        burstLoading.value = false;
    }
}

/**
 * 查询订单。
 */
function queryOrder(orderNo: string) {
    void callOrder(() => api.orderDetail(orderNo));
}

/**
 * 支付。
 */
async function pay() {
    const orderNo = orderResult.value?.ok && orderResult.value.data ? orderResult.value.data.orderNo : '';
    if (!orderNo) {
        return;
    }
    const res = await callPay(() => api.payOrder(orderNo));
    if (res.ok) {
        ElMessage.success('支付成功');
        queryOrder(orderNo);
    }
}

/**
 * 取消并回滚库存。
 */
async function cancel() {
    const orderNo = orderResult.value?.ok && orderResult.value.data ? orderResult.value.data.orderNo : '';
    if (!orderNo) {
        return;
    }
    const res = await callCancel(() => api.cancelOrder(orderNo));
    if (res.ok) {
        ElMessage.success('已取消，库存已回滚');
        queryOrder(orderNo);
        await loadActivities();
    }
}

const runtimeEntries = computed(() => {
    const data = runtimeResult.value?.ok ? runtimeResult.value.data : null;
    return data ? Object.entries(data) : [];
});

let timer: number | undefined;

onMounted(() => {
    void loadActivities();
    void callRuntime(api.runtime);
    timer = window.setInterval(() => {
        now.value = Date.now();
    }, 1000);
});

onUnmounted(() => {
    if (timer) {
        window.clearInterval(timer);
    }
});
</script>

<template>
    <div class="spike">
        <div class="spike__banner">
            <div class="spike__banner-inner">
                <div>
                    <div class="spike__title">秒杀活动</div>
                    <div class="spike__subtitle">Lua 原子扣减 + 去重 + MQ 异步建单，抢购结果直接反映四道防线</div>
                </div>
                <div class="spike__timer">
                    <span class="spike__timer-label">首场距结束</span>
                    <span class="spike__timer-value">{{ activities[0] ? countdown(activities[0].endTime) : '--:--:--' }}</span>
                </div>
            </div>
        </div>

        <div class="spike__toolbar">
            <div class="lab-row">
                <span class="lab-hint">当前抢购用户</span>
                <el-input-number v-model="userId" :min="1" size="small" controls-position="right" />
                <el-button size="small" :icon="Refresh" @click="loadActivities()">刷新会场</el-button>
            </div>
            <span class="lab-spacer" />
            <el-popover placement="bottom" width="420" trigger="click">
                <template #reference>
                    <el-button size="small">创建并开启示例活动</el-button>
                </template>
                <el-form size="small" label-width="86px">
                    <el-form-item label="商品 id">
                        <el-input-number v-model="createForm.productId" :min="1" controls-position="right" />
                    </el-form-item>
                    <el-form-item label="标题">
                        <el-input v-model="createForm.title" />
                    </el-form-item>
                    <el-form-item label="库存">
                        <el-input-number v-model="createForm.totalStock" :min="1" controls-position="right" />
                    </el-form-item>
                    <el-form-item label="秒杀价">
                        <el-input-number v-model="createForm.unitPrice" :min="0" :precision="2" controls-position="right" />
                    </el-form-item>
                    <el-form-item label="结束时间">
                        <el-input v-model="createForm.endTime" />
                    </el-form-item>
                    <el-button type="primary" size="small" @click="seedActivity">创建并预热</el-button>
                </el-form>
            </el-popover>
        </div>

        <el-skeleton :loading="listLoading && activities.length === 0">
            <template #template>
                <div class="spike__grid">
                    <div v-for="i in 4" :key="i" class="spike__card" style="padding: 14px">
                        <el-skeleton-item variant="text" style="width: 70%" />
                        <el-skeleton-item variant="text" style="margin-top: 12px; width: 45%" />
                    </div>
                </div>
            </template>
            <template #default>
                <div v-if="activities.length > 0" class="spike__grid">
                    <article v-for="row in activities" :key="row.id" class="spike__card">
                        <div class="spike__card-head">
                            <h3 class="spike__card-title">{{ row.title }}</h3>
                            <el-tag size="small" effect="plain" :type="row.status === 'ONLINE' ? 'success' : 'info'">
                                {{ row.status }}
                            </el-tag>
                        </div>
                        <div class="spike__card-body">
                            <div class="spike__price">
                                <span class="spike__price-label">秒杀价</span>
                                <span class="spike__price-value">¥ {{ money(row.unitPrice) }}</span>
                                <span class="spike__price-tip lab-num">限量 {{ row.totalStock }} 件</span>
                            </div>
                            <div class="spike__stock">
                                <el-progress
                                    :percentage="soldPercent(row)"
                                    :stroke-width="6"
                                    :show-text="false"
                                    :color="soldOut(row) ? '#8a9099' : '#2f6feb'"
                                />
                                <div class="spike__stock-text">
                                    <span v-if="soldOut(row)">已抢完</span>
                                    <span v-else class="lab-num">剩余 {{ row.availableStock }} / {{ row.totalStock }}</span>
                                    <span class="spike__countdown">{{ countdown(row.endTime) }}</span>
                                </div>
                            </div>
                            <div class="spike__actions">
                                <el-button
                                    class="spike__buy"
                                    type="primary"
                                    size="small"
                                    :loading="buying"
                                    :disabled="!clickable(row)"
                                    @click="buy(row)"
                                >
                                    {{ buttonText(row) }}
                                </el-button>
                                <el-button size="small" @click="prepare(row)" v-if="row.status === 'DRAFT'">预热</el-button>
                                <el-button size="small" :icon="Timer" @click="runBurstTest(row)" :loading="burstLoading">
                                    并发压测
                                </el-button>
                            </div>
                        </div>
                    </article>
                </div>
                <div v-else class="lab-empty">
                    <div class="lab-empty__title">还没有活动</div>
                    点右上角「创建并开启示例活动」，会同时创建活动并把库存预热进 Redis。
                </div>
            </template>
        </el-skeleton>

        <div class="spike__panel">
            <div class="spike__panel-title">我的订单</div>
            <div class="lab-row">
                <el-input
                    v-model="receipt.orderNo"
                    placeholder="抢购成功后订单号会填进来，也可手动输入"
                    style="width: 320px"
                    size="small"
                    clearable
                />
                <el-button size="small" @click="queryOrder(receipt.orderNo)">查询</el-button>
                <el-button size="small" type="success" @click="pay">支付</el-button>
                <el-button size="small" type="danger" @click="cancel">取消并回滚库存</el-button>
            </div>
            <el-descriptions
                v-if="orderResult?.ok && orderResult.data"
                :column="4"
                border
                size="small"
                style="margin-top: 12px"
            >
                <el-descriptions-item label="订单号">{{ orderResult.data.orderNo }}</el-descriptions-item>
                <el-descriptions-item label="活动">{{ orderResult.data.activityId }}</el-descriptions-item>
                <el-descriptions-item label="数量">{{ orderResult.data.quantity }}</el-descriptions-item>
                <el-descriptions-item label="金额">{{ money(orderResult.data.amount) }}</el-descriptions-item>
                <el-descriptions-item label="状态">
                    <el-tag :type="orderResult.data.status === 'PAID' ? 'success' : 'warning'" size="small">
                        {{ orderResult.data.status }}
                    </el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="用户">{{ orderResult.data.userId }}</el-descriptions-item>
                <el-descriptions-item label="下单时间">{{ orderResult.data.createTime }}</el-descriptions-item>
            </el-descriptions>
        </div>

        <div class="spike__panel">
            <div class="spike__panel-title">运行时状态</div>
            <div class="lab-row">
                <el-tag v-for="[key, value] in runtimeEntries" :key="String(key)" size="small" effect="plain">
                    {{ key }} = {{ value }}
                </el-tag>
                <span v-if="runtimeEntries.length === 0" class="lab-hint">抢一次之后再看这里</span>
            </div>
        </div>

        <el-dialog v-model="receipt.visible" width="440px" align-center :title="receipt.title">
            <div class="spike__result">
                <el-tag :type="receipt.ok ? 'success' : 'danger'" size="small" effect="plain">
                    {{ receipt.ok ? '成功' : '失败' }}
                </el-tag>
                <p class="spike__result-msg">{{ receipt.message }}</p>
                <div v-if="receipt.orderNo" class="spike__result-order">
                    <span class="lab-mono">{{ receipt.orderNo }}</span>
                    <el-button size="small" text @click="copyOrderNo(receipt.orderNo)">复制</el-button>
                </div>
            </div>
            <template #footer>
                <el-button v-if="receipt.ok" type="primary" @click="receipt.visible = false; queryOrder(receipt.orderNo)">
                    查看订单
                </el-button>
                <el-button @click="receipt.visible = false">关闭</el-button>
            </template>
        </el-dialog>

        <el-dialog v-model="burstVisible" title="并发压测结果" width="560px">
            <div v-if="burst" class="spike__burst">
                <div class="spike__burst-nums">
                    <div><span>{{ burst.total }}</span>总请求</div>
                    <div class="ok"><span>{{ burst.success }}</span>抢到</div>
                    <div class="no"><span>{{ burst.failed }}</span>未抢到</div>
                    <div><span>{{ burst.elapsedMs }} ms</span>总耗时</div>
                </div>
                <p class="lab-hint" style="margin-bottom: 12px">
                    成功数不应超过剩余库存，多出来就是超卖。各道防线拦下的请求按返回码分组列在下面。
                </p>
                <el-table :data="burst.rows" border size="small" max-height="260">
                    <el-table-column prop="key" label="返回" min-width="260" show-overflow-tooltip />
                    <el-table-column prop="value" label="次数" width="90" />
                </el-table>
            </div>
        </el-dialog>
    </div>
</template>

<style scoped>
.spike__banner {
    background: var(--lab-card);
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    padding: 12px 16px;
    margin-bottom: 12px;
}

.spike__banner-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
}

.spike__title {
    font-size: 14px;
    font-weight: 600;
}

.spike__subtitle {
    margin-top: 4px;
    font-size: 12px;
    color: var(--lab-muted);
    line-height: 1.6;
}

.spike__timer {
    text-align: right;
}

.spike__timer-label {
    display: block;
    font-size: 11px;
    color: var(--lab-muted);
}

.spike__timer-value {
    font-size: 16px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--lab-text);
}

.spike__toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 0 12px;
    flex-wrap: wrap;
}

.spike__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
    margin-bottom: 12px;
}

.spike__card {
    background: var(--lab-card);
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    overflow: hidden;
}

.spike__card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--lab-border);
    background: #fafbfc;
}

.spike__card-body {
    padding: 12px 14px 14px;
}

.spike__card-title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.5;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.spike__price {
    display: flex;
    align-items: baseline;
    gap: 8px;
}

.spike__price-label {
    font-size: 12px;
    color: var(--lab-muted);
}

.spike__price-value {
    font-size: 16px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--lab-text);
}

.spike__price-tip {
    margin-left: auto;
    font-size: 12px;
    color: var(--lab-muted);
}

.spike__stock {
    margin: 12px 0;
}

.spike__stock-text {
    display: flex;
    justify-content: space-between;
    margin-top: 6px;
    font-size: 12px;
    color: var(--lab-text-2);
}

.spike__countdown {
    color: var(--lab-muted);
    font-variant-numeric: tabular-nums;
}

.spike__actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
}

.spike__buy {
    min-width: 96px;
}

.spike__panel {
    padding: 14px 16px;
    background: var(--lab-card);
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    margin-bottom: 12px;
}

.spike__panel-title {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 10px;
}

.spike__result {
    padding: 4px 0;
}

.spike__result-msg {
    margin: 10px 0;
    font-size: 13px;
    color: var(--lab-text-2);
    line-height: 1.6;
}

.spike__result-order {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: #fafbfc;
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
}

.spike__burst-nums {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-bottom: 12px;
    font-size: 12px;
    color: var(--lab-muted);
}

.spike__burst-nums span {
    display: block;
    font-size: 16px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--lab-text);
}

.spike__burst-nums .ok span {
    color: var(--lab-success);
}

.spike__burst-nums .no span {
    color: var(--lab-danger);
}
</style>
