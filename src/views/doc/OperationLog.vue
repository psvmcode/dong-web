<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue';
import { ElMessage } from 'element-plus';
import { RefreshRight } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import StatCard from '@/components/StatCard.vue';
import ResultView from '@/components/ResultView.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/doc';
import type { OperationLogDocument } from '@/api/types';
import { parseJson, pretty, uuid } from '@/utils/format';

/**
 * MongoDB 操作日志。
 *
 * <p>日志这类数据天生没有固定 schema：今天记一个字段，明天加两个。
 * 页面因此把 detail 做成自由 JSON 输入，写完就知道它是怎么被原样存进去的。
 */

const form = reactive({
    bizType: 'ORDER',
    bizId: uuid('BIZ').slice(0, 16),
    operator: 'ops-console',
    action: 'CREATE',
    detail: '{"orderNo":"SO-001","amount":1999}',
});

const query = reactive({ pageNum: 1, pageSize: 10, bizType: '' });

const { result: saveResult, call: callSave } = useApi<string>();
const { result: pageResult, call: callPage } = useApi<{ list: OperationLogDocument[]; total: number }>();
const { result: countResult, call: callCount } = useApi<number>();

const rows = computed<OperationLogDocument[]>(() => (pageResult.value?.ok && pageResult.value.data ? pageResult.value.data.list : []));
const total = computed(() => (pageResult.value?.ok && pageResult.value.data ? pageResult.value.data.total : 0));

/**
 * 写入一条日志。
 */
async function save() {
    const detail = parseJson(form.detail);
    if (detail === null) {
        ElMessage.error('detail 必须是合法 JSON');
        return;
    }
    const res = await callSave(() =>
        api.save({
            bizType: form.bizType,
            bizId: form.bizId,
            operator: form.operator,
            action: form.action,
            detail: detail as Record<string, unknown>,
        }),
    );
    if (res.ok) {
        ElMessage.success('日志已写入');
        refresh();
    }
}

/**
 * 刷新列表与总数。
 */
function refresh() {
    void callPage(() => api.page({ pageNum: query.pageNum, pageSize: query.pageSize, bizType: query.bizType || undefined }));
    void callCount(api.count);
}

/**
 * 连写若干条，方便看分页效果。
 */
async function seed() {
    for (let index = 0; index < 5; index += 1) {
        await api.save({
            bizType: form.bizType,
            bizId: `SEED-${Date.now()}-${index}`,
            operator: form.operator,
            action: 'SEED',
            detail: { index, note: '批量写入的示例日志' },
        });
    }
    ElMessage.success('已写入 5 条示例日志');
    refresh();
}

onMounted(refresh);
</script>

<template>
    <div>
        <SectionHead
            title="MongoDB 操作日志"
            desc="无 schema 的代价与收益都在这里：字段随便加，但也没有「这个字段必有」的保证。页面因此把 detail 做成自由 JSON。"
        >
            <template #actions>
                <el-button size="small" :icon="RefreshRight" @click="refresh()">刷新</el-button>
            </template>
        </SectionHead>

        <div class="lab-grid lab-grid--3">
            <StatCard label="日志总条数" :value="countResult?.ok ? countResult.data : '-'" tone="accent" hint="集合内的全部文档" />
            <StatCard label="当前页条数" :value="rows.length" />
            <StatCard label="总记录数（分页）" :value="total" hint="与 filter 条件一致" />
        </div>

        <div class="lab-grid lab-grid--2">
            <div class="lab-card">
                <div class="lab-card__title">写入日志</div>
                <div class="lab-card__desc">detail 可以是任意 JSON 结构，存进去什么样，取出来还是什么样。</div>
                <el-form size="small" label-width="86px">
                    <div class="lab-grid lab-grid--2">
                        <el-form-item label="业务类型">
                            <el-input v-model="form.bizType" maxlength="64" />
                        </el-form-item>
                        <el-form-item label="业务 id">
                            <el-input v-model="form.bizId" maxlength="128" />
                        </el-form-item>
                        <el-form-item label="操作人">
                            <el-input v-model="form.operator" maxlength="64" />
                        </el-form-item>
                        <el-form-item label="动作">
                            <el-input v-model="form.action" maxlength="64" />
                        </el-form-item>
                    </div>
                    <el-form-item label="detail">
                        <el-input v-model="form.detail" type="textarea" :rows="3" />
                    </el-form-item>
                    <div class="lab-row">
                        <el-button type="primary" size="small" @click="save">写入</el-button>
                        <el-button size="small" @click="seed">批量写 5 条</el-button>
                    </div>
                </el-form>
                <ResultView :result="saveResult" title="文档 id" :max-height="120" style="margin-top: 10px" />
            </div>

            <div class="lab-card">
                <div class="lab-card__title">查询条件</div>
                <div class="lab-card__desc">bizType 留空就是全部；填了就只查这一种业务。</div>
                <el-form size="small" label-width="86px">
                    <el-form-item label="业务类型">
                        <el-input v-model="query.bizType" placeholder="留空查全部" clearable />
                    </el-form-item>
                    <div class="lab-grid lab-grid--2">
                        <el-form-item label="页码">
                            <el-input-number v-model="query.pageNum" :min="1" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="每页">
                            <el-input-number v-model="query.pageSize" :min="1" :max="200" controls-position="right" />
                        </el-form-item>
                    </div>
                    <el-button type="primary" size="small" @click="refresh">查询</el-button>
                </el-form>
                <ResultView :result="countResult" title="总数接口" :max-height="120" style="margin-top: 10px" />
            </div>
        </div>

        <div class="lab-card">
            <div class="lab-card__title">日志列表</div>
            <el-table :data="rows" border stripe size="small" max-height="420">
                <el-table-column prop="id" label="文档 id" min-width="200" show-overflow-tooltip />
                <el-table-column prop="bizType" label="业务类型" width="120" />
                <el-table-column prop="bizId" label="业务 id" min-width="160" show-overflow-tooltip />
                <el-table-column prop="action" label="动作" width="110" />
                <el-table-column prop="operator" label="操作人" width="130" />
                <el-table-column label="detail" min-width="240">
                    <template #default="{ row }">
                        <span class="lab-mono">{{ pretty(row.detail) }}</span>
                    </template>
                </el-table-column>
                <el-table-column prop="createTime" label="时间" min-width="170" />
            </el-table>
            <el-pagination
                v-model:current-page="query.pageNum"
                v-model:page-size="query.pageSize"
                :total="total"
                small
                background
                layout="total, prev, pager, next"
                style="margin-top: 10px"
                @current-change="refresh"
                @size-change="refresh"
            />
        </div>
    </div>
</template>
