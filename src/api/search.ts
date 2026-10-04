import { path, postJson } from './http';
import type {
    ConsistencyReport,
    DeepSearchQuery,
    DeepSearchResponse,
    NearbySearchQuery,
    NearbySearchResponse,
    ProductSearchRequest,
    ProductSearchResponse,
    RebuildResponse,
    SearchAggregateResponse,
} from './types';

/**
 * 搜索引擎实验接口。
 *
 * <p>MySQL 是权威源，ES 索引随时可以丢弃重建，所以这里分两类：
 * 检索类怎么用都不会改数据，运维类（sync / rebuild / repair）才会动索引。
 */

/** 全文检索，支持过滤、排序、高亮与分类分面。 */
export function search(body: ProductSearchRequest) {
    return postJson<ProductSearchResponse>('/api/search', body);
}

/** 深分页，用 search_after 翻页。 */
export function searchDeep(body: DeepSearchQuery) {
    return postJson<DeepSearchResponse>('/api/search/deep', body);
}

/** 聚合统计。 */
export function aggregate(body: ProductSearchRequest) {
    return postJson<SearchAggregateResponse>('/api/search/aggregate', body);
}

/** 前缀补全。 */
export function suggest(prefix: string, size = 8) {
    return postJson<string[]>('/api/search/suggest', { prefix, size });
}

/** 地理检索。 */
export function nearby(body: NearbySearchQuery) {
    return postJson<NearbySearchResponse>('/api/search/nearby', body);
}

/** 查询索引文档总数。 */
export function docCount() {
    return postJson<number>('/api/search/count');
}

/** 查看别名当前指向的真实索引。 */
export function currentIndex() {
    return postJson<string>('/api/search/current-index');
}

/** 一致性对账，只报告不修复。 */
export function consistency() {
    return postJson<ConsistencyReport>('/api/search/consistency');
}

/** 按对账结果修复索引。 */
export function repairConsistency() {
    return postJson<ConsistencyReport>('/api/search/consistency/repair');
}

/** 从 MySQL 全量重建索引。 */
export function syncAll() {
    return postJson<number>('/api/search/sync');
}

/** 重同步单个商品。 */
export function syncOne(productId: number) {
    return postJson<null>(path('/api/search/sync/{productId}', { productId }));
}

/** 零停机重建索引。 */
export function rebuild() {
    return postJson<RebuildResponse>('/api/search/rebuild');
}
