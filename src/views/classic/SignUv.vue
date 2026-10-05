<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Calendar } from '@element-plus/icons-vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/classic';
import { currentMonth, today } from '@/utils/format';

/**
 * 签到日历与独立访客。
 *
 * <p>两个实验都在讲同一件事：用概率和位运算换空间。
 * 签到用 bitmap，一个人一年只占 365 bit；UV 用 HyperLogLog，固定 12KB 就能估出上亿规模。
 * 页面把「估算值 vs 真实值」的误差直接算出来，这比说一句「有误差」诚实得多。
 */

const userId = ref('u-1001');
const month = ref(currentMonth());
const signedToday = ref(false);
const streak = ref(0);
const monthCount = ref(0);
const calendar = reactive<Record<string, boolean>>({});
const picking = ref('');

const uv = reactive({ page: '/home', visitors: 100, running: false, real: 0, estimated: 0, progress: 0 });

const { result: signResult, call: callSign } = useApi<boolean>();
const { result: statusResult, call: callStatus } = useApi<boolean>();
const { result: streakResult, call: callStreak } = useApi<number>();
const { result: monthResult, call: callMonth } = useApi<number>();
const { result: calendarResult, call: callCalendar } = useApi<Record<string, boolean>>();
const { result: countResult, call: callCount } = useApi<number>();

/**
 * 当月的天数。
 */
const daysInMonth = computed(() => {
    const [year, monthValue] = month.value.split('-').map(Number);
    return new Date(year, monthValue, 0).getDate();
});

/**
 * 当月第一天是星期几，用于日历排版。
 */
const firstWeekday = computed(() => {
    const [year, monthValue] = month.value.split('-').map(Number);
    return new Date(year, monthValue - 1, 1).getDay();
});

/**
 * 日历格子，前面补空位对齐星期。
 */
const cells = computed(() => {
    const padding = Array.from({ length: (firstWeekday.value + 6) % 7 }, () => 0);
    const days = Array.from({ length: daysInMonth.value }, (_, index) => index + 1);
    return [...padding, ...days];
});

/**
 * 加载签到相关状态。
 */
async function loadSign() {
    const date = today();
    await Promise.all([
        callStatus(() => api.signStatus(userId.value, date)),
        callStreak(() => api.signStreak(userId.value, date)),
        callMonth(() => api.signMonth(userId.value, month.value)),
        callCalendar(() => api.signCalendar(userId.value, month.value)),
    ]);
    signedToday.value = statusResult.value?.ok ? Boolean(statusResult.value.data) : false;
    streak.value = streakResult.value?.ok ? streakResult.value.data : 0;
    monthCount.value = monthResult.value?.ok ? monthResult.value.data : 0;
    Object.keys(calendar).forEach((key) => delete calendar[key]);
    if (calendarResult.value?.ok && calendarResult.value.data) {
        Object.assign(calendar, calendarResult.value.data);
    }
}

/**
 * 今天签到。
 */
async function signToday() {
    const res = await callSign(() => api.signIn(userId.value, today()));
    if (res.ok) {
        ElMessage[res.data ? 'success' : 'warning'](res.data ? '签到成功' : '今天已经签过了');
        await loadSign();
    }
}

/**
 * 补签指定的某一天。
 *
 * @param day 日期
 */
async function signDay(day: number) {
    const date = `${month.value}-${String(day).padStart(2, '0')}`;
    const res = await callSign(() => api.signIn(userId.value, date));
    if (res.ok) {
        ElMessage[res.data ? 'success' : 'warning'](res.data ? `${date} 签到成功` : `${date} 已经签过了`);
        await loadSign();
    }
}

/**
 * 模拟一批独立访客访问同一个页面，然后对比 HLL 估算值与真实人数。
 */
async function runUv() {
    uv.running = true;
    uv.progress = 0;
    const real = uv.visitors;
    try {
        for (let index = 1; index <= real; index += 1) {
            await api.recordUv(uv.page, `visitor-${index}`, today());
            uv.progress = Math.round((index / real) * 100);
        }
        const res = await callCount(() => api.countUv(uv.page, today()));
        uv.real = real;
        uv.estimated = res.ok ? res.data : 0;
        ElMessage.success('统计完成，看看估算值和真实人数差多少');
    } finally {
        uv.running = false;
    }
}

