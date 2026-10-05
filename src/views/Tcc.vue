<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { RefreshRight } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/tcc';
import type { TccBranch, TccResultResponse } from '@/api/types';

/**
 * 分布式转账。
 *
 * <p>TCC 的关键是「Confirm 和 Cancel 都得真的写过」。
 * 这一页把 forceFailure 做成界面上一个醒目的红色开关：
 * 打开它提交，就能看到 Try 成功、Confirm 失败、最终由 Cancel 把预扣的资源全部还回去。
 * 只读提交结果的页面永远验证不到这条分支。
 */

const form = reactive({ userId: 1, productId: 1, quantity: 1, forceFailure: false });
const seedForm = reactive({ userId: 1, productId: 1, available: 100, balance: 100000 });

const xid = ref('');
const result = ref<TccResultResponse | null>(null);
const branches = ref<TccBranch[]>([]);
const statusMap = ref<Record<string, unknown>>({});

const { result: seedResult, call: callSeed } = useApi<null>();
const { loading: submitLoading, result: submitResult, call: callSubmit } = useApi<TccResultResponse>();
const { result: branchesResult, call: callBranches } = useApi<TccBranch[]>();
const { result: recoverResult, call: callRecover } = useApi<number>();

/**
 * 提交一笔分布式订单。
 */
async function submit() {
    const res = await callSubmit(() => api.submit({ ...form }));
    if (!res.ok) {
        ElMessage.error(res.message);
        return;
    }
    result.value = res.data;
    xid.value = res.data?.xid ?? '';
    await loadTx();
    ElMessage[res.data?.committed ? 'success' : 'warning'](res.data?.message ?? '');
}

/**
 * 加载事务状态与分支。
 */
async function loadTx() {
    if (!xid.value) {
        return;
    }
    const [statusRes, branchRes] = await Promise.all([api.status(xid.value), callBranches(() => api.branches(xid.value))]);
    if (statusRes.ok) {
        statusMap.value = statusRes.data ?? {};
    }
    branches.value = branchRes.ok && branchRes.data ? branchRes.data : [];
}

/**
 * 初始化演示数据。
 */
async function seed() {
    const res = await callSeed(() => api.seed(seedForm.userId, seedForm.productId, seedForm.available, seedForm.balance));
    if (res.ok) {
        ElMessage.success('库存与账户已初始化');
    }
}

/**
 * 手工恢复停留在中间状态的事务。
 */
async function recover() {
    const res = await callRecover(api.recover);
    if (res.ok) {
        ElMessage.success(`已恢复 ${res.data} 笔事务`);
        await loadTx();
    }
}

const committed = computed(() => result.value?.committed ?? null);

/**
 * 分支状态对应的标签类型。
 *
 * @param status 分支状态
 */
function branchTone(status: string): string {
    if (status === 'CONFIRMED') {
        return 'success';
    }
    return status === 'CANCELLED' ? 'danger' : 'warning';
}

const statusEntries = computed(() => Object.entries(statusMap.value));
</script>

