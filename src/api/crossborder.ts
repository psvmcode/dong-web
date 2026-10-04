import { deleteQuery, path, postJson, postQuery } from './http';
import type {
    AccountCreateRequest,
    AccountEventResponse,
    AccountResponse,
    ChannelConfig,
    ComplianceRecordResponse,
    FxQuoteResponse,
    FxRateResponse,
    PageQueryBody,
    PageResult,
    ReconDiffResponse,
    ReconReportResponse,
    RemittanceCreateRequest,
    RemittanceEventResponse,
    RemittanceResponse,
    SettlementBatchResponse,
} from './types';

/**
 * 跨境支付场景接口。
 *
 * <p>这是全站链路最长的一个场景：开户 → 询价锁汇 → 合规筛查 → 扣款 → 清算 → 对账。
 * 接口多，但每个节点都是幂等且可重放的，前端因此可以放心地重发。
 */

// ------------------------------------------------------------------ 账户

/** 开立跨境账户。 */
export function openAccount(body: AccountCreateRequest) {
    return postJson<number>('/api/crossborder/accounts', body);
}

/** 查询全部跨境账户。 */
export function listAccounts() {
    return postJson<AccountResponse[]>('/api/crossborder/accounts/list');
}

/** 按账号查询账户。 */
export function accountDetail(accountNo: string) {
    return postJson<AccountResponse>(path('/api/crossborder/accounts/{accountNo}', { accountNo }));
}

/** 校验账户余额与流水差额，initial 是建账时的初始余额。 */
export function balanceDiff(accountNo: string, initial: number) {
    return postJson<Record<string, unknown>>(path('/api/crossborder/accounts/{accountNo}/diff', { accountNo }), {
        initial,
    });
}

/** 查询冻结 / 解冻事件。 */
export function accountEvents(accountNo: string) {
    return postJson<AccountEventResponse[]>(path('/api/crossborder/accounts/{accountNo}/events', { accountNo }));
}

/** 冻结账户。 */
export function freeze(accountNo: string, reason: string, operator: string) {
    return postQuery<AccountResponse>(path('/api/crossborder/accounts/{accountNo}/freeze', { accountNo }), {
        reason,
        operator,
    });
}

/** 解冻账户。 */
export function unfreeze(accountNo: string, reason: string, operator: string) {
    return postQuery<AccountResponse>(path('/api/crossborder/accounts/{accountNo}/unfreeze', { accountNo }), {
        reason,
        operator,
    });
}

/** 加入制裁名单。 */
export function addSanction(ownerName: string) {
    return postQuery<null>('/api/crossborder/sanction', { ownerName });
}

/** 移出制裁名单。 */
export function removeSanction(ownerName: string) {
    return deleteQuery<null>('/api/crossborder/sanction', { ownerName });
}

/** 查询制裁名单大小。 */
export function sanctionCount() {
    return postJson<number>('/api/crossborder/sanction/count');
}

// ------------------------------------------------------------------ 汇率

/** 询价，返回带有效期的报价。 */
export function quote(sourceCurrency: string, targetCurrency: string, validSeconds = 30) {
    return postQuery<FxQuoteResponse>('/api/crossborder/fx/quote', {
        sourceCurrency,
        targetCurrency,
        validSeconds,
    });
}

/** 查询报价详情。 */
export function quoteDetail(quoteNo: string) {
    return postJson<FxQuoteResponse>(path('/api/crossborder/fx/{quoteNo}', { quoteNo }));
}

/** 查询货币对的可用报价。 */
export function availableQuotes(sourceCurrency: string, targetCurrency: string) {
    return postJson<FxQuoteResponse[]>('/api/crossborder/fx/available', { sourceCurrency, targetCurrency });
}

/** 查询当前中间价，走缓存。 */
export function currentRate(sourceCurrency: string, targetCurrency: string) {
    return postJson<Record<string, unknown>>('/api/crossborder/fx/rate/current', {
        sourceCurrency,
        targetCurrency,
    });
}

/** 查询全部币种牌价。 */
export function rates() {
    return postJson<FxRateResponse[]>('/api/crossborder/fx/rates');
}

