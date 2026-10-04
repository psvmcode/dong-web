<script setup lang="ts">
import { computed, reactive } from 'vue';
import { ElMessage } from 'element-plus';
import SectionHead from '@/components/SectionHead.vue';
import StatCard from '@/components/StatCard.vue';
import ResultView from '@/components/ResultView.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/classic';
import { currentMonth, today } from '@/utils/format';

/**
 * 签到与 UV。
 *
 * <p>两个实验都瞄准「空间换时间」：
 * 一个人一年的签到只占 365 bit，HyperLogLog 用固定 12KB 估出上亿规模的独立访客。
 * 代价是放弃了精确性——UV 返回的永远是估算值，
 * 页面因此把「误差」当作标签摆出来，而不是假装它精确。
 */

const sign = reactive({ userId: 'u-1001', date: today(), month: currentMonth() });
const uv = reactive({ page: '/home', visitorId: 'v-1', date: today(), from: '2026-09-01', to: today() });

const { result: signResult, call: callSign } = useApi<boolean>();
const { result: statusResult, call: callStatus } = useApi<boolean>();
const { result: streakResult, call: callStreak } = useApi<number>();
const { result: monthResult, call: callMonth } = useApi<number>();
const { result: calendarResult, call: callCalendar } = useApi<Record<string, boolean>>();

const { result: recordResult, call: callRecord } = useApi<number>();
const { result: countResult, call: callCount } = useApi<number>();
const { result: rangeResult, call: callRange } = useApi<number>();

const calendar = computed(() => (calendarResult.value?.ok && calendarResult.value.data ? calendarResult.value.data : {}));

/**
 * 签到。
 */
async function doSign() {
    const res = await callSign(() => api.signIn(sign.userId, sign.date));
    if (res.ok) {
        ElMessage[res.data ? 'success' : 'warning'](res.data ? '签到成功' : '今天已经签过了');
        await loadSignState();
    }
}

/**
 * 刷新签到相关状态。
 */
async function loadSignState() {
    await Promise.all([
        callStatus(() => api.signStatus(sign.userId, sign.date)),
        callStreak(() => api.signStreak(sign.userId, sign.date)),
        callMonth(() => api.signMonth(sign.userId, sign.month)),
        callCalendar(() => api.signCalendar(sign.userId, sign.month)),
    ]);
}

/**
 * 记录一次访问。
 */
async function doRecord() {
    await callRecord(() => api.recordUv(uv.page, uv.visitorId, uv.date));
    await doCount();
}

/**
 * 查询当日 UV。
 */
function doCount() {
    void callCount(() => api.countUv(uv.page, uv.date));
}

/**
 * 查询区间 UV。
 */
function doRange() {
    void callRange(() => api.rangeUv(uv.page, uv.from, uv.to));
}
</script>

<template>
    <div>
        <SectionHead
            title="签到与 UV"
            desc="bitmap 让一年的签到只占几十字节，HyperLogLog 用固定 12KB 估出独立访客数。两者的共同代价是不保留明细，所以页面只给结果不给证据。"
        />

        <el-tabs>
            <el-tab-pane label="bitmap 签到">
                <el-form size="small" inline label-width="72px">
                    <el-form-item label="用户">
                        <el-input v-model="sign.userId" style="width: 160px" />
                    </el-form-item>
                    <el-form-item label="日期">
                        <el-input v-model="sign.date" placeholder="yyyy-MM-dd" style="width: 150px" />
                    </el-form-item>
                    <el-form-item label="月份">
                        <el-input v-model="sign.month" placeholder="yyyy-MM" style="width: 130px" />
                    </el-form-item>
                    <el-form-item>
                        <el-button type="primary" size="small" @click="doSign">签到</el-button>
                        <el-button size="small" @click="loadSignState()">刷新状态</el-button>
                    </el-form-item>
                </el-form>

                <div class="lab-grid lab-grid--3">
                    <StatCard
                        label="当日是否签到"
                        :value="statusResult?.ok ? (statusResult.data ? '已签到' : '未签到') : '-'"
                        :tone="statusResult?.ok && statusResult.data ? 'good' : 'plain'"
                        hint="bitmap 的第 day 位"
                    />
                    <StatCard label="连续签到天数" :value="streakResult?.ok ? streakResult.data : '-'" tone="accent" />
                    <StatCard label="当月签到天数" :value="monthResult?.ok ? monthResult.data : '-'" tone="accent" />
                </div>

                <div class="lab-card">
                    <div class="lab-card__title">当月签到日历</div>
                    <div class="lab-card__desc">每个格子是该月的一天，绿色为已签到。位图的下标从 0 开始，所以第 1 天对应第 0 位。</div>
                    <div v-if="Object.keys(calendar).length > 0" class="sign-grid">
                        <el-tooltip
                            v-for="(signed, day) in calendar"
                            :key="day"
                            :content="`${sign.month}-${String(day).padStart(2, '0')} · ${signed ? '已签到' : '未签到'}`"
                            placement="top"
                        >
                            <div class="sign-cell" :class="{ 'sign-cell--on': signed }">{{ day }}</div>
                        </el-tooltip>
                    </div>
                    <div v-else class="lab-hint">点「刷新状态」加载日历</div>
                </div>

                <ResultView :result="signResult" title="签到返回结果" :max-height="140" />
            </el-tab-pane>

            <el-tab-pane label="HyperLogLog UV">
                <el-form size="small" inline label-width="72px">
                    <el-form-item label="页面">
                        <el-input v-model="uv.page" style="width: 150px" />
                    </el-form-item>
                    <el-form-item label="访客标识">
                        <el-input v-model="uv.visitorId" style="width: 150px" />
                    </el-form-item>
                    <el-form-item label="日期">
                        <el-input v-model="uv.date" placeholder="yyyy-MM-dd" style="width: 150px" />
                    </el-form-item>
                    <el-form-item>
                        <el-button type="primary" size="small" @click="doRecord">记录一次访问</el-button>
                        <el-button size="small" @click="doCount">查当日 UV</el-button>
                    </el-form-item>
                </el-form>

                <div class="lab-row" style="margin-bottom: 12px">
                    <el-input v-model="uv.from" placeholder="起始 yyyy-MM-dd" style="width: 160px" />
                    <el-input v-model="uv.to" placeholder="结束 yyyy-MM-dd" style="width: 160px" />
                    <el-button size="small" @click="doRange">查区间 UV（自动去重）</el-button>
                </div>

                <div class="lab-grid lab-grid--3">
                    <StatCard label="本次记录后的估算 UV" :value="recordResult?.ok ? recordResult.data : '-'" tone="accent" hint="约 0.81% 标准误差" />
                    <StatCard label="当日 UV" :value="countResult?.ok ? countResult.data : '-'" tone="good" />
                    <StatCard label="区间 UV" :value="rangeResult?.ok ? rangeResult.data : '-'" tone="good" hint="多日合并会自动去重" />
                </div>

                <el-alert
                    type="info"
                    :closable="false"
                    show-icon
                    title="为什么是估算值"
                    description="同一个访客反复访问只会被算一次，但 HyperLogLog 不保存明细，所以给不出「谁」来过，只能给出数量。这是它换空间的方式。"
                />
            </el-tab-pane>
        </el-tabs>
    </div>
</template>

<style scoped>
.sign-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
    gap: 8px;
}

.sign-cell {
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    background: #f4f6fa;
    color: #7a869a;
    font-size: 13px;
    border: 1px solid transparent;
}

.sign-cell--on {
    background: #e6f7ee;
    color: #16a34a;
    border-color: #b6e6c9;
    font-weight: 600;
}
</style>
