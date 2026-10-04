<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Delete, RefreshRight, Sunny } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import StatCard from '@/components/StatCard.vue';
import ResultView from '@/components/ResultView.vue';
import EChart from '@/components/EChart.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/cache';
import type { ApiResult } from '@/api/http';
import type { CacheStatsSnapshot } from '@/api/types';
import { thousand } from '@/utils/format';

/**
 * 缓存观测与穿透实验。
 *
 * <p>这一页回答四个问题：
 * <ul>
 *   <li>命中率现在是多少，各层分别贡献多少——看 stats</li>
 *   <li>转角足够多的并发穿透会怎样——看 penetration 的有无布隆对照</li>
 *   <li>一个 key 能不能手动读写并广播失效——看 probe</li>
 *   <li>回到干净状态——warm-up 与 stats/reset</li>
 * </ul>
 */

const { loading: statLoading, call: callStats } = useApi<CacheStatsSnapshot>();
const { result: levelsResult, call: callLevels } = useApi<Record<string, unknown>>();
const { result: penetrationResult, loading: penetrationLoading, call: callPenetration } = useApi<Record<string, unknown>>();
const { result: probeResult, call: callProbe } = useApi<string>();
const { call: callInvalidate } = useApi<null>();
const { call: callWarmUp } = useApi<number>();
const { call: callReset } = useApi<unknown>();

const stats = ref<CacheStatsSnapshot | null>(null);
const penetration = reactive({ count: 200, guarded: true });
const probe = reactive({ key: 'lab:demo', value: 'hello-dong' });
const guardComparison = ref<{ off: Record<string, unknown> | null; on: Record<string, unknown> | null }>({
    off: null,
    on: null,
});

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
 * 并行做一次「无布隆」与「有布隆」的穿透，结果并排放，才是对照实验。
 */
async function runPenetration() {
    guardComparison.value = { off: null, on: null };
    const off = await callPenetration(() => api.penetration({ count: penetration.count, guarded: false }));
    guardComparison.value.off = off.ok ? off.data : null;
    const on = await callPenetration(() => api.penetration({ count: penetration.count, guarded: true }));
    guardComparison.value.on = on.ok ? on.data : null;
    ElMessage.success('对照实验完成，看下方两张结果卡');
}

/**
 * 写入再读取同一个 key。probe 接口本身兼写兼读，这里按顺序调用两次。
 */
async function probeTwice() {
    await callProbe(() => api.probe({ key: probe.key, value: probe.value }));
    await callProbe(() => api.probe({ key: probe.key, value: probe.value }));
}

/**
 * 手动失效一个 key。
 */
async function invalidate() {
    await callInvalidate(() => api.invalidate(probe.key));
    ElMessage.success(`已删除 ${probe.key} 并广播失效事件`);
    await loadStats();
}

/**
 * 把一次实验的裸数据包装成 ApiResult，好复用 ResultView 展示。
 *
 * @param data 实验返回体
 */
function wrap(data: Record<string, unknown> | null): ApiResult<unknown> | null {
    return data ? { ok: true, code: 0, message: '对照结果', data, elapsed: 0 } : null;
}

const offResult = computed(() => wrap(guardComparison.value.off));
const onResult = computed(() => wrap(guardComparison.value.on));

const ratioChart = computed(() => {
    const snapshot = stats.value;
    if (!snapshot) {
        return null;
    }
    return {
        tooltip: { trigger: 'axis' },
        grid: { left: 60, right: 20, top: 30, bottom: 30 },
        xAxis: { type: 'category', data: ['L1 命中', 'L2 命中', '回源', '布隆拦截', '旧值兜底', '降级'] },
        yAxis: { type: 'value' },
        series: [
            {
                type: 'bar',
                barWidth: '42%',
                itemStyle: { borderRadius: [6, 6, 0, 0] },
                data: [
                    snapshot.l1Hit,
                    snapshot.l2Hit,
                    snapshot.miss,
                    snapshot.penetrationBlocked,
                    snapshot.staleServed,
                    snapshot.degraded,
                ].map((value, index) => ({
                    value,
                    itemStyle: {
                        color: ['#3d6ff5', '#6f8cf7', '#f2b94b', '#16a34a', '#a78bfa', '#dc4a4a'][index],
                        borderRadius: [6, 6, 0, 0],
                    },
                })),
            },
        ],
    };
});

onMounted(() => {
    void loadStats();
    void callLevels(api.cacheLevels);
});
</script>

