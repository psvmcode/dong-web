<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Search } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import StatCard from '@/components/StatCard.vue';
import ResultView from '@/components/ResultView.vue';
import EChart from '@/components/EChart.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/search';
import type {
    NearbySearchResponse,
    ProductSearchResponse,
    SearchAggregateResponse,
    SearchHit,
} from '@/api/types';
import { money, thousand } from '@/utils/format';

/**
 * 检索工作台。
 *
 * <p>MySQL 是权威源，ES 只是检索视图，所以这里所有按钮都是安全操作：
 * 查错了重查就是，不会写坏数据。真正会改索引的按钮都放在「一致性与运维」页。
 */

const query = reactive({
    keyword: '',
    category: '',
    minPrice: undefined as number | undefined,
    maxPrice: undefined as number | undefined,
    sort: 'relevance',
    includeOffShelf: false,
    pageNum: 1,
    pageSize: 10,
});

const { loading: searchLoading, result: searchResult, call: callSearch } = useApi<ProductSearchResponse>();
const { result: aggResult, call: callAggregate } = useApi<SearchAggregateResponse>();
const { result: suggestResult, call: callSuggest } = useApi<string[]>();
const { result: nearbyResult, call: callNearby } = useApi<NearbySearchResponse>();
const { result: deepResult, call: callDeep } = useApi<{ list: SearchHit[]; nextAfter: string; hasMore: boolean }>();

const suggestText = ref('');
const nearbyForm = reactive({ lat: 31.23, lon: 121.47, radiusKm: 50, size: 10 });
const deepCursor = ref('');

/**
 * 组装检索请求体，顺手把空字符串清掉。
 */
function buildBody() {
    return {
        keyword: query.keyword || undefined,
        category: query.category || undefined,
        minPrice: query.minPrice,
        maxPrice: query.maxPrice,
        sort: query.sort,
        includeOffShelf: query.includeOffShelf,
        pageNum: query.pageNum,
        pageSize: query.pageSize,
    };
}

/**
 * 执行检索。
 */
function doSearch() {
    void callSearch(() => api.search(buildBody()));
}

/**
 * 执行聚合。
 */
function doAggregate() {
    void callAggregate(() => api.aggregate(buildBody()));
}

/**
 * 点分面标签时把分类填进条件并重新检索。
 *
 * @param category 分类名
 */
function pickFacet(category: string) {
    query.category = query.category === category ? '' : category;
    query.pageNum = 1;
    doSearch();
}

/**
 * 前缀补全。
 */
function doSuggest() {
    void callSuggest(() => api.suggest(suggestText.value, 10));
}

/**
 * 地理检索。
 */
function doNearby() {
    void callNearby(() => api.nearby({ ...nearbyForm }));
}

/**
 * 深分页：首次不带游标，之后用上一次返回的 nextAfter 继续翻。
 */
async function doDeep() {
    const res = await callDeep(() => api.searchDeep({ sort: query.sort, after: deepCursor.value || undefined, size: 5 }));
    if (res.ok && res.data) {
        deepCursor.value = res.data.nextAfter ?? '';
        if (!res.data.hasMore) {
            ElMessage.info('已经翻到最后，没有更多数据了');
        }
    }
}

const rows = computed<SearchHit[]>(() => (searchResult.value?.ok && searchResult.value.data ? searchResult.value.data.list : []));
const total = computed(() => (searchResult.value?.ok && searchResult.value.data ? searchResult.value.data.total : 0));
const facets = computed(() => (searchResult.value?.ok && searchResult.value.data ? searchResult.value.data.categoryFacets ?? {} : {}));

/**
 * 优先用高亮片段渲染，没有高亮时退回原字段。
 *
 * @param highlights 高亮片段数组
 * @param fallback 原始值
 */
function renderHighlight(highlights: string[] | undefined, fallback: string): string {
    const list = highlights ?? [];
    return list.length > 0 ? list.join(' · ') : fallback;
}

const categoryChart = computed(() => {
    const aggregation = aggResult.value?.ok ? aggResult.value.data : null;
    if (!aggregation) {
        return null;
    }
    const entries = Object.entries(aggregation.categoryFacets ?? {});
    return {
        tooltip: { trigger: 'axis' },
        grid: { left: 70, right: 20, top: 24, bottom: 40 },
        xAxis: { type: 'category', data: entries.map(([key]) => key) },
        yAxis: { type: 'value' },
        series: [
            {
                type: 'bar',
                data: entries.map(([, value]) => value),
                itemStyle: { color: '#3d6ff5', borderRadius: [6, 6, 0, 0] },
            },
        ],
    };
});

