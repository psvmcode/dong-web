<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Delete, RefreshRight } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import ResultView from '@/components/ResultView.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/order';
import type { OrderBenchmarkResponse, OrderResponse, OrderTransitionLogResponse } from '@/api/types';
import { money } from '@/utils/format';

/**
 * 订单状态机。
 *
 * <p>状态只能由事件推进，所以页面先把「当前可用事件」查出来，
 * 让用户能对上的按钮才是能成功提交的按钮——这就是状态机对外暴露的全部信息。
 * benchmark 用来对照「加了乐观锁」与「不加」在同并发下的差别。
 */

const createForm = reactive({ userId: 1, productName: '无线降噪耳机', quantity: 1, payAmount: 999 });
const orderNo = ref('');
const events = ref<string[]>([]);
const fireForm = reactive({
    event: '',
    operator: 'console',
    payNo: '',
    trackingNo: '',
    refundAmount: 0,
    reason: '',
});
const benchmarkForm = reactive({ threads: 8, orderNoForBm: '' });
const compare = ref<{ cas: OrderBenchmarkResponse | null; none: OrderBenchmarkResponse | null }>({ cas: null, none: null });
const compareLoading = ref(false);

const { result: createResult, call: callCreate } = useApi<string>();
const { result: detailResult, call: callDetail } = useApi<OrderResponse>();
const { result: logsResult, call: callLogs } = useApi<OrderTransitionLogResponse[]>();
const { result: fireResult, call: callFire } = useApi<OrderResponse>();
const { result: benchmarkResult, call: callBenchmark } = useApi<OrderBenchmarkResponse>();
const { result: plantumlResult, call: callPlantuml } = useApi<string>();

const detail = computed(() => (detailResult.value?.ok ? detailResult.value.data : null));
const logs = computed<OrderTransitionLogResponse[]>(() =>
    logsResult.value?.ok && logsResult.value.data ? logsResult.value.data : [],
);

/**
 * 创建订单。
 */
async function doCreate() {
    const res = await callCreate(() => api.create({ ...createForm }));
    if (res.ok && res.data) {
        orderNo.value = res.data;
        ElMessage.success(`订单已创建：${res.data}`);
        await loadOrder();
    }
}

/**
 * 拉取订单详情、可用事件与流转日志。
 */
async function loadOrder() {
    if (!orderNo.value) {
        return;
    }
    await Promise.all([
        callDetail(() => api.detail(orderNo.value)),
        callLogs(() => api.logs(orderNo.value)),
        (async () => {
            const res = await api.availableEvents(orderNo.value);
            events.value = res.ok && res.data ? res.data : [];
            if (res.ok && res.data && res.data.length > 0 && !events.value.includes(fireForm.event)) {
                fireForm.event = res.data[0];
            }
        })(),
    ]);
}

/**
 * 触发事件推进状态。
 */
async function doFire() {
    if (!fireForm.event) {
        ElMessage.warning('先选一个事件');
        return;
    }
    const res = await callFire(() =>
        api.fire(orderNo.value, {
            event: fireForm.event,
            operator: fireForm.operator || undefined,
            payNo: fireForm.payNo || undefined,
            trackingNo: fireForm.trackingNo || undefined,
            refundAmount: refundEvents.includes(fireForm.event) ? fireForm.refundAmount : undefined,
            reason: fireForm.reason || undefined,
        }),
    );
    if (res.ok) {
        ElMessage.success(`已触发 ${fireForm.event}`);
        await loadOrder();
    }
}

/**
 * 需要金额的退款事件。
 */
const refundEvents = ['APPLY_REFUND', 'REFUND_SUCCESS', 'REFUND_FAIL'];

/**
 * 删除订单。
 */
async function doRemove() {
    await api.remove(orderNo.value);
    ElMessage.success('订单已删除');
    await loadOrder();
}

/**
 * 同一订单跑两遍并发推进：一遍带乐观锁，一遍不带，看成功次数与最终版本号。
 */
