/**
 * 后端 DTO 的 TypeScript 镜像。
 *
 * <p>字段与后端 DTO 一一对应，命名保持后端的小驼峰。
 * 结构化类型是这个项目的核心：实验室的价值在于「同一份数据看不同维度」，
 * 用 any 把结构抹平，等于把这个价值丢掉一半。
 */

/** 分页查询基类对应的请求体。 */
export interface PageQueryBody {
    pageNum?: number;
    pageSize?: number;
}

/** 分页结果。 */
export interface PageResult<T> {
    total: number;
    list: T[];
    pageNum: number;
    pageSize: number;
}

// ---------------------------------------------------------------- cache

/** 商品视图对象。 */
export interface ProductResponse {
    id: number;
    name: string;
    category: string;
    price: number;
    stock: number;
    status: string;
    updateTime: string;
    /** true 表示这次读拿的是兜底的旧值，回源没成功 */
    stale: boolean;
}

/** 商品新增 / 更新请求。 */
export interface ProductSaveRequest {
    name: string;
    category: string;
    price: number;
    stock: number;
    longitude: number;
    latitude: number;
    description: string;
}

/** 缓存命中统计快照。 */
export interface CacheStatsSnapshot {
    l1Hit: number;
    l2Hit: number;
    miss: number;
    penetrationBlocked: number;
    rebuild: number;
    staleServed: number;
    degraded: number;
    rebuildRejected: number;
    rebuildSkipped: number;
    circuitBlocked: number;
    hitRatioPercent: number;
}

/** 缓存穿透实验入参。 */
export interface PenetrationQuery {
    count: number;
    guarded: boolean;
}

/** 缓存读写入参。 */
export interface ProbeQuery {
    key: string;
    value: string;
}

// ---------------------------------------------------------------- search

/** 检索请求。 */
export interface ProductSearchRequest {
    keyword?: string;
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    pageNum?: number;
    pageSize?: number;
    sort?: string;
    includeOffShelf?: boolean;
}

/** 检索命中项。 */
export interface SearchHit {
    id: string;
    name: string;
    category: string;
    price: number;
    stock: number;
    highlight: string[];
    descriptionHighlight: string[];
}

/** 检索结果。 */
export interface ProductSearchResponse {
    total: number;
    pageNum: number;
    pageSize: number;
    list: SearchHit[];
    categoryFacets: Record<string, number>;
}

/** 深分页请求。 */
export interface DeepSearchQuery {
    sort?: string;
    after?: string;
    size?: number;
}

/** 深分页结果。 */
export interface DeepSearchResponse {
    list: SearchHit[];
    nextAfter: string;
    hasMore: boolean;
}

/** 附近检索请求。 */
export interface NearbySearchQuery {
    lat: number;
    lon: number;
    radiusKm: number;
    size: number;
}

/** 附近检索命中项。 */
export interface NearbyHit {
    id: string;
    name: string;
    category: string;
    price: number;
    distanceKm: number;
}

/** 附近检索结果。 */
export interface NearbySearchResponse {
    total: number;
    list: NearbyHit[];
}

/** 价格统计聚合。 */
export interface Stats {
    count: number;
    min: number;
    max: number;
    avg: number;
    sum: number;
}

/** 聚合分桶。 */
export interface Bucket {
    key: string;
    docCount: number;
}

/** 聚合结果。 */
export interface SearchAggregateResponse {
    total: number;
    categoryFacets: Record<string, number>;
    priceStats: Stats;
    priceRanges: Bucket[];
    monthlyBuckets: Bucket[];
    priceStatsByCategory: Record<string, Stats>;
}

/** GEO 成员。 */
export interface NearbyPlaceResponse {
    member: string;
    longitude: number;
    latitude: number;
    distanceKm: number;
}

/** 一致性对账报告。 */
export interface ConsistencyReport {
    dbCount: number;
    esCount: number;
    missingIds: number[];
    staleIds: number[];
    orphanIds: number[];
    repaired: boolean;
    repairedCount: number;
}