/** 调整某个币种的牌价。 */
export function adjustRate(currency: string, usdRate: number) {
    return postQuery<null>('/api/crossborder/fx/rate', { currency, usdRate });
}

/** 手工清理过期报价。 */
export function expireQuotes() {
    return postJson<number>('/api/crossborder/fx/expire');
}

/** 查询汇率敞口。 */
export function fxExposure() {
    return postJson<Record<string, unknown>>('/api/crossborder/risk/fx-exposure');
}

// ------------------------------------------------------------------ 汇款

/** 发起汇款。 */
export function createRemittance(body: RemittanceCreateRequest) {
    return postJson<RemittanceResponse>('/api/crossborder/remittance', body);
}

/** 按汇款单号查询。 */
export function remittanceDetail(remittanceNo: string) {
    return postJson<RemittanceResponse>(path('/api/crossborder/remittance/{remittanceNo}', { remittanceNo }));
}

/** 按幂等键查询，超时重试后的确认手段。 */
export function remittanceByIdempotent(idempotentKey: string) {
    return postJson<RemittanceResponse>(
        path('/api/crossborder/remittance/by-idempotent/{idempotentKey}', { idempotentKey }),
    );
}

/** 分页查询汇款单。 */
export function pageRemittance(body: PageQueryBody & { status?: string }) {
    return postJson<PageResult<RemittanceResponse>>('/api/crossborder/remittance/page', body);
}

/** 查询待人工审核的汇款单。 */
export function pendingReview(body: PageQueryBody) {
    return postJson<PageResult<RemittanceResponse>>('/api/crossborder/remittance/pending-review', body);
}

/** 查询合规检查记录。 */
export function complianceRecords(remittanceNo: string) {
    return postJson<ComplianceRecordResponse[]>(
        path('/api/crossborder/remittance/{remittanceNo}/compliance', { remittanceNo }),
    );
}

/** 查询状态流转历史。 */
export function remittanceEvents(remittanceNo: string) {
    return postJson<RemittanceEventResponse[]>(
        path('/api/crossborder/remittance/{remittanceNo}/events', { remittanceNo }),
    );
}

/** 人工审核放行。 */
export function approve(remittanceNo: string, reviewer: string, note: string) {
    return postJson<RemittanceResponse>(path('/api/crossborder/remittance/{remittanceNo}/review/approve', { remittanceNo }), {
        reviewer,
        note,
    });
}

/** 人工审核驳回。 */
export function reject(remittanceNo: string, reviewer: string, note: string) {
    return postJson<RemittanceResponse>(path('/api/crossborder/remittance/{remittanceNo}/review/reject', { remittanceNo }), {
        reviewer,
        note,
    });
}

/** 发起退汇。 */
export function returnRemittance(remittanceNo: string, reason: string, operator: string) {
    return postQuery<RemittanceResponse>(path('/api/crossborder/remittance/{remittanceNo}/return', { remittanceNo }), {
        reason,
        operator,
    });
}

/** 重置重试计数并重新投递清算消息。 */
export function retry(remittanceNo: string) {
    return postJson<RemittanceResponse>(path('/api/crossborder/remittance/{remittanceNo}/retry', { remittanceNo }));
}

/** 按清算批次查询汇款单。 */
export function remittanceByBatch(batchNo: string) {
    return postJson<RemittanceResponse[]>(path('/api/crossborder/remittance/by-batch/{batchNo}', { batchNo }));
}

/** 汇款运行时统计。 */
export function remittanceRuntime() {
    return postJson<Record<string, unknown>>('/api/crossborder/remittance/runtime');
}

// ------------------------------------------------------------------ 清算

/** 查询清算渠道配置。 */
export function channels() {
    return postJson<ChannelConfig[]>('/api/crossborder/settlement/channels');
}

/** 调整渠道的时效、限额与费率。 */
export function adjustChannel(
    channel: number,
    params: { etaMinutes: number; perTxLimit: number; fixedFee: number; rateFee: number; enabled?: number },
) {
    return postQuery<null>(path('/api/crossborder/settlement/channel/{channel}', { channel }), params);
}

