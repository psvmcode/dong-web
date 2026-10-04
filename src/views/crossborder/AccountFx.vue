<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { RefreshRight } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import ResultView from '@/components/ResultView.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/crossborder';
import { money } from '@/utils/format';
import type { AccountEventResponse, AccountResponse, FxQuoteResponse, FxRateResponse } from '@/api/types';

/**
 * 账户与汇率。
 *
 * <p>跨境支付的第一段链路：先有账户、再有报价。
 * 钱在这里一律用 BigDecimal 参与运算，所以页面上的「可用余额」永远等于
 * 余额减冻结额，而不是某个顺手算出来的浮点值。
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

const selected = ref('');
const freezeForm = reactive({ reason: '风险核查', operator: 'risk-console' });
const diffInitial = ref(0);
const sanctionName = ref('Bad Actor');

const fx = reactive({ sourceCurrency: 'CNY', targetCurrency: 'USD', validSeconds: 30 });
const quoteNo = ref('');
const rateAdjust = reactive({ currency: 'USD', usdRate: 1 });

const { result: accountsResult, call: callAccounts } = useApi<AccountResponse[]>();
const { result: openResult, call: callOpen } = useApi<number>();
const { result: detailResult, call: callDetail } = useApi<AccountResponse>();
const { result: eventsResult, call: callEvents } = useApi<AccountEventResponse[]>();
const { result: opResult, call: callOp } = useApi<unknown>();
const { result: diffResult, call: callDiff } = useApi<Record<string, unknown>>();
const { result: quoteResult, call: callQuote } = useApi<FxQuoteResponse>();
const { result: quotesResult, call: callQuotes } = useApi<FxQuoteResponse[]>();
const { result: ratesResult, call: callRates } = useApi<FxRateResponse[]>();
const { result: exposureResult, call: callExposure } = useApi<Record<string, unknown>>();
const { result: currentRateResult, call: callCurrentRate } = useApi<Record<string, unknown>>();

const accounts = computed<AccountResponse[]>(() =>
    accountsResult.value?.ok && accountsResult.value.data ? accountsResult.value.data : [],
);
const events = computed<AccountEventResponse[]>(() =>
    eventsResult.value?.ok && eventsResult.value.data ? eventsResult.value.data : [],
);
const rates = computed<FxRateResponse[]>(() => (ratesResult.value?.ok && ratesResult.value.data ? ratesResult.value.data : []));
const quote = computed(() => (quoteResult.value?.ok ? quoteResult.value.data : null));

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
 * 选中账户并加载详情与事件。
 *
 * @param accountNo 账号
 */
async function pick(accountNo: string) {
    selected.value = accountNo;
    await Promise.all([
        callDetail(() => api.accountDetail(accountNo)),
        callEvents(() => api.accountEvents(accountNo)),
    ]);
}

/**
 * 冻结账户。
 */
async function freeze() {
    const res = await callOp(() => api.freeze(selected.value, freezeForm.reason, freezeForm.operator));
    if (res.ok) {
        ElMessage.success('已冻结');
        loadAccounts();
        await pick(selected.value);
    }
}

/**
 * 解冻账户。
 */
async function unfreeze() {
    const res = await callOp(() => api.unfreeze(selected.value, freezeForm.reason, freezeForm.operator));
    if (res.ok) {
        ElMessage.success('已解冻');
        loadAccounts();
        await pick(selected.value);
    }
}

/**
 * 余额与流水差额校验。
 */
function checkDiff() {
    void callDiff(() => api.balanceDiff(selected.value, diffInitial.value));
}

/**
 * 加入 / 移出制裁名单。
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
 * 查询锁汇报价是否有效。到期后 lockedRate 不再可用。
 */
function checkQuote() {
    void callQuote(() => api.quoteDetail(quoteNo.value));
}

onMounted(() => {
    loadAccounts();
    void callRates(api.rates);
    void callExposure(api.fxExposure);
});
</script>

