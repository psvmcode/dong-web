<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import SectionHead from '@/components/SectionHead.vue';
import EChart from '@/components/EChart.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/classic';

/**
 * 性能对比实验室。
 *
 * <p>三个实验共用同一种方法论：同一件事换几种做法，把结果画在同一张图上。
 * 单个数字说明不了任何问题——「加锁耗时 23 秒」看起来很糟，
 * 但只有跟「不加锁丢失 98 次更新」放在一起，才知道这个代价值不值。
 */

const tab = ref<'id' | 'lock' | 'limiter'>('lock');

const idCount = ref(1000);
const idLoading = ref(false);
const idRows = ref<Record<string, unknown>[]>([]);

const lock = reactive({ threads: 10, loops: 10 });
const lockLoading = ref(false);
const lockRows = ref<Record<string, unknown>[]>([]);

const limiter = reactive({ bizKey: 'api-demo', limit: 50, windowSeconds: 60, attempts: 120, gapMillis: 500, distributed: true });
const limiterLoading = ref(false);
const limiterRows = ref<Record<string, unknown> | null>(null);

const { result: idResult, call: callId } = useApi<Record<string, unknown>>();
const { result: tryResult, call: callTry } = useApi<boolean>();
const { result: compareResult, call: callCompare } = useApi<Record<string, unknown>>();

/**
 * 四种发号策略各跑一遍。
 */
async function runIds() {
    idLoading.value = true;
    idRows.value = [];
    try {
        for (const strategy of ['snowflake', 'segment', 'redis', 'uuid']) {
            const res = await callId(() => api.generateIds(strategy, idCount.value));
            if (res.ok) {
                idRows.value.push(res.data as Record<string, unknown>);
            }
        }
        ElMessage.success('四种策略跑完了，看耗时对比');
    } finally {
        idLoading.value = false;
    }
}

/**
 * 锁实验：不加锁与加锁各跑一遍。
 */
async function runLock() {
    lockLoading.value = true;
    lockRows.value = [];
    try {
        const none = await api.lockWithout(lock.threads, lock.loops);
        if (none.ok) {
            lockRows.value.push(none.data as Record<string, unknown>);
        }
        const locked = await api.lockWith(lock.threads, lock.loops);
        if (locked.ok) {
            lockRows.value.push(locked.data as Record<string, unknown>);
        }
        ElMessage.success('两组都跑完了');
    } finally {
        lockLoading.value = false;
    }
}

/**
 * 限流：四种算法各来两轮突发。
 */
async function runLimiter() {
    limiterLoading.value = true;
    limiterRows.value = null;
    try {
        const res = await callCompare(() => api.limiterCompare({ ...limiter }));
        limiterRows.value = res.ok ? (res.data as Record<string, unknown>) : null;
        ElMessage.success('四算法对比完成');
    } finally {
        limiterLoading.value = false;
    }
}

/**
 * 从结果里取数字，字段名不统一时按候选顺序找。
 *
 * @param data 返回体
 * @param keys 候选字段
 */
function num(data: Record<string, unknown> | undefined, keys: string[]): number {
    if (!data) {
        return 0;
    }
    for (const key of keys) {
        const value = data[key];
        if (typeof value === 'number') {
            return value;
        }
    }
    return 0;
}

const idChart = computed(() => {
    const rows = idRows.value;
    if (rows.length === 0) {
        return null;
    }
    return {
        tooltip: { trigger: 'axis' },
        grid: { left: 80, right: 24, top: 24, bottom: 30 },
        xAxis: { type: 'value', name: 'ms' },
        yAxis: { type: 'category', data: rows.map((row) => String(row.strategy)) },
        series: [
            {
                type: 'bar',
                data: rows.map((row) => ({ value: Number(row.elapsedMillis ?? 0), itemStyle: { color: '#3d6ff5', borderRadius: [0, 6, 6, 0] } })),
                label: { show: true, position: 'right', fontSize: 11, formatter: '{c} ms' },
            },
        ],
    };
});

const lockChart = computed(() => {
    const rows = lockRows.value;
    if (rows.length === 0) {
        return null;
    }
    return {
        tooltip: { trigger: 'axis' },
        legend: { bottom: 0 },
        grid: { left: 70, right: 24, top: 30, bottom: 44 },
        xAxis: { type: 'category', data: rows.map((row) => (row.mode === 'no-lock' ? '不加锁' : 'Redisson 锁')) },
        yAxis: [
            { type: 'value', name: '次数' },
            { type: 'value', name: 'ms' },
        ],
        series: [
            {
                name: '丢失更新',
                type: 'bar',
                data: rows.map((row) => num(row, ['lostUpdates'])),
                itemStyle: { color: '#dc4a4a', borderRadius: [6, 6, 0, 0] },
            },
            {
                name: '实际计数',
                type: 'bar',
                data: rows.map((row) => num(row, ['actual'])),
                itemStyle: { color: '#16a34a', borderRadius: [6, 6, 0, 0] },
            },
            {
                name: '耗时',
                type: 'line',
                yAxisIndex: 1,
                data: rows.map((row) => num(row, ['elapsedMillis'])),
                lineStyle: { color: '#f2b94b' },
                itemStyle: { color: '#f2b94b' },
            },
        ],
    };
});

