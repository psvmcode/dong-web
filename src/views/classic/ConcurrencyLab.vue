<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import SectionHead from '@/components/SectionHead.vue';
import StatCard from '@/components/StatCard.vue';
import ResultView from '@/components/ResultView.vue';
import EChart from '@/components/EChart.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/classic';
import type { ClassicIdGenerated, ClassicLockLabResult, ClassicRateLimitLabResult } from '@/api/types';

/**
 * 发号器 / 锁 / 限流三组对照实验。
 *
 * <p>这三个实验是同一种方法论：同一件事用不同手段做一遍，
 * 把耗时、精度、丢失量放在同一张表里。页面因此统一按「跑全部 → 排表格」的形式组织，
 * 而不是让用户自己一个个按钮点过去。
 */

const idCount = ref(1000);
const idStrategy = ref('snowflake');
const idRows = ref<Record<string, unknown>[]>([]);
const idLoading = ref(false);
const idHistory = ref<ClassicIdGenerated[]>([]);

const lockForm = ref({ threads: 20, loops: 20 });
const lockRows = ref<Record<string, unknown>[]>([]);
const lockLoading = ref(false);
const lockHistory = ref<ClassicLockLabResult[]>([]);

const limiterForm = ref({ bizKey: 'api-demo', limit: 100, windowSeconds: 60, attempts: 200, gapMillis: 300, distributed: true });
const limiterAlgorithm = ref('SLIDING_WINDOW');
const limiterRows = ref<ClassicRateLimitLabResult[]>([]);
const limiterLoading = ref(false);

const { result: idResult, call: callId } = useApi<Record<string, unknown>>();
const { result: tryResult, call: callTry } = useApi<boolean>();
const { result: compareResult, call: callCompare } = useApi<Record<string, unknown>>();

/**
 * 四种发号策略各跑一遍。
 */
async function runAllStrategies() {
    idLoading.value = true;
    idRows.value = [];
    try {
        for (const strategy of ['snowflake', 'segment', 'redis', 'uuid']) {
            const res = await callId(() => api.generateIds(strategy, idCount.value));
            if (res.ok) {
                idRows.value.push(res.data as Record<string, unknown>);
            }
        }
        const history = await api.idRecords(idStrategy.value, 10);
        idHistory.value = history.ok && history.data ? history.data : [];
    } finally {
        idLoading.value = false;
    }
}

/**
 * 锁实验：不带锁与带锁各跑一遍。
 */
async function runLockCompare() {
    lockLoading.value = true;
    lockRows.value = [];
    try {
        const none = await api.lockWithout(lockForm.value.threads, lockForm.value.loops);
        if (none.ok) {
            lockRows.value.push({ mode: 'none', ...(none.data as Record<string, unknown>) });
        }
        const locked = await api.lockWith(lockForm.value.threads, lockForm.value.loops);
        if (locked.ok) {
            lockRows.value.push({ mode: 'lock', ...(locked.data as Record<string, unknown>) });
        }
        const [noLock, redisson] = await Promise.all([api.lockRecords('no-lock', 5), api.lockRecords('redisson-lock', 5)]);
        lockHistory.value = [
            ...(noLock.ok && noLock.data ? noLock.data : []),
            ...(redisson.ok && redisson.data ? redisson.data : []),
        ];
    } finally {
        lockLoading.value = false;
    }
}

/**
 * 四种限流算法一轮对比：每种算法先来一轮突发，隔 gapMillis 再来第二轮。
 */
async function runLimiterCompare() {
    limiterLoading.value = true;
    limiterRows.value = [];
    try {
        await callCompare(() => api.limiterCompare({ ...limiterForm.value }));
        const history = await api.limiterRecords(limiterForm.value.bizKey, 20);
        limiterRows.value = history.ok && history.data ? history.data : [];
        ElMessage.success('四算法对比完成');
    } finally {
        limiterLoading.value = false;
    }
}

/**
 * 单算法单次尝试。
 */
async function tryOnce() {
    const res = await callTry(() =>
        api.limiterTry(
            `${limiterForm.value.bizKey}:${limiterAlgorithm.value.toLowerCase()}`,
            limiterAlgorithm.value,
            limiterForm.value.limit,
            limiterForm.value.windowSeconds,
            limiterForm.value.distributed,
        ),
    );
    ElMessage[res.ok && res.data ? 'success' : 'warning'](res.ok && res.data ? '拿到配额' : '被限流');
}

const idChart = computed(() => {
    const rows = idRows.value;
    if (rows.length === 0) {
        return null;
    }
    return {
        tooltip: { trigger: 'axis' },
        grid: { left: 70, right: 20, top: 24, bottom: 40 },
        xAxis: { type: 'category', data: rows.map((row) => String(row.strategy)) },
        yAxis: { type: 'value', name: 'ms' },
        series: [
            {
                type: 'bar',
                data: rows.map((row) => Number(row.elapsedMillis ?? 0)),
                itemStyle: { color: '#3d6ff5', borderRadius: [6, 6, 0, 0] },
            },
        ],
    };
});