<template>
    <div class="tc">
        <SectionHead
            title="分布式转账"
            desc="Try 预留资源，Confirm 或 Cancel 二选一落地。把「强制失败」打开再提交一次，才能验证回滚链路真的被写过。"
        >
            <template #actions>
                <el-button size="small" type="warning" :icon="RefreshRight" @click="recover()">手工恢复</el-button>
            </template>
        </SectionHead>

        <div class="tc__body">
            <div class="tc__form">
                <div class="tc__card">
                    <div class="tc__card-title">转账信息</div>
                    <el-form size="small" label-width="86px">
                        <el-form-item label="付款用户">
                            <el-input-number v-model="form.userId" :min="1" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="商品">
                            <el-input-number v-model="form.productId" :min="1" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="数量">
                            <el-input-number v-model="form.quantity" :min="1" controls-position="right" />
                        </el-form-item>
                    </el-form>

                    <div class="tc__switch" :class="{ 'tc__switch--danger': form.forceFailure }">
                        <div>
                            <div class="tc__switch-title">强制在 Confirm 阶段失败</div>
                            <div class="tc__switch-desc">
                                {{ form.forceFailure ? '提交后 Try 会成功，Confirm 报错，最终由 Cancel 把预扣的资源还回去' : '关闭时走完整成功链路' }}
                            </div>
                        </div>
                        <el-switch v-model="form.forceFailure" size="large" />
                    </div>

                    <el-button
                        class="tc__submit"
                        :type="form.forceFailure ? 'danger' : 'primary'"
                        size="large"
                        :loading="submitLoading"
                        @click="submit"
                    >
                        {{ form.forceFailure ? '提交并制造失败' : '提交转账' }}
                    </el-button>
                </div>

                <div class="tc__card">
                    <div class="tc__card-title">初始化演示数据</div>
                    <div class="tc__card-desc">库存与账户需要先准备好，缺了它提交会直接失败。</div>
                    <el-form size="small" inline label-width="70px">
                        <el-form-item label="用户">
                            <el-input-number v-model="seedForm.userId" :min="1" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="商品">
                            <el-input-number v-model="seedForm.productId" :min="1" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="库存">
                            <el-input-number v-model="seedForm.available" :min="0" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="余额">
                            <el-input-number v-model="seedForm.balance" :min="0" controls-position="right" />
                        </el-form-item>
                        <el-form-item>
                            <el-button size="small" @click="seed">初始化</el-button>
                        </el-form-item>
                    </el-form>
                    <div v-if="seedResult" class="lab-hint">
                        {{ seedResult.ok ? '已就绪' : `初始化失败：${seedResult.message}` }}
                    </div>
                </div>
            </div>

            <div class="tc__result">
                <div v-if="result" class="tc__verdict" :class="{ 'tc__verdict--ok': committed, 'tc__verdict--bad': !committed }">
                    <div class="tc__verdict-icon">{{ committed ? '✓' : '↩' }}</div>
                    <div>
                        <div class="tc__verdict-title">{{ committed ? '转账成功' : '已回滚' }}</div>
                        <div class="tc__verdict-desc">{{ result.message }}</div>
                        <div class="tc__verdict-xid">{{ result.xid }}</div>
                    </div>
                </div>
                <div v-else class="tc__placeholder">
                    <div class="tc__placeholder-icon">💸</div>
                    <div>提交一笔转账，看三个分支分别落地成什么状态</div>
                </div>

                <div class="tc__phases">
                    <div class="tc__phase" :class="{ 'is-on': !!result }">
                        <div class="tc__phase-name">Try</div>
                        <div class="tc__phase-desc">冻结库存与账户额度</div>
                    </div>
                    <span class="tc__arrow">›</span>
                    <div class="tc__phase" :class="{ 'is-on': committed === true, 'is-off': committed === false }">
                        <div class="tc__phase-name">Confirm</div>
                        <div class="tc__phase-desc">真正扣减并落地</div>
                    </div>
                    <span class="tc__arrow">›</span>
                    <div class="tc__phase" :class="{ 'is-on': committed === false, 'is-off': committed === true }">
                        <div class="tc__phase-name">Cancel</div>
                        <div class="tc__phase-desc">释放预扣资源</div>
                    </div>
                </div>

                <div class="tc__card">
                    <div class="tc__card-title">分支明细</div>
                    <el-table :data="branches" border stripe size="small" max-height="260">
                        <el-table-column prop="branchId" label="分支" min-width="150" show-overflow-tooltip />
                        <el-table-column label="状态" width="120">
                            <template #default="{ row }">
                                <el-tag :type="branchTone(row.status)" size="small">{{ row.status }}</el-tag>
                            </template>
                        </el-table-column>
                        <el-table-column prop="retryCount" label="重试" width="70" />
                        <el-table-column prop="errorMessage" label="错误" min-width="150" show-overflow-tooltip />
                    </el-table>
                    <div v-if="branches.length === 0" class="lab-hint">提交后按 xid 拉取</div>
                </div>

                <div class="tc__card">
                    <div class="tc__card-title">事务状态</div>
                    <el-descriptions v-if="statusEntries.length > 0" :column="1" border size="small">
                        <el-descriptions-item v-for="[key, value] in statusEntries" :key="key" :label="String(key)">
                            {{ value }}
                        </el-descriptions-item>
                    </el-descriptions>
                    <div v-else class="lab-hint">提交后显示</div>
                </div>

                <div v-if="recoverResult" class="tc__card">
                    <div class="tc__card-title">手工恢复</div>
                    <el-tag :type="recoverResult.ok ? 'success' : 'danger'" effect="dark">
                        {{ recoverResult.ok ? `恢复 ${recoverResult.data} 笔` : `code ${recoverResult.code}` }}
                    </el-tag>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.tc__body {
    display: grid;
    grid-template-columns: 340px minmax(0, 1fr);
    gap: 14px;
    align-items: start;
}

