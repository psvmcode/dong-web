import { deleteQuery, path, postJson } from './http';
import type {
    LabRunItem,
    LabRunResponse,
    MessageResponse,
    PageResult,
    RunResponse,
    RunStatsResponse,
    SessionResponse,
    ToolDescriptor,
    ToolDryRunResponse,
    ToolStatsResponse,
} from './types';

/**
 * Agent 实验室接口。
 *
 * <p>这一组的关键词是「停止」：每轮循环都要问一次是否触达闸门，
 * 每次运行必须有一个 finish_reason。页面据此把「怎么停下来的」作为一等公民展示。
 */

/** 创建会话，返回会话号。 */
export function createSession(title: string) {
    return postJson<string>('/api/agent/sessions', { title });
}

/** 分页查询会话。 */
export function listSessions(pageNum = 1, pageSize = 20) {
    return postJson<PageResult<SessionResponse>>('/api/agent/sessions/list', { pageNum, pageSize });
}

/** 查询会话详情。 */
export function sessionDetail(sessionNo: string) {
    return postJson<SessionResponse>(path('/api/agent/sessions/{sessionNo}', { sessionNo }));
}

/** 分页查询会话消息。 */
export function sessionMessages(sessionNo: string, pageNum = 1, pageSize = 50) {
    return postJson<PageResult<MessageResponse>>(
        path('/api/agent/sessions/{sessionNo}/messages', { sessionNo }),
        { pageNum, pageSize },
    );
}

/** 删除会话及其消息。 */
export function removeSession(sessionNo: string) {
    return deleteQuery<null>(path('/api/agent/sessions/{sessionNo}', { sessionNo }));
}

/** 发起一次运行，同步等待结束。 */
export function run(body: { prompt: string; sessionNo?: string; clientToken?: string; confirmSideEffect?: boolean }) {
    return postJson<RunResponse>('/api/agent/runs', body);
}

/** 查询运行结果。 */
export function runDetail(runNo: string) {
    return postJson<RunResponse>(path('/api/agent/runs/{runNo}', { runNo }));
}

/** 分页查询运行。 */
export function listRuns(pageNum = 1, pageSize = 20) {
    return postJson<PageResult<RunResponse>>('/api/agent/runs/list', { pageNum, pageSize });
}

/** 查询运行统计。 */
export function runStats() {
    return postJson<RunStatsResponse>('/api/agent/runs/stats');
}

/** 取消运行。 */
export function cancelRun(runNo: string) {
    return postJson<null>(path('/api/agent/runs/{runNo}/cancel', { runNo }));
}

/** 确认执行挂起的副作用工具。 */
export function confirmRun(runNo: string) {
    return postJson<RunResponse>(path('/api/agent/runs/{runNo}/confirm', { runNo }));
}

/** 拒绝执行挂起的工具。 */
export function rejectRun(runNo: string) {
    return postJson<RunResponse>(path('/api/agent/runs/{runNo}/reject', { runNo }));
}

/** 查询工具清单。 */
export function tools() {
    return postJson<ToolDescriptor[]>('/api/agent/tools');
}

/** 试运行只读工具。 */
export function dryRun(toolName: string, args: Record<string, unknown>) {
    return postJson<ToolDryRunResponse>('/api/agent/tools/dry-run', { toolName, arguments: args });
}

/** 按工具维度统计调用情况。 */
export function toolStats() {
    return postJson<ToolStatsResponse>('/api/agent/tools/stats');
}

/** 查询可用实验编号。 */
export function experiments() {
    return postJson<string[]>('/api/agent/lab/experiments');
}

/** 跑一组对照实验。 */
export function runLab(key: string, body: { modes: string[]; rounds?: number; prompt?: string; confirmSideEffect?: boolean }) {
    return postJson<LabRunResponse>(path('/api/agent/lab/{key}', { key }), body);
}

/** 查询历史实验结果。 */
export function labResults(experiment: string, pageNum = 1, pageSize = 20) {
    return postJson<PageResult<LabRunItem>>('/api/agent/lab/results', { experiment, pageNum, pageSize });
}
