<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Delete, RefreshRight, Sunny } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import EChart from '@/components/EChart.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/cache';
import type { CacheStatsSnapshot } from '@/api/types';
import { thousand } from '@/utils/format';

/**
 * 缓存监控大屏。
 *
 * <p>这一页的定位是「看数」而不是「调接口」：
 * 上方是命中率与各层贡献，中间是穿透对照实验（无布隆 vs 有布隆，同一批 id 打过去看回源次数差多少），
 * 下方才是手动读写一个 key 的操作台。
 */

const stats = ref<CacheStatsSnapshot | null>(null);
const penetration = reactive({ count: 200 });
const probe = reactive({ key: 'lab:demo', value: 'hello-dong' });
const comparison = ref<{ off: Record<string, unknown> | null; on: Record<string, unknown> | null }>({ off: null, on: null });

const { loading: statLoading, call: callStats } = useApi<CacheStatsSnapshot>();
const { result: levelsResult, call: callLevels } = useApi<Record<string, unknown>>();
const { result: penetrationResult, loading: penetrateLoading, call: callPenetration } = useApi<Record<string, unknown>>();
const { result: probeResult, call: callProbe } = useApi<string>();
const { call: callInvalidate } = useApi<null>();
const { call: callWarmUp } = useApi<number>();
const { call: callReset } = useApi<unknown>();

/**
 * 拉取命中统计。
 */
async function loadStats() {
    const res = await callStats(api.cacheStats);
    if (res.ok) {
        stats.value = res.data;
    }
}

/**
 * 穿透对照：同一批不存在的 id，无布隆与有布隆各打一次。
 */
async function runPenetration() {
    comparison.value = { off: null, on: null };
    const off = await callPenetration(() => api.penetration({ count: penetration.count, guarded: false }));
    comparison.value.off = off.ok ? off.data : null;
    const on = await callPenetration(() => api.penetration({ count: penetration.count, guarded: true }));
    comparison.value.on = on.ok ? on.data : null;
    ElMessage.success('对照完成，看下面两张卡的回源次数差多少');
    await loadStats();
}

/**
 * 先写后读同一个 key，两次耗时差就是 L2 的往返成本。
 */
async function probeTwice() {
    await callProbe(() => api.probe({ key: probe.key, value: probe.value }));
    await callProbe(() => api.probe({ key: probe.key, value: probe.value }));
}

/**
 * 删除 key 并广播失效。
 */
async function invalidate() {
    await callInvalidate(() => api.invalidate(probe.key));
    ElMessage.success(`已删除 ${probe.key} 并广播失效`);
    await loadStats();
}

/**
 * 预热。
 */
async function warmUp() {
    const res = await callWarmUp(api.warmUp);
    if (res.ok) {
        ElMessage.success(`已预热 ${res.data} 条商品`);
        await loadStats();
    }
}

/**
 * 重置统计。
 */
async function reset() {
    await callReset(api.resetCacheStats);
    ElMessage.success('统计已清零');
    await loadStats();
}

const ratio = computed(() => stats.value?.hitRatioPercent ?? 0);

const gauge = computed(() => ({
    series: [
        {
            type: 'gauge',
            startAngle: 200,
            endAngle: -20,
            min: 0,
            max: 100,
            radius: '92%',
            progress: { show: true, width: 14, itemStyle: { color: '#3d6ff5' } },
            axisLine: { lineStyle: { width: 14, color: [[1, '#eef1f6']] } },
            axisTick: { show: false },
            splitLine: { show: false },
            axisLabel: { show: false },
            pointer: { show: false },
            detail: {
                valueAnimation: true,
                fontSize: 32,
                fontWeight: 700,
                offsetCenter: [0, '0%'],
                formatter: '{value}%',
                color: '#1f2733',
            },
            title: { offsetCenter: [0, '32%'], fontSize: 12, color: '#7a869a' },
            data: [{ value: ratio.value, name: '命中率' }],
        },
    ],
}));

