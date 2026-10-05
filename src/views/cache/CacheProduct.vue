<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Delete, Plus, RefreshRight } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/cache';
import type { CacheStatsSnapshot, ProductResponse, ProductSaveRequest } from '@/api/types';
import { categoryMeta } from '@/utils/scene';
import { money } from '@/utils/format';

/**
 * 商品详情 + 缓存链路。
 *
 * <p>多级缓存最反直觉的地方是「同样一次查询，结果一样但代价完全不同」。
 * 所以这一页不猜命中了哪一层，而是**在读取前后各取一次统计快照做差**：
 * l1Hit 涨了就是 L1 命中，l2Hit 涨了就是 L2 命中，miss 涨了就是回源打到了数据库。
 * 这样展示出来的链路是可证的，不是靠注释吹的。
 */

/** 一次读取的实测结果。 */
interface ReadTrace {
    id: number;
    layer: string;
    layerTone: 'l1' | 'l2' | 'db' | 'stale';
    elapsed: number;
    guarded: boolean;
    at: string;
}

const list = ref<ProductResponse[]>([]);
const listLoading = ref(false);
const page = reactive({ pageNum: 1, pageSize: 10, total: 0 });
const selected = ref<ProductResponse | null>(null);
const traces = ref<ReadTrace[]>([]);

const { loading: readLoading, result: readResult, call: callRead } = useApi<ProductResponse>();
const { loading: saveLoading, call: callSave } = useApi<unknown>();
const { call: callInvalidate } = useApi<null>();

const form = reactive<ProductSaveRequest>({
    name: '',
    category: '',
    price: 0,
    stock: 0,
    longitude: 0,
    latitude: 0,
    description: '',
});
const editingId = ref<number | null>(null);

/**
 * 上一份统计快照，用于和读取后的快照做差。
 */
let baseline: CacheStatsSnapshot | null = null;

/**
 * 取一次统计快照。
 */
async function snapshot(): Promise<CacheStatsSnapshot | null> {
    const res = await api.cacheStats();
    return res.ok ? res.data : null;
}

/**
 * 加载商品列表。列表接口有意绕过缓存。
 */
async function loadList() {
    listLoading.value = true;
    try {
        const res = await api.pageProducts({ pageNum: page.pageNum, pageSize: page.pageSize });
        list.value = res.ok && res.data ? res.data.list : [];
        page.total = res.ok && res.data ? res.data.total : 0;
    } finally {
        listLoading.value = false;
    }
}

/**
 * 读一次商品，并用统计差判断命中了哪一层。
 *
 * @param id 商品 id
 * @param guarded 是否走布隆过滤器版本
 */
async function readOne(id: number, guarded = false) {
    const before = await snapshot();
    const res = await callRead(() => (guarded ? api.productByIdGuarded(id) : api.productById(id)));
    const after = await snapshot();
    if (res.ok && res.data) {
        selected.value = res.data;
    }
    if (before && after) {
        traces.value.unshift({
            id,
            layer: layerOf(before, after, res.ok && Boolean(res.data?.stale)),
            layerTone: toneOf(before, after, res.ok && Boolean(res.data?.stale)),
            elapsed: res.elapsed,
            guarded,
            at: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        });
        traces.value = traces.value.slice(0, 12);
    }
}

/**
 * 用两次快照的差值判断命中层级。
 *
 * @param before 读之前
 * @param after 读之后
 * @param stale 是否返回了旧值
 */
function layerOf(before: CacheStatsSnapshot, after: CacheStatsSnapshot, stale: boolean): string {
    if (stale && after.staleServed > before.staleServed) {
        return '旧值兜底';
    }
    if (after.l1Hit > before.l1Hit) {
        return 'L1 命中';
    }
    if (after.l2Hit > before.l2Hit) {
        return 'L2 命中';
    }
    if (after.miss > before.miss) {
        return '回源数据库';
    }
    if (after.penetrationBlocked > before.penetrationBlocked) {
        return '布隆拦截';
    }
    return '无变化';
}

/**
 * 层级对应的配色。
 *
 * @param before 读之前
 * @param after 读之后
 * @param stale 是否旧值
 */
function toneOf(before: CacheStatsSnapshot, after: CacheStatsSnapshot, stale: boolean): ReadTrace['layerTone'] {
    if (stale && after.staleServed > before.staleServed) {
        return 'stale';
    }
    if (after.l1Hit > before.l1Hit) {
        return 'l1';
    }
    if (after.l2Hit > before.l2Hit) {
        return 'l2';
    }
    return 'db';
}

/**
 * 选中商品。
 *
 * @param row 商品
 */
function pick(row: ProductResponse) {
    selected.value = row;
}