const limiterChart = computed(() => {
    const data = limiterRows.value;
    if (!data) {
        return null;
    }
    const entries = Object.entries(data);
    return {
        tooltip: { trigger: 'axis' },
        legend: { bottom: 0 },
        grid: { left: 70, right: 24, top: 30, bottom: 44 },
        xAxis: { type: 'category', data: entries.map(([key]) => key) },
        yAxis: { type: 'value', name: '放行次数' },
        series: [
            {
                name: '第一轮放行',
                type: 'bar',
                data: entries.map(([, value]) =>
                    num(value as Record<string, unknown>, ['firstBurstAllowed']),
                ),
                itemStyle: { color: '#3d6ff5', borderRadius: [6, 6, 0, 0] },
            },
            {
                name: '第二轮放行',
                type: 'bar',
                data: entries.map(([, value]) =>
                    num(value as Record<string, unknown>, ['secondBurstAllowed']),
                ),
                itemStyle: { color: '#f2b94b', borderRadius: [6, 6, 0, 0] },
            },
        ],
    };
});

const lockSummary = computed(() => {
    const noLock = lockRows.value.find((row) => row.mode === 'no-lock');
    const locked = lockRows.value.find((row) => row.mode !== 'no-lock');
    if (!noLock || !locked) {
        return null;
    }
    const lost = num(noLock, ['lostUpdates']);
    const slow = num(locked, ['elapsedMillis']) / Math.max(1, num(noLock, ['elapsedMillis']));
    return { lost, slow: slow.toFixed(1), expected: num(noLock, ['expected']) };
});
</script>