/**
 * 估算与实际之间的误差百分比。
 */
const errorPercent = computed(() => {
    if (uv.real === 0) {
        return 0;
    }
    return Number((((uv.estimated - uv.real) / uv.real) * 100).toFixed(2));
});

onMounted(loadSign);
</script>

<template>
    <div class="sign">
        <div class="sign__hero">
            <div class="sign__hero-left">
                <div class="sign__user">
                    <div class="sign__avatar">{{ userId.slice(0, 1).toUpperCase() }}</div>
                    <div>
                        <div class="sign__user-name">{{ userId }}</div>
                        <div class="sign__user-meta">已连续签到 {{ streak }} 天</div>
                    </div>
                </div>
                <div class="sign__stats">
                    <div class="sign__stat">
                        <div class="sign__stat-value">{{ streak }}</div>
                        <div class="sign__stat-label">连续天数</div>
                    </div>
                    <div class="sign__stat">
                        <div class="sign__stat-value">{{ monthCount }}</div>
                        <div class="sign__stat-label">本月累计</div>
                    </div>
                    <div class="sign__stat">
                        <div class="sign__stat-value">{{ Object.values(calendar).filter(Boolean).length }}</div>
                        <div class="sign__stat-label">本月已签</div>
                    </div>
                </div>
            </div>
            <div class="sign__hero-right">
                <div class="sign__today">
                    {{ signedToday ? '今日已签到' : '今天还没签到' }}
                </div>
                <el-button
                    class="sign__btn"
                    type="warning"
                    size="large"
                    round
                    :disabled="signedToday"
                    @click="signToday"
                >
                    {{ signedToday ? '已签到' : '签到' }}
                </el-button>
                <div class="lab-row" style="margin-top: 10px">
                    <el-input v-model="userId" size="small" style="width: 140px" />
                    <el-button size="small" @click="loadSign">切换用户</el-button>
                </div>
            </div>
        </div>

        <div class="sign__panel">
            <div class="sign__panel-head">
                <div class="sign__panel-title">
                    <el-icon><Calendar /></el-icon>
                    {{ month }} 签到日历
                </div>
                <span class="lab-spacer" />
                <el-input v-model="month" size="small" style="width: 130px" placeholder="yyyy-MM" />
                <el-button size="small" @click="loadSign">刷新</el-button>
                <span class="lab-hint">点任意一天可以补签</span>
            </div>

            <div class="sign__week">
                <span v-for="label in ['一', '二', '三', '四', '五', '六', '日']" :key="label">{{ label }}</span>
            </div>
            <div class="sign__grid">
                <div
                    v-for="(day, index) in cells"
                    :key="index"
                    class="sign__cell"
                    :class="{
                        'sign__cell--pad': day === 0,
                        'sign__cell--on': day > 0 && calendar[String(day)],
                        'sign__cell--today': day === Number(today().slice(8, 10)) && month === today().slice(0, 7),
                    }"
                    @click="day > 0 && signDay(day)"
                >
                    <template v-if="day > 0">
                        <span class="sign__day">{{ day }}</span>
                        <span v-if="calendar[String(day)]" class="sign__check">✓</span>
                    </template>
                </div>
            </div>
        </div>

        <div class="sign__panel">
            <div class="sign__panel-head">
                <div class="sign__panel-title">独立访客统计（HyperLogLog）</div>
            </div>
            <div class="sign__uv">
                <div class="sign__uv-form">
                    <el-form size="small" inline>
                        <el-form-item label="页面">
                            <el-input v-model="uv.page" style="width: 160px" />
                        </el-form-item>
                        <el-form-item label="访客数">
                            <el-input-number v-model="uv.visitors" :min="1" :max="500" controls-position="right" />
                        </el-form-item>
                        <el-form-item>
                            <el-button type="primary" :loading="uv.running" @click="runUv">模拟这么多访客</el-button>
                        </el-form-item>
                    </el-form>
                    <el-progress v-if="uv.running || uv.progress > 0" :percentage="uv.progress" :stroke-width="8" />
                </div>

                <div class="sign__uv-result">
                    <div class="sign__uv-num">
                        <div class="sign__uv-value">{{ uv.real }}</div>
                        <div class="sign__uv-label">真实访问人数</div>
                    </div>
                    <div class="sign__uv-arrow">→</div>
                    <div class="sign__uv-num">
                        <div class="sign__uv-value sign__uv-value--est">{{ uv.estimated }}</div>
                        <div class="sign__uv-label">HLL 估算值</div>
                    </div>
                    <div class="sign__uv-num">
                        <div class="sign__uv-value" :class="Math.abs(errorPercent) > 2 ? 'sign__uv-value--warn' : ''">
                            {{ errorPercent }}%
                        </div>
                        <div class="sign__uv-label">误差</div>
                    </div>
                </div>

                <el-alert
                    type="info"
                    :closable="false"
                    show-icon
                    title="为什么是估算值"
                    description="HyperLogLog 只保存一个位图，不保存具体是谁来过，所以给不出「哪 100 个人」，只能给出大约 100 这个数字。换来的是无论访客上亿还是几百，占用始终是 12KB 左右。"
                />
            </div>
        </div>
    </div>