/** 索引重建结果。 */
export interface RebuildResponse {
    alias: string;
    fromIndex: string;
    toIndex: string;
    movedDocs: number;
}

// ---------------------------------------------------------------- seckill

/** 秒杀活动请求。 */
export interface SeckillActivityRequest {
    productId: number;
    title: string;
    totalStock: number;
    unitPrice: number;
    startTime: string;
    endTime: string;
}

/** 秒杀活动视图。 */
export interface SeckillActivityResponse {
    id: number;
    productId: number;
    title: string;
    totalStock: number;
    availableStock: number;
    unitPrice: number;
    startTime: string;
    endTime: string;
    status: string;
}

/** 秒杀下单回执。 */
export interface SeckillReceiptResponse {
    orderNo: string;
    accepted: boolean;
    message: string;
    remainingStock: number;
    amount: number;
}

/** 秒杀订单。 */
export interface SeckillOrderResponse {
    orderNo: string;
    activityId: number;
    productId: number;
    userId: number;
    quantity: number;
    amount: number;
    status: string;
    createTime: string;
}

// ---------------------------------------------------------------- red packet

/** 发红包请求。 */
export interface RedPacketSendRequest {
    sponsorId: number;
    totalAmount: number;
    totalCount: number;
    packetType: number;
}

/** 红包详情。 */
export interface RedPacketResponse {
    packetNo: string;
    sponsorId: number;
    totalAmount: number;
    totalCount: number;
    remainAmount: number;
    remainCount: number;
    packetType: string;
    status: string;
    createTime: string;
}

/** 抢红包结果。 */
export interface GrabResultResponse {
    grabbed: boolean;
    amount: number;
    message: string;
}

/** 领取记录。 */
export interface RedPacketRecord {
    id: number;
    packetNo: string;
    userId: number;
    amount: number;
    createTime: string;
}

// ---------------------------------------------------------------- order

/** 创建订单请求。 */
export interface OrderCreateRequest {
    userId: number;
    productName: string;
    quantity: number;
    payAmount: number;
}

/** 触发订单事件请求。 */
export interface OrderFireRequest {
    event: string;
    operator?: string;
    payNo?: string;
    trackingNo?: string;
    refundAmount?: number;
    reason?: string;
}

/** 订单视图。 */
export interface OrderResponse {
    orderNo: string;
    userId: number;
    productName: string;
    quantity: number;
    payAmount: number;
    refundAmount: number;
    status: string;
    statusCode: number;
    refundFrom: string;
    trackingNo: string;
    payNo: string;
    urgeCount: number;
    version: number;
    createTime: string;
    updateTime: string;
}

/** 订单流转日志。 */
export interface OrderTransitionLogResponse {
    orderNo: string;
    fromStatus: string;
    toStatus: string;
    event: string;
    accepted: boolean;
    reason: string;
    operator: string;
    createTime: string;
}

/** 并发推进对比结果。 */
export interface OrderBenchmarkResponse {
    orderNo: string;
    threads: number;
    mode: string;
    successCount: number;
    blockedCount: number;
    finalStatus: string;
    finalVersion: number;
    attemptLogCount: number;
    elapsedMs: number;
}

// ---------------------------------------------------------------- tcc

/** TCC 下单请求。 */
export interface TccOrderRequest {
    userId: number;
    productId: number;
    quantity: number;
    forceFailure: boolean;
}

/** TCC 结果。 */
export interface TccResultResponse {
    committed: boolean;
    xid: string;
    message: string;
}

/** TCC 分支。 */
export interface TccBranch {
    id: number;
    xid: string;
    branchId: string;
    status: string;
    payload: string;
    errorMessage: string;
    nextRetryTime: string;
    retryCount: number;
    createTime: string;
    updateTime: string;
}

// ---------------------------------------------------------------- mq

/** 消息投递日志。 */
export interface MqMessageLog {
    id: number;
    msgId: string;
    topic: string;
    payload: string;
    status: string;
    retryCount: number;
    createTime: string;
    updateTime: string;
}

