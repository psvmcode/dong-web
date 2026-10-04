<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Delete, Plus, RefreshRight, Search } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import StatCard from '@/components/StatCard.vue';
import ResultView from '@/components/ResultView.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/cache';
import { cacheStats } from '@/api/cache';
import type { ApiResult } from '@/api/http';
import type { ProductResponse, ProductSaveRequest } from '@/api/types';
import { money } from '@/utils/format';

/**
 * 商品与多级缓存。
 *
 * <p>这一页的重点是「同一条商品来回读，看耗时怎么变」：
 * 第一次回源落 L1，第二次命中本地缓存， elapsed 会肉眼可见地掉下来。
 * guarded 版本多一道布隆过滤，用来对照「不存在的 id 能否在一进就被挡住」。
 */

const list = ref<ProductResponse[]>([]);
const listLoading = ref(false);
const readMode = ref<'all' | 'page'>('page');
const page = reactive({ pageNum: 1, pageSize: 10, total: 0 });

const { loading: readLoading, result: readResult, call: callRead } = useApi<ProductResponse>();
const { loading: saveLoading, call: callSave } = useApi<unknown>();
const history = ref<{ id: number; guarded: boolean; elapsed: number; stale: boolean }[]>([]);

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

const sortableHistory = computed(() => history.value.slice(0, 12));

/**
 * 拉取商品列表。
 */
async function loadList() {
    listLoading.value = true;
    try {
        if (readMode.value === 'all') {
            const res = await api.allProducts();
            list.value = res.ok && res.data ? res.data : [];
            page.total = list.value.length;
        } else {
            const res = await api.pageProducts({ pageNum: page.pageNum, pageSize: page.pageSize });
            list.value = res.ok && res.data ? res.data.list : [];
            page.total = res.ok && res.data ? res.data.total : 0;
        }
    } finally {
        listLoading.value = false;
    }
}

/**
 * 按 id 读一次，记录耗时便于看缓存层级带来的差异。
 *
 * @param id 商品 id
 * @param guarded 是否走布隆过滤器版本
 */
async function readOne(id: number, guarded: boolean) {
    const runner = () => (guarded ? api.productByIdGuarded(id) : api.productById(id));
    const res = await callRead(runner);
    history.value.unshift({
        id,
        guarded,
        elapsed: res.elapsed,
        stale: Boolean(res.ok && res.data && res.data.stale),
    });
    history.value = history.value.slice(0, 40);
}

/**
 * 把当前行填进表单，切换到更新模式。
 *
 * @param row 行数据
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
 * 重置表单为新增模式。
 */
function toCreate() {
    editingId.value = null;
    form.name = '';
    form.category = '';
    form.price = 0;
    form.stock = 0;
    form.longitude = 0;
    form.latitude = 0;
    form.description = '';
}

/**
 * 提交新增或更新。成功后刷新列表。
 */
async function submit() {
    const res: ApiResult<unknown> =
        editingId.value === null
            ? await callSave(() => api.createProduct(form))
            : await callSave(() => api.updateProduct(editingId.value as number, form) as Promise<ApiResult<null>>);
    if (res.ok) {
        ElMessage.success(editingId.value === null ? '商品已创建' : '商品已更新，缓存已失效');
        await loadList();
    }
}

/**
 * 删除商品。
 *
 * @param row 行数据
 */
async function remove(row: ProductResponse) {
    await ElMessageBox.confirm(`确认删除商品「${row.name}」？`, '删除确认', { type: 'warning' });
    const res = await callSave(() => api.deleteProduct(row.id) as Promise<ApiResult<null>>);
    if (res.ok) {
        ElMessage.success('已删除');
        await loadList();
    }
}

const hitRatio = ref<number | null>(null);

/**
 * 顺带取一次命中率，放在页头作为对照。
 */
async function loadStats() {
    const res = await cacheStats();
    hitRatio.value = res.ok ? res.data.hitRatioPercent : null;
}

onMounted(() => {
    void loadList();
    void loadStats();
});
</script>