<template>
    <div>
        <SectionHead
            title="账户与汇率"
            desc="跨境支付的第一段：先有账户与 KYC 等级，再有报价与锁汇。金额全程走 BigDecimal，页面上看到的差额不会因浮点误差而失真。"
        >
            <template #actions>
                <el-button size="small" :icon="RefreshRight" @click="loadAccounts(); callRates(api.rates)">刷新</el-button>
            </template>
        </SectionHead>

        <el-tabs>
            <el-tab-pane label="账户">
                <div class="lab-grid lab-grid--2">
                    <div class="lab-card">
                        <div class="lab-card__title">开户</div>
                        <div class="lab-card__desc">
                            singleLimit 默认与 AML 大额阈值相同，想看到「人工审核」分支就把单次限额或汇出金额调到阈值以上。
                        </div>
                        <el-form size="small" label-width="96px">
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
                                <el-form-item label="日限额">
                                    <el-input-number v-model="openForm.dailyLimit" :precision="2" controls-position="right" />
                                </el-form-item>
                                <el-form-item label="单笔限额">
                                    <el-input-number v-model="openForm.singleLimit" :precision="2" controls-position="right" />
                                </el-form-item>
                                <el-form-item label="KYC 等级">
                                    <el-input-number v-model="openForm.kycLevel" :min="0" :max="5" controls-position="right" />
                                </el-form-item>
                            </div>
                            <el-button type="primary" size="small" @click="open">开立账户</el-button>
                        </el-form>
                        <ResultView :result="openResult" title="开户结果" :max-height="120" style="margin-top: 10px" />
                    </div>

                    <div class="lab-card">
                        <div class="lab-card__title">制裁名单</div>
                        <div class="lab-card__desc">制裁筛查是合规的第一道门，命中后汇款会被直接拒绝，连人工审核都不进。</div>
                        <div class="lab-row">
                            <el-input v-model="sanctionName" style="width: 220px" />
                            <el-button size="small" type="danger" @click="toggleSanction(true)">加入</el-button>
                            <el-button size="small" @click="toggleSanction(false)">移除</el-button>
                            <el-button size="small" @click="callOp(api.sanctionCount)">查数量</el-button>
                        </div>
                        <ResultView :result="opResult" title="名单操作返回" :max-height="160" style="margin-top: 10px" />
                        <ResultView :result="diffResult" title="余额差额校验" :max-height="200" style="margin-top: 10px" />
                    </div>
                </div>

                <div class="lab-card">
                    <div class="lab-card__title">账户列表</div>
                    <div class="lab-card__desc">点账户号把它选为操作对象，冻结 / 解冻 / 事件查询都针对它。</div>
                    <el-table :data="accounts" border stripe size="small" max-height="360">
                        <el-table-column label="账号" min-width="180">
                            <template #default="{ row }">
                                <el-link type="primary" @click="pick(row.accountNo)">{{ row.accountNo }}</el-link>
                            </template>
                        </el-table-column>
                        <el-table-column prop="ownerName" label="户名" min-width="160" show-overflow-tooltip />
                        <el-table-column prop="currency" label="币种" width="80" />
                        <el-table-column label="余额" width="130">
                            <template #default="{ row }">{{ money(row.balance) }}</template>
                        </el-table-column>
                        <el-table-column label="冻结" width="110">
                            <template #default="{ row }">{{ money(row.frozenBalance) }}</template>
                        </el-table-column>
                        <el-table-column label="可用" width="130">
                            <template #default="{ row }">{{ money(row.availableBalance) }}</template>
                        </el-table-column>
                        <el-table-column label="状态" width="100">
                            <template #default="{ row }">
                                <el-tag :type="row.status === 0 ? 'success' : 'danger'" size="small">
                                    {{ row.status === 0 ? '正常' : '冻结' }}
                                </el-tag>
                            </template>
                        </el-table-column>
                    </el-table>
                </div>

                <div class="lab-grid lab-grid--2">
                    <div class="lab-card">
                        <div class="lab-card__title">冻结 / 解冻</div>
                        <div class="lab-card__desc">冻结会连带限制可用额度，事件会落库留痕，任何人改过都有记录。</div>
                        <el-form size="small" label-width="86px">
                            <el-form-item label="账号">
                                <el-input v-model="selected" placeholder="从列表里选" />
                            </el-form-item>
                            <el-form-item label="原因">
                                <el-input v-model="freezeForm.reason" />
                            </el-form-item>
                            <el-form-item label="操作人">
                                <el-input v-model="freezeForm.operator" />
                            </el-form-item>
                            <el-form-item label="初始余额">
                                <el-input-number v-model="diffInitial" :precision="2" controls-position="right" />
                            </el-form-item>
                        </el-form>
                        <div class="lab-row">
                            <el-button size="small" type="danger" @click="freeze">冻结</el-button>
                            <el-button size="small" type="success" @click="unfreeze">解冻</el-button>
                            <el-button size="small" @click="checkDiff">校验余额差额</el-button>
                        </div>
                        <ResultView :result="detailResult" title="账户详情" :max-height="220" style="margin-top: 10px" />
                    </div>

                    <div class="lab-card">
                        <div class="lab-card__title">冻结/解冻事件</div>
                        <div class="lab-card__desc">账户状态变更的历史，按时间倒序。</div>
                        <el-table :data="events" border stripe size="small" max-height="320">
                            <el-table-column prop="eventType" label="事件" width="110" />
                            <el-table-column prop="reason" label="原因" min-width="160" show-overflow-tooltip />
                            <el-table-column prop="operator" label="操作人" width="120" />
                            <el-table-column prop="createTime" label="时间" min-width="160" />
                        </el-table>
                    </div>
                </div>
            </el-tab-pane>

            <el-tab-pane label="汇率与锁汇">
                <div class="lab-grid lab-grid--2">
                    <div class="lab-card">
                        <div class="lab-card__title">询价锁汇</div>
                        <div class="lab-card__desc">报价带有效期，到期后一笔新的询价会得到不同的汇率——这就是锁汇的意义。</div>
                        <el-form size="small" label-width="86px">
                            <div class="lab-grid lab-grid--2">
                                <el-form-item label="源币种">
                                    <el-input v-model="fx.sourceCurrency" />
                                </el-form-item>
                                <el-form-item label="目标币种">
                                    <el-input v-model="fx.targetCurrency" />
                                </el-form-item>
                            </div>
                            <el-form-item label="有效秒数">
                                <el-input-number v-model="fx.validSeconds" :min="1" controls-position="right" />
                            </el-form-item>
                            <el-form-item label="报价号">
                                <el-input v-model="quoteNo" placeholder="询价后自动填入" />
                            </el-form-item>
                        </el-form>
                        <div class="lab-row">
                            <el-button type="primary" size="small" @click="doQuote">询价</el-button>
                            <el-button size="small" @click="checkQuote">查报价是否还有效</el-button>
                            <el-button size="small" @click="callQuotes(() => api.availableQuotes(fx.sourceCurrency, fx.targetCurrency))">
                                可用报价
                            </el-button>
                            <el-button size="small" @click="callCurrentRate(() => api.currentRate(fx.sourceCurrency, fx.targetCurrency))">
                                当前中间价
                            </el-button>
                        </div>
                        <div v-if="quote" class="lab-row" style="margin-top: 10px">
                            <el-tag size="small" effect="plain">买入 {{ quote.bidRate }}</el-tag>
                            <el-tag size="small" effect="plain">卖出 {{ quote.askRate }}</el-tag>
                            <el-tag size="small" effect="plain" :type="quote.expired ? 'danger' : 'success'">
                                {{ quote.expired ? '已过期' : `剩余 ${quote.validSeconds}s` }}
                            </el-tag>
                        </div>
                        <ResultView :result="quoteResult" title="报价详情" :max-height="200" style="margin-top: 10px" />
                    </div>

                    <div class="lab-card">
                        <div class="lab-card__title">牌价管理</div>
                        <div class="lab-card__desc">牌价是所有报价的基准，改动它会立刻影响后续询价的结果。</div>
                        <div class="lab-row">
                            <el-input v-model="rateAdjust.currency" style="width: 120px" />
                            <el-input-number v-model="rateAdjust.usdRate" :precision="6" size="small" controls-position="right" />
                            <el-button size="small" type="primary" @click="callOp(() => api.adjustRate(rateAdjust.currency, rateAdjust.usdRate)).then(() => callRates(api.rates))">
                                调整牌价
                            </el-button>
                            <el-button size="small" @click="callOp(api.expireQuotes)">清理过期报价</el-button>
                        </div>
                        <el-table :data="rates" border stripe size="small" max-height="280" style="margin-top: 12px">
                            <el-table-column prop="currency" label="币种" width="100" />
                            <el-table-column prop="usdRate" label="对美元汇率" min-width="140" />
                            <el-table-column label="状态" width="90">
                                <template #default="{ row }">
                                    <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
                                        {{ row.status === 1 ? '启用' : '停用' }}
                                    </el-tag>
                                </template>
                            </el-table-column>
                            <el-table-column prop="updateTime" label="更新时间" min-width="160" />
                        </el-table>
                    </div>
                </div>

                <div class="lab-card">
                    <div class="lab-card__title">汇率敞口</div>
                    <div class="lab-card__desc">已锁汇但未清算的金额就是敞口，汇率一动就是浮动盈亏。</div>
                    <div class="lab-row" style="margin-bottom: 10px">
                        <el-button size="small" :icon="RefreshRight" @click="callExposure(api.fxExposure)">刷新敞口</el-button>
                    </div>
                    <ResultView :result="exposureResult" title="敞口数据" :max-height="220" />
                    <ResultView :result="currentRateResult" title="当前中间价" :max-height="160" style="margin-top: 10px" />
                </div>
            </el-tab-pane>
        </el-tabs>
    </div>
</template>
