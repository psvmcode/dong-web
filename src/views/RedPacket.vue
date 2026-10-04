<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { RefreshRight } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import StatCard from '@/components/StatCard.vue';
import ResultView from '@/components/ResultView.vue';
import EChart from '@/components/EChart.vue';
import { runBurst, useApi } from '@/composables/useApi';
import * as api from '@/api/redpacket';
import type { ApiResult } from '@/api/http';
import type { GrabResultResponse, RedPacketRecord, RedPacketResponse } from '@/api/types';

/**
 * 抢红包实验。
 *
 * <p>份额表是权威源，Redis 队列只是副本，所以这一页特意留了「重建副本」按钮：
 * 手动删掉 Redis 队列之后再来抢，能亲眼看到以库为准的恢复过程。
 * 金额单位一律是分，接口层不做换算，避免浮点。
 */

const send = reactive({ sponsorId: 1, totalAmount: 10000, totalCount: 10, packetType: 1 });
const packetNo = ref('');
const grabForm = reactive({ userId: 1 });
const burstForm = reactive({ threads: 20, baseUserId: 1000 });

const { result: sendResult, call: callSend } = useApi<string>();
const { result: detailResult, call: callDetail } = useApi<RedPacketResponse>();
const { result: remainResult, call: callRemain } = useApi<Record<string, unknown>>();
const { result: recordsResult, call: callRecords } = useApi<RedPacketRecord[]>();
const { result: rebuildResult, call: callRebuild } = useApi<boolean>();
const { result: runtimeResult, call: callRuntime } = useApi<Record<string, unknown>>();
const { result: grabResult, call: callGrab } = useApi<GrabResultResponse>();

const burstResult = ref<Awaited<ReturnType<typeof runBurst>> | null>(null);
const burstLoading = ref(false);
const grabbedAmounts = ref<number[]>([]);

/**
 * 发红包，成功后把返回的红包号填到操作区。
 */
async function doSend() {
    const res = await callSend(() => api.send({ ...send }));
    if (res.ok && res.data) {
        packetNo.value = res.data;
        ElMessage.success(`红包已发出：${res.data}`);
        await refreshAll();
    }
}

/**
 * 单人抢一次。
 */
async function doGrab() {
    if (!packetNo.value) {
        ElMessage.warning('先填一个红包号');
        return;
    }
    await callGrab(() => api.grab(packetNo.value, grabForm.userId));
    await refreshAll();
}

/**
 * 并发抢。每个请求一个 userId，抢完之后看成功数是否恰好等于份额数。
 */
async function runBurstTest() {
    if (!packetNo.value) {
        ElMessage.warning('先填一个红包号');
        return;
    }
    burstLoading.value = true;
    grabbedAmounts.value = [];
    try {
        const results: ApiResult<GrabResultResponse>[] = [];
        const summary = await runBurst<GrabResultResponse>(burstForm.threads, async (index) => {
            const res = await api.grab(packetNo.value, burstForm.baseUserId + index);
            results.push(res);
            if (res.ok && res.data?.grabbed) {
                grabbedAmounts.value.push(res.data.amount);
            }
            return res;
        });
        burstResult.value = summary;
        await refreshAll();
    } finally {
        burstLoading.value = false;
    }
}

/**
 * 重建 Redis 副本。
 */
async function rebuild() {
    const res = await callRebuild(() => api.rebuild(packetNo.value));
    if (res.ok) {
        ElMessage.success('已按份额表重建副本');
        await refreshAll();
    }
}

/**
 * 一次性刷新详情、剩余与领取记录。
 */
async function refreshAll() {
    if (!packetNo.value) {
        return;
    }
    await Promise.all([
        callDetail(() => api.detail(packetNo.value)),
        callRemain(() => api.remain(packetNo.value)),
        callRecords(() => api.records(packetNo.value)),
        callRuntime(api.runtime),
    ]);
}

const records = computed<RedPacketRecord[]>(() => (recordsResult.value?.ok && recordsResult.value.data ? recordsResult.value.data : []));
const detail = computed(() => (detailResult.value?.ok ? detailResult.value.data : null));

const amountChart = computed(() => {
    const unique = [...new Set(grabbedAmounts.value)].sort((a, b) => a - b);
    const counts = unique.map((amount) => grabbedAmounts.value.filter((item) => item === amount).length);
    if (unique.length === 0) {
        return null;
    }
    return {
        tooltip: { trigger: 'axis' },
        grid: { left: 60, right: 20, top: 24, bottom: 40 },
        xAxis: { type: 'category', data: unique.map((amount) => `${amount} 分`) },
        yAxis: { type: 'value', minInterval: 1 },
        series: [
            {
                type: 'bar',
                data: counts,
                itemStyle: { color: '#f2b94b', borderRadius: [6, 6, 0, 0] },
            },
        ],
    };
});
</script>

