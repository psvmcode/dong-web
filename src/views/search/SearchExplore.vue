<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Search } from '@element-plus/icons-vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/search';
import type {
    NearbySearchResponse,
    ProductSearchResponse,
    SearchAggregateResponse,
    SearchHit,
} from '@/api/types';
import { categoryMeta, highlightHtml } from '@/utils/scene';
import { money, thousand } from '@/utils/format';

/**
 * 商品搜索页。
 *
 * <p>这一页刻意做成电商搜索的样子：搜索框带补全、左侧是分类与价格筛选、右侧是商品卡片、
 * 关键词在标题和描述里被染成橙色。做成「能搜到东西的样子」之后，
 * 分词、高亮、分面、排序这些 ES 的能力才变成看得见摸得着的东西，
 * 而不是接口文档里的一行文字。
 */

const keyword = ref('');
const filter = reactive({
    category: '',
    minPrice: undefined as number | undefined,
    maxPrice: undefined as number | undefined,
    includeOffShelf: false,
});
const sort = ref('relevance');
const page = reactive({ pageNum: 1, pageSize: 12 });
const mode = ref<'search' | 'nearby'>('search');
const deepMode = ref(false);
const deepCursor = ref('');

const { loading, result: searchResult, call: callSearch } = useApi<ProductSearchResponse>();
const { result: aggResult, call: callAggregate } = useApi<SearchAggregateResponse>();
const { result: nearbyResult, call: callNearby } = useApi<NearbySearchResponse>();
const { result: deepResult, call: callDeep } = useApi<{ list: SearchHit[]; nextAfter: string; hasMore: boolean }>();
const { loading: syncing, result: syncResult, call: callSync } = useApi<number>();

const nearbyForm = reactive({ lat: 31.2304, lon: 121.4737, radiusKm: 1000, size: 20 });

const rows = computed<SearchHit[]>(() => (searchResult.value?.ok && searchResult.value.data ? searchResult.value.data.list : []));
const total = computed(() => (searchResult.value?.ok && searchResult.value.data ? searchResult.value.data.total : 0));
const facets = computed(() => (searchResult.value?.ok && searchResult.value.data ? searchResult.value.data.categoryFacets ?? {} : {}));
const priceRanges = computed(() => (aggResult.value?.ok ? aggResult.value.data.priceRanges ?? [] : []));
const priceStats = computed(() => (aggResult.value?.ok ? aggResult.value.data.priceStats : null));
const nearbyRows = computed(() => (nearbyResult.value?.ok && nearbyResult.value.data ? nearbyResult.value.data.list : []));

/**
 * 组装检索条件。
 */
function buildBody() {
    return {
        keyword: keyword.value || undefined,
        category: filter.category || undefined,
        minPrice: filter.minPrice,
        maxPrice: filter.maxPrice,
        sort: sort.value,
        includeOffShelf: filter.includeOffShelf,
        pageNum: page.pageNum,
        pageSize: page.pageSize,
    };
}

/**
 * 执行检索，顺带把聚合取回来用于筛选栏的分布图。
 */
function doSearch() {
    void callSearch(() => api.search(buildBody()));
    void callAggregate(() => api.aggregate(buildBody()));
}

/**
 * 搜索框补全。el-autocomplete 要求回调式，把异步结果喂给 cb。
 *
 * @param text 当前输入
 * @param cb 结果回调
 */
function suggest(text: string, cb: (list: { value: string }[]) => void) {
    if (!text) {
        cb([]);
        return;
    }
    void api.suggest(text, 8).then((res) => {
        cb(res.ok && res.data ? res.data.map((item) => ({ value: item })) : []);
    });
}

/**
 * 补全项被选中时直接按它搜索。
 *
 * @param item 补全项
 */
function onSuggestSelect(item: { value: string }): void {
    keyword.value = item.value;
    doSearch();
}

/**
 * 选中某个分类。
 *
 * @param category 分类名
 */
