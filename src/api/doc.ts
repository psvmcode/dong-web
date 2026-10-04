import { postJson } from './http';
import type { OperationLogDocument, OperationLogRequest, PageResult } from './types';

/**
 * MongoDB 操作日志接口。
 *
 * <p>用文档库存日志的取舍是「没有 schema 约束」换来「随便加字段」，
 * 前端因此把 detail 做成自由 JSON，写完就能看到原样存进去的样子。
 */

/** 写入一条操作日志，返回文档 id。 */
export function save(body: OperationLogRequest) {
    return postJson<string>('/api/doc/operation-log/save', body);
}

/** 按业务类型分页查询。 */
export function page(body: { pageNum: number; pageSize: number; bizType?: string }) {
    return postJson<PageResult<OperationLogDocument>>('/api/doc/operation-log/page', body);
}

/** 查询日志总条数。 */
export function count() {
    return postJson<number>('/api/doc/operation-log/count');
}