const limiterChart = computed(() => {
    const rows = limiterRows.value;
    if (rows.length === 0) {
        return null;
    }
    return {
        tooltip: { trigger: 'axis' },
        legend: { bottom: 0 },
        grid: { left: 70, right: 20, top: 24, bottom: 50 },
        xAxis: { type: 'category', data: rows.map((row) => row.algorithm) },
        yAxis: { type: 'value' },
        series: [
            {
                name: '第一轮放行',
                type: 'bar',
                data: rows.map((row) => row.firstBurstAllowed),
                itemStyle: { color: '#3d6ff5', borderRadius: [6, 6, 0, 0] },
            },
            {
                name: '第二轮放行',
                type: 'bar',
                data: rows.map((row) => row.secondBurstAllowed),
                itemStyle: { color: '#f2b94b', borderRadius: [6, 6, 0, 0] },
            },
        ],
    };
});
</script>

<template>
    <div>
        <SectionHead
            title="发号器 / 锁 / 限流"
            desc="三组实验都是同一个套路：同一件事换几种做法，把耗时、精度与丢失量并排摆出来。看数字之间的差距，比看单个结果有信息量得多。"
        />

        <el-tabs>
            <el-tab-pane label="发号器">
                <el-alert
                    type="info"
                    :closable="false"
                    show-icon
                    title="看什么"
                    description="同样生成 count 个 id：snowflake 本地自增最快但不带业务语义，redis / segment 要过一次网络或用一批号，uuid 无顺序信息所以索引最差。elapsedMillis 的差距就是选择的依据。"
                    style="margin-bottom: 12px"
                />
                <div class="lab-row">
                    <el-input-number v-model="idCount" :min="1" :max="1000" size="small" controls-position="right" />
                    <el-button type="primary" size="small" :loading="idLoading" @click="runAllStrategies">
                        四种策略各跑一遍
                    </el-button>
                    <span class="lab-spacer" />
                    <span class="lab-hint">历史记录只看这一种：</span>
                    <el-select v-model="idStrategy" size="small" style="width: 160px" @change="api.idRecords(idStrategy, 10).then((res) => (idHistory = res.ok && res.data ? res.data : []))">
                        <el-option label="snowflake" value="snowflake" />
                        <el-option label="segment" value="segment" />
                        <el-option label="redis" value="redis" />
                        <el-option label="uuid" value="uuid" />
                    </el-select>
                </div>
                <el-table :data="idRows" border stripe size="small" style="margin-top: 12px">
                    <el-table-column prop="strategy" label="策略" width="120" />
                    <el-table-column prop="count" label="生成数量" width="110" />
                    <el-table-column prop="lastId" label="最后一个 id" min-width="200" show-overflow-tooltip />
                    <el-table-column label="耗时 ms" width="120">
                        <template #default="{ row }">{{ Number(row.elapsedMillis ?? 0).toFixed(2) }}</template>
                    </el-table-column>
                </el-table>
                <EChart v-if="idChart" :option="idChart" :height="240" />
                <div class="lab-grid lab-grid--2" style="margin-top: 12px">
                    <div>
                        <div class="lab-hint" style="margin-bottom: 6px">历史记录</div>
                        <el-table :data="idHistory" border size="small" max-height="240">
                            <el-table-column prop="strategy" label="策略" width="110" />
                            <el-table-column prop="idCount" label="数量" width="90" />
                            <el-table-column label="耗时 ms" width="110">
                                <template #default="{ row }">{{ Number(row.elapsedMillis).toFixed(2) }}</template>
                            </el-table-column>
                            <el-table-column prop="createTime" label="时间" min-width="150" />
                        </el-table>
                    </div>
                    <ResultView :result="idResult" title="最后一次返回" :max-height="240" />
                </div>
            </el-tab-pane>

            <el-tab-pane label="并发锁">
                <el-alert
                    type="warning"
                    :closable="false"
                    show-icon
                    title="对照的意义"
                    description="不加锁那一组必然丢失更新：expectedCount 是理论上该有的值，actualCount 是实际值，两者的差就是被覆盖写掉的次数。加锁组结果精确但耗时会高一个量级。"
                    style="margin-bottom: 12px"
                />
                <div class="lab-row">
                    <span class="lab-hint">并发线程</span>
                    <el-input-number v-model="lockForm.threads" :min="1" :max="200" size="small" controls-position="right" />
                    <span class="lab-hint">每线程循环</span>
                    <el-input-number v-model="lockForm.loops" :min="1" :max="500" size="small" controls-position="right" />
                    <el-button type="danger" size="small" :loading="lockLoading" @click="runLockCompare">跑两组对照</el-button>
                </div>
                <el-table :data="lockRows" border stripe size="small" style="margin-top: 12px">
                    <el-table-column prop="mode" label="模式" width="110">
                        <template #default="{ row }">
                            <el-tag :type="row.mode === 'lock' ? 'success' : 'danger'" size="small">
                                {{ row.mode === 'lock' ? '加 Redisson 锁' : '不加锁' }}
                            </el-tag>
                        </template>
                    </el-table-column>
                    <el-table-column prop="expectedCount" label="期望值" width="100" />
                    <el-table-column prop="actualCount" label="实际值" width="100" />
                    <el-table-column prop="lostUpdates" label="丢失更新" width="110" />
                    <el-table-column prop="lockAcquired" label="获锁成功" width="110" />
                    <el-table-column prop="lockTimedOut" label="获锁超时" width="110" />
                    <el-table-column prop="elapsedMillis" label="耗时 ms" width="110" />
                </el-table>
                <div class="lab-grid lab-grid--3" style="margin-top: 12px">
                    <StatCard
                        label="不加锁丢失量"
                        :value="String(lockRows.find((row) => row.mode === 'none')?.lostUpdates ?? '-')"
                        tone="bad"
                        hint="expectedCount - actualCount"
                    />
                    <StatCard
                        label="加锁丢失量"
                        :value="String(lockRows.find((row) => row.mode === 'lock')?.lostUpdates ?? '-')"
                        tone="good"
                        hint="应当始终为 0"
                    />
                    <StatCard
                        label="耗时倍数"
                        :value="
                            lockRows.length === 2
                                ? (Number(lockRows[1].elapsedMillis) / Math.max(1, Number(lockRows[0].elapsedMillis))).toFixed(1)
                                : '-'
                        "
                        tone="warn"
                        hint="加锁耗时 / 不加锁耗时"
                    />
                </div>
                <el-table :data="lockHistory" border stripe size="small" style="margin-top: 12px">
                    <el-table-column prop="mode" label="模式" width="140" />
                    <el-table-column prop="expectedCount" label="期望值" width="100" />
                    <el-table-column prop="actualCount" label="实际值" width="100" />
                    <el-table-column prop="lostUpdates" label="丢失更新" width="110" />
                    <el-table-column prop="elapsedMillis" label="耗时 ms" width="110" />
                    <el-table-column prop="createTime" label="时间" min-width="160" />
                </el-table>
            </el-tab-pane>

            <el-tab-pane label="限流算法">
                <el-alert
                    type="info"
                    :closable="false"
                    show-icon
                    title="四算法的区别在哪"
                    description="固定窗口在临界点能放两倍流量；滑动窗口精确但内存开销大；令牌桶允许突发；漏桶把突发削成匀速。第二轮故意隔 gapMillis 再打，就是为了看跨窗口那一瞬间各算法放了多少。"
                    style="margin-bottom: 12px"
                />
                <el-form size="small" inline label-width="86px">
                    <el-form-item label="业务 key">
                        <el-input v-model="limiterForm.bizKey" style="width: 160px" />
                    </el-form-item>
                    <el-form-item label="配额">
                        <el-input-number v-model="limiterForm.limit" :min="1" controls-position="right" />
                    </el-form-item>
                    <el-form-item label="窗口秒">
                        <el-input-number v-model="limiterForm.windowSeconds" :min="1" controls-position="right" />
                    </el-form-item>
                    <el-form-item label="突发次数">
                        <el-input-number v-model="limiterForm.attempts" :min="1" controls-position="right" />
                    </el-form-item>
                    <el-form-item label="两轮间隔 ms">
                        <el-input-number v-model="limiterForm.gapMillis" :min="0" controls-position="right" />
                    </el-form-item>
                    <el-form-item label="分布式">
                        <el-switch v-model="limiterForm.distributed" />
                    </el-form-item>
                </el-form>
                <div class="lab-row">
                    <el-button type="primary" size="small" :loading="limiterLoading" @click="runLimiterCompare">
                        四算法对比
                    </el-button>
                    <el-select v-model="limiterAlgorithm" size="small" style="width: 180px">
                        <el-option label="固定窗口" value="FIXED_WINDOW" />
                        <el-option label="滑动窗口" value="SLIDING_WINDOW" />
                        <el-option label="令牌桶" value="TOKEN_BUCKET" />
                        <el-option label="漏桶" value="LEAKY_BUCKET" />
                    </el-select>
                    <el-button size="small" @click="tryOnce">单算法试一次</el-button>
                </div>
                <el-table :data="limiterRows" border stripe size="small" style="margin-top: 12px">
                    <el-table-column prop="algorithm" label="算法" min-width="130" />
                    <el-table-column prop="limitCount" label="配额" width="90" />
                    <el-table-column prop="windowSeconds" label="窗口秒" width="90" />
                    <el-table-column prop="attempts" label="突发次数" width="100" />
                    <el-table-column prop="firstBurstAllowed" label="第一轮放行" width="110" />
                    <el-table-column prop="secondBurstAllowed" label="第二轮放行" width="110" />
                    <el-table-column label="是否分布式" width="110">
                        <template #default="{ row }">{{ row.distributed === 1 ? '是' : '否' }}</template>
                    </el-table-column>
                </el-table>
                <div class="lab-grid lab-grid--2" style="margin-top: 12px">
                    <EChart v-if="limiterChart" :option="limiterChart" :height="260" />
                    <div>
                        <ResultView :result="compareResult" title="对比原始返回" :max-height="240" />
                        <ResultView :result="tryResult" title="单次尝试" :max-height="140" style="margin-top: 10px" />
                    </div>
                </div>
            </el-tab-pane>
        </el-tabs>
    </div>
</template>
