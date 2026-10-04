<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { RefreshRight } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import StatCard from '@/components/StatCard.vue';
import ResultView from '@/components/ResultView.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/tcc';
import type { TccBranch, TccResultResponse } from '@/api/types';

/**
 * TCC 分布式事务。
 *
 * <p>Try 阶段预留资源，Confirm / Cancel 只负责落地或释放。
 * 页面刻意把 forceFailure 开关露出来：让 Cancel 真的发生一次，
 * 才能理解「回滚不是假设，而是必须被显式实现的另一条分支」。
 */

const seedForm = reactive({ userId: 1, productId: 1, available: 100, balance: 100000 });
const orderForm = reactive({ userId: 1, productId: 1, quantity: 1, forceFailure: false });

const { result: seedResult, call: callSeed } = useApi<null>();
const { result: submitResult, call: callSubmit } = useApi<TccResultResponse>();
const { result: statusResult, call: callStatus } = useApi<Record<string, unknown>>();
const { result: branchesResult, call: callBranches } = useApi<TccBranch[]>();
const { result: recoverResult, call: callRecover } = useApi<number>();

const xid = ref('');

const branches = computed<TccBranch[]>(() => (branchesResult.value?.ok && branchesResult.value.data ? branchesResult.value.data : []));
const lastResult = computed(() => (submitResult.value?.ok ? submitResult.value.data : null));

/**
 * 初始化演示数据。
 */
async function doSeed() {
    const res = await callSeed(() => api.seed(seedForm.userId, seedForm.productId, seedForm.available, seedForm.balance));
    if (res.ok) {
        ElMessage.success('库存与账户已初始化');
    }
}

/**
 * 提交一笔分布式订单。
 */
async function doSubmit() {
    const res = await callSubmit(() => api.submit({ ...orderForm }));
    if (res.ok && res.data) {
        xid.value = res.data.xid;
        ElMessage[res.data.committed ? 'success' : 'warning'](res.data.message);
        await loadTx();
    }
}

/**
 * 拉取事务状态与分支。
 */
async function loadTx() {
    if (!xid.value) {
        return;
    }
    await Promise.all([callStatus(() => api.status(xid.value)), callBranches(() => api.branches(xid.value))]);
}

/**
 * 手工恢复停留在中间状态的事务。
 */
async function doRecover() {
    const res = await callRecover(api.recover);
    if (res.ok) {
        ElMessage.success(`已恢复 ${res.data} 笔事务`);
        await loadTx();
    }
}

/**
 * 把状态 Map 摊平成可遍历的条目。
 */
const statusEntries = computed(() => {
    const data = statusResult.value?.ok ? statusResult.value.data : null;
    return data ? Object.entries(data) : [];
});
</script>