/** 启停渠道。 */
export function toggleChannel(channel: number, enabled: boolean) {
    return postQuery<null>(path('/api/crossborder/settlement/channel/{channel}/toggle', { channel }), { enabled });
}

/** 创建清算批次，返回批次号。 */
export function createBatch(channel: string, currency: string, cutoffMinutes = 60) {
    return postQuery<string>('/api/crossborder/settlement/batch', { channel, currency, cutoffMinutes });
}

/** 查询批次详情。 */
export function batchDetail(batchNo: string) {
    return postJson<SettlementBatchResponse>(path('/api/crossborder/settlement/batch/{batchNo}', { batchNo }));
}

/** 查询全部批次。 */
export function batchList() {
    return postJson<SettlementBatchResponse[]>('/api/crossborder/settlement/batch/list');
}

/** 把已扣款的汇款单并入批次。 */
export function collect(batchNo: string, limit = 100) {
    return postQuery<number>(path('/api/crossborder/settlement/batch/{batchNo}/collect', { batchNo }), { limit });
}

/** 执行清算。 */
export function settle(batchNo: string) {
    return postJson<number>(path('/api/crossborder/settlement/batch/{batchNo}/settle', { batchNo }));
}

/** 关闭超期批次。 */
export function closeOverdue() {
    return postJson<number>('/api/crossborder/settlement/close-overdue');
}

/** 查询批次状态分布。 */
export function batchStatus() {
    return postJson<Record<string, unknown>>('/api/crossborder/settlement/status');
}

// ------------------------------------------------------------------ 风控

/** 渠道路由试算。 */
export function route(amount: number, urgent: boolean) {
    return postJson<Record<string, unknown>>('/api/crossborder/risk/route', { amount, urgent });
}

/** 查询付款人当日交易画像。 */
export function amlProfile(payerAccountId: number) {
    return postJson<Record<string, unknown>>('/api/crossborder/risk/aml/profile', { payerAccountId });
}

/** 查询命中拆分交易嫌疑的账户。 */
export function amlFlagged() {
    return postJson<Record<string, unknown>[]>('/api/crossborder/risk/aml/flagged');
}

/** 重置日限额占用计数。 */
export function resetDaily(payerAccountId: number) {
    return postQuery<null>('/api/crossborder/risk/aml/reset-daily', { payerAccountId });
}

/** 清空 AML 监控数据。 */
export function clearAml() {
    return deleteQuery<null>('/api/crossborder/risk/aml');
}

// ------------------------------------------------------------------ 对账

/** 执行一轮对账，errorRate 用于注入渠道差错。 */
export function runRecon(batchNo: string, errorRate?: number) {
    return postQuery<ReconReportResponse>(path('/api/crossborder/recon/{batchNo}', { batchNo }), { errorRate });
}

/** 模拟渠道回单。 */
export function channelStatement(batchNo: string, errorRate: number) {
    return postJson<Record<string, unknown>[]>(
        path('/api/crossborder/recon/{batchNo}/channel-statement', { batchNo }),
        { errorRate },
    );
}

/** 查询对账报告。 */
export function reconReport(batchNo: string) {
    return postJson<ReconReportResponse>(path('/api/crossborder/recon/{batchNo}/report', { batchNo }));
}

/** 处理单笔差异。 */
export function handleDiff(id: number, diffType: string, decision: string) {
    return postQuery<Record<string, unknown>>(path('/api/crossborder/recon/diff/{id}', { id }), {
        diffType,
        decision,
    });
}

/** 批量处理某批次全部未处理差异。 */
export function handleAll(batchNo: string, decision: string) {
    return postQuery<number>(path('/api/crossborder/recon/{batchNo}/handle-all', { batchNo }), { decision });
}

/** 查询对账总览。 */
export function reconOverview() {
    return postJson<Record<string, unknown>>('/api/crossborder/recon/overview');
}

/** 查询对账差异，可按批次过滤。 */
export function reconDiffs(batchNo?: string) {
    return postJson<ReconDiffResponse[]>('/api/crossborder/settlement/recon', { batchNo });
}