<template>
    <div>
        <SectionHead
            title="抢红包"
            desc="金额预先切好写进 Redis 队列，抢的时候由 Lua 原子弹出一份。份额总量固定，所以成功人次永远等于份数，多一点就说明有重复发放。"
        />

        <div class="lab-grid lab-grid--2">
            <div class="lab-card">
                <div class="lab-card__title">发红包</div>
                <div class="lab-card__desc">金额单位是分。固定红包每人一样，随机红包按总金额在多个份额间切分。</div>
                <el-form size="small" label-width="86px">
                    <div class="lab-grid lab-grid--2">
                        <el-form-item label="发起人 id">
                            <el-input-number v-model="send.sponsorId" :min="1" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="总金额(分)">
                            <el-input-number v-model="send.totalAmount" :min="1" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="份数">
                            <el-input-number v-model="send.totalCount" :min="1" :max="1000" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="类型">
                            <el-select v-model="send.packetType">
                                <el-option label="固定金额" :value="1" />
                                <el-option label="随机金额" :value="2" />
                            </el-select>
                        </el-form-item>
                    </div>
                    <el-button type="primary" size="small" @click="doSend">发红包</el-button>
                </el-form>
                <ResultView :result="sendResult" title="红包号" :max-height="140" style="margin-top: 10px" />
            </div>

            <div class="lab-card">
                <div class="lab-card__title">操作区</div>
                <div class="lab-card__desc">下面所有动作都针对同一个红包号，方便一轮实验连着做。</div>
                <el-form size="small" label-width="86px">
                    <el-form-item label="红包号">
                        <el-input v-model="packetNo" placeholder="发完红包会自动填入" />
                    </el-form-item>
                    <el-form-item label="抢的人 id">
                        <el-input-number v-model="grabForm.userId" :min="1" controls-position="right" />
                    </el-form-item>
                </el-form>
                <div class="lab-row">
                    <el-button size="small" :icon="RefreshRight" @click="refreshAll()">刷新状态</el-button>
                    <el-button size="small" @click="doGrab()">单人抢一次</el-button>
                    <el-button size="small" type="warning" @click="rebuild()">重建副本</el-button>
                    <el-button size="small" @click="callRuntime(api.runtime)">运行时</el-button>
                </div>
                <ResultView :result="remainResult" title="剩余" :max-height="160" style="margin-top: 10px" />
            </div>
        </div>

        <div class="lab-card">
            <div class="lab-card__title">并发抢</div>
            <div class="lab-card__desc">
                一次性放 threads 个不同 userId 过去抢同一个红包。成功人次应当恰好等于剩余份数，之后再抢应当全部返回「已抢完」。
            </div>
            <el-form size="small" inline label-width="80px">
                <el-form-item label="并发数">
                    <el-input-number v-model="burstForm.threads" :min="1" :max="100" controls-position="right" />
                </el-form-item>
                <el-form-item label="起始 uid">
                    <el-input-number v-model="burstForm.baseUserId" :min="1" controls-position="right" />
                </el-form-item>
                <el-form-item>
                    <el-button type="danger" :loading="burstLoading" @click="runBurstTest">开始抢</el-button>
                </el-form-item>
            </el-form>

            <div v-if="burstResult" class="lab-grid lab-grid--4">
                <StatCard label="成功人次" :value="burstResult.success" tone="good" hint="拿到份额的人数" />
                <StatCard label="失败人次" :value="burstResult.failed" :tone="burstResult.failed > 0 ? 'warn' : 'plain'" hint="含重复抢与已抢完" />
                <StatCard label="发放总额" :value="`${grabbedAmounts.reduce((sum, item) => sum + item, 0)} 分`" tone="accent" />
                <StatCard label="整轮耗时" :value="`${burstResult.elapsedMs} ms`" />
            </div>
            <div v-if="burstResult" class="lab-row" style="margin-bottom: 10px">
                <el-tag v-for="(count, key) in burstResult.messages" :key="key" size="small" effect="plain" type="danger">
                    {{ key }} × {{ count }}
                </el-tag>
            </div>
            <EChart v-if="amountChart" :option="amountChart" :height="240" />
            <ResultView :result="grabResult" title="最后一次单人抢的结果" :max-height="200" style="margin-top: 10px" />
        </div>

        <div class="lab-grid lab-grid--2">
            <div class="lab-card">
                <div class="lab-card__title">红包详情</div>
                <ResultView :result="detailResult" empty-text="填红包号后点「刷新状态」" :max-height="280" />
            </div>
            <div class="lab-card">
                <div class="lab-card__title">领取记录</div>
                <el-table :data="records" border stripe size="small" max-height="280" empty-text="还没有人领到">
                    <el-table-column prop="userId" label="领取人" width="100" />
                    <el-table-column label="金额(分)" width="110">
                        <template #default="{ row }">{{ row.amount }}</template>
                    </el-table-column>
                    <el-table-column prop="createTime" label="时间" min-width="160" />
                </el-table>
                <div v-if="detail" class="lab-row" style="margin-top: 10px">
                    <el-tag size="small" effect="plain">类型 {{ detail.packetType }}</el-tag>
                    <el-tag size="small" effect="plain">状态 {{ detail.status }}</el-tag>
                    <el-tag size="small" effect="plain">剩余 {{ detail.remainCount }} / {{ detail.totalCount }}</el-tag>
                    <el-tag size="small" effect="plain">剩余金额 {{ detail.remainAmount }} 分</el-tag>
                </div>
            </div>
        </div>

        <div class="lab-card">
            <div class="lab-card__title">运行时状态</div>
            <div class="lab-card__desc">本地标记、限流窗口、副本健康度等进程内状态。</div>
            <ResultView :result="runtimeResult" title="运行时" :max-height="220" />
            <ResultView :result="rebuildResult" title="重建副本结果" :max-height="140" style="margin-top: 10px" />
        </div>
    </div>
</template>