async function runCompare() {
    const target = benchmarkForm.orderNoForBm || orderNo.value;
    if (!target) {
        ElMessage.warning('先填一个订单号');
        return;
    }
    compareLoading.value = true;
    try {
        const cas = await callBenchmark(() => api.benchmark(target, 'cas', benchmarkForm.threads));
        compare.value.cas = cas.ok ? cas.data : null;
        const none = await callBenchmark(() => api.benchmark(target, 'none', benchmarkForm.threads));
        compare.value.none = none.ok ? none.data : null;
    } finally {
        compareLoading.value = false;
    }
}
</script>

<template>
    <div>
        <SectionHead
            title="订单状态机"
            desc="七个状态、九个事件，跨状态跳转由 COLA 状态机在框架层拦掉。并发也不能指望状态机：落库那一步仍然要乐观锁。"
        >
            <template #actions>
                <el-button size="small" @click="callPlantuml(api.plantuml)">导出状态图</el-button>
            </template>
        </SectionHead>

        <div class="lab-grid lab-grid--2">
            <div class="lab-card">
                <div class="lab-card__title">创建订单</div>
                <div class="lab-card__desc">订单创建后处于待支付，之后的每一步都必须走事件。</div>
                <el-form size="small" label-width="86px">
                    <div class="lab-grid lab-grid--2">
                        <el-form-item label="用户 id">
                            <el-input-number v-model="createForm.userId" :min="1" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="数量">
                            <el-input-number v-model="createForm.quantity" :min="1" controls-position="right" />
                        </el-form-item>
                    </div>
                    <el-form-item label="商品名">
                        <el-input v-model="createForm.productName" maxlength="128" />
                    </el-form-item>
                    <el-form-item label="金额">
                        <el-input-number v-model="createForm.payAmount" :min="0" :precision="2" controls-position="right" />
                    </el-form-item>
                    <el-button type="primary" size="small" @click="doCreate">创建订单</el-button>
                </el-form>
                <ResultView :result="createResult" title="订单号" :max-height="120" style="margin-top: 10px" />
            </div>

            <div class="lab-card">
                <div class="lab-card__title">订单操作</div>
                <div class="lab-card__desc">可用事件由后端按当前状态返回，灰掉的事件就是状态机不允许的分支。</div>
                <el-form size="small" label-width="86px">
                    <el-form-item label="订单号">
                        <el-input v-model="orderNo" placeholder="创建后自动填入" clearable />
                    </el-form-item>
                    <el-form-item label="可触发事件">
                        <div class="lab-row">
                            <el-tag v-for="event in events" :key="event" :type="fireForm.event === event ? 'primary' : 'info'" size="small" effect="plain" style="cursor: pointer" @click="fireForm.event = event">
                                {{ event }}
                            </el-tag>
                            <span v-if="events.length === 0" class="lab-hint">尚未加载或已到终态</span>
                        </div>
                    </el-form-item>
                    <el-form-item label="操作人">
                        <el-input v-model="fireForm.operator" style="width: 200px" />
                    </el-form-item>
                    <el-form-item label="支付流水">
                        <el-input v-model="fireForm.payNo" placeholder="PAY 事件需要" style="width: 220px" />
                    </el-form-item>
                    <el-form-item label="物流单号">
                        <el-input v-model="fireForm.trackingNo" placeholder="SHIP 事件需要" style="width: 220px" />
                    </el-form-item>
                    <el-form-item label="退款金额">
                        <el-input-number v-model="fireForm.refundAmount" :min="0" :precision="2" controls-position="right" />
                    </el-form-item>
                    <el-form-item label="原因">
                        <el-input v-model="fireForm.reason" placeholder="取消 / 退款失败需要" />
                    </el-form-item>
                </el-form>
                <div class="lab-row">
                    <el-button size="small" :icon="RefreshRight" @click="loadOrder()">刷新</el-button>
                    <el-button size="small" type="primary" @click="doFire">触发事件</el-button>
                    <el-button size="small" type="danger" :icon="Delete" @click="doRemove">删除订单</el-button>
                </div>
            </div>
        </div>

        <div class="lab-grid lab-grid--2">
            <div class="lab-card">
                <div class="lab-card__title">订单详情</div>
                <el-descriptions v-if="detail" :column="2" border size="small">
                    <el-descriptions-item label="订单号">{{ detail.orderNo }}</el-descriptions-item>
                    <el-descriptions-item label="状态">{{ detail.status }}（{{ detail.statusCode }}）</el-descriptions-item>
                    <el-descriptions-item label="商品">{{ detail.productName }}</el-descriptions-item>
                    <el-descriptions-item label="数量">{{ detail.quantity }}</el-descriptions-item>
                    <el-descriptions-item label="应付">{{ money(detail.payAmount) }}</el-descriptions-item>
                    <el-descriptions-item label="已退">{{ money(detail.refundAmount) }}</el-descriptions-item>
                    <el-descriptions-item label="版本号">{{ detail.version }}</el-descriptions-item>
                    <el-descriptions-item label="催单次数">{{ detail.urgeCount }}</el-descriptions-item>
                    <el-descriptions-item label="支付流水">{{ detail.payNo || '-' }}</el-descriptions-item>
                    <el-descriptions-item label="物流单号">{{ detail.trackingNo || '-' }}</el-descriptions-item>
                </el-descriptions>
                <div v-else class="lab-hint">还没有订单数据</div>
                <ResultView :result="fireResult" title="触发事件的返回" :max-height="200" style="margin-top: 10px" />
            </div>

            <div class="lab-card">
                <div class="lab-card__title">状态流转日志</div>
                <div class="lab-card__desc">accepted 为 false 的条目是被状态机拒绝的迁移，拒绝后状态会退回原值，所以这里能反复看到同一对 from → to。</div>
                <el-timeline v-if="logs.length > 0" style="padding-left: 4px; max-height: 340px; overflow: auto">
                    <el-timeline-item
                        v-for="(log, index) in logs"
                        :key="index"
                        :type="log.accepted ? 'success' : 'danger'"
                        :timestamp="log.createTime"
                    >
                        {{ log.fromStatus }} → {{ log.toStatus }}（{{ log.event }}）
                        <div class="lab-hint">{{ log.reason }} · 操作人 {{ log.operator }}</div>
                    </el-timeline-item>
                </el-timeline>
                <div v-else class="lab-hint">暂无流转日志</div>
            </div>
        </div>

        <div class="lab-card">
            <div class="lab-card__title">并发推进对比</div>
            <div class="lab-card__desc">
                cas 模式带乐观锁（where status=? and version=?），none 模式不带。同一个订单用两种模式各推进 threads 次，
                对比成功次数与最终版本号，就能看到「没有锁时被覆盖写掉了多少」。
            </div>
            <el-form size="small" inline label-width="80px">
                <el-form-item label="订单号">
                    <el-input v-model="benchmarkForm.orderNoForBm" :placeholder="orderNo || '留空则用当前订单'" style="width: 260px" />
                </el-form-item>
                <el-form-item label="并发数">
                    <el-input-number v-model="benchmarkForm.threads" :min="1" :max="100" controls-position="right" />
                </el-form-item>
                <el-form-item>
                    <el-button type="danger" :loading="compareLoading" @click="runCompare">跑两组对照</el-button>
                </el-form-item>
            </el-form>
            <el-table v-if="compare.cas || compare.none" :data="[compare.cas, compare.none].filter(Boolean)" border size="small">
                <el-table-column prop="mode" label="模式" width="120" />
                <el-table-column prop="threads" label="并发数" width="90" />
                <el-table-column prop="successCount" label="成功次数" width="110" />
                <el-table-column prop="blockedCount" label="被拦次数" width="110" />
                <el-table-column prop="finalStatus" label="最终状态" width="130" />
                <el-table-column prop="finalVersion" label="最终版本" width="110" />
                <el-table-column prop="attemptLogCount" label="日志条数" width="110" />
                <el-table-column prop="elapsedMs" label="耗时 ms" width="110" />
            </el-table>
            <ResultView :result="benchmarkResult" title="最后一次返回" :max-height="200" style="margin-top: 10px" />
        </div>

        <div class="lab-card">
            <div class="lab-card__title">状态机图（PlantUML）</div>
            <div class="lab-card__desc">导出的是 PlantUML 语法，粘到任意支持的工具里就能看到完整的状态跃迁图。</div>
            <el-button size="small" type="primary" @click="callPlantuml(api.plantuml)">导出</el-button>
            <ResultView :result="plantumlResult" empty-text="点「导出」生成" :max-height="260" style="margin-top: 10px" />
        </div>
    </div>
</template>