function pickCategory(category: string) {
    filter.category = filter.category === category ? '' : category;
    page.pageNum = 1;
    doSearch();
}

/**
 * 快捷价格区间。
 *
 * @param min 下限
 * @param max 上限
 */
function pickPrice(min: number | undefined, max: number | undefined) {
    filter.minPrice = min;
    filter.maxPrice = max;
    page.pageNum = 1;
    doSearch();
}

/**
 * 排序切换。
 *
 * @param value 排序值
 */
function changeSort(value: string) {
    sort.value = value;
    page.pageNum = 1;
    doSearch();
}

/**
 * 深分页翻页。游标由上一次结果给出，不受 from+size 一万条限制。
 */
async function deepNext() {
    const res = await callDeep(() => api.searchDeep({ sort: sort.value, after: deepCursor.value || undefined, size: 12 }));
    if (res.ok && res.data) {
        deepCursor.value = res.data.nextAfter ?? '';
        if (!res.data.hasMore) {
            ElMessage.info('已经翻到最后了');
        }
    }
}

/**
 * 索引为空时的一键重建。
 */
async function rebuildIndex() {
    const res = await callSync(api.syncAll);
    if (res.ok) {
        ElMessage.success(`已从 MySQL 重建 ${res.data} 条文档`);
        doSearch();
    }
}

/**
 * 地理检索。
 */
function doNearby() {
    void callNearby(() => api.nearby({ lat: nearbyForm.lat, lon: nearbyForm.lon, radiusKm: nearbyForm.radiusKm, size: nearbyForm.size }));
}

const priceRangeMax = computed(() =>
    Math.max(1, ...priceRanges.value.map((item) => item.docCount)),
);

onMounted(() => {
    doSearch();
});
</script>

