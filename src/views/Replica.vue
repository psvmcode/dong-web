<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { RefreshRight } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import StatCard from '@/components/StatCard.vue';
import ResultView from '@/components/ResultView.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/replica';
import type { UserAccount } from '@/api/types';
import { thousand } from '@/utils/format';

/**
 * 第二数据源（MariaDB）。
 *
 * <p>多数据源的真正难点不是配两个 DataSource，而是分清「哪些写能在同一个本地事务里」
 * 与「读会不会看到旧值」。这一页把这两件事分别做成了转账与连读两次。
 */

const createForm = reactive({ userId: 1, username: '张三', balance: 100000 });
const transferForm = reactive({ fromUserId: 1, toUserId: 2, amount: 1000 });
const queryUserId = ref(1);

const { result: accountsResult, call: callAccounts } = useApi<UserAccount[]>();
const { result: detailResult, call: callDetail } = useApi<UserAccount>();
const { result: createResult, call: callCreate } = useApi<number>();
const { result: transferResult, call: callTransfer } = useApi<number>();
const { result: consistencyResult, call: callConsistency } = useApi<Record<string, unknown>>();

const accounts = computed<UserAccount[]>(() => (accountsResult.value?.ok && accountsResult.value.data ? accountsResult.value.data : []));

/**
 * 加载账户列表。
 */
function loadAccounts() {
    void callAccounts(api.all);
}

/**
 * 创建账户。
 */
async function create() {
    const res = await callCreate(() => api.create(createForm.userId, createForm.username, createForm.balance));
    if (res.ok) {
        ElMessage.success('账户已创建');
        loadAccounts();
    }
}

/**
 * 转账。两个账户在同一个本地事务里完成，不存在中间态。
 */
async function transfer() {
    const res = await callTransfer(() =>
        api.transfer(transferForm.fromUserId, transferForm.toUserId, transferForm.amount),
    );
    if (res.ok) {
        ElMessage.success('转账完成');
        loadAccounts();
    }
}

/**
 * 连读两次，观察是否有复制延迟。
 */
function checkConsistency() {
    void callConsistency(() => api.consistency(queryUserId.value));
}

/**
 * 按用户 id 查询。
 */
function loadDetail() {
    void callDetail(() => api.detail(queryUserId.value));
}

onMounted(loadAccounts);
</script>

<template>
    <div>
        <SectionHead
            title="多数据源"
            desc="MariaDB 是第二个数据源。能在同一本地事务里完成的写才安全；跨数据源的一致性则由连读两次这种笨办法来暴露。"
        >
            <template #actions>
                <el-button size="small" :icon="RefreshRight" @click="loadAccounts()">刷新账户</el-button>
            </template>
        </SectionHead>

        <div class="lab-grid lab-grid--3">
            <StatCard label="账户数" :value="accounts.length" tone="accent" hint="第二数据源" />
            <StatCard
                label="余额总和"
                :value="thousand(accounts.reduce((sum, item) => sum + item.balance, 0))"
                hint="转账前后应当不变"
            />
            <StatCard label="查询目标 userId" :value="queryUserId" hint="详情与一致性读取都用它" />
        </div>

        <div class="lab-grid lab-grid--2">
            <div class="lab-card">
                <div class="lab-card__title">创建账户</div>
                <div class="lab-card__desc">写入第二数据源。userId 重复会失败，先创建 1、2 两个用户才能做转账。</div>
                <el-form size="small" label-width="86px">
                    <el-form-item label="userId">
                        <el-input-number v-model="createForm.userId" :min="1" controls-position="right" />
                    </el-form-item>
                    <el-form-item label="用户名">
                        <el-input v-model="createForm.username" maxlength="128" />
                    </el-form-item>
                    <el-form-item label="初始余额">
                        <el-input-number v-model="createForm.balance" :min="0" controls-position="right" />
                    </el-form-item>
                    <el-button type="primary" size="small" @click="create">创建</el-button>
                </el-form>
                <ResultView :result="createResult" title="创建结果" :max-height="120" style="margin-top: 10px" />
            </div>

            <div class="lab-card">
                <div class="lab-card__title">转账</div>
                <div class="lab-card__desc">扣加在单个本地事务里完成，不存在「已经扣了但没加上」的中间态。</div>
                <el-form size="small" label-width="96px">
                    <div class="lab-grid lab-grid--2">
                        <el-form-item label="付款 userId">
                            <el-input-number v-model="transferForm.fromUserId" :min="1" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="收款 userId">
                            <el-input-number v-model="transferForm.toUserId" :min="1" controls-position="right" />
                        </el-form-item>
                    </div>
                    <el-form-item label="金额(分)">
                        <el-input-number v-model="transferForm.amount" :min="1" controls-position="right" />
                    </el-form-item>
                    <el-button type="primary" size="small" @click="transfer">转账</el-button>
                </el-form>
                <ResultView :result="transferResult" title="转账结果" :max-height="120" style="margin-top: 10px" />
            </div>
        </div>

        <div class="lab-card">
            <div class="lab-card__title">账户列表</div>
            <el-table :data="accounts" border stripe size="small" max-height="320">
                <el-table-column prop="id" label="id" width="80" />
                <el-table-column label="userId" width="100">
                    <template #default="{ row }">
                        <el-link type="primary" @click="queryUserId = row.userId; loadDetail()">{{ row.userId }}</el-link>
                    </template>
                </el-table-column>
                <el-table-column prop="username" label="用户名" min-width="140" />
                <el-table-column label="余额" min-width="130">
                    <template #default="{ row }">{{ thousand(row.balance) }}</template>
                </el-table-column>
                <el-table-column prop="updateTime" label="更新时间" min-width="170" />
            </el-table>
        </div>

        <div class="lab-grid lab-grid--2">
            <div class="lab-card">
                <div class="lab-card__title">连读两次看延迟</div>
                <div class="lab-card__desc">两次读取间隔内如果有其它写操作，第二次可能读到不同的值——这就是复制延迟最直接的表现。</div>
                <div class="lab-row">
                    <el-input-number v-model="queryUserId" :min="1" size="small" controls-position="right" />
                    <el-button size="small" type="primary" @click="checkConsistency">一致性读取</el-button>
                    <el-button size="small" @click="loadDetail">查详情</el-button>
                </div>
                <ResultView :result="consistencyResult" title="两次读取对比" :max-height="220" style="margin-top: 10px" />
            </div>
            <div class="lab-card">
                <div class="lab-card__title">账户详情</div>
                <ResultView :result="detailResult" :max-height="260" />
            </div>
        </div>
    </div>
</template>