<template>
    <div>
        <SectionHead
            title="命中率与穿透实验"
            desc="缓存的价值在于可被观测：这一页把每一层各拦下多少请求摊开看，再让布隆过滤器与不设防的对照组同台跑一遍。"
        >
            <template #actions>
                <el-button size="small" :icon="Sunny" @click="callWarmUp(api.warmUp).then(() => loadStats())">预热</el-button>
                <el-button size="small" @click="callReset(api.resetCacheStats).then(() => loadStats())">重置统计</el-button>
                <el-button size="small" type="primary" :icon="RefreshRight" @click="loadStats()">刷新统计</el-button>
            </template>
        </SectionHead>

        <el-alert
            type="info"
            show-icon
            :closable="false"
            title="怎么看这一页"
            description="先把统计清零，再对同一个 id 连读几次，L1 命中数会涨；接着跑一次穿透对照，看布隆过滤器到底拦下了多少次回源。"
            style="margin-bottom: 16px"
        />

        <div v-loading="statLoading" class="lab-grid lab-grid--4">
            <StatCard label="L1 命中" :value="thousand(stats?.l1Hit ?? 0)" tone="accent" hint="进程内 Caffeine" />
            <StatCard label="L2 命中" :value="thousand(stats?.l2Hit ?? 0)" tone="accent" hint="Redis" />
            <StatCard label="回源次数" :value="thousand(stats?.miss ?? 0)" :tone="(stats?.miss ?? 0) > 0 ? 'warn' : 'good'" hint="真正打到数据库的次数" />
            <StatCard
                label="命中率"
                :value="`${stats?.hitRatioPercent ?? 0}%`"
                :tone="(stats?.hitRatioPercent ?? 0) >= 60 ? 'good' : 'warn'"
                hint="(L1 + L2) / 总读"
            />
        </div>

        <div class="lab-grid lab-grid--4">
            <StatCard label="布隆拦截" :value="thousand(stats?.penetrationBlocked ?? 0)" tone="good" hint="不存在的 id 被提前拒绝" />
            <StatCard label="旧值兜底" :value="thousand(stats?.staleServed ?? 0)" tone="warn" hint="回源失败后用过期值顶上" />
            <StatCard label="熔断拒绝" :value="thousand(stats?.circuitBlocked ?? 0)" tone="warn" hint="回源熔断窗口内的快速失败" />
            <StatCard label="降级次数" :value="thousand(stats?.degraded ?? 0)" tone="bad" hint="连旧值都没有，只能报错" />
        </div>

        <div class="lab-grid lab-grid--2">
            <div class="lab-card">
                <div class="lab-card__title">各层贡献分布</div>
                <div class="lab-card__desc">柱子高度直接说明「哪一层替数据库挡了流量」。</div>
                <EChart v-if="ratioChart" :option="ratioChart" :height="260" />
                <div v-else class="lab-hint">暂无统计数据</div>
            </div>

            <div class="lab-card">
                <div class="lab-card__title">层级明细</div>
                <div class="lab-card__desc">L1 / L2 的容量与命中明细，用于判断 L1 是否配得过大或过小。</div>
                <ResultView :result="levelsResult" empty-text="暂无层级数据" :max-height="260" />
            </div>
        </div>

        <div class="lab-card">
            <div class="lab-card__title">缓存穿透对照实验</div>
            <div class="lab-card__desc">
                一次性打 count 个不存在的 id 过去。无布隆时每个 id 都会落到数据库；有布隆时绝大多数一进就被拒。
            </div>
            <div class="lab-row">
                <el-input-number v-model="penetration.count" :min="1" :max="1000" size="small" controls-position="right" />
                <el-button type="primary" :loading="penetrationLoading" @click="runPenetration">跑对照实验</el-button>
            </div>
            <div class="lab-grid lab-grid--2" style="margin-top: 12px">
                <div>
                    <div class="lab-hint" style="margin-bottom: 6px">无布隆过滤器（对照组）</div>
                    <ResultView :result="offResult" :max-height="240" empty-text="尚未执行" />
                </div>
                <div>
                    <div class="lab-hint" style="margin-bottom: 6px">有布隆过滤器（实验组）</div>
                    <ResultView :result="onResult" :max-height="240" empty-text="尚未执行" />
                </div>
            </div>
            <ResultView :result="penetrationResult" title="最后一次原始返回" :max-height="200" style="margin-top: 12px" />
        </div>

        <div class="lab-card">
            <div class="lab-card__title">手动读写一个 key</div>
            <div class="lab-card__desc">
                probe 走的是完整链路：写一次再读一次，两次 elapsed 的差值就是 L2 的往返成本；删掉之后会广播失效事件，其它节点的 L1 也会跟着失效。
            </div>
            <el-form label-width="72px" size="small" inline>
                <el-form-item label="key">
                    <el-input v-model="probe.key" style="width: 200px" />
                </el-form-item>
                <el-form-item label="value">
                    <el-input v-model="probe.value" style="width: 240px" />
                </el-form-item>
                <el-form-item>
                    <el-button type="primary" @click="probeTwice">写入后再读</el-button>
                    <el-button :icon="Delete" @click="invalidate">删除并失效</el-button>
                </el-form-item>
            </el-form>
            <ResultView :result="probeResult" empty-text="尚未 probe" :max-height="200" />
        </div>
    </div>
</template>