<template>
    <div class="pl">
        <SectionHead
            title="性能对比实验室"
            desc="同一件事换几种做法，把数字并排摆出来。单个结果说明不了问题，差值才说明问题。"
        />

        <el-tabs v-model="tab">
            <el-tab-pane label="并发锁" name="lock">
                <div class="pl__run">
                    <div>
                        <div class="pl__run-title">加锁 vs 不加锁</div>
                        <div class="pl__run-desc">
                            期望值是「线程数 × 循环次数」，实际值是并发自增之后真正落下的值。
                            两者的差就是被覆盖写掉的次数。
                        </div>
                    </div>
                    <span class="lab-spacer" />
                    <el-input-number v-model="lock.threads" :min="1" :max="200" size="small" controls-position="right" />
                    <span class="lab-hint">线程</span>
                    <el-input-number v-model="lock.loops" :min="1" :max="500" size="small" controls-position="right" />
                    <span class="lab-hint">每线程循环</span>
                    <el-button type="danger" size="small" :loading="lockLoading" @click="runLock">跑两组对照</el-button>
                </div>

                <div v-if="lockSummary" class="pl__verdict">
                    期望 {{ lockSummary.expected }} 次更新：不加锁丢了
                    <b class="pl__bad">{{ lockSummary.lost }}</b> 次，加锁一次没丢，代价是慢了
                    <b class="pl__warn">{{ lockSummary.slow }}</b> 倍。
                </div>

                <div class="pl__panel">
                    <EChart v-if="lockChart" :option="lockChart" :height="280" />
                    <div v-else class="lab-hint">点「跑两组对照」开始</div>
                </div>

                <el-table v-if="lockRows.length > 0" :data="lockRows" border size="small">
                    <el-table-column label="模式" width="160">
                        <template #default="{ row }">
                            <el-tag :type="row.mode === 'no-lock' ? 'danger' : 'success'" size="small" effect="dark">
                                {{ row.mode === 'no-lock' ? '不加锁' : 'Redisson 锁' }}
                            </el-tag>
                        </template>
                    </el-table-column>
                    <el-table-column label="期望" width="90">
                        <template #default="{ row }">{{ num(row, ['expected']) }}</template>
                    </el-table-column>
                    <el-table-column label="实际" width="90">
                        <template #default="{ row }">{{ num(row, ['actual']) }}</template>
                    </el-table-column>
                    <el-table-column label="丢失更新" width="110">
                        <template #default="{ row }">{{ num(row, ['lostUpdates']) }}</template>
                    </el-table-column>
                    <el-table-column label="获锁成功" width="110">
                        <template #default="{ row }">{{ num(row, ['lockAcquired']) }}</template>
                    </el-table-column>
                    <el-table-column label="获锁超时" width="110">
                        <template #default="{ row }">{{ num(row, ['lockTimedOut']) }}</template>
                    </el-table-column>
                    <el-table-column label="耗时 ms" width="110">
                        <template #default="{ row }">{{ num(row, ['elapsedMillis']) }}</template>
                    </el-table-column>
                </el-table>
            </el-tab-pane>

            <el-tab-pane label="限流算法" name="limiter">
                <div class="pl__run">
                    <div>
                        <div class="pl__run-title">四种算法的两轮突发</div>
                        <div class="pl__run-desc">
                            第一轮把配额打光，隔 gapMillis 再打第二轮。固定窗口在临界点能放两倍流量，
                            令牌桶与漏桶会在间隔里恢复一点，滑动窗口最精确但也最贵。
                        </div>
                    </div>
                    <span class="lab-spacer" />
                    <el-button type="primary" size="small" :loading="limiterLoading" @click="runLimiter">跑一轮对比</el-button>
                </div>

                <el-form size="small" inline label-width="86px">
                    <el-form-item label="业务 key">
                        <el-input v-model="limiter.bizKey" style="width: 160px" />
                    </el-form-item>
                    <el-form-item label="配额">
                        <el-input-number v-model="limiter.limit" :min="1" controls-position="right" />
                    </el-form-item>
                    <el-form-item label="窗口秒">
                        <el-input-number v-model="limiter.windowSeconds" :min="1" controls-position="right" />
                    </el-form-item>
                    <el-form-item label="突发次数">
                        <el-input-number v-model="limiter.attempts" :min="1" controls-position="right" />
                    </el-form-item>
                    <el-form-item label="两轮间隔 ms">
                        <el-input-number v-model="limiter.gapMillis" :min="0" controls-position="right" />
                    </el-form-item>
                    <el-form-item label="分布式">
                        <el-switch v-model="limiter.distributed" />
                    </el-form-item>
                </el-form>

                <div class="pl__panel">
                    <EChart v-if="limiterChart" :option="limiterChart" :height="280" />
                    <div v-else class="lab-hint">点「跑一轮对比」开始</div>
                </div>

                <el-alert
                    v-if="limiterRows"
                    type="info"
                    :closable="false"
                    show-icon
                    title="怎么看这张图"
                    description="第一轮放行超过配额的就是「临界点放了两倍流量」；第二轮放行为 0 说明窗口没恢复，大于 0 说明算法允许在间隔内补充配额。"
                />
                <div v-if="tryResult" class="lab-hint">
                    单次尝试结果：{{ tryResult.ok ? (tryResult.data ? '拿到配额' : '被限流') : `code ${tryResult.code}` }}
                </div>
            </el-tab-pane>

            <el-tab-pane label="发号器" name="id">
                <div class="pl__run">
                    <div>
                        <div class="pl__run-title">四种 id 策略各生成 {{ idCount }} 个</div>
                        <div class="pl__run-desc">
                            snowflake 本地自增最快但不带业务语义；segment 一次取一批；redis 每次都要过网络；
                            uuid 无序，进 InnoDB 主键会让页分裂明显变多。
                        </div>
                    </div>
                    <span class="lab-spacer" />
                    <el-input-number v-model="idCount" :min="1" :max="1000" size="small" controls-position="right" />
                    <el-button type="primary" size="small" :loading="idLoading" @click="runIds">四种各跑一遍</el-button>
                </div>

                <div class="pl__panel">
                    <EChart v-if="idChart" :option="idChart" :height="280" />
                    <div v-else class="lab-hint">点「四种各跑一遍」开始</div>
                </div>

                <el-table v-if="idRows.length > 0" :data="idRows" border size="small">
                    <el-table-column prop="strategy" label="策略" width="140" />
                    <el-table-column prop="count" label="数量" width="100" />
                    <el-table-column prop="lastId" label="最后一个 id" min-width="220" show-overflow-tooltip />
                    <el-table-column label="耗时 ms" width="130">
                        <template #default="{ row }">{{ Number(row.elapsedMillis ?? 0).toFixed(3) }}</template>
                    </el-table-column>
                </el-table>
                <div v-if="idResult" class="lab-hint">
                    最后一次返回：{{ idResult.ok ? '成功' : `code ${idResult.code}` }}
                </div>
            </el-tab-pane>
        </el-tabs>
    </div>
</template>

<style scoped>
.pl__run {
    display: flex;
    align-items: center;
    gap: 10px;
    background: #fff;
    border: 1px solid var(--lab-border);
    border-left: 3px solid #3d6ff5;
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    padding: 14px 16px;
    margin-bottom: 12px;
    flex-wrap: wrap;
}

.pl__run-title {
    font-size: 14px;
    font-weight: 600;
}

.pl__run-desc {
    font-size: 12px;
    color: var(--lab-muted);
    line-height: 1.7;
    margin-top: 4px;
    max-width: 620px;
}

.pl__verdict {
    background: #fff7e8;
    border: 1px solid #ffe0a3;
    border-radius: 10px;
    padding: 10px 14px;
    font-size: 13px;
    margin-bottom: 12px;
    line-height: 1.8;
}

.pl__bad {
    color: #dc4a4a;
    font-size: 16px;
}

.pl__warn {
    color: #d98900;
    font-size: 16px;
}

.pl__panel {
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    padding: 12px 14px;
    margin-bottom: 12px;
}
</style>