<template>
    <div class="shop">
        <div class="shop__topbar">
            <div class="shop__logo">
                <span class="shop__logo-mark">dong</span>
                <span class="shop__logo-text">商城</span>
            </div>
            <el-autocomplete
                v-model="keyword"
                :fetch-suggestions="suggest"
                :trigger-on-focus="false"
                placeholder="搜商品，试试「华为」「羽绒服」「大米」"
                class="shop__input"
                size="large"
                clearable
                @select="onSuggestSelect"
                @keyup.enter="doSearch"
            >
                <template #prefix><el-icon><Search /></el-icon></template>
            </el-autocomplete>
            <el-button type="danger" size="large" :loading="loading" @click="doSearch">搜索</el-button>
        </div>

        <el-tabs v-model="mode" class="shop__tabs">
            <el-tab-pane label="商品搜索" name="search">
                <div class="shop__body">
                    <aside class="shop__side">
                        <div class="shop__panel">
                            <div class="shop__panel-title">分类</div>
                            <el-radio-group v-model="filter.category" class="shop__cats" @change="doSearch">
                                <el-radio-button label="" value="">全部</el-radio-button>
                                <el-radio-button
                                    v-for="(count, category) in facets"
                                    :key="String(category)"
                                    :label="String(category)"
                                    :value="String(category)"
                                >
                                    {{ category }} {{ count }}
                                </el-radio-button>
                            </el-radio-group>
                        </div>

                        <div class="shop__panel">
                            <div class="shop__panel-title">价格</div>
                            <div class="shop__prices">
                                <el-button size="small" @click="pickPrice(undefined, 100)">100 以下</el-button>
                                <el-button size="small" @click="pickPrice(100, 500)">100 - 500</el-button>
                                <el-button size="small" @click="pickPrice(500, 2000)">500 - 2000</el-button>
                                <el-button size="small" @click="pickPrice(2000, undefined)">2000 以上</el-button>
                            </div>
                            <div class="shop__price-input">
                                <el-input-number v-model="filter.minPrice" :min="0" :controls="false" size="small" placeholder="最低" />
                                <span>-</span>
                                <el-input-number v-model="filter.maxPrice" :min="0" :controls="false" size="small" placeholder="最高" />
                                <el-button size="small" type="primary" @click="doSearch">确定</el-button>
                            </div>
                            <div v-if="priceStats" class="shop__hint">
                                在售 {{ thousand(priceStats.count) }} 件 · 均价 ¥{{ money(priceStats.avg) }} · 最高 ¥{{ money(priceStats.max) }}
                            </div>
                        </div>

                        <div v-if="priceRanges.length > 0" class="shop__panel">
                            <div class="shop__panel-title">价格分布</div>
                            <div v-for="item in priceRanges" :key="item.key" class="shop__bar">
                                <div class="shop__bar-label">{{ item.key.replace('*-', '≤').replace('-*', '+').replace('-', ' ~ ') }}</div>
                                <div class="shop__bar-track">
                                    <div class="shop__bar-fill" :style="{ width: `${(item.docCount / priceRangeMax) * 100}%` }"></div>
                                </div>
                                <div class="shop__bar-count">{{ item.docCount }}</div>
                            </div>
                        </div>

                        <div class="shop__panel">
                            <div class="shop__panel-title">其它</div>
                            <el-checkbox v-model="filter.includeOffShelf" @change="doSearch">包含已下架商品</el-checkbox>
                        </div>
                    </aside>

                    <main class="shop__main">
                        <div class="shop__sortbar">
                            <div class="shop__sorts">
                                <span :class="{ 'is-on': sort === 'relevance' }" @click="changeSort('relevance')">综合</span>
                                <span :class="{ 'is-on': sort === 'price_asc' }" @click="changeSort('price_asc')">价格 ↑</span>
                                <span :class="{ 'is-on': sort === 'price_desc' }" @click="changeSort('price_desc')">价格 ↓</span>
                                <span :class="{ 'is-on': sort === 'created_desc' }" @click="changeSort('created_desc')">最新</span>
                            </div>
                            <div class="shop__meta">
                                找到 {{ thousand(total) }} 件商品<template v-if="searchResult"> · 用时 {{ searchResult.elapsed }} ms</template>
                            </div>
                            <span class="lab-spacer" />
                            <el-switch v-model="deepMode" size="small" active-text="深分页模式" />
                            <el-button v-if="deepMode" size="small" @click="deepNext">翻下一页（search_after）</el-button>
                            <el-button v-if="deepMode" size="small" text @click="deepCursor = ''">重置游标</el-button>
                        </div>

                        <div v-if="deepMode && deepResult?.ok" class="shop__deep-tip">
                            深分页用游标翻页，不受 from + size 的一万条上限限制。当前游标：{{ deepCursor || '空' }}
                        </div>

                        <el-skeleton :loading="loading" animated :count="3" style="margin-top: 8px">
                            <template #template>
                                <div class="shop__grid">
                                    <div v-for="i in 6" :key="i" class="shop__card">
                                        <el-skeleton-item variant="image" style="height: 160px" />
                                        <el-skeleton-item variant="text" style="margin-top: 10px" />
                                        <el-skeleton-item variant="text" style="width: 60%" />
                                    </div>
                                </div>
                            </template>
                            <template #default>
                                <div v-if="rows.length > 0" class="shop__grid">
                                    <article v-for="hit in rows" :key="hit.id" class="shop__card">
                                        <div
                                            class="shop__card-img"
                                            :style="{ background: categoryMeta(hit.category).gradient }"
                                        >
                                            <span>{{ categoryMeta(hit.category).icon }}</span>
                                        </div>
                                        <div class="shop__card-body">
                                            <h3 class="shop__card-title" v-html="highlightHtml(hit.highlight, hit.name)"></h3>
                                            <p class="shop__card-desc" v-html="highlightHtml(hit.descriptionHighlight, '')"></p>
                                            <div class="shop__card-tags">
                                                <el-tag size="small" effect="plain">{{ hit.category }}</el-tag>
                                                <el-tag size="small" effect="plain" type="info">库存 {{ hit.stock }}</el-tag>
                                            </div>
                                            <div class="shop__card-price">
                                                <span class="shop__price-symbol">¥</span>
                                                <span class="shop__price-value">{{ money(hit.price) }}</span>
                                            </div>
                                        </div>
                                    </article>
                                </div>
                                <div v-else class="shop__empty">
                                    <div class="shop__empty-icon">🔍</div>
                                    <div class="shop__empty-title">没有找到商品</div>
                                    <div class="shop__empty-desc">
                                        索引里可能还没有数据。ES 只是可丢弃的检索视图，从 MySQL 重建一次就行。
                                    </div>
                                    <el-button type="primary" :loading="syncing" @click="rebuildIndex">从 MySQL 重建索引</el-button>
                                    <div v-if="syncResult?.ok" class="shop__hint">已同步 {{ syncResult.data }} 条</div>
                                </div>
                            </template>
                        </el-skeleton>

                        <div v-if="!deepMode && total > page.pageSize" class="shop__pager">
                            <el-pagination
                                v-model:current-page="page.pageNum"
                                v-model:page-size="page.pageSize"
                                :total="total"
                                :page-sizes="[12, 24, 48]"
                                layout="total, sizes, prev, pager, next"
                                background
                                @current-change="doSearch"
                                @size-change="doSearch"
                            />
                        </div>
                    </main>
                </div>
            </el-tab-pane>

            <el-tab-pane label="附近商品" name="nearby">
                <div class="shop__nearby">
                    <el-form size="small" inline>
                        <el-form-item label="纬度">
                            <el-input-number v-model="nearbyForm.lat" :precision="4" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="经度">
                            <el-input-number v-model="nearbyForm.lon" :precision="4" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="半径 km">
                            <el-input-number v-model="nearbyForm.radiusKm" :min="1" controls-position="right" />
                        </el-form-item>
                        <el-form-item>
                            <el-button type="primary" @click="doNearby">看看附近</el-button>
                        </el-form-item>
                    </el-form>
                    <div class="shop__grid">
                        <article v-for="hit in nearbyRows" :key="hit.id" class="shop__card">
                            <div class="shop__card-img" :style="{ background: categoryMeta(hit.category).gradient }">
                                <span>{{ categoryMeta(hit.category).icon }}</span>
                            </div>
                            <div class="shop__card-body">
                                <h3 class="shop__card-title">{{ hit.name }}</h3>
                                <div class="shop__card-tags">
                                    <el-tag size="small" effect="plain">{{ hit.category }}</el-tag>
                                    <el-tag size="small" effect="plain" type="warning">{{ hit.distanceKm.toFixed(1) }} km</el-tag>
                                </div>
                                <div class="shop__card-price">
                                    <span class="shop__price-symbol">¥</span>
                                    <span class="shop__price-value">{{ money(hit.price) }}</span>
                                </div>
                            </div>
                        </article>
                    </div>
                    <div v-if="nearbyRows.length === 0" class="shop__empty">
                        <div class="shop__empty-title">点「看看附近」按距离找商品</div>
                    </div>
                </div>
            </el-tab-pane>
        </el-tabs>
    </div>
