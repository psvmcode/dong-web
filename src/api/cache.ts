import { deleteQuery, path, postJson, putJson } from './http';
import type {
    CacheStatsSnapshot,
    PageResult,
    PenetrationQuery,
    ProbeQuery,
    ProductResponse,
    ProductSaveRequest,
} from './types';

/**
 * 缓存实验室接口。
 *
 * <p>product 侧走的是业务主读路径（L1 → L2 → 回源），
 * lab 侧是观察与控制面：看命中率、做穿透实验、手动预热与失效。
 */

/** 查看各层级缓存命中率。 */
export function cacheStats() {
    return postJson<CacheStatsSnapshot>('/api/cache/lab/stats');
}

/** 重置命中统计。 */
export function resetCacheStats() {
    return postJson<null>('/api/cache/lab/stats/reset');
}

/** 缓存预热，返回加载的商品数。 */
export function warmUp() {
    return postJson<number>('/api/cache/lab/warm-up');
}

/** 查看 L1 与 L2 的容量与命中明细。 */
export function cacheLevels() {
    return postJson<Record<string, unknown>>('/api/cache/lab/levels');
}

/** 缓存穿透实验，count 个不存在的 id 打过去，对比有无布隆过滤器。 */
export function penetration(body: PenetrationQuery) {
    return postJson<Record<string, unknown>>('/api/cache/lab/penetration', body);
}

/** 完整走一遍缓存链路读一次 key。 */
export function probe(body: ProbeQuery) {
    return postJson<string>('/api/cache/lab/probe', body);
}

/** 删除缓存并广播失效事件。 */
export function invalidate(key: string) {
    return deleteQuery<null>('/api/cache/lab/probe', { key });
}

/** 分页查询商品，有意绕过缓存。 */
export function pageProducts(body: { pageNum: number; pageSize: number }) {
    return postJson<PageResult<ProductResponse>>('/api/cache/products/page', body);
}

/** 查询全部商品，不经过缓存。 */
export function allProducts() {
    return postJson<ProductResponse[]>('/api/cache/products/all');
}

/** 按 id 查商品，走完整缓存链路。 */
export function productById(id: number) {
    return postJson<ProductResponse>(path('/api/cache/products/{id}', { id }));
}

/** 按 id 查商品，先过布隆过滤器。 */
export function productByIdGuarded(id: number) {
    return postJson<ProductResponse>(path('/api/cache/products/{id}/guarded', { id }));
}

/** 新增商品。 */
export function createProduct(body: ProductSaveRequest) {
    return postJson<number>('/api/cache/products', body);
}

/** 更新商品，先更新数据库再失效缓存。 */
export function updateProduct(id: number, body: ProductSaveRequest) {
    return putJson<null>(path('/api/cache/products/{id}', { id }), body);
}

/** 删除商品并失效缓存。 */
export function deleteProduct(id: number) {
    return deleteQuery<null>(path('/api/cache/products/{id}', { id }));
}
