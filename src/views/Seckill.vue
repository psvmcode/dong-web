<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { RefreshRight, Timer } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import StatCard from '@/components/StatCard.vue';
import ResultView from '@/components/ResultView.vue';
import EChart from '@/components/EChart.vue';
import { runBurst, useApi } from '@/composables/useApi';
import * as api from '@/api/seckill';
import type { SeckillActivityResponse, SeckillOrderResponse } from '@/api/types';
import { money, thousand, toDateTimeString } from '@/utils/format';

/**
 * 秒杀实验。
 *
 * <p>这一页的核心是选中一个活动后的并发压测：四道防线（限流 / 本地售罄标记 / Lua 扣减 / 唯一索引）
 * 会把并发请求切成「成功 / 库存不足 / 重复下单 / 被限流」几堆，
 * 看每一堆各占多少，比看单个请求的返回值有信息量得多。
 */

const activities = ref<SeckillActivityResponse[]>([]);
const listLoading = ref(false);
const currentActivity = ref<SeckillActivityResponse | null>(null);

const create = reactive({
    productId: 1,
    title: '限量大促',
    totalStock: 100,
    unitPrice: 99,
    startTime: toDateTimeString(new Date()),
    endTime: toDateTimeString(new Date(Date.now() + 3600_000)),
});

const burst = reactive({ threads: 20, baseUserId: 1000 });
const burstResult = ref<Awaited<ReturnType<typeof runBurst>> | null>(null);
const burstLoading = ref(false);
const stockBefore = ref<number | null>(null);
const stockAfter = ref<number | null>(null);

const { result: createResult, call: callCreate } = useApi<number>();
const { result: prepareResult, call: callPrepare } = useApi<number>();
const { result: stockResult, call: callStock } = useApi<number>();
const { result: runtimeResult, call: callRuntime } = useApi<Record<string, unknown>>();
const { result: orderResult, call: callOrder } = useApi<SeckillOrderResponse>();
const { call: callPay } = useApi<null>();
const { call: callCancel } = useApi<null>();

const orderNo = ref('');

/**
 * 拉取活动列表。
 */
async function loadActivities() {
    listLoading.value = true;
    try {
        const res = await api.listActivities();
        activities.value = res.ok && res.data ? res.data : [];
        if (currentActivity.value) {
            currentActivity.value = activities.value.find((item) => item.id === currentActivity.value?.id) ?? null;
        }
    } finally {
        listLoading.value = false;
    }
}

/**
 * 创建活动。
 */
async function doCreate() {
    const res = await callCreate(() => api.createActivity({ ...create }));
    if (res.ok) {
        ElMessage.success('活动已创建');
        await loadActivities();
    }
}

/**
 * 预热库存。
 *
 * @param row 活动行
 */
async function prepare(row: SeckillActivityResponse) {
    const res = await callPrepare(() => api.prepare(row.id));
    if (res.ok) {
        ElMessage.success(`已预热 ${res.data} 份库存`);
        await loadActivities();
    }
}

/**
 * 查看剩余库存。
 *
 * @param row 活动行
 */
function checkStock(row: SeckillActivityResponse) {
    void callStock(() => api.stock(row.id));
}

/**
 * 并发压测。一次性放出 threads 个请求，中间不加延迟。
 */
async function runBurstTest() {
    const target = currentActivity.value;
    if (!target) {
        ElMessage.warning('先在列表里选一个活动');
        return;
    }
    burstLoading.value = true;
    try {
        const before = await api.stock(target.id);
        stockBefore.value = before.ok ? before.data : null;
        burstResult.value = await runBurst(burst.threads, (index) =>
            api.seckill(target.id, burst.baseUserId + index, 1),
        );
        const after = await api.stock(target.id);
        stockAfter.value = after.ok ? after.data : null;
        await loadActivities();
        void callRuntime(api.runtime);
    } finally {
        burstLoading.value = false;
    }
}

/**
 * 查询订单。
 */
function queryOrder() {
    void callOrder(() => api.orderDetail(orderNo.value));
}

/**
 * 支付订单。
 */
async function pay() {
    const res = await callPay(() => api.payOrder(orderNo.value));
    if (res.ok) {
        ElMessage.success('已支付');
        await queryOrder();
    }
}

/**
 * 取消订单并回滚库存。
 */