// ---------------------------------------------------------------- crossborder

/** 跨境开户请求。 */
export interface AccountCreateRequest {
    ownerName: string;
    country: string;
    currency: string;
    balance: number;
    dailyLimit: number;
    singleLimit: number;
    kycLevel: number;
}

/** 跨境账户视图。 */
export interface AccountResponse {
    id: number;
    accountNo: string;
    ownerName: string;
    country: string;
    currency: string;
    balance: number;
    frozenBalance: number;
    availableBalance: number;
    kycLevel: number;
    dailyLimit: number;
    singleLimit: number;
    status: number;
    createTime: string;
    updateTime: string;
}

/** 账户冻结 / 解冻事件。 */
export interface AccountEventResponse {
    id: number;
    accountNo: string;
    eventType: string;
    reason: string;
    operator: string;
    createTime: string;
}

/** 汇率报价。 */
export interface FxQuoteResponse {
    quoteNo: string;
    currencyPair: string;
    bidRate: number;
    askRate: number;
    lockedRate: number;
    status: string;
    expireTime: string;
    expired: boolean;
    validSeconds: number;
}

/** 币种牌价。 */
export interface FxRateResponse {
    currency: string;
    usdRate: number;
    status: number;
    createTime: string;
    updateTime: string;
}

/** 发起汇款请求。 */
export interface RemittanceCreateRequest {
    idempotentKey: string;
    payerAccountNo: string;
    payeeAccountNo: string;
    sourceAmount: number;
    channel: string;
    urgent: boolean;
    quoteNo?: string;
}

/** 汇款单视图。 */
export interface RemittanceResponse {
    remittanceNo: string;
    idempotentKey: string;
    payerAccountNo: string;
    payeeAccountNo: string;
    sourceCurrency: string;
    targetCurrency: string;
    sourceAmount: number;
    exchangeRate: number;
    targetAmount: number;
    feeAmount: number;
    channel: string;
    status: string;
    quoteNo: string;
    batchNo: string;
    failReason: string;
    createTime: string;
    updateTime: string;
}

/** 合规检查记录。 */
export interface ComplianceRecordResponse {
    remittanceNo: string;
    checkType: string;
    result: string;
    hitDetail: string;
    createTime: string;
}

/** 汇款状态流转事件。 */
export interface RemittanceEventResponse {
    remittanceNo: string;
    fromStatus: number;
    fromStatusName: string;
    toStatus: number;
    toStatusName: string;
    event: string;
    result: number;
    reason: string;
    operator: string;
    createTime: string;
}

/** 清算渠道配置。 */
export interface ChannelConfig {
    id: number;
    channel: number;
    etaMinutes: number;
    perTxLimit: number;
    fixedFee: number;
    rateFee: number;
    enabled: number;
    createTime: string;
    updateTime: string;
}

/** 清算批次。 */
export interface SettlementBatchResponse {
    batchNo: string;
    channel: string;
    currency: string;
    totalCount: number;
    totalAmount: number;
    status: string;
    cutoffTime: string;
    createTime: string;
    updateTime: string;
}

/** 对账差异。 */
export interface ReconDiffResponse {
    batchNo: string;
    remittanceNo: string;
    diffType: string;
    localAmount: number;
    channelAmount: number;
    diffAmount: number;
    handleStatus: number;
    createTime: string;
}

/** 对账报告。 */
export interface ReconReportResponse {
    batchNo: string;
    channel: string;
    currency: string;
    reconTime: string;
    localCount: number;
    localTotal: number;
    channelCount: number;
    channelTotal: number;
    matchedCount: number;
    diffCount: number;
    unhandledCount: number;
    balanced: boolean;
    diffByType: Record<string, number>;
    diffs: ReconDiffResponse[];
}

// ---------------------------------------------------------------- social

/** 动态视图。 */
export interface FeedResponse {
    feedId: number;
    authorId: number;
    content: string;
    likeCount: number;
    createTime: string;
}

// ---------------------------------------------------------------- classic

