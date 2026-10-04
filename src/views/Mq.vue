<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue';
import { ElMessage } from 'element-plus';
import { RefreshRight, Promotion } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import StatCard from '@/components/StatCard.vue';
import ResultView from '@/components/ResultView.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/mq';
import type { MqMessageLog } from '@/api/types';

/**
 * 消息投递实验。
 *
 * <p>同一套接口背后可能是 RocketMQ、Kafka 或本地实现，
 * 所以页面先告诉你当前生效的是哪一个——换实现之后消费语义会不会变，
 * 得靠发送之后看日志里的投递次数来判断。
 */

const form = reactive({
    topic: 'demo-order-topic',
    key: 'order-1001',
    payload: '{"orderNo":"SO20261004001","amount":1999}',
    delaySeconds: 10,
    shardingKey: 'user-1',
    keyPrefix: 'batch',
    count: 10,
    logLimit: 20,
});

const { result: statusResult, call: callStatus } = useApi<Record<string, unknown>>();
const { result: sendResult, call: callSend } = useApi<null>();
const { result: logsResult, call: callLogs } = useApi<MqMessageLog[]>();
const { result: statsResult, call: callStats } = useApi<Record<string, unknown>>();

const logs = computed<MqMessageLog[]>(() => (logsResult.value?.ok && logsResult.value.data ? logsResult.value.data : []));

/**
 * 发送普通消息。
 */
async function send() {
    await callSend(() => api.send(form.topic, form.key, form.payload));
    ElMessage.success('已投递，等一会儿看日志');
}

/**
 * 发送延迟消息。
 */
async function sendDelayed() {
    await callSend(() => api.sendDelayed(form.topic, form.key, form.delaySeconds));
    ElMessage.success(`已投递，${form.delaySeconds} 秒后可见`);
}

/**
 * 发送顺序消息。
 */
async function sendOrdered() {
    await callSend(() => api.sendOrdered(form.topic, form.key, form.shardingKey));
    ElMessage.success('已投递，同分片内按序消费');
}

/**
 * 批量发送。
 */
async function sendBatch() {
    await callSend(() => api.sendBatch(form.topic, form.keyPrefix, form.count));
    ElMessage.success(`已批量投递 ${form.count} 条`);
}

/**
 * 刷新日志与统计。
 */
function refresh() {
    void callLogs(() => api.logs(form.logLimit));
    void callStats(api.stats);
}

const statusEntries = computed(() => {
    const data = statusResult.value?.ok ? statusResult.value.data : null;
    return data ? Object.entries(data) : [];
});
const statsEntries = computed(() => {
    const data = statsResult.value?.ok ? statsResult.value.data : null;
    return data ? Object.entries(data) : [];
});

onMounted(() => {
    void callStatus(api.status);
    refresh();
});
</script>

<template>
    <div>
        <SectionHead
            title="消息投递实验"
            desc="普通、延迟、顺序、批量四类消息对应四种不同的可靠性语义。发送之后看投递日志里的重试次数与重复投递计数。"
        >
            <template #actions>
                <el-button size="small" :icon="RefreshRight" @click="refresh()">刷新日志</el-button>
            </template>
        </SectionHead>

        <div class="lab-card">
            <div class="lab-card__title">当前生效的传输实现</div>
            <div class="lab-row">
                <el-tag v-for="[key, value] in statusEntries" :key="String(key)" size="small" effect="plain">
                    {{ key }} = {{ value }}
                </el-tag>
                <span v-if="statusEntries.length === 0" class="lab-hint">未获取到实现信息</span>
            </div>
        </div>

        <div class="lab-grid lab-grid--2">
            <div class="lab-card">
                <div class="lab-card__title">发送消息</div>
                <div class="lab-card__desc">
                    四类消息的差别在于「什么时候被消费」与「谁和谁保证顺序」，接口层刻意统一，让对照只落在语义上。
                </div>
                <el-form size="small" label-width="86px">
                    <el-form-item label="topic">
                        <el-input v-model="form.topic" />
                    </el-form-item>
                    <el-form-item label="业务 key">
                        <el-input v-model="form.key" />
                    </el-form-item>
                    <el-form-item label="消息体">
                        <el-input v-model="form.payload" type="textarea" :rows="2" />
                    </el-form-item>
                    <div class="lab-grid lab-grid--2">
                        <el-form-item label="延迟秒数">
                            <el-input-number v-model="form.delaySeconds" :min="0" :max="86400" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="分片键">
                            <el-input v-model="form.shardingKey" />
                        </el-form-item>
                        <el-form-item label="批量前缀">
                            <el-input v-model="form.keyPrefix" />
                        </el-form-item>
                        <el-form-item label="批量条数">
                            <el-input-number v-model="form.count" :min="1" :max="1000" controls-position="right" />
                        </el-form-item>
                    </div>
                    <div class="lab-row">
                        <el-button type="primary" size="small" :icon="Promotion" @click="send">普通消息</el-button>
                        <el-button size="small" @click="sendDelayed">延迟消息</el-button>
                        <el-button size="small" @click="sendOrdered">顺序消息</el-button>
                        <el-button size="small" @click="sendBatch">批量消息</el-button>
                    </div>
                </el-form>
                <ResultView :result="sendResult" title="投递结果" :max-height="160" style="margin-top: 10px" />
            </div>

            <div class="lab-card">
                <div class="lab-card__title">消费统计</div>
                <div class="lab-card__desc">重复投递计数是这里最该看的数字：至少一次投递的语义下，消费者必须自己幂等。</div>
                <div class="lab-row">
                    <el-tag v-for="[key, value] in statsEntries" :key="String(key)" size="small" effect="plain">
                        {{ key }} = {{ value }}
                    </el-tag>
                    <span v-if="statsEntries.length === 0" class="lab-hint">暂无统计</span>
                </div>
                <StatCard label="日志条数" :value="logs.length" style="margin-top: 12px" hint="最近投递记录" />
            </div>
        </div>

        <div class="lab-card">
            <div class="lab-card__title">投递日志</div>
            <div class="lab-row" style="margin-bottom: 10px">
                <el-input-number v-model="form.logLimit" :min="1" :max="200" size="small" controls-position="right" />
                <el-button size="small" :icon="RefreshRight" @click="refresh()">刷新</el-button>
                <span class="lab-hint">每条消息的 status 与 retryCount 反映了投递结果</span>
            </div>
            <el-table :data="logs" border stripe size="small" max-height="360">
                <el-table-column prop="id" label="id" width="70" />
                <el-table-column prop="msgId" label="消息 id" min-width="180" show-overflow-tooltip />
                <el-table-column prop="topic" label="topic" min-width="160" />
                <el-table-column prop="payload" label="消息体" min-width="200" show-overflow-tooltip />
                <el-table-column label="状态" width="120">
                    <template #default="{ row }">
                        <el-tag :type="row.status === 'CONSUMED' ? 'success' : 'danger'" size="small">{{ row.status }}</el-tag>
                    </template>
                </el-table-column>
                <el-table-column prop="retryCount" label="重试" width="80" />
                <el-table-column prop="updateTime" label="更新时间" min-width="160" />
            </el-table>
        </div>
    </div>
</template>