.tc__form,
.tc__result {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.tc__card {
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    padding: 14px 16px;
}

.tc__card-title {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 10px;
}

.tc__card-desc {
    font-size: 12px;
    color: var(--lab-muted);
    margin-bottom: 10px;
}

.tc__switch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: #fafbfd;
    border: 1px solid var(--lab-border);
    border-radius: 10px;
    padding: 12px;
    margin-bottom: 12px;
}

.tc__switch--danger {
    background: #fff5f5;
    border-color: #f6cfcf;
}

.tc__switch-title {
    font-size: 13px;
    font-weight: 600;
}

.tc__switch-desc {
    font-size: 12px;
    color: var(--lab-muted);
    margin-top: 2px;
    line-height: 1.6;
}

.tc__submit {
    width: 100%;
}

.tc__verdict {
    display: flex;
    align-items: center;
    gap: 14px;
    background: #fff;
    border: 1px solid var(--lab-border);
    border-left: 4px solid #c9cdd6;
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    padding: 16px 18px;
}

.tc__verdict--ok {
    border-left-color: #16a34a;
}

.tc__verdict--bad {
    border-left-color: #dc4a4a;
    background: #fffbfb;
}

.tc__verdict-icon {
    width: 46px;
    height: 46px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    font-weight: 700;
    background: #f0f2f6;
    color: #7a869a;
}

.tc__verdict--ok .tc__verdict-icon {
    background: #e6f7ee;
    color: #16a34a;
}

.tc__verdict--bad .tc__verdict-icon {
    background: #ffece8;
    color: #dc4a4a;
}

.tc__verdict-title {
    font-size: 17px;
    font-weight: 600;
}

.tc__verdict-desc {
    font-size: 12px;
    color: var(--lab-muted);
    margin-top: 2px;
}

.tc__verdict-xid {
    font-family: Menlo, Consolas, monospace;
    font-size: 11px;
    color: #a3acbb;
    margin-top: 4px;
}

.tc__placeholder {
    background: #fff;
    border: 1px dashed var(--lab-border);
    border-radius: var(--lab-radius);
    padding: 40px 20px;
    text-align: center;
    color: var(--lab-muted);
}

.tc__placeholder-icon {
    font-size: 36px;
}

.tc__phases {
    display: flex;
    align-items: stretch;
    gap: 8px;
}

.tc__phase {
    flex: 1;
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: 10px;
    padding: 12px 10px;
    text-align: center;
}

.tc__phase.is-on {
    border-color: #b6e6c9;
    background: #f2fbf6;
}

.tc__phase.is-off {
    opacity: 0.45;
}

.tc__phase-name {
    font-size: 14px;
    font-weight: 600;
}

.tc__phase-desc {
    font-size: 11px;
    color: var(--lab-muted);
    margin-top: 3px;
}

.tc__arrow {
    align-self: center;
    color: #c9cdd6;
    font-size: 18px;
}

@media (max-width: 1000px) {
    .tc__body {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
