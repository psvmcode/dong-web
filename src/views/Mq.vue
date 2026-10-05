<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Promotion, RefreshRight } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/mq';
import type { MqMessageLog } from '@/api/types';

/**
 * 消息控制台。
 *
 * <p>四类消息对应四种不同的可靠性语义：普通（尽快）、延迟（到点才发）、
 * 顺序（同分片按序）、批量（一次多条）。界面按 tab 切换发送方式，
 * 右边实时滚动投递日志——顺序消息是不是真的按序消费，在日志里一眼能看出来。
 */

const channel = ref<'normal' | 'delayed' | 'ordered' | 'batch'>('normal');
const form = reactive({
    topic: 'demo-order-topic',
    key: 'order-1001',
    payload: '{"orderNo":"SO20261005001","amount":1999}',
    delaySeconds: 10,
    shardingKey: 'user-1',
    keyPrefix: 'batch',
    count: 10,
    logLimit: 20,
});

const { result: statusResult, call: callStatus } = useApi<Record<string, unknown>>();
const { loading: sendLoading, result: sendResult, call: callSend } = useApi<null>();
const { result: logsResult, call: callLogs } = useApi<MqMessageLog[]>();
const { result: statsResult, call: callStats } = useApi<Record<string, unknown>>();

const logs = computed<MqMessageLog[]>(() => (logsResult.value?.ok && logsResult.value.data ? logsResult.value.data : []));
const implEntries = computed(() => (statusResult.value?.ok ? Object.entries(statusResult.value.data) : []));
const statEntries = computed(() => (statsResult.value?.ok ? Object.entries(statsResult.value.data) : []));

/** 四种发送方式的说明。 */
const CHANNELS = [
    { key: 'normal', label: '普通消息', desc: '发出去就尽快被消费，不保证到达时刻' },
    { key: 'delayed', label: '延迟消息', desc: '到指定秒数之后才可被消费' },
    { key: 'ordered', label: '顺序消息', desc: '相同分片键的消息严格按发送顺序消费' },
    { key: 'batch', label: '批量消息', desc: '一次投递多条，共享同一个 key 前缀' },
] as const;

/**
 * 按当前 tab 发送消息。
 */
async function send() {
    let res;
    switch (channel.value) {
        case 'delayed':
            res = await callSend(() => api.sendDelayed(form.topic, form.key, form.delaySeconds));
            break;
        case 'ordered':
            res = await callSend(() => api.sendOrdered(form.topic, form.key, form.shardingKey));
            break;
        case 'batch':
            res = await callSend(() => api.sendBatch(form.topic, form.keyPrefix, form.count));
            break;
        default:
            res = await callSend(() => api.send(form.topic, form.key, form.payload));
    }
    if (res.ok) {
        ElMessage.success('已投递');
    }
    refresh();
}

/**
 * 刷新日志与统计。
 */
function refresh() {
    void callLogs(() => api.logs(form.logLimit));
    void callStats(api.stats);
}

/**
 * 统计里取一个数字。
 *
 * @param keys 候选字段
 */
function statNumber(keys: string[]): number {
    const data = statsResult.value?.ok ? statsResult.value.data : null;
    if (!data) {
        return 0;
    }
    for (const key of keys) {
        const value = data[key];
        if (typeof value === 'number') {
            return value;
        }
    }
    return 0;
}

const consumed = computed(() => statNumber(['consumed', 'consumedCount', 'success']));
const duplicated = computed(() => statNumber(['duplicated', 'duplicateCount', 'repeated']));
const failed = computed(() => statNumber(['failed', 'deadLettered', 'errorCount']));

onMounted(() => {
    void callStatus(api.status);
    refresh();
});
</script>

