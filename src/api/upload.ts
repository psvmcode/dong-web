import { deleteQuery, postJson, type ApiResult } from './http';
import { useTraceStore } from '@/stores/trace';

/**
 * 文件分片上传接口。
 *
 * <p>唯一不走 JSON body 的是 chunk：它用 multipart/form-data 传二进制分片。
 * 分片塞进 JSON 会先 base64 膨胀 33%，对 GB 级文件等于凭空多传几百 MB。
 *
 * <p>uploadId 由「指纹 + 大小 + 文件名 + 分片大小」在服务端确定性推导，
 * 所以前端不需要把它存到 localStorage——刷新页面后重新 init 就能命中同一个任务。
 */

/** 初始化响应。 */
export interface UploadInitResponse {
    uploadId: string;
    instant: boolean;
    totalChunks: number;
    uploadedChunks: number[];
    status: number;
}

/** 进度响应。 */
export interface UploadStatusResponse {
    uploadId: string;
    fileName: string;
    fileSize: number;
    totalChunks: number;
    uploadedChunks: number;
    uploadedBytes: number;
    percent: number;
    status: number;
    statusName: string;
}

/** 任务列表项。 */
export interface UploadTaskResponse {
    uploadId: string;
    fileName: string;
    fileSize: number;
    chunkSize: number;
    totalChunks: number;
    uploadedChunks: number;
    fileHash: string;
    hashMode: string;
    status: number;
    statusName: string;
    createTime: string;
}

/**
 * 初始化上传，返回是否秒传以及已收分片。
 *
 * @param body 文件元信息与分片策略
 */
export function init(body: {
    fileName: string;
    fileSize: number;
    chunkSize?: number;
    fileHash: string;
    hashMode: string;
}) {
    return postJson<UploadInitResponse>('/api/upload/init', body);
}

/**
 * 上传一个分片。用原生 fetch 而不是封装好的 http，因为要传 FormData。
 *
 * <p>返回值刻意保持与 ApiResult 同构，页面上的处理逻辑才能和别的接口一致。
 *
 * @param params 分片参数
 */
export async function chunk(params: {
    uploadId: string;
    chunkIndex: number;
    chunkHash?: string;
    blob: Blob;
}): Promise<ApiResult<number>> {
    const form = new FormData();
    form.append('uploadId', params.uploadId);
    form.append('chunkIndex', String(params.chunkIndex));
    form.append('chunkHash', params.chunkHash ?? '');
    form.append('file', params.blob, 'chunk.bin');
    const started = performance.now();
    try {
        const response = await fetch('/api/upload/chunk', { method: 'POST', body: form });
        const body = (await response.json()) as { code: number; message: string; data: number };
        const result: ApiResult<number> = {
            ok: body.code === 0,
            code: body.code,
            message: body.message,
            data: body.data,
            elapsed: Math.round(performance.now() - started),
        };
        // 分片请求也要进链路，否则压测时看不到并发到底打得多快
        useTraceStore().push({
            method: 'POST',
            url: `/api/upload/chunk (分片 #${params.chunkIndex})`,
            elapsed: result.elapsed,
            code: result.code,
            ok: result.ok,
            message: result.message,
            summary: `${(params.blob.size / 1024).toFixed(0)} KB`,
            path: window.location.pathname,
        });
        return result;
    } catch (error) {
        const elapsed = Math.round(performance.now() - started);
        return {
            ok: false,
            code: -1,
            message: error instanceof Error ? error.message : '网络异常',
            data: 0,
            elapsed,
        };
    }
}

/**
 * 合并分片。
 *
 * @param uploadId 上传任务号
 */
export function complete(uploadId: string) {
    return postJson<string>('/api/upload/complete', { uploadId });
}

/**
 * 查询进度。
 *
 * @param uploadId 上传任务号
 */
export function status(uploadId: string) {
    return postJson<UploadStatusResponse>('/api/upload/status', { uploadId });
}

/**
 * 任务列表。
 *
 * @param query 分页条件
 */
export function tasks(query: { pageNum: number; pageSize: number; status?: number }) {
    return postJson<{ total: number; list: UploadTaskResponse[] }>('/api/upload/tasks', query);
}

/**
 * 取消任务。
 *
 * @param uploadId 上传任务号
 */
export function cancel(uploadId: string) {
    return deleteQuery<null>(`/api/upload/${encodeURIComponent(uploadId)}`);
}
