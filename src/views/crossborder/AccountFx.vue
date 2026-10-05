<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { RefreshRight } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/crossborder';
import type { AccountEventResponse, AccountResponse, FxQuoteResponse, FxRateResponse } from '@/api/types';
import { money } from '@/utils/format';

/**
 * 账户与汇率。
 *
 * <p>做成银行 App 的样子：上面是银行卡，下面是账户列表、制裁名单和汇率牌价。
 * 钱在这里全程用 BigDecimal 参与运算，所以「可用余额」永远等于余额减冻结额，
 * 不会出现浮点误差导致的差一分钱。
 */

const openForm = reactive({
    ownerName: 'Acme Trading Ltd',
    country: 'CN',
    currency: 'CNY',
    balance: 1_000_000,
    dailyLimit: 500_000,
    singleLimit: 50_000,
    kycLevel: 2,
});

const selected = ref<AccountResponse | null>(null);
const freezeForm = reactive({ reason: '风险核查', operator: 'risk-console' });
const diffInitial = ref(0);
const sanctionName = ref('Bad Actor');

const fx = reactive({ sourceCurrency: 'CNY', targetCurrency: 'USD', validSeconds: 30 });
const quoteNo = ref('');
const rateAdjust = reactive({ currency: 'USD', usdRate: 1 });

const { result: accountsResult, call: callAccounts } = useApi<AccountResponse[]>();
const { result: openResult, call: callOpen } = useApi<number>();
const { result: eventsResult, call: callEvents } = useApi<AccountEventResponse[]>();
const { result: opResult, call: callOp } = useApi<unknown>();
const { result: diffResult, call: callDiff } = useApi<Record<string, unknown>>();
const { result: quoteResult, call: callQuote } = useApi<FxQuoteResponse>();
const { result: ratesResult, call: callRates } = useApi<FxRateResponse[]>();
const { result: exposureResult, call: callExposure } = useApi<Record<string, unknown>>();

const accounts = computed<AccountResponse[]>(() =>
    accountsResult.value?.ok && accountsResult.value.data ? accountsResult.value.data : [],
);
const events = computed<AccountEventResponse[]>(() =>
    eventsResult.value?.ok && eventsResult.value.data ? eventsResult.value.data : [],
);
const rates = computed<FxRateResponse[]>(() => (ratesResult.value?.ok && ratesResult.value.data ? ratesResult.value.data : []));
const quote = computed(() => (quoteResult.value?.ok ? quoteResult.value.data : null));
const exposureEntries = computed(() => (exposureResult.value?.ok ? Object.entries(exposureResult.value.data) : []));

/**
 * 加载账户列表。
 */
function loadAccounts() {
    void callAccounts(api.listAccounts);
}

/**
 * 开户。
 */
async function open() {
    const res = await callOpen(() => api.openAccount({ ...openForm }));
    if (res.ok) {
        ElMessage.success('账户已开立');
        loadAccounts();
    }
}

/**
 * 选中账户。
 *
 * @param row 账户
 */
function pick(row: AccountResponse) {
    selected.value = row;
    void callEvents(() => api.accountEvents(row.accountNo));
}

/**
 * 冻结。
 */
async function freeze() {
    if (!selected.value) {
        return;
    }
    await callOp(() => api.freeze(selected.value?.accountNo ?? '', freezeForm.reason, freezeForm.operator));
    ElMessage.success('已冻结');
    loadAccounts();
}

/**
 * 解冻。
 */
async function unfreeze() {
    if (!selected.value) {
        return;
    }
    await callOp(() => api.unfreeze(selected.value?.accountNo ?? '', freezeForm.reason, freezeForm.operator));
    ElMessage.success('已解冻');
    loadAccounts();
}

/**
 * 余额与流水差额校验。
 */
function checkDiff() {
    if (!selected.value) {
        return;
    }
    void callDiff(() => api.balanceDiff(selected.value?.accountNo ?? '', diffInitial.value));
}

/**
 * 制裁名单增删。
 *
 * @param add true 表示加入
 */
async function toggleSanction(add: boolean) {
    const res = add
        ? await callOp(() => api.addSanction(sanctionName.value))
        : await callOp(() => api.removeSanction(sanctionName.value));
    if (res.ok) {
        ElMessage.success(add ? '已加入制裁名单' : '已移出制裁名单');
    }
}