const layerChart = computed(() => {
    const snapshot = stats.value;
    if (!snapshot) {
        return null;
    }
    const items = [
        { name: 'L1 命中', value: snapshot.l1Hit, color: '#3d6ff5' },
        { name: 'L2 命中', value: snapshot.l2Hit, color: '#0ea5a5' },
        { name: '回源', value: snapshot.miss, color: '#f2b94b' },
        { name: '布隆拦截', value: snapshot.penetrationBlocked, color: '#16a34a' },
        { name: '旧值兜底', value: snapshot.staleServed, color: '#a78bfa' },
        { name: '熔断拒绝', value: snapshot.circuitBlocked, color: '#dc4a4a' },
    ];
    return {
        tooltip: { trigger: 'axis' },
        grid: { left: 80, right: 20, top: 20, bottom: 30 },
        xAxis: { type: 'value' },
        yAxis: { type: 'category', data: items.map((item) => item.name) },
        series: [
            {
                type: 'bar',
                data: items.map((item) => ({ value: item.value, itemStyle: { color: item.color, borderRadius: [0, 6, 6, 0] } })),
                label: { show: true, position: 'right', fontSize: 11, color: '#7a869a' },
            },
        ],
    };
});

/**
 * 从对照结果里挑一个数字出来展示。
 *
 * @param data 实验返回体
 * @param keys 候选字段名
 */
function number(data: Record<string, unknown> | null, keys: string[]): string {
    if (!data) {
        return '-';
    }
    for (const key of keys) {
        if (data[key] !== undefined && data[key] !== null) {
            return String(data[key]);
        }
    }
    return '-';
}

const offMiss = computed(() => number(comparison.value.off, ['miss', 'missCount', 'rebuild', 'elapsedMillis']));
const onMiss = computed(() => number(comparison.value.on, ['miss', 'missCount', 'rebuild', 'elapsedMillis']));

onMounted(() => {
    void loadStats();
    void callLevels(api.cacheLevels);
});
</script>

<template>
    <div>
        <SectionHead
            title="缓存监控大屏"
            desc="命中率、各层贡献、穿透防护的效果都在这一屏。下面的对照实验会用同一批不存在的 id，分别在有/无布隆过滤器的情况下打过去。"
        >
            <template #actions>
                <el-button size="small" :icon="Sunny" @click="warmUp">预热</el-button>
                <el-button size="small" @click="reset">重置统计</el-button>
                <el-button size="small" type="primary" :icon="RefreshRight" @click="loadStats(); callLevels(api.cacheLevels)">
                    刷新
                </el-button>
            </template>
        </SectionHead>

        <div class="mc">
            <div class="mc__gauge">
                <EChart :option="gauge" :height="200" />
                <div class="mc__gauge-foot">
                    L1 {{ thousand(stats?.l1Hit ?? 0) }} · L2 {{ thousand(stats?.l2Hit ?? 0) }} · 回源
                    {{ thousand(stats?.miss ?? 0) }}
                </div>
            </div>
            <div class="mc__layers">
                <EChart v-if="layerChart" :option="layerChart" :height="200" />
                <el-skeleton v-else :loading="statLoading" animated />
            </div>
        </div>

        <div class="mc__counters">
            <div class="mc__counter">
                <div class="mc__counter-value">{{ thousand(stats?.l1Hit ?? 0) }}</div>
                <div class="mc__counter-label">L1 命中</div>
            </div>
            <div class="mc__counter">
                <div class="mc__counter-value">{{ thousand(stats?.l2Hit ?? 0) }}</div>
                <div class="mc__counter-label">L2 命中</div>
            </div>
            <div class="mc__counter mc__counter--warn">
                <div class="mc__counter-value">{{ thousand(stats?.miss ?? 0) }}</div>
                <div class="mc__counter-label">回源数据库</div>
            </div>
            <div class="mc__counter mc__counter--good">
                <div class="mc__counter-value">{{ thousand(stats?.penetrationBlocked ?? 0) }}</div>
                <div class="mc__counter-label">布隆拦截</div>
            </div>
            <div class="mc__counter mc__counter--bad">
                <div class="mc__counter-value">{{ thousand(stats?.degraded ?? 0) }}</div>
                <div class="mc__counter-label">降级次数</div>
            </div>
        </div>

        <div class="lab-card">
            <div class="lab-card__title">穿透对照实验</div>
            <div class="lab-card__desc">
                用 {{ penetration.count }} 个根本不存在的 id 打过去。没有布隆时每一次都会落到数据库；
                有布隆时绝大多数在入口就被拒绝。两边的数字差，就是布隆过滤器替数据库挡下的量。
            </div>
            <div class="lab-row">
                <el-input-number v-model="penetration.count" :min="1" :max="1000" size="small" controls-position="right" />
                <el-button type="danger" size="small" :loading="penetrateLoading" @click="runPenetration">跑对照</el-button>
            </div>
            <div class="mc__compare">
                <div class="mc__compare-card">
                    <div class="mc__compare-title">无布隆过滤器</div>
                    <div class="mc__compare-num mc__compare-num--bad">{{ offMiss }}</div>
                    <div class="mc__compare-hint">回源 / 重建次数</div>
                    <pre class="mc__compare-raw">{{ comparison.off ? JSON.stringify(comparison.off, null, 2) : '尚未执行' }}</pre>
                </div>
                <div class="mc__compare-card">
                    <div class="mc__compare-title">有布隆过滤器</div>
                    <div class="mc__compare-num mc__compare-num--good">{{ onMiss }}</div>
                    <div class="mc__compare-hint">回源 / 重建次数</div>
                    <pre class="mc__compare-raw">{{ comparison.on ? JSON.stringify(comparison.on, null, 2) : '尚未执行' }}</pre>
                </div>
            </div>
        </div>

        <div class="lab-card">
            <div class="lab-card__title">手动读写一个 key</div>
            <div class="lab-card__desc">
                写一次再读一次，两次 elapsed 的差值就是 L2 的往返成本；删掉之后会广播失效事件，其它节点的 L1 也会跟着失效。
            </div>
            <el-form size="small" inline label-width="60px">
                <el-form-item label="key">
                    <el-input v-model="probe.key" style="width: 220px" />
                </el-form-item>
                <el-form-item label="value">
                    <el-input v-model="probe.value" style="width: 240px" />
                </el-form-item>
                <el-form-item>
                    <el-button type="primary" size="small" @click="probeTwice">写入后再读</el-button>
                    <el-button size="small" :icon="Delete" @click="invalidate">删除并失效</el-button>
                </el-form-item>
            </el-form>
            <div v-if="probeResult" class="mc__probe">
                <el-tag size="small" effect="plain">最后一次耗时 {{ probeResult.elapsed }} ms</el-tag>
                <el-tag size="small" :type="probeResult.ok ? 'success' : 'danger'" effect="dark">
                    {{ probeResult.ok ? 'code 0' : `code ${probeResult.code}` }}
                </el-tag>
                <span class="lab-mono">{{ probeResult.data }}</span>
            </div>
        </div>

        <div class="lab-card">
            <div class="lab-card__title">层级明细</div>
            <pre class="mc__raw">{{ levelsResult?.ok ? JSON.stringify(levelsResult.data, null, 2) : '暂无' }}</pre>
        </div>
    </div>