/** 短链视图。 */
export interface ShortLinkResponse {
    code: string;
    originUrl: string;
    hitCount: number;
    createTime: string;
}

/** 排行榜条目。 */
export interface RankItemResponse {
    member: string;
    score: number;
    rank: number;
}

/** 发号器实验结果。 */
export interface ClassicIdGenerated {
    id: number;
    strategy: string;
    idCount: number;
    lastId: string;
    elapsedMillis: number;
    createTime: string;
}

/** 锁实验对比结果。 */
export interface ClassicLockLabResult {
    id: number;
    mode: string;
    expectedCount: number;
    actualCount: number;
    lockAcquired: number;
    lockTimedOut: number;
    lostUpdates: number;
    elapsedMillis: number;
    createTime: string;
}

/** 限流算法对比结果。 */
export interface ClassicRateLimitLabResult {
    id: number;
    bizKey: string;
    algorithm: string;
    limitCount: number;
    windowSeconds: number;
    attempts: number;
    firstBurstAllowed: number;
    secondBurstAllowed: number;
    distributed: number;
    createTime: string;
}

// ---------------------------------------------------------------- replica

/** 第二数据源账户。 */
export interface UserAccount {
    id: number;
    userId: number;
    username: string;
    balance: number;
    createTime: string;
    updateTime: string;
}

// ---------------------------------------------------------------- mongo

/** MongoDB 操作日志。 */
export interface OperationLogDocument {
    id: string;
    bizType: string;
    bizId: string;
    operator: string;
    action: string;
    detail: Record<string, unknown>;
    createTime: string;
}

/** 操作日志写入请求。 */
export interface OperationLogRequest {
    bizType: string;
    bizId: string;
    operator: string;
    action: string;
    detail: Record<string, unknown>;
}

// ---------------------------------------------------------------- agent

/** Agent 会话。 */
export interface SessionResponse {
    sessionNo: string;
    title: string;
    model: string;
    status: number;
    messageCount: number;
    runCount: number;
    summary: string;
    createTime: string;
    updateTime: string;
}

/** Agent 会话消息。 */
export interface MessageResponse {
    seq: number;
    role: string;
    content: string;
    toolName: string;
    truncated: boolean;
    createTime: string;
}

/** 一次运行的结果。 */
export interface RunResponse {
    runNo: string;
    sessionNo: string;
    status: number;
    finishReason: string;
    answer: string;
    steps: number;
    toolCalls: number;
    promptTokens: number;
    completionTokens: number;
    elapsedMillis: number;
    errorMessage: string;
    pendingCalls: string;
    createTime: string;
}

/** 运行统计。 */
export interface RunStatsResponse {
    total: number;
    finishReasonCounts: Record<string, number>;
    avgSteps: number;
    avgToolCalls: number;
    avgElapsedMillis: number;
}

/** 工具描述。 */
export interface ToolDescriptor {
    name: string;
    description: string;
    parametersSchema: string;
    risk: string;
    needConfirm: boolean;
    timeoutSeconds: number;
}

/** 工具试运行结果。 */
export interface ToolDryRunResponse {
    success: boolean;
    payload: string;
    errorMessage: string;
    elapsedMillis: number;
}

/** 工具维度统计行。 */
export interface ToolStatRow {
    toolName: string;
    calls: number;
    failures: number;
    avgElapsedMillis: number;
}

/** 工具统计结果。 */
export interface ToolStatsResponse {
    scanLimit: number;
    rows: ToolStatRow[];
}

/** 单次对照实验条目。 */
export interface LabRunItem {
    experiment: string;
    mode: string;
    round: number;
    provider: string;
    runNo: string;
    success: boolean;
    finishReason: string;
    steps: number;
    toolCalls: number;
    promptTokens: number;
    completionTokens: number;
    elapsedMillis: number;
    detail: string;
    errorMessage: string;
}

/** 一组对照实验的结果。 */
export interface LabRunResponse {
    experiment: string;
    title: string;
    metrics: string;
    items: LabRunItem[];
}
