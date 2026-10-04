<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Delete, RefreshRight } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import StatCard from '@/components/StatCard.vue';
import ResultView from '@/components/ResultView.vue';
import EChart from '@/components/EChart.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/crossborder';

/**
 * 风控。
 *
 * <p>这里的每个数字都在回答同一个问题：这笔钱能不能放出去。
 * 路由试算给出渠道推荐，AML 画像给出当日累计，拆分嫌疑给出「同一个人拆成多笔」的证据。
 */

const routeForm = reactive({ amount: 10000, urgent: false });
const payerId = ref(1);

const { result: routeResult, call: callRoute } = useApi<Record<string, unknown>>();
const { result: profileResult, call: callProfile } = useApi<Record<string, unknown>>();
const { result: flaggedResult, call: callFlagged } = useApi<Record<string, unknown>[]>();
const { result: exposureResult, call: callExposure } = useApi<Record<string, unknown>>();
const { result: opResult, call: callOp } = useApi<unknown>();

const flagged = computed<Record<string, unknown>[]>(() =>
    flaggedResult.value?.ok && flaggedResult.value.data ? flaggedResult.value.data : [],
);

/**
 * 把 Map 结构摊平，方便用 descriptions 展示。
 *
 * @param data map 型返回值
 */
function entries(data: Record<string, unknown> | null | undefined): [string, unknown][] {
    return data ? Object.entries(data) : [];
}

const routeEntries = computed(() => entries(routeResult.value?.ok ? routeResult.value.data : null));
const profileEntries = computed(() => entries(profileResult.value?.ok ? profileResult.value.data : null));
const exposureEntries = computed(() => entries(exposureResult.value?.ok ? exposureResult.value.data : null));

/**
 * 从路由返回里挑出评分部分画成柱状图。
 */
const routeChart = computed(() => {
    const data = routeResult.value?.ok ? routeResult.value.data : null;
    if (!data) {
        return null;
    }
    const scores: Record<string, number> = {};
    for (const [key, value] of Object.entries(data)) {
        if (key.startsWith('score:') || key.endsWith('Score')) {
            scores[key] = Number(value);
        }
    }
    if (Object.keys(scores).length === 0) {
        return null;
    }
    return {
        tooltip: { trigger: 'axis' },
        grid: { left: 90, right: 20, top: 24, bottom: 40 },
        xAxis: { type: 'category', data: Object.keys(scores) },
        yAxis: { type: 'value' },
        series: [
            {
                type: 'bar',
                data: Object.values(scores),
                itemStyle: { color: '#3d6ff5', borderRadius: [6, 6, 0, 0] },
            },
        ],
    };
});

/**
 * 刷新全部风控视图。
 */
function refresh() {
    void callFlagged(api.amlFlagged);
    void callExposure(api.fxExposure);
    if (payerId.value) {
        void callProfile(() => api.amlProfile(payerId.value));
    }
}

/**
 * 重置日限额占用。
 */
async function resetDaily() {
    const res = await callOp(() => api.resetDaily(payerId.value));
    if (res.ok) {
        ElMessage.success('日限额占用已重置');
        refresh();
    }
}

/**
 * 清空 AML 监控数据。
 */
async function clearAml() {
    await ElMessageBox.confirm('清空后当日的累计与嫌疑记录都会消失，确认继续？', '清空 AML 数据', { type: 'warning' });
    const res = await callOp(() => api.clearAml());
    if (res.ok) {
        ElMessage.success('AML 数据已清空');
        refresh();
    }
}

onMounted(refresh);
</script>