const monthlyChart = computed(() => {
    const aggregation = aggResult.value?.ok ? aggResult.value.data : null;
    if (!aggregation) {
        return null;
    }
    const buckets = aggregation.monthlyBuckets ?? [];
    return {
        tooltip: { trigger: 'axis' },
        grid: { left: 60, right: 20, top: 24, bottom: 40 },
        xAxis: { type: 'category', data: buckets.map((bucket) => bucket.key) },
        yAxis: { type: 'value' },
        series: [
            {
                type: 'line',
                smooth: true,
                areaStyle: { opacity: 0.18 },
                lineStyle: { color: '#6f8cf7' },
                itemStyle: { color: '#3d6ff5' },
                data: buckets.map((bucket) => bucket.docCount),
            },
        ],
    };
});
</script>

<template>
    <div>
        <SectionHead
            title="检索工作台"
            desc="全文检索、过滤、排序、高亮与分面都在同一个请求里，聚合共用同一份条件，保证两边的过滤口径不会走偏。"
        />

        <div class="lab-card">
            <div class="lab-card__title">检索条件</div>
            <el-form size="small" label-width="72px" inline>
                <el-form-item label="关键词">
                    <el-input v-model="query.keyword" placeholder="支持分词与模糊容错" style="width: 220px" clearable />
                </el-form-item>
                <el-form-item label="分类">
                    <el-input v-model="query.category" placeholder="精确匹配 keyword 字段" style="width: 160px" clearable />
                </el-form-item>
                <el-form-item label="价格区间">
                    <el-input-number v-model="query.minPrice" :min="0" :controls="false" size="small" style="width: 90px" />
                    <span class="lab-muted" style="margin: 0 6px">-</span>
                    <el-input-number v-model="query.maxPrice" :min="0" :controls="false" size="small" style="width: 90px" />
                </el-form-item>
                <el-form-item label="排序">
                    <el-select v-model="query.sort" style="width: 140px">
                        <el-option label="相关性" value="relevance" />
                        <el-option label="价格升序" value="price_asc" />
                        <el-option label="价格降序" value="price_desc" />
                        <el-option label="最新创建" value="created_desc" />
                    </el-select>
                </el-form-item>
                <el-form-item label="含下架">
                    <el-switch v-model="query.includeOffShelf" />
                </el-form-item>
                <el-form-item>
                    <el-button type="primary" :icon="Search" :loading="searchLoading" @click="doSearch">检索</el-button>
                    <el-button @click="doAggregate">同时跑聚合</el-button>
                </el-form-item>
            </el-form>

            <div v-if="Object.keys(facets).length > 0" class="lab-row" style="margin-bottom: 10px">
                <span class="lab-hint">分类分面：</span>
                <el-tag
                    v-for="(count, category) in facets"
                    :key="category"
                    size="small"
                    :type="query.category === category ? 'primary' : 'info'"
                    effect="plain"
                    round
                    style="cursor: pointer"
                    @click="pickFacet(String(category))"
                >
                    {{ category }} · {{ count }}
                </el-tag>
            </div>

            <el-table :data="rows" border stripe size="small" max-height="380" empty-text="没有命中，换个关键词或放开价格区间">
                <el-table-column prop="id" label="id" width="90" />
                <el-table-column label="商品名" min-width="200">
                    <template #default="{ row }">
                        <span v-html="renderHighlight(row.highlight, row.name)"></span>
                    </template>
                </el-table-column>
                <el-table-column label="描述高亮" min-width="240">
                    <template #default="{ row }">
                        <span v-html="renderHighlight(row.descriptionHighlight, '')"></span>
                    </template>
                </el-table-column>
                <el-table-column prop="category" label="分类" width="120" />
                <el-table-column label="价格" width="100">
                    <template #default="{ row }">{{ money(row.price) }}</template>
                </el-table-column>
                <el-table-column prop="stock" label="库存" width="90" />
            </el-table>

            <div class="lab-row" style="margin-top: 12px">
                <span class="lab-hint">共 {{ thousand(total) }} 条</span>
                <span class="lab-spacer" />
                <el-pagination
                    v-model:current-page="query.pageNum"
                    v-model:page-size="query.pageSize"
                    :total="total"
                    :page-sizes="[10, 20, 50]"
                    layout="sizes, prev, pager, next"
                    small
                    background
                    @current-change="doSearch"
                    @size-change="doSearch"
                />
            </div>
        </div>

        <div class="lab-grid lab-grid--2">
            <div class="lab-card">
                <div class="lab-card__title">深分页（search_after）</div>
                <div class="lab-card__desc">
                    from + size 超过一万条会被 ES 直接拒绝；这里改用游标翻页，点一次翻一页，游标由上一次结果给出。
                </div>
                <div class="lab-row">
                    <el-button size="small" type="primary" @click="doDeep">翻一页</el-button>
                    <el-button size="small" @click="deepCursor = ''">重置游标</el-button>
                    <el-tag size="small" effect="plain">游标 {{ deepCursor ? '已持有' : '空' }}</el-tag>
                </div>
                <ResultView :result="deepResult" :max-height="220" empty-text="点「翻一页」开始" />
            </div>

            <div class="lab-card">
                <div class="lab-card__title">前缀补全</div>
                <div class="lab-card__desc">走 completion suggester，不走 match：补全要的是前缀命中，不是全文相关性。</div>
                <div class="lab-row">
                    <el-input v-model="suggestText" placeholder="输入商品名的前缀" style="width: 240px" clearable />
                    <el-button size="small" type="primary" @click="doSuggest">补全</el-button>
                </div>
                <div class="lab-row" style="margin-top: 10px">
                    <el-tag v-for="item in suggestResult && suggestResult.ok && suggestResult.data ? suggestResult.data : []" :key="item" size="small" effect="light">
                        {{ item }}
                    </el-tag>
                </div>
            </div>
        </div>

        <div class="lab-card">
            <div class="lab-card__title">聚合统计</div>
            <div class="lab-card__desc">与检索共用同一份过滤条件，所以这里的数字与上面的条数永远对得上。</div>
            <el-button size="small" type="primary" @click="doAggregate" style="margin-bottom: 12px">跑一次聚合</el-button>
            <div v-if="aggResult && aggResult.ok && aggResult.data" class="lab-grid lab-grid--4">
                <StatCard label="总条数" :value="thousand(aggResult.data.total)" tone="accent" />
                <StatCard label="最低价" :value="money(aggResult.data.priceStats?.min)" />
                <StatCard label="最高价" :value="money(aggResult.data.priceStats?.max)" />
                <StatCard label="均价" :value="money(aggResult.data.priceStats?.avg)" tone="good" />
            </div>
            <div class="lab-grid lab-grid--2" style="margin-top: 12px">
                <EChart v-if="categoryChart" :option="categoryChart" :height="240" />
                <EChart v-if="monthlyChart" :option="monthlyChart" :height="240" />
            </div>
            <ResultView :result="aggResult" :max-height="220" title="聚合原始返回" />
        </div>

        <div class="lab-card">
            <div class="lab-card__title">地理检索</div>
            <div class="lab-card__desc">按坐标加半径过滤，再按距离升序排。默认坐标落在上海，可直接改成自己的城市。</div>
            <el-form size="small" inline label-width="72px">
                <el-form-item label="纬度">
                    <el-input-number v-model="nearbyForm.lat" :precision="6" controls-position="right" size="small" />
                </el-form-item>
                <el-form-item label="经度">
                    <el-input-number v-model="nearbyForm.lon" :precision="6" controls-position="right" size="small" />
                </el-form-item>
                <el-form-item label="半径 km">
                    <el-input-number v-model="nearbyForm.radiusKm" :min="1" controls-position="right" size="small" />
                </el-form-item>
                <el-form-item label="条数">
                    <el-input-number v-model="nearbyForm.size" :min="1" :max="200" controls-position="right" size="small" />
                </el-form-item>
                <el-form-item>
                    <el-button type="primary" size="small" @click="doNearby">附近搜索</el-button>
                </el-form-item>
            </el-form>
            <el-table
                v-if="nearbyResult && nearbyResult.ok && nearbyResult.data"
                :data="nearbyResult.data.list"
                border
                size="small"
                max-height="280"
            >
                <el-table-column prop="id" label="id" width="90" />
                <el-table-column prop="name" label="商品名" min-width="160" />
                <el-table-column prop="category" label="分类" width="120" />
                <el-table-column label="价格" width="100">
                    <template #default="{ row }">{{ money(row.price) }}</template>
                </el-table-column>
                <el-table-column label="距离 km" width="110">
                    <template #default="{ row }">{{ row.distanceKm.toFixed(2) }}</template>
                </el-table-column>
            </el-table>
            <ResultView :result="nearbyResult" :max-height="200" title="原始返回" />
        </div>
    </div>
</template>