</template>

<style scoped>
.shop {
    background: #fff;
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    overflow: hidden;
}

.shop__topbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 18px 24px;
    border-bottom: 1px solid var(--lab-border);
}

.shop__logo {
    display: flex;
    align-items: baseline;
    gap: 4px;
}

.shop__logo-mark {
    font-size: 20px;
    font-weight: 700;
    color: #e1251b;
    letter-spacing: -0.5px;
}

.shop__logo-text {
    font-size: 14px;
    color: var(--lab-muted);
}

.shop__input {
    flex: 1;
    max-width: 620px;
}

.shop__tabs {
    padding: 0 16px;
}

.shop__body {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    gap: 18px;
    padding: 4px 8px 20px;
}

.shop__side {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.shop__panel {
    border: 1px solid var(--lab-border);
    border-radius: 10px;
    padding: 12px;
}

.shop__panel-title {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 10px;
}

.shop__cats {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.shop__cats :deep(.el-radio-button__inner) {
    width: 100%;
    border-left: 1px solid var(--el-border-color);
    border-radius: 6px !important;
    text-align: left;
    justify-content: flex-start;
}

.shop__prices {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
}

.shop__price-input {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 10px;
}

.shop__price-input :deep(.el-input-number) {
    width: 78px;
}

.shop__hint {
    margin-top: 8px;
    font-size: 12px;
    color: var(--lab-muted);
    line-height: 1.6;
}

.shop__bar {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
    font-size: 12px;
}

.shop__bar-label {
    width: 92px;
    color: var(--lab-muted);
}

.shop__bar-track {
    flex: 1;
    height: 8px;
    background: #f0f2f6;
    border-radius: 4px;
    overflow: hidden;
}

.shop__bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #ffb199, #ff0844);
    border-radius: 4px;
}

.shop__bar-count {
    width: 34px;
    text-align: right;
    color: var(--lab-muted);
}

.shop__sortbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    background: #fafbfd;
    border: 1px solid var(--lab-border);
    border-radius: 10px;
    margin-bottom: 12px;
    flex-wrap: wrap;
}