</template>

<style scoped>
.sign {
    background: #f6f8fc;
    padding: 18px;
    border-radius: var(--lab-radius);
}

.sign__hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    background: linear-gradient(135deg, #ff9d4d, #ff6b35);
    border-radius: 14px;
    padding: 24px 26px;
    color: #fff;
    box-shadow: 0 8px 24px rgba(255, 107, 53, 0.24);
    flex-wrap: wrap;
}

.sign__hero-left {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.sign__user {
    display: flex;
    align-items: center;
    gap: 12px;
}

.sign__avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.24);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    font-weight: 700;
}

.sign__user-name {
    font-size: 17px;
    font-weight: 600;
}

.sign__user-meta {
    font-size: 12px;
    opacity: 0.85;
    margin-top: 2px;
}

.sign__stats {
    display: flex;
    gap: 26px;
}

.sign__stat-value {
    font-size: 24px;
    font-weight: 700;
}

.sign__stat-label {
    font-size: 12px;
    opacity: 0.85;
}

.sign__hero-right {
    text-align: center;
}

.sign__today {
    font-size: 13px;
    opacity: 0.9;
    margin-bottom: 8px;
}

.sign__btn {
    min-width: 130px;
    font-size: 16px;
    font-weight: 600;
    background: #fff !important;
    color: #ff6b35 !important;
    border: none !important;
}

.sign__btn:disabled {
    background: rgba(255, 255, 255, 0.6) !important;
    color: #b58a72 !important;
}

.sign__panel {
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    padding: 14px 16px;
    margin-top: 14px;
}

.sign__panel-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
    flex-wrap: wrap;
}

.sign__panel-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 600;
}

.sign__week {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 8px;
    margin-bottom: 8px;
}

.sign__week span {
    text-align: center;
    font-size: 12px;
    color: var(--lab-muted);
}

.sign__grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 8px;
}

.sign__cell {
    aspect-ratio: 1;
    border-radius: 10px;
    background: #f6f8fc;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.14s ease, transform 0.14s ease;
    position: relative;
}

.sign__cell:hover {
    transform: scale(1.04);
}

.sign__cell--pad {
    background: transparent;
    cursor: default;
}

.sign__cell--on {
    background: linear-gradient(160deg, #ffd08a, #ff8b3d);
    color: #fff;
}

.sign__cell--today {
    border: 2px solid #ff6b35;
}

.sign__day {
    font-size: 15px;
    font-weight: 600;
}

.sign__check {
    font-size: 11px;
    margin-top: 2px;
}

.sign__uv-result {
    display: flex;
    align-items: center;
    gap: 24px;
    margin: 14px 0;
    flex-wrap: wrap;
}

.sign__uv-num {
    text-align: center;
}

.sign__uv-value {
    font-size: 30px;
    font-weight: 700;
    color: var(--lab-text);
}

.sign__uv-value--est {
    color: #3d6ff5;
}

.sign__uv-value--warn {
    color: var(--lab-warn);
}

.sign__uv-label {
    font-size: 12px;
    color: var(--lab-muted);
    margin-top: 2px;
}

.sign__uv-arrow {
    font-size: 22px;
    color: var(--lab-muted);
}
</style>