/**
 * 询价锁汇。
 */
async function doQuote() {
    const res = await callQuote(() => api.quote(fx.sourceCurrency, fx.targetCurrency, fx.validSeconds));
    if (res.ok && res.data) {
        quoteNo.value = res.data.quoteNo;
    }
}

/**
 * 调整牌价。
 */
async function adjustRate() {
    const res = await callOp(() => api.adjustRate(rateAdjust.currency, rateAdjust.usdRate));
    if (res.ok) {
        ElMessage.success('牌价已调整');
        void callRates(api.rates);
    }
}

onMounted(() => {
    loadAccounts();
    void callRates(api.rates);
    void callExposure(api.fxExposure);
});
</script>

<template>
    <div class="bk">
        <SectionHead
            title="账户与汇率"
            desc="跨境支付的第一段：先有账户与 KYC 等级，再有报价与锁汇。把单笔限额调高，后面汇款时才能看到人工审核分支。"
        >
            <template #actions>
                <el-button size="small" :icon="RefreshRight" @click="loadAccounts(); callRates(api.rates)">刷新</el-button>
            </template>
        </SectionHead>

        <div class="bk__cards">
            <div v-if="selected" class="bk__card" :class="{ 'bk__card--frozen': selected.status !== 0 }">
                <div class="bk__card-top">
                    <span class="bk__card-bank">dong 跨境账户</span>
                    <span class="bk__card-type">{{ selected.currency }}</span>
                </div>
                <div class="bk__card-no">{{ selected.accountNo }}</div>
                <div class="bk__card-owner">{{ selected.ownerName }}</div>
                <div class="bk__card-bottom">
                    <div>
                        <div class="bk__card-label">可用余额</div>
                        <div class="bk__card-amount">{{ money(selected.availableBalance) }}</div>
                    </div>
                    <div class="bk__card-right">
                        <div class="bk__card-label">冻结</div>
                        <div class="bk__card-frozen">{{ money(selected.frozenBalance) }}</div>
                    </div>
                </div>
                <el-tag v-if="selected.status !== 0" class="bk__card-badge" type="danger" effect="dark">已冻结</el-tag>
            </div>
            <div class="bk__summary">
                <div class="bk__summary-title">账户总览</div>
                <div class="bk__summary-grid">
                    <div>
                        <div class="bk__summary-value">{{ accounts.length }}</div>
                        <div class="bk__summary-label">账户数</div>
                    </div>
                    <div>
                        <div class="bk__summary-value">
                            {{ accounts.filter((item) => item.status !== 0).length }}
                        </div>
                        <div class="bk__summary-label">冻结中</div>
                    </div>
                    <div>
                        <div class="bk__summary-value">
                            {{ money(accounts.reduce((sum, item) => sum + item.availableBalance, 0)) }}
                        </div>
                        <div class="bk__summary-label">可用总额</div>
                    </div>
                </div>
                <div v-if="diffResult?.ok" class="bk__diff">
                    差额校验：{{ JSON.stringify(diffResult.data) }}
                </div>
            </div>
        </div>

        <div class="bk__grid">
            <div class="bk__panel">
                <div class="bk__panel-title">账户列表</div>
                <el-table :data="accounts" border stripe size="small" max-height="260" highlight-current-row @row-click="pick">
                    <el-table-column prop="accountNo" label="账号" min-width="190" show-overflow-tooltip />
                    <el-table-column prop="ownerName" label="户名" min-width="150" show-overflow-tooltip />
                    <el-table-column label="可用余额" width="130">
                        <template #default="{ row }">{{ money(row.availableBalance) }}</template>
                    </el-table-column>
                    <el-table-column label="状态" width="90">
                        <template #default="{ row }">
                            <el-tag :type="row.status === 0 ? 'success' : 'danger'" size="small">
                                {{ row.status === 0 ? '正常' : '冻结' }}
                            </el-tag>
                        </template>
                    </el-table-column>
                </el-table>
            </div>

            <div class="bk__panel">
                <div class="bk__panel-title">冻结 / 解冻</div>
                <div class="lab-hint" style="margin-bottom: 10px">
                    {{ selected ? selected.accountNo : '先在左边点一个账户' }}
                </div>
                <el-form size="small" label-width="70px">
                    <el-form-item label="原因">
                        <el-input v-model="freezeForm.reason" />
                    </el-form-item>
                    <el-form-item label="操作人">
                        <el-input v-model="freezeForm.operator" />
                    </el-form-item>
                    <el-form-item label="初始额">
                        <el-input-number v-model="diffInitial" :precision="2" controls-position="right" />
                    </el-form-item>
                </el-form>
                <div class="lab-row">
                    <el-button size="small" type="danger" :disabled="!selected" @click="freeze">冻结</el-button>
                    <el-button size="small" type="success" :disabled="!selected" @click="unfreeze">解冻</el-button>
                    <el-button size="small" :disabled="!selected" @click="checkDiff">校验差额</el-button>
                </div>
            </div>

            <div class="bk__panel">
                <div class="bk__panel-title">开户</div>
                <el-form size="small" label-width="80px">
                    <el-form-item label="户名">
                        <el-input v-model="openForm.ownerName" maxlength="128" />
                    </el-form-item>
                    <div class="lab-grid lab-grid--2">
                        <el-form-item label="国家">
                            <el-input v-model="openForm.country" maxlength="32" />
                        </el-form-item>
                        <el-form-item label="币种">
                            <el-input v-model="openForm.currency" maxlength="16" />
                        </el-form-item>
                        <el-form-item label="初始余额">
                            <el-input-number v-model="openForm.balance" :precision="2" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="单笔限额">
                            <el-input-number v-model="openForm.singleLimit" :precision="2" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="日限额">
                            <el-input-number v-model="openForm.dailyLimit" :precision="2" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="KYC">
                            <el-input-number v-model="openForm.kycLevel" :min="0" :max="5" controls-position="right" />
                        </el-form-item>
                    </div>
                    <el-button type="primary" size="small" @click="open">开立账户</el-button>
                </el-form>
                <div v-if="openResult" class="lab-hint">
                    {{ openResult.ok ? '开户成功' : `开户失败：${openResult.message}` }}
                </div>
            </div>
        </div>

        <div class="bk__grid">
            <div class="bk__panel">
                <div class="bk__panel-title">冻结 / 解冻事件</div>
                <el-timeline v-if="events.length > 0" style="padding-left: 4px; max-height: 220px; overflow: auto">
                    <el-timeline-item
                        v-for="(event, index) in events"
                        :key="index"
                        :type="event.eventType === 'FREEZE' ? 'danger' : 'success'"
                        :timestamp="event.createTime"
                    >
                        {{ event.eventType }} · {{ event.reason }} · {{ event.operator }}
                    </el-timeline-item>
                </el-timeline>
                <div v-else class="lab-hint">选中账户后显示</div>
            </div>

            <div class="bk__panel">
                <div class="bk__panel-title">制裁名单</div>
                <div class="lab-hint" style="margin-bottom: 8px">命中制裁名单的汇款会被直接拒绝，连人工审核都不进。</div>
                <div class="lab-row">
                    <el-input v-model="sanctionName" style="width: 180px" />
                    <el-button size="small" type="danger" @click="toggleSanction(true)">加入</el-button>
                    <el-button size="small" @click="toggleSanction(false)">移除</el-button>
                </div>
            </div>

            <div class="bk__panel">
                <div class="bk__panel-title">汇率敞口</div>
                <el-descriptions v-if="exposureEntries.length > 0" :column="1" border size="small">
                    <el-descriptions-item v-for="[key, value] in exposureEntries" :key="key" :label="String(key)">
                        {{ value }}
                    </el-descriptions-item>
                </el-descriptions>
                <div v-else class="lab-hint">暂无敞口</div>
            </div>
        </div>

        <div class="bk__grid bk__grid--fx">
            <div class="bk__panel">
                <div class="bk__panel-title">锁汇询价</div>
                <div class="lab-hint" style="margin-bottom: 8px">
                    报价带有效期。到期后再询价会得到不同的汇率——这就是锁汇的意义。
                </div>
                <el-form size="small" inline>
                    <el-form-item :label="fx.sourceCurrency">
                        <el-input v-model="fx.sourceCurrency" style="width: 90px" />
                    </el-form-item>
                    <el-form-item :label="fx.targetCurrency">
                        <el-input v-model="fx.targetCurrency" style="width: 90px" />
                    </el-form-item>
                    <el-form-item label="有效期">
                        <el-input-number v-model="fx.validSeconds" :min="1" controls-position="right" />
                    </el-form-item>
                    <el-form-item>
                        <el-button type="primary" size="small" @click="doQuote">询价</el-button>
                    </el-form-item>
                </el-form>
                <div v-if="quote" class="bk__quote">
                    <div class="bk__quote-rate">{{ quote.lockedRate }}</div>
                    <div class="bk__quote-meta">{{ quote.currencyPair }} · {{ quoteNo }}</div>
                    <el-tag :type="quote.expired ? 'danger' : 'success'" size="small" effect="dark">
                        {{ quote.expired ? '已过期' : `剩余 ${quote.validSeconds}s` }}
                    </el-tag>
                </div>
            </div>

            <div class="bk__panel">
                <div class="bk__panel-title">币种牌价</div>
                <el-table :data="rates" border stripe size="small" max-height="240">
                    <el-table-column prop="currency" label="币种" width="90" />
                    <el-table-column prop="usdRate" label="对美元" min-width="120" />
                    <el-table-column label="状态" width="80">
                        <template #default="{ row }">
                            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
                                {{ row.status === 1 ? '启用' : '停' }}
                            </el-tag>
                        </template>
                    </el-table-column>
                </el-table>
                <div class="lab-row" style="margin-top: 10px">
                    <el-input v-model="rateAdjust.currency" style="width: 90px" />
                    <el-input-number v-model="rateAdjust.usdRate" :precision="6" size="small" controls-position="right" />
                    <el-button size="small" @click="adjustRate">调整牌价</el-button>
                    <el-button size="small" @click="callOp(api.expireQuotes)">清理过期报价</el-button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.bk__cards {
    display: grid;
    grid-template-columns: 380px minmax(0, 1fr);
    gap: 14px;
    margin-bottom: 14px;
}