.shop__sorts {
    display: flex;
    gap: 4px;
}

.shop__sorts span {
    padding: 5px 14px;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    color: #4e5969;
}

.shop__sorts span:hover {
    background: #eef1f6;
}

.shop__sorts .is-on {
    background: #e1251b;
    color: #fff;
}

.shop__meta {
    font-size: 12px;
    color: var(--lab-muted);
}

.shop__deep-tip {
    padding: 8px 12px;
    margin-bottom: 12px;
    font-size: 12px;
    color: #b26a00;
    background: #fff7e8;
    border: 1px solid #ffe0a3;
    border-radius: 8px;
}

.shop__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 14px;
}

.shop__card {
    border: 1px solid var(--lab-border);
    border-radius: 10px;
    overflow: hidden;
    background: #fff;
    transition: box-shadow 0.16s ease, transform 0.16s ease;
}

.shop__card:hover {
    transform: translateY(-2px);
    box-shadow: var(--lab-shadow-hover);
}

.shop__card-img {
    height: 160px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 46px;
}

.shop__card-body {
    padding: 10px 12px 14px;
}

.shop__card-title {
    margin: 0 0 6px;
    font-size: 14px;
    font-weight: 500;
    line-height: 1.45;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.shop__card-title :deep(em) {
    color: #e1251b;
    font-style: normal;
    font-weight: 600;
}

.shop__card-desc {
    margin: 0 0 8px;
    font-size: 12px;
    color: var(--lab-muted);
    line-height: 1.55;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.shop__card-desc :deep(em) {
    color: #e1251b;
    font-style: normal;
}

.shop__card-tags {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
    flex-wrap: wrap;
}

.shop__card-price {
    display: flex;
    align-items: baseline;
    color: #e1251b;
}

.shop__price-symbol {
    font-size: 13px;
}

.shop__price-value {
    font-size: 20px;
    font-weight: 600;
}

.shop__empty {
    padding: 60px 20px;
    text-align: center;
}

.shop__empty-icon {
    font-size: 40px;
}

.shop__empty-title {
    margin: 10px 0 6px;
    font-size: 15px;
    font-weight: 600;
}

.shop__empty-desc {
    font-size: 13px;
    color: var(--lab-muted);
    margin-bottom: 14px;
}

.shop__pager {
    margin-top: 18px;
    display: flex;
    justify-content: flex-end;
}

.shop__nearby {
    padding: 12px 8px 20px;
}
</style>