<template>
    <div>
        <SectionHead
            title="TCC 分布式事务"
            desc="Try 预留资源，Confirm 或 Cancel 二选一落地。强制失败开关用来验证回滚链路真的被写过，而不是只在成功路径上自洽。"
        >
            <template #actions>
                <el-button size="small" type="warning" :icon="RefreshRight" @click="doRecover()">手工恢复</el-button>
            </template>
        </SectionHead>

        <div class="lab-grid lab-grid--3">
            <StatCard label="最近事务 xid" :value="xid || '-'" hint="提交后自动生成" />
            <StatCard
                label="提交结果"
                :value="lastResult ? (lastResult.committed ? '已提交' : '已回滚') : '-'"
                :tone="lastResult ? (lastResult.committed ? 'good' : 'warn') : 'plain'"
                :hint="lastResult?.message ?? ''"
            />
            <StatCard label="分支数" :value="branches.length" hint="一次事务包含多个分支" />
        </div>

        <div class="lab-grid lab-grid--2">
            <div class="lab-card">
                <div class="lab-card__title">初始化数据</div>
                <div class="lab-card__desc">seed 会同时准备库存与账户，缺了它提交会直接失败。</div>
                <el-form size="small" label-width="86px">
                    <div class="lab-grid lab-grid--2">
                        <el-form-item label="用户 id">
                            <el-input-number v-model="seedForm.userId" :min="1" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="商品 id">
                            <el-input-number v-model="seedForm.productId" :min="1" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="库存">
                            <el-input-number v-model="seedForm.available" :min="0" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="余额(分)">
                            <el-input-number v-model="seedForm.balance" :min="0" controls-position="right" />
                        </el-form-item>
                    </div>
                    <el-button type="primary" size="small" @click="doSeed">初始化</el-button>
                </el-form>
                <ResultView :result="seedResult" title="初始化结果" :max-height="120" style="margin-top: 10px" />
            </div>

            <div class="lab-card">
                <div class="lab-card__title">提交分布式订单</div>
                <div class="lab-card__desc">
                    勾选「强制失败」会在 Confirm 阶段制造一次故障，用于验证 Cancel 分支把预扣的资源还回去。
                </div>
                <el-form size="small" label-width="86px">
                    <div class="lab-grid lab-grid--2">
                        <el-form-item label="用户 id">
                            <el-input-number v-model="orderForm.userId" :min="1" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="商品 id">
                            <el-input-number v-model="orderForm.productId" :min="1" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="数量">
                            <el-input-number v-model="orderForm.quantity" :min="1" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="强制失败">
                            <el-switch v-model="orderForm.forceFailure" />
                        </el-form-item>
                    </div>
                    <el-button type="primary" size="small" @click="doSubmit">提交订单</el-button>
                </el-form>
                <ResultView :result="submitResult" title="提交结果" :max-height="180" style="margin-top: 10px" />
            </div>
        </div>

        <div class="lab-grid lab-grid--2">
            <div class="lab-card">
                <div class="lab-card__title">事务状态</div>
                <div class="lab-row">
                    <el-input v-model="xid" placeholder="事务 xid" style="width: 260px" clearable />
                    <el-button size="small" :icon="RefreshRight" @click="loadTx()">刷新</el-button>
                </div>
                <el-descriptions v-if="statusEntries.length > 0" :column="1" border size="small" style="margin-top: 12px">
                    <el-descriptions-item v-for="[key, value] in statusEntries" :key="key" :label="String(key)">
                        {{ value }}
                    </el-descriptions-item>
                </el-descriptions>
                <div v-else class="lab-hint">填 xid 后点刷新</div>
            </div>

            <div class="lab-card">
                <div class="lab-card__title">分支记录</div>
                <div class="lab-card__desc">每个分支独立记录 Try / Confirm / Cancel 的状态，恢复时按分支逐个推进。</div>
                <el-table :data="branches" border stripe size="small" max-height="300">
                    <el-table-column prop="branchId" label="分支" min-width="140" show-overflow-tooltip />
                    <el-table-column prop="status" label="状态" width="120">
                        <template #default="{ row }">
                            <el-tag
                                :type="row.status === 'CONFIRMED' ? 'success' : row.status === 'CANCELLED' ? 'danger' : 'warning'"
                                size="small"
                            >
                                {{ row.status }}
                            </el-tag>
                        </template>
                    </el-table-column>
                    <el-table-column prop="retryCount" label="重试" width="80" />
                    <el-table-column prop="errorMessage" label="错误信息" min-width="160" show-overflow-tooltip />
                </el-table>
            </div>
        </div>

        <div class="lab-card">
            <div class="lab-card__title">手工恢复</div>
            <div class="lab-card__desc">停留在 TRYING / CONFIRMING / CANCELLING 的事务不会自己走下去，靠这里触发重试。</div>
            <el-button type="warning" size="small" @click="doRecover()">执行恢复</el-button>
            <ResultView :result="recoverResult" title="恢复条数" :max-height="160" style="margin-top: 10px" />
        </div>
    </div>
</template>