</template>

<style scoped>
.mc {
    display: grid;
    grid-template-columns: 300px minmax(0, 1fr);
    gap: 14px;
    margin-bottom: 14px;
}

.mc__gauge,
.mc__layers {
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    padding: 12px 14px;
}

.mc__gauge-foot {
    text-align: center;
    font-size: 12px;
    color: var(--lab-muted);
}

.mc__counters {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
    margin-bottom: 14px;
}

.mc__counter {
    background: #fff;
    border: 1px solid var(--lab-border);
    border-left: 3px solid #3d6ff5;
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    padding: 12px 14px;
}

.mc__counter--warn {
    border-left-color: #f2b94b;
}

.mc__counter--good {
    border-left-color: #16a34a;
}

.mc__counter--bad {
    border-left-color: #dc4a4a;
}

.mc__counter-value {
    font-size: 24px;
    font-weight: 700;
}

.mc__counter-label {
    font-size: 12px;
    color: var(--lab-muted);
    margin-top: 2px;
}

.mc__compare {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 12px;
    margin-top: 12px;
}

.mc__compare-card {
    border: 1px solid var(--lab-border);
    border-radius: 10px;
    padding: 14px;
    background: #fbfcfe;
}

.mc__compare-title {
    font-size: 13px;
    font-weight: 600;
}

.mc__compare-num {
    font-size: 32px;
    font-weight: 700;
    margin: 6px 0 2px;
}

.mc__compare-num--bad {
    color: #dc4a4a;
}

.mc__compare-num--good {
    color: #16a34a;
}

.mc__compare-hint {
    font-size: 12px;
    color: var(--lab-muted);
}

.mc__compare-raw {
    margin: 10px 0 0;
    padding: 10px;
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: 8px;
    font-family: Menlo, Consolas, monospace;
    font-size: 11px;
    max-height: 160px;
    overflow: auto;
    color: #4e5969;
}

.mc__probe {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 10px;
    flex-wrap: wrap;
}

.mc__raw {
    margin: 0;
    padding: 10px 12px;
    background: #fbfcfe;
    border: 1px solid var(--lab-border);
    border-radius: 8px;
    font-family: Menlo, Consolas, monospace;
    font-size: 12px;
    max-height: 200px;
    overflow: auto;
}

@media (max-width: 900px) {
    .mc {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