<template>
    <div class="mq">
        <SectionHead
            title="消息控制台"
            desc="同一套接口背后可以是 RocketMQ、Kafka 或本地实现。四类消息对应四种可靠性语义，投递之后看日志里的顺序与重试次数。"
        >
            <template #actions>
                <el-button size="small" :icon="RefreshRight" @click="refresh()">刷新日志</el-button>
            </template>
        </SectionHead>

        <div class="mq__head">
            <div class="mq__impl">
                <div class="mq__impl-label">当前生效的传输实现</div>
                <div class="mq__impl-value">
                    {{ statusResult?.ok ? String((statusResult.data as Record<string, unknown>).active ?? '未知') : '-' }}
                </div>
                <div class="lab-row">
                    <el-tag
                        v-for="[key, value] in implEntries"
                        :key="String(key)"
                        size="small"
                        effect="plain"
                        :type="value === true || (typeof value === 'string' && value === 'rocketmq') ? 'success' : 'info'"
                    >
                        {{ key }} = {{ value }}
                    </el-tag>
                </div>
            </div>
            <div class="mq__stats">
                <div class="mq__stat">
                    <div class="mq__stat-value">{{ consumed }}</div>
                    <div class="mq__stat-label">已消费</div>
                </div>
                <div class="mq__stat mq__stat--warn">
                    <div class="mq__stat-value">{{ duplicated }}</div>
                    <div class="mq__stat-label">重复投递</div>
                </div>
                <div class="mq__stat mq__stat--bad">
                    <div class="mq__stat-value">{{ failed }}</div>
                    <div class="mq__stat-label">失败 / 死信</div>
                </div>
                <div class="mq__stat">
                    <div class="mq__stat-value">{{ logs.length }}</div>
                    <div class="mq__stat-label">日志条数</div>
                </div>
            </div>
        </div>

        <div class="mq__body">
            <div class="mq__sender">
                <el-tabs v-model="channel">
                    <el-tab-pane v-for="item in CHANNELS" :key="item.key" :label="item.label" :name="item.key">
                        <div class="mq__channel-desc">{{ item.desc }}</div>
                    </el-tab-pane>
                </el-tabs>

                <el-form size="small" label-width="90px">
                    <el-form-item label="topic">
                        <el-input v-model="form.topic" />
                    </el-form-item>
                    <el-form-item v-if="channel !== 'batch'" label="业务 key">
                        <el-input v-model="form.key" />
                    </el-form-item>
                    <el-form-item v-if="channel === 'normal'" label="消息体">
                        <el-input v-model="form.payload" type="textarea" :rows="2" />
                    </el-form-item>
                    <el-form-item v-if="channel === 'delayed'" label="延迟秒数">
                        <el-input-number v-model="form.delaySeconds" :min="0" :max="86400" controls-position="right" />
                    </el-form-item>
                    <el-form-item v-if="channel === 'ordered'" label="分片键">
                        <el-input v-model="form.shardingKey" placeholder="相同分片键的消息会被顺序消费" />
                    </el-form-item>
                    <template v-if="channel === 'batch'">
                        <el-form-item label="key 前缀">
                            <el-input v-model="form.keyPrefix" />
                        </el-form-item>
                        <el-form-item label="条数">
                            <el-input-number v-model="form.count" :min="1" :max="1000" controls-position="right" />
                        </el-form-item>
                    </template>
                    <el-button type="primary" size="small" :icon="Promotion" :loading="sendLoading" @click="send">
                        投递消息
                    </el-button>
                </el-form>

                <el-alert
                    v-if="channel === 'ordered'"
                    class="mq__note"
                    type="info"
                    :closable="false"
                    show-icon
                    title="怎么验证顺序"
                    description="连发多条相同分片键的消息，再看右边的日志：它们的创建顺序与消费落库顺序应当一致。换成不同分片键就只有并发、没有顺序。"
                />
                <el-alert
                    v-else-if="channel === 'delayed'"
                    class="mq__note"
                    type="info"
                    :closable="false"
                    show-icon
                    title="延迟消息的实现差异"
                    description="RocketMQ 用内置延迟等级，Kafka 没有原生延迟，本地实现用时间轮询——同一个接口底下的机制完全不同，所以延迟精度也不保证一致。"
                />
                <div v-if="sendResult" class="mq__note">
                    <el-tag :type="sendResult.ok ? 'success' : 'danger'" effect="dark">
                        {{ sendResult.ok ? '投递成功' : `code ${sendResult.code}` }}
                    </el-tag>
                </div>
            </div>

            <div class="mq__logs">
                <div class="mq__logs-head">
                    <span>投递日志</span>
                    <span class="lab-spacer" />
                    <el-input-number v-model="form.logLimit" :min="1" :max="200" size="small" controls-position="right" />
                    <el-button size="small" :icon="RefreshRight" @click="refresh()">刷新</el-button>
                </div>
                <el-timeline v-if="logs.length > 0" class="mq__timeline">
                    <el-timeline-item
                        v-for="log in logs"
                        :key="log.id"
                        :type="log.status === 'CONSUMED' ? 'success' : 'danger'"
                        :timestamp="log.updateTime"
                    >
                        <div class="mq__log">
                            <div class="mq__log-topic">{{ log.topic }}</div>
                            <div class="mq__log-payload lab-mono">{{ log.payload }}</div>
                            <div class="lab-row">
                                <el-tag size="small" effect="plain">{{ log.status }}</el-tag>
                                <el-tag v-if="log.retryCount > 0" size="small" type="warning" effect="plain">
                                    重试 {{ log.retryCount }} 次
                                </el-tag>
                                <span class="lab-hint lab-mono">{{ log.msgId }}</span>
                            </div>
                        </div>
                    </el-timeline-item>
                </el-timeline>
                <div v-else class="lab-hint">还没有投递记录，发一条试试</div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.mq__head {
    display: grid;
    grid-template-columns: 320px minmax(0, 1fr);
    gap: 14px;
    margin-bottom: 14px;
}

.mq__impl {
    background: linear-gradient(135deg, #2b3350, #4b3a72);
    border-radius: var(--lab-radius);
    padding: 16px 18px;
    color: #fff;
    box-shadow: 0 8px 22px rgba(43, 51, 80, 0.18);
}

.mq__impl-label {
    font-size: 12px;
    opacity: 0.7;
}

.mq__impl-value {
    font-size: 22px;
    font-weight: 700;
    margin: 4px 0 10px;
}

.mq__stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 12px;
}

.mq__stat {
    background: #fff;
    border: 1px solid var(--lab-border);
    border-left: 3px solid #3d6ff5;
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    padding: 12px 14px;
}

.mq__stat--warn {
    border-left-color: #f2b94b;
}

.mq__stat--bad {
    border-left-color: #dc4a4a;
}

.mq__stat-value {
    font-size: 24px;
    font-weight: 700;
}

.mq__stat-label {
    font-size: 12px;
    color: var(--lab-muted);
    margin-top: 2px;
}

.mq__body {
    display: grid;
    grid-template-columns: 360px minmax(0, 1fr);
    gap: 14px;
    align-items: start;
}

.mq__sender,
.mq__logs {
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    padding: 14px 16px;
}

.mq__channel-desc {
    font-size: 12px;
    color: var(--lab-muted);
    line-height: 1.7;
    min-height: 36px;
}

.mq__note {
    margin-top: 12px;
}

.mq__logs-head {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 12px;
}

.mq__timeline {
    padding-left: 4px;
    max-height: 520px;
    overflow: auto;
}

.mq__log-topic {
    font-size: 13px;
    font-weight: 600;
}

.mq__log-payload {
    margin: 4px 0 6px;
    color: #4e5969;
    word-break: break-all;
}

@media (max-width: 1000px) {
    .mq__head,
    .mq__body {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