<template>
    <div>
        <SectionHead
            title="商品与多级缓存"
            desc="写路径是「先更库再失效缓存」，读路径是 L1 → L2 → 回源。同一条商品连续读两次，看耗时历史的变化就知道命中了哪一层。"
        >
            <template #actions>
                <el-radio-group v-model="readMode" size="small" @change="loadList">
                    <el-radio-button value="page">分页（不走缓存）</el-radio-button>
                    <el-radio-button value="all">全量（不走缓存）</el-radio-button>
                </el-radio-group>
                <el-button size="small" :icon="RefreshRight" @click="loadList(); loadStats()">刷新</el-button>
            </template>
        </SectionHead>

        <div class="lab-grid lab-grid--3">
            <StatCard label="商品总数" :value="page.total" hint="来自数据库，绕开缓存" />
            <StatCard label="缓存命中率" :value="hitRatio === null ? '未获取' : `${hitRatio}%`" tone="accent" hint="累计口径" />
            <StatCard label="最近读取次数" :value="history.length" hint="仅统计本页会话内的读操作" />
        </div>

        <div class="lab-card">
            <div class="lab-card__title">商品列表</div>
            <div class="lab-card__desc">
                列表接口有意绕过缓存，避免把「列表查询污染 L1」这种事带到读路径实验里。单条读取才走三级缓存。
            </div>
            <el-table v-loading="listLoading" :data="list" border stripe size="small" max-height="420">
                <el-table-column prop="id" label="id" width="80" />
                <el-table-column prop="name" label="商品名" min-width="160" show-overflow-tooltip />
                <el-table-column prop="category" label="分类" width="120" />
                <el-table-column label="价格" width="100">
                    <template #default="{ row }">{{ money(row.price) }}</template>
                </el-table-column>
                <el-table-column prop="stock" label="库存" width="90" />
                <el-table-column prop="status" label="状态" width="100">
                    <template #default="{ row }">
                        <el-tag :type="row.status === 'ON_SALE' ? 'success' : 'info'" size="small">{{ row.status }}</el-tag>
                    </template>
                </el-table-column>
                <el-table-column label="操作" min-width="280" fixed="right">
                    <template #default="{ row }">
                        <el-button size="small" :icon="Search" @click="readOne(row.id, false)">走缓存读</el-button>
                        <el-button size="small" @click="readOne(row.id, true)">布隆读</el-button>
                        <el-button size="small" @click="toEdit(row)">编辑</el-button>
                        <el-button size="small" type="danger" :icon="Delete" @click="remove(row)">删除</el-button>
                    </template>
                </el-table-column>
            </el-table>
            <div v-if="readMode === 'page'" class="lab-row" style="margin-top: 12px">
                <el-pagination
                    v-model:current-page="page.pageNum"
                    v-model:page-size="page.pageSize"
                    :total="page.total"
                    :page-sizes="[10, 20, 50]"
                    layout="total, sizes, prev, pager, next"
                    small
                    background
                    @current-change="loadList"
                    @size-change="loadList"
                />
            </div>
        </div>

        <div class="lab-grid lab-grid--2">
            <div class="lab-card">
                <div class="lab-card__title">
                    {{ editingId === null ? '新增商品' : `更新商品 #${editingId}` }}
                </div>
                <div class="lab-card__desc">新增会同步写布隆过滤器；更新走「先更库再失效缓存」，不做双写。</div>
                <el-form label-width="88px" size="small">
                    <el-form-item label="商品名">
                        <el-input v-model="form.name" placeholder="如：无线降噪耳机" maxlength="128" />
                    </el-form-item>
                    <el-form-item label="分类">
                        <el-input v-model="form.category" placeholder="如：数码" maxlength="128" />
                    </el-form-item>
                    <div class="lab-grid lab-grid--2">
                        <el-form-item label="价格">
                            <el-input-number v-model="form.price" :min="0" :precision="2" :step="1" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="库存">
                            <el-input-number v-model="form.stock" :min="0" :step="1" controls-position="right" />
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
                        <el-button type="primary" :icon="Plus" :loading="saveLoading" @click="submit">提交</el-button>
                        <el-button v-if="editingId !== null" @click="toCreate">切回新增</el-button>
                    </div>
                </el-form>
            </div>

            <div class="lab-card">
                <div class="lab-card__title">读取结果</div>
                <div class="lab-card__desc">elapsed 是端到端耗时。同一 id 连点几次「走缓存读」，第二次起应该明显更快。</div>
                <ResultView :result="readResult" :loading="readLoading" empty-text="点列表里的「走缓存读」试试" />
                <div v-if="sortableHistory.length > 0" class="lab-row" style="margin-top: 10px">
                    <el-tag
                        v-for="(item, index) in sortableHistory"
                        :key="index"
                        size="small"
                        effect="plain"
                        :type="item.stale ? 'warning' : 'success'"
                        round
                    >
                        #{{ item.id }}{{ item.guarded ? ' 布隆' : '' }} · {{ item.elapsed }}ms{{ item.stale ? ' · 旧值兜底' : '' }}
                    </el-tag>
                </div>
            </div>
        </div>
    </div>
</template>