/**
 * 删除这条商品的缓存。
 */
async function invalidate() {
    if (!selected.value) {
        return;
    }
    await callInvalidate(() => api.invalidate(String(selected.value?.id ?? 0)));
    ElMessage.success('缓存已删除并广播失效，下一次读会回源');
    traces.value = [];
}

/**
 * 把商品填进编辑表单。
 *
 * @param row 商品
 */
function toEdit(row: ProductResponse) {
    editingId.value = row.id;
    form.name = row.name;
    form.category = row.category;
    form.price = row.price;
    form.stock = row.stock;
    form.description = '';
}

/**
 * 切回新增模式。
 */
function toCreate() {
    editingId.value = null;
    Object.assign(form, { name: '', category: '', price: 0, stock: 0, longitude: 0, latitude: 0, description: '' });
}

/**
 * 提交新增或更新。
 */
async function submit() {
    const res =
        editingId.value === null
            ? await callSave(() => api.createProduct(form))
            : await callSave(() => api.updateProduct(editingId.value as number, form));
    if (res.ok) {
        ElMessage.success(editingId.value === null ? '商品已创建' : '商品已更新，缓存已失效');
        await loadList();
    }
}

/**
 * 删除商品。
 *
 * @param row 商品
 */
async function remove(row: ProductResponse) {
    await ElMessageBox.confirm(`确认删除「${row.name}」？`, '删除确认', { type: 'warning' });
    const res = await callSave(() => api.deleteProduct(row.id));
    if (res.ok) {
        ElMessage.success('已删除');
        await loadList();
    }
}

const metaOf = computed(() => (selected.value ? categoryMeta(selected.value.category) : null));

onMounted(() => {
    void loadList();
    void snapshot().then((value) => {
        baseline = value;
    });
});
</script>

<template>
    <div class="pc">
        <SectionHead
            title="商品与多级缓存"
            desc="同样的查询，结果一样但代价可能差两个数量级。右侧的链路不是猜的，是读取前后各取一次统计快照做差算出来的。"
        >
            <template #actions>
                <el-button size="small" :icon="RefreshRight" @click="loadList()">刷新列表</el-button>
            </template>
        </SectionHead>

        <div class="pc__body">
            <div class="pc__list">
                <el-table
                    v-loading="listLoading"
                    :data="list"
                    border
                    stripe
                    size="small"
                    max-height="520"
                    highlight-current-row
                    @row-click="pick"
                >
                    <el-table-column prop="id" label="id" width="70" />
                    <el-table-column prop="name" label="商品" min-width="180" show-overflow-tooltip />
                    <el-table-column prop="category" label="分类" width="110" />
                    <el-table-column label="价格" width="100">
                        <template #default="{ row }">{{ money(row.price) }}</template>
                    </el-table-column>
                    <el-table-column prop="stock" label="库存" width="80" />
                </el-table>
                <el-pagination
                    v-model:current-page="page.pageNum"
                    v-model:page-size="page.pageSize"
                    :total="page.total"
                    :page-sizes="[10, 20, 50]"
                    small
                    background
                    layout="total, sizes, prev, pager, next"
                    style="margin-top: 10px"
                    @current-change="loadList"
                    @size-change="loadList"
                />
            </div>

            <div class="pc__detail">
                <div v-if="selected" class="pc__card">
                    <div class="pc__card-img" :style="{ background: metaOf?.gradient }">
                        <span>{{ metaOf?.icon }}</span>
                    </div>
                    <div class="pc__card-body">
                        <div class="pc__card-title">
                            {{ selected.name }}
                            <el-tag v-if="selected.stale" size="small" type="warning" effect="dark">旧值兜底</el-tag>
                        </div>
                        <div class="pc__card-meta">
                            {{ selected.category }} · 库存 {{ selected.stock }} · {{ selected.status }}
                        </div>
                        <div class="pc__card-price">
                            <span>¥</span>{{ money(selected.price) }}
                        </div>
                        <div class="lab-row" style="margin-top: 10px">
                            <el-button type="primary" size="small" :loading="readLoading" @click="readOne(selected.id)">
                                读一次（走缓存）
                            </el-button>
                            <el-button size="small" @click="readOne(selected.id, true)">读一次（布隆）</el-button>
                            <el-button size="small" :icon="Delete" @click="invalidate">删缓存</el-button>
                            <el-button size="small" @click="toEdit(selected)">编辑</el-button>
                            <el-button size="small" type="danger" @click="remove(selected)">删除</el-button>
                        </div>
                    </div>
                </div>
                <div v-else class="pc__placeholder">
                    在左边点一行商品，看它这次读命中了哪一层
                </div>

                <div class="pc__trace">
                    <div class="pc__trace-title">最近读取链路</div>
                    <div class="pc__flow">
                        <div class="pc__flow-node" :class="{ 'is-on': traces[0]?.layerTone === 'l1' }">L1<br />进程内</div>
                        <span>›</span>
                        <div class="pc__flow-node" :class="{ 'is-on': traces[0]?.layerTone === 'l2' }">L2<br />Redis</div>
                        <span>›</span>
                        <div class="pc__flow-node" :class="{ 'is-on': traces[0]?.layerTone === 'db' }">回源<br />MySQL</div>
                    </div>
                    <el-timeline v-if="traces.length > 0" class="pc__timeline">
                        <el-timeline-item
                            v-for="(trace, index) in traces"
                            :key="index"
                            :type="trace.layerTone === 'db' || trace.layerTone === 'stale' ? 'warning' : 'success'"
                            :timestamp="trace.at"
                        >
                            #{{ trace.id }}{{ trace.guarded ? '（布隆）' : '' }} ·
                            <b :class="`pc__layer pc__layer--${trace.layerTone}`">{{ trace.layer }}</b>
                            · {{ trace.elapsed }} ms
                        </el-timeline-item>
                    </el-timeline>
                    <div v-else class="lab-hint">还没有读取记录</div>
                </div>
            </div>
        </div>

        <el-collapse class="pc__editor">
            <el-collapse-item :title="editingId === null ? '新增商品' : `编辑商品 #${editingId}`" name="edit">
                <el-form size="small" label-width="86px">
                    <div class="lab-grid lab-grid--3">
                        <el-form-item label="商品名">
                            <el-input v-model="form.name" maxlength="128" />
                        </el-form-item>
                        <el-form-item label="分类">
                            <el-input v-model="form.category" maxlength="128" />
                        </el-form-item>
                        <el-form-item label="价格">
                            <el-input-number v-model="form.price" :min="0" :precision="2" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="库存">
                            <el-input-number v-model="form.stock" :min="0" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="经度">
                            <el-input-number v-model="form.longitude" :precision="6" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="纬度">
                            <el-input-number v-model="form.latitude" :precision="6" controls-position="right" />
                        </el-form-item>
                    </div>
                    <el-form-item label="描述">
                        <el-input v-model="form.description" type="textarea" :rows="2" maxlength="4096" />
                    </el-form-item>
                    <div class="lab-row">
                        <el-button type="primary" size="small" :icon="Plus" :loading="saveLoading" @click="submit">提交</el-button>
                        <el-button v-if="editingId !== null" size="small" @click="toCreate">切回新增</el-button>
                    </div>
                </el-form>
            </el-collapse-item>
        </el-collapse>
    </div>