<template>
    <div>
        <SectionHead
            title="风控"
            desc="每一笔跨境汇款都要回答「能不能放出去」。这里把路由评分、AML 画像、拆分嫌疑与汇率敞口放在同一屏，方便交叉核对。"
        >
            <template #actions>
                <el-button size="small" :icon="RefreshRight" @click="refresh()">刷新</el-button>
                <el-button size="small" :icon="Delete" type="danger" @click="clearAml">清空 AML</el-button>
            </template>
        </SectionHead>

        <div class="lab-grid lab-grid--3">
            <StatCard label="拆分嫌疑账户数" :value="flagged.length" :tone="flagged.length > 0 ? 'warn' : 'good'" hint="命中结构化的规避行为" />
            <StatCard label="付款人 id" :value="payerId" hint=" AML 画像的查询对象" />
            <StatCard
                label="路由推荐渠道"
                :value="String((routeResult?.ok && routeResult.data?.recommended) ?? '-')"
                tone="accent"
                hint="评分最高的渠道"
            />
        </div>

        <div class="lab-grid lab-grid--2">
            <div class="lab-card">
                <div class="lab-card__title">渠道路由试算</div>
                <div class="lab-card__desc">金额与是否加急共同决定评分：不同渠道的时效、限额与费率差别很大，换一个组合就会换推荐。</div>
                <el-form size="small" inline label-width="80px">
                    <el-form-item label="金额">
                        <el-input-number v-model="routeForm.amount" :min="1" :precision="2" controls-position="right" />
                    </el-form-item>
                    <el-form-item label="加急">
                        <el-switch v-model="routeForm.urgent" />
                    </el-form-item>
                    <el-form-item>
                        <el-button type="primary" size="small" @click="callRoute(() => api.route(routeForm.amount, routeForm.urgent))">
                            试算
                        </el-button>
                    </el-form-item>
                </el-form>
                <el-descriptions v-if="routeEntries.length > 0" :column="1" border size="small" style="margin-top: 12px">
                    <el-descriptions-item v-for="[key, value] in routeEntries" :key="key" :label="String(key)">
                        {{ typeof value === 'object' ? JSON.stringify(value) : value }}
                    </el-descriptions-item>
                </el-descriptions>
                <div v-else class="lab-hint">点「试算」看各渠道评分</div>
            </div>

            <div>
                <div class="lab-card">
                    <div class="lab-card__title">评分柱状图</div>
                    <div class="lab-card__desc">评分字段会被自动挑出来画成图，其余字段在左侧 descriptions 里原样展示。</div>
                    <EChart v-if="routeChart" :option="routeChart" :height="220" />
                    <div v-else class="lab-hint">没有可绘制的评分子段</div>
                </div>
                <ResultView :result="routeResult" title="路由原始返回" :max-height="180" />
            </div>
        </div>

        <div class="lab-card">
            <div class="lab-card__title">AML 交易画像</div>
            <div class="lab-card__desc">
                当日累计金额与笔数是限额判断的依据。拆分成多笔小额试图绕过阈值，会被算作成拆分交易嫌疑。
            </div>
            <div class="lab-row">
                <el-input-number v-model="payerId" :min="1" size="small" controls-position="right" />
                <el-button size="small" type="primary" @click="callProfile(() => api.amlProfile(payerId))">查画像</el-button>
                <el-button size="small" @click="resetDaily">重置日限额占用</el-button>
            </div>
            <el-descriptions v-if="profileEntries.length > 0" :column="2" border size="small" style="margin-top: 12px">
                <el-descriptions-item v-for="[key, value] in profileEntries" :key="key" :label="String(key)">
                    {{ value }}
                </el-descriptions-item>
            </el-descriptions>
            <div v-else class="lab-hint">查不到画像，确认这个账户今天有交易</div>
        </div>

        <div class="lab-grid lab-grid--2">
            <div class="lab-card">
                <div class="lab-card__title">拆分交易嫌疑</div>
                <div class="lab-card__desc">命中「短时间多笔接近阈值金额」的账户，命中后需要人工介入。</div>
                <el-table :data="flagged" border stripe size="small" max-height="260">
                    <el-table-column label="字段" min-width="180">
                        <template #default="{ row }">
                            <div v-for="[key] in Object.entries(row)" :key="String(key)" class="lab-hint">{{ key }}</div>
                        </template>
                    </el-table-column>
                    <el-table-column label="取值" min-width="220">
                        <template #default="{ row }">
                            <div v-for="[key, value] in Object.entries(row)" :key="String(key)">{{ value }}</div>
                        </template>
                    </el-table-column>
                </el-table>
                <div v-if="flagged.length === 0" class="lab-hint">暂无嫌疑账户</div>
            </div>

            <div class="lab-card">
                <div class="lab-card__title">汇率敞口</div>
                <div class="lab-card__desc">已锁汇未清算的部分会随汇率浮动产生盈亏。</div>
                <el-descriptions v-if="exposureEntries.length > 0" :column="1" border size="small">
                    <el-descriptions-item v-for="[key, value] in exposureEntries" :key="key" :label="String(key)">
                        {{ value }}
                    </el-descriptions-item>
                </el-descriptions>
                <div v-else class="lab-hint">暂无敞口数据</div>
                <ResultView :result="opResult" title="操作返回" :max-height="140" style="margin-top: 10px" />
            </div>
        </div>
    </div>
</template>