.bk__card {
    position: relative;
    background: linear-gradient(135deg, #1f3a6e, #3d6ff5);
    border-radius: 16px;
    padding: 18px 20px;
    color: #fff;
    box-shadow: 0 10px 26px rgba(31, 58, 110, 0.28);
    min-height: 180px;
}

.bk__card--frozen {
    background: linear-gradient(135deg, #4a4f5a, #767c8a);
}

.bk__card-top {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    opacity: 0.85;
}

.bk__card-no {
    font-family: Menlo, Consolas, monospace;
    font-size: 19px;
    letter-spacing: 1px;
    margin: 14px 0 4px;
}

.bk__card-owner {
    font-size: 13px;
    opacity: 0.85;
}

.bk__card-bottom {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-top: 18px;
}

.bk__card-label {
    font-size: 12px;
    opacity: 0.75;
}

.bk__card-amount {
    font-size: 26px;
    font-weight: 700;
}

.bk__card-frozen {
    font-size: 18px;
    font-weight: 600;
}

.bk__card-right {
    text-align: right;
}

.bk__card-badge {
    position: absolute;
    right: 16px;
    top: 16px;
}

.bk__summary {
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    padding: 14px 16px;
}

.bk__summary-title {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 10px;
}

.bk__summary-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
}

.bk__summary-value {
    font-size: 22px;
    font-weight: 700;
}

.bk__summary-label {
    font-size: 12px;
    color: var(--lab-muted);
}

.bk__diff {
    margin-top: 10px;
    font-size: 12px;
    color: var(--lab-muted);
    word-break: break-all;
}

.bk__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 12px;
    margin-bottom: 12px;
}

.bk__grid--fx {
    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
}

.bk__panel {
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    padding: 14px 16px;
}

.bk__panel-title {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 10px;
}

.bk__quote {
    background: #fafbfd;
    border: 1px solid var(--lab-border);
    border-radius: 10px;
    padding: 12px;
    margin-top: 10px;
}

.bk__quote-rate {
    font-size: 26px;
    font-weight: 700;
    color: #3d6ff5;
}

.bk__quote-meta {
    font-size: 12px;
    color: var(--lab-muted);
    margin: 2px 0 6px;
    font-family: Menlo, Consolas, monospace;
}
</style>