async function cancel() {
    const res = await callCancel(() => api.cancelOrder(orderNo.value));
    if (res.ok) {
        ElMessage.success('已取消，库存已回滚');
        await loadActivities();
    }
}

const burstMessages = computed(() => Object.entries(burstResult.value?.messages ?? {}));

const burstChart = computed(() => {
    const summary = burstResult.value;
    if (!summary) {
        return null;
    }
    const data = [
        { name: '成功', value: summary.success },
        ...burstMessages.value.map(([key, value]) => ({ name: key, value })),
    ];
    return {
        tooltip: { trigger: 'item' },
        legend: { bottom: 0, type: 'scroll' },
        series: [
            {
                type: 'pie',
                radius: ['42%', '68%'],
                itemStyle: { borderColor: '#fff', borderWidth: 2 },
                label: { formatter: '{b}: {c}' },
                data,
            },
        ],
    };
});

onMounted(() => {
    void loadActivities();
    void callRuntime(api.runtime);
});
</script>

<template>
    <div>
        <SectionHead
            title="秒杀"
            desc="下单路径是「先扣 Redis 库存再异步建单」。这里的并发压测一次性放出 threads 个请求，看四道防线分别拦下多少。"
        >
            <template #actions>
                <el-button size="small" :icon="RefreshRight" @click="loadActivities()">刷新活动</el-button>
            </template>
        </SectionHead>

        <div class="lab-grid lab-grid--3">
            <StatCard label="剩余库存" :value="stockResult?.ok ? thousand(stockResult.data) : '-'" tone="accent" hint="Redis 中的份额" />
            <StatCard
                label="最近并发成功 / 总数"
                :value="burstResult ? `${burstResult.success} / ${burstResult.total}` : '-'"
                :tone="burstResult && burstResult.success === burstResult.total ? 'bad' : 'good'"
                hint="成功数不应超过剩余库存"
            />
            <StatCard label="压测耗时" :value="burstResult ? `${burstResult.elapsedMs} ms` : '-'" hint="整轮并发从发到收" />
        </div>

        <div class="lab-grid lab-grid--2">
            <div class="lab-card">
                <div class="lab-card__title">创建活动</div>
                <div class="lab-card__desc">活动创建后是草稿态，需要预热才会把库存写进 Redis 并开启。</div>
                <el-form size="small" label-width="86px">
                    <div class="lab-grid lab-grid--2">
                        <el-form-item label="商品 id">
                            <el-input-number v-model="create.productId" :min="1" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="单价">
                            <el-input-number v-model="create.unitPrice" :min="0" :precision="2" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="库存">
                            <el-input-number v-model="create.totalStock" :min="1" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="标题">
                            <el-input v-model="create.title" />
                        </el-form-item>
                    </div>
                    <el-form-item label="活动时间">
                        <el-date-picker
                            v-model="create.startTime"
                            type="datetime"
                            value-format="YYYY-MM-DD HH:mm:ss"
                            size="small"
                            placeholder="开始"
                            style="width: 180px"
                        />
                        <span class="lab-muted" style="margin: 0 8px">至</span>
                        <el-date-picker
                            v-model="create.endTime"
                            type="datetime"
                            value-format="YYYY-MM-DD HH:mm:ss"
                            size="small"
                            placeholder="结束"
                            style="width: 180px"
                        />
                    </el-form-item>
                    <el-button type="primary" size="small" @click="doCreate">创建活动</el-button>
                </el-form>
                <ResultView :result="createResult" title="创建结果" :max-height="140" style="margin-top: 10px" />
            </div>

            <div class="lab-card">
                <div class="lab-card__title">活动列表</div>
                <div class="lab-card__desc">点「选为压测对象」锁定目标，其余按钮是常规运维动作。</div>
                <el-table v-loading="listLoading" :data="activities" border stripe size="small" max-height="360">
                    <el-table-column prop="id" label="id" width="70" />
                    <el-table-column prop="title" label="标题" min-width="130" show-overflow-tooltip />
                    <el-table-column prop="totalStock" label="总库存" width="90" />
                    <el-table-column prop="availableStock" label="可用" width="80" />
                    <el-table-column label="单价" width="90">
                        <template #default="{ row }">{{ money(row.unitPrice) }}</template>
                    </el-table-column>
                    <el-table-column prop="status" label="状态" width="100">
                        <template #default="{ row }">
                            <el-tag :type="row.status === 'ONLINE' ? 'success' : 'info'" size="small">{{ row.status }}</el-tag>
                        </template>
                    </el-table-column>
                    <el-table-column label="操作" min-width="180">
                        <template #default="{ row }">
                            <el-button size="small" @click="prepare(row)">预热</el-button>
                            <el-button size="small" @click="checkStock(row)">库存</el-button>
                            <el-button
                                size="small"
                                :type="currentActivity?.id === row.id ? 'primary' : 'default'"
                                @click="currentActivity = row"
                            >
                                {{ currentActivity?.id === row.id ? '已选中' : '选中' }}
                            </el-button>
                        </template>
                    </el-table-column>
                </el-table>
            </div>
        </div>

        <div class="lab-card">
            <div class="lab-card__title">
                <el-icon><Timer /></el-icon>
                并发压测
            </div>
            <div class="lab-card__desc">
                每个请求用不同的 userId，绕开「同一用户限购」这道去重，直奔库存扣减的竞争。成功数应当恰好等于剩余库存，多一点就是超卖了。
            </div>
            <el-form size="small" inline label-width="80px">
                <el-form-item label="并发数">
                    <el-input-number v-model="burst.threads" :min="1" :max="100" controls-position="right" />
                </el-form-item>
                <el-form-item label="起始 uid">
                    <el-input-number v-model="burst.baseUserId" :min="1" controls-position="right" />
                </el-form-item>
                <el-form-item>
                    <el-button type="danger" :loading="burstLoading" @click="runBurstTest">开始压测</el-button>
                </el-form-item>
            </el-form>
            <el-alert
                type="info"
                :closable="false"
                show-icon
                title="并发数上限 100"
                description="后端全局限流是每 IP 每秒 200 次，压测本身也会被限流：再往上加，失败里会多出一批 1003，那是限流生效的证据而不是代码问题。"
                style="margin-bottom: 12px"
            />

            <div v-if="burstResult" class="lab-grid lab-grid--2">
                <div>
                    <div class="lab-row" style="margin-bottom: 8px">
                        <el-tag type="success" size="small" effect="dark">成功 {{ burstResult.success }}</el-tag>
                        <el-tag type="danger" size="small" effect="dark">失败 {{ burstResult.failed }}</el-tag>
                        <el-tag size="small" effect="plain">总耗时 {{ burstResult.elapsedMs }} ms</el-tag>
                        <el-tag size="small" effect="plain">
                            库存 {{ stockBefore ?? '-' }} → {{ stockAfter ?? '-' }}
                        </el-tag>
                    </div>
                    <el-table :data="burstMessages.map(([key, value]) => ({ key, value }))" border size="small" max-height="260">
                        <el-table-column prop="key" label="返回" min-width="220" show-overflow-tooltip />
                        <el-table-column prop="value" label="次数" width="90" />
                    </el-table>
                </div>
                <EChart v-if="burstChart" :option="burstChart" :height="280" />
            </div>
            <div v-else class="lab-hint">选一个活动，然后点「开始压测」。</div>
        </div>

        <div class="lab-card">
            <div class="lab-card__title">订单操作</div>
            <div class="lab-card__desc">秒杀订单是异步建单的，下单拿到回执后过一会儿再来查；取消会回滚库存。</div>
            <div class="lab-row">
                <el-input v-model="orderNo" placeholder="订单号" style="width: 280px" clearable />
                <el-button size="small" @click="queryOrder">查询</el-button>
                <el-button size="small" type="success" @click="pay">支付</el-button>
                <el-button size="small" type="danger" @click="cancel">取消并回滚</el-button>
            </div>
            <ResultView :result="orderResult" title="订单" :max-height="240" style="margin-top: 10px" />
        </div>

        <div class="lab-card">
            <div class="lab-card__title">运行时状态</div>
            <div class="lab-card__desc">本地售罄标记、限流器状态等进程内的数据，这里能看到请求被拦在哪一层。</div>
            <div class="lab-row" style="margin-bottom: 10px">
                <el-button size="small" :icon="RefreshRight" @click="callRuntime(api.runtime)">刷新</el-button>
            </div>
            <ResultView :result="runtimeResult" title="运行时" :max-height="260" />
        </div>
    </div>
</template>