</template>

<style scoped>
.pc__body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 400px;
    gap: 14px;
    align-items: start;
}

.pc__list {
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    padding: 12px 14px;
}

.pc__detail {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.pc__card {
    display: flex;
    gap: 12px;
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    padding: 14px;
}

.pc__card-img {
    width: 92px;
    height: 92px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 38px;
    flex: 0 0 92px;
}

.pc__card-body {
    flex: 1;
    min-width: 0;
}

.pc__card-title {
    font-size: 15px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
}

.pc__card-meta {
    font-size: 12px;
    color: var(--lab-muted);
    margin: 4px 0 6px;
}

.pc__card-price {
    color: #e1251b;
    font-size: 22px;
    font-weight: 700;
}

.pc__card-price span {
    font-size: 13px;
}

.pc__placeholder {
    background: #fff;
    border: 1px dashed var(--lab-border);
    border-radius: var(--lab-radius);
    padding: 48px 20px;
    text-align: center;
    color: var(--lab-muted);
}

.pc__trace {
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    padding: 14px;
}

.pc__trace-title {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 10px;
}

.pc__flow {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
}

.pc__flow-node {
    flex: 1;
    text-align: center;
    padding: 8px 4px;
    border-radius: 8px;
    background: #f4f6fa;
    color: var(--lab-muted);
    font-size: 12px;
    line-height: 1.4;
    border: 1px solid transparent;
}

.pc__flow-node.is-on {
    background: var(--lab-primary-soft);
    color: #3d6ff5;
    border-color: #b9cdf7;
    font-weight: 600;
}

.pc__timeline {
    padding-left: 4px;
    max-height: 240px;
    overflow: auto;
}

.pc__layer--l1 {
    color: #3d6ff5;
}

.pc__layer--l2 {
    color: #0ea5a5;
}

.pc__layer--db {
    color: #d98900;
}

.pc__layer--stale {
    color: #dc4a4a;
}

.pc__editor {
    margin-top: 14px;
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    overflow: hidden;
}

@media (max-width: 1200px) {
    .pc__body {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
