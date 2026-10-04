<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { RefreshRight, VideoPause } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import StatCard from '@/components/StatCard.vue';
import ResultView from '@/components/ResultView.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/agent';
import type {
    LabRunItem,
    LabRunResponse,
    MessageResponse,
    PageResult,
    RunResponse,
    SessionResponse,
    ToolDescriptor,
} from '@/api/types';
import { parseJson, uuid } from '@/utils/format';

/**
 * Agent 工程实验台。
 *
 * <p>这里的重点不是「让模型写点什么」，而是「跑一次运行要付出多少、怎么停下来」：
 * 步数、工具调用数、token、耗时、finish_reason 都是一等公民。
 * SSE 不用 EventSource，因为它只能发 GET，而这个项目的业务接口一律是 POST。
 */

const form = reactive({
    prompt: '现在几点了',
    sessionNo: '',
    clientToken: uuid('TOKEN'),
    confirmSideEffect: false,
});

const streamEvents = ref<{ event: string; data: string }[]>([]);
const streamRunning = ref(false);
let streamAbort: AbortController | null = null;

const toolArgs = reactive({ toolName: '', arguments: '{}' });
const sessionTitle = ref('新的实验会话');
const labKey = ref('E2');
const labModes = ref<string[]>(['serial', 'parallel']);

const { result: runResult, call: callRun } = useApi<RunResponse>();
const { result: toolsResult, call: callTools } = useApi<ToolDescriptor[]>();
const { result: dryRunResult, call: callDryRun } = useApi<{ success: boolean; payload: string; errorMessage: string; elapsedMillis: number }>();
const { result: statsResult, call: callStats } = useApi<{ total: number; finishReasonCounts: Record<string, number>; avgSteps: number; avgToolCalls: number; avgElapsedMillis: number }>();
const { result: sessionsResult, call: callSessions } = useApi<PageResult<SessionResponse>>();
const { result: messagesResult, call: callMessages } = useApi<PageResult<MessageResponse>>();
const { result: experimentsResult, call: callExperiments } = useApi<string[]>();
const { result: labResult, call: callLab } = useApi<LabRunResponse>();
const { result: labResultsResult, call: callLabResults } = useApi<PageResult<LabRunItem>>();
const { call: callOp } = useApi<unknown>();

const tools = computed<ToolDescriptor[]>(() => (toolsResult.value?.ok && toolsResult.value.data ? toolsResult.value.data : []));
const sessions = computed<SessionResponse[]>(() => (sessionsResult.value?.ok && sessionsResult.value.data ? sessionsResult.value.data.list : []));
const messages = computed<MessageResponse[]>(() => (messagesResult.value?.ok && messagesResult.value.data ? messagesResult.value.data.list : []));
const experiments = computed<string[]>(() => (experimentsResult.value?.ok && experimentsResult.value.data ? experimentsResult.value.data : []));
const labItems = computed<LabRunItem[]>(() => (labResultsResult.value?.ok && labResultsResult.value.data ? labResultsResult.value.data.list : []));

/**
 * 同步运行，等待整个循环结束后一次性拿结果。
 */
async function runSync() {
    const res = await callRun(() =>
        api.run({
            prompt: form.prompt,
            sessionNo: form.sessionNo || undefined,
            clientToken: form.clientToken,
            confirmSideEffect: form.confirmSideEffect,
        }),
    );
    if (res.ok && res.data) {
        form.sessionNo = res.data.sessionNo;
        loadSessions();
    }
}

/**
 * 流式运行：自己用 fetch 读 SSE，因为 EventSource 不能发 POST。
 */
async function runStream() {
    if (streamRunning.value) {
        return;
    }
    streamRunning.value = true;
    streamEvents.value = [];
    streamAbort = new AbortController();
    try {
        const response = await fetch('/api/agent/runs/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: form.prompt,
                sessionNo: form.sessionNo || undefined,
                clientToken: form.clientToken,
                confirmSideEffect: form.confirmSideEffect,
            }),
            signal: streamAbort.signal,
        });
        if (!response.body) {
            ElMessage.error('响应没有可读的流');
            return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            buffer += decoder.decode(value, { stream: true });
            const frames = buffer.split('\n\n');
            buffer = frames.pop() ?? '';
            for (const frame of frames) {
                pushFrame(frame);
            }
        }
        if (buffer.trim()) {
            pushFrame(buffer);
        }
    } catch (error) {
        ElMessage.error(error instanceof Error ? error.message : '流式运行失败');
    } finally {
        streamRunning.value = false;
        streamAbort = null;
        await callStats(api.runStats);
    }
}

/**
 * 解析一个 SSE 帧，取出 event 名与 data。
 *
 * @param frame 形如 "event: step\ndata: {...}" 的片段
 */
function pushFrame(frame: string) {
    let event = 'message';
    let data = '';
    for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) {
            event = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
            data += line.slice(5).trim();
        }
    }
    streamEvents.value.push({ event, data });
}

/**
 * 主动断开 SSE。连接断了后端会标记取消，所以这不算泄漏。
 */
function stopStream() {
    streamAbort?.abort();
    streamRunning.value = false;
}

/**
 * 创建会话。
 */
async function createSession() {
    const res = await callOp(() => api.createSession(sessionTitle.value));
    if (res.ok) {
        ElMessage.success('会话已创建');
        form.sessionNo = String(res.data ?? '');
        loadSessions();
    }
}

/**
 * 加载会话列表。
 */
function loadSessions() {
    void callSessions(() => api.listSessions(1, 20));
}

/**
 * 选中会话并加载消息。
 *
 * @param sessionNo 会话号
 */
function pickSession(sessionNo: string) {
    form.sessionNo = sessionNo;
    void callMessages(() => api.sessionMessages(sessionNo, 1, 50));
}

/**
 * 删除会话。
 *
 * @param sessionNo 会话号
 */
async function removeSession(sessionNo: string) {
    const res = await callOp(() => api.removeSession(sessionNo));
    if (res.ok) {
        ElMessage.success('会话已删除');
        loadSessions();
    }
}

/**
 * 试运行一个只读工具。
 */
async function dryRun() {
    const args = parseJson(toolArgs.arguments);
    if (args === null) {
        ElMessage.error('参数必须是合法 JSON');
        return;
    }
    await callDryRun(() => api.dryRun(toolArgs.toolName, args as Record<string, unknown>));
}

/**
 * 跑一组对照实验。
 */
async function runLab() {
    await callLab(() => api.runLab(labKey.value, { modes: labModes.value, rounds: 1, confirmSideEffect: form.confirmSideEffect }));
    void callLabResults(() => api.labResults(labKey.value, 1, 20));
}

const modeOptions = ['serial', 'parallel'];
const finishReasonEntries = computed(() =>
    statsResult.value?.ok && statsResult.value.data ? Object.entries(statsResult.value.data.finishReasonCounts ?? {}) : [],
);

onMounted(() => {
    void callTools(api.tools);
    void callStats(api.runStats);
    loadSessions();
    void callExperiments(api.experiments);
});
</script>

<template>
    <div>
        <SectionHead
            title="Agent 工程实验台"
            desc="把 LLM 应用做成对照实验：步数、工具调用、token、耗时与 finish_reason 都是可量化的指标，五道停止闸门决定一轮循环什么时候必须停。"
        >
            <template #actions>
                <el-button size="small" :icon="RefreshRight" @click="callTools(api.tools); callStats(api.runStats)">刷新</el-button>
            </template>
        </SectionHead>

        <el-alert
            type="warning"
            show-icon
            :closable="false"
            title="默认关闭"
            description="后端 dong.agent.enabled 默认为 false，所有接口会返回 1004「中间件未启用」。在 application.yml 把它改成 true 并重启后端即可。"
            style="margin-bottom: 16px"
        />

        <div class="lab-grid lab-grid--4">
            <StatCard label="运行总数" :value="statsResult?.ok ? statsResult.data.total : '-'" tone="accent" hint="含失败与取消" />
            <StatCard label="平均步数" :value="statsResult?.ok ? statsResult.data.avgSteps : '-'" />
            <StatCard label="平均工具调用" :value="statsResult?.ok ? statsResult.data.avgToolCalls : '-'" />
            <StatCard
                label="平均耗时"
                :value="statsResult?.ok ? `${statsResult.data.avgElapsedMillis} ms` : '-'"
                hint="含模型往返"
            />
        </div>

        <el-tabs>
            <el-tab-pane label="运行">
                <div class="lab-card">
                    <div class="lab-card__title">发起运行</div>
                    <div class="lab-card__desc">
                        同步运行等整轮结束再返回；流式运行每推一个事件就在下面追加一行。连接一断，后端会把这次运行标记为取消。
                    </div>
                    <el-form size="small" label-width="110px">
                        <el-form-item label="提示词">
                            <el-input v-model="form.prompt" type="textarea" :rows="2" maxlength="4096" />
                        </el-form-item>
                        <div class="lab-grid lab-grid--2">
                            <el-form-item label="会话号">
                                <el-input v-model="form.sessionNo" placeholder="留空自动创建" />
                            </el-form-item>
                            <el-form-item label="幂等 token">
                                <el-input v-model="form.clientToken" />
                            </el-form-item>
                        </div>
                        <el-form-item label="允许副作用">
                            <el-switch v-model="form.confirmSideEffect" />
                        </el-form-item>
                    </el-form>
                    <div class="lab-row">
                        <el-button type="primary" size="small" @click="runSync">同步运行</el-button>
                        <el-button size="small" :loading="streamRunning" @click="runStream">流式运行（SSE）</el-button>
                        <el-button size="small" :icon="VideoPause" :disabled="!streamRunning" @click="stopStream">中断</el-button>
                        <el-button size="small" @click="form.clientToken = uuid('TOKEN')">换幂等键</el-button>
                    </div>
                </div>

                <div class="lab-grid lab-grid--2">
                    <div class="lab-card">
                        <div class="lab-card__title">流式事件</div>
                        <div class="lab-card__desc">每一个 event 一行，能直观看到「模型停在哪里」。</div>
                        <div class="stream-box">
                            <div v-for="(item, index) in streamEvents" :key="index" class="stream-row">
                                <el-tag size="small" effect="plain" type="info">{{ item.event }}</el-tag>
                                <span class="lab-mono">{{ item.data }}</span>
                            </div>
                            <div v-if="streamEvents.length === 0" class="lab-hint">点「流式运行」开始</div>
                        </div>
                    </div>
                    <div class="lab-card">
                        <div class="lab-card__title">结束原因分布</div>
                        <div class="lab-card__desc">每一次运行都必然有一个 finish_reason，没有「不了了之」这种状态。</div>
                        <div class="lab-row">
                            <el-tag v-for="[reason, count] in finishReasonEntries" :key="String(reason)" size="small" effect="plain">
                                {{ reason }} × {{ count }}
                            </el-tag>
                            <span v-if="finishReasonEntries.length === 0" class="lab-hint">暂无运行</span>
                        </div>
                        <ResultView :result="runResult" title="最近一次运行" :max-height="260" style="margin-top: 10px" />
                    </div>
                </div>
            </el-tab-pane>

            <el-tab-pane label="工具">
                <div class="lab-card">
                    <div class="lab-card__title">工具清单</div>
                    <div class="lab-card__desc">risk 为 SIDE_EFFECT 的工具需要确认后才会执行，needConfirm 标出来就是要挂起等确认。</div>
                    <el-table :data="tools" border stripe size="small" max-height="360">
                        <el-table-column prop="name" label="工具名" min-width="160" />
                        <el-table-column prop="description" label="说明" min-width="240" show-overflow-tooltip />
                        <el-table-column label="风险" width="130">
                            <template #default="{ row }">
                                <el-tag :type="row.risk === 'READ_ONLY' ? 'success' : 'danger'" size="small">{{ row.risk }}</el-tag>
                            </template>
                        </el-table-column>
                        <el-table-column label="需确认" width="100">
                            <template #default="{ row }">
                                <el-tag :type="row.needConfirm ? 'warning' : 'info'" size="small">
                                    {{ row.needConfirm ? '是' : '否' }}
                                </el-tag>
                            </template>
                        </el-table-column>
                        <el-table-column prop="timeoutSeconds" label="超时秒" width="100" />
                        <el-table-column label="操作" min-width="120">
                            <template #default="{ row }">
                                <el-button size="small" @click="toolArgs.toolName = row.name">填到表单</el-button>
                            </template>
                        </el-table-column>
                    </el-table>
                </div>

                <div class="lab-card">
                    <div class="lab-card__title">试运行只读工具</div>
                    <div class="lab-card__desc">有副作用的工具不接受试运行：真正执行要靠运行过程中挂起确认。</div>
                    <el-form size="small" label-width="86px">
                        <el-form-item label="工具名">
                            <el-input v-model="toolArgs.toolName" style="width: 260px" />
                        </el-form-item>
                        <el-form-item label="参数 JSON">
                            <el-input v-model="toolArgs.arguments" type="textarea" :rows="2" />
                        </el-form-item>
                        <el-button type="primary" size="small" @click="dryRun">试运行</el-button>
                    </el-form>
                    <ResultView :result="dryRunResult" title="试运行结果" :max-height="200" style="margin-top: 10px" />
                </div>
            </el-tab-pane>

            <el-tab-pane label="会话">
                <div class="lab-grid lab-grid--2">
                    <div class="lab-card">
                        <div class="lab-card__title">会话列表</div>
                        <div class="lab-row" style="margin-bottom: 10px">
                            <el-input v-model="sessionTitle" style="width: 220px" />
                            <el-button type="primary" size="small" @click="createSession">新建会话</el-button>
                        </div>
                        <div class="session-list">
                            <div
                                v-for="session in sessions"
                                :key="session.sessionNo"
                                class="session-item"
                                :class="{ 'session-item--active': session.sessionNo === form.sessionNo }"
                                @click="pickSession(session.sessionNo)"
                            >
                                <div class="lab-row" style="justify-content: space-between">
                                    <span>{{ session.title }}</span>
                                    <el-button size="small" text type="danger" @click.stop="removeSession(session.sessionNo)">
                                        删除
                                    </el-button>
                                </div>
                                <div class="lab-hint">{{ session.sessionNo }} · 消息 {{ session.messageCount }} · 运行 {{ session.runCount }}</div>
                            </div>
                            <div v-if="sessions.length === 0" class="lab-hint">还没有会话</div>
                        </div>
                    </div>

                    <div class="lab-card">
                        <div class="lab-card__title">会话消息</div>
                        <div class="lab-card__desc">工具消息也会被记录进来，看完就能复盘一轮运行的完整过程。</div>
                        <div class="stream-box">
                            <div v-for="message in messages" :key="message.seq" class="stream-row">
                                <el-tag size="small" effect="plain" :type="message.role === 'TOOL' ? 'warning' : 'info'">
                                    {{ message.role }} #{{ message.seq }}
                                </el-tag>
                                <span class="lab-mono" style="white-space: pre-wrap">{{ message.content }}</span>
                            </div>
                            <div v-if="messages.length === 0" class="lab-hint">选一个会话查看消息</div>
                        </div>
                    </div>
                </div>
            </el-tab-pane>

            <el-tab-pane label="对照实验">
                <div class="lab-card">
                    <div class="lab-card__title">跑一组对照实验</div>
                    <div class="lab-card__desc">
                        同一个任务用不同模式各跑一遍，把步数、工具调用与耗时并列。没有对照的单次结果说明不了任何问题。
                    </div>
                    <el-form size="small" inline label-width="80px">
                        <el-form-item label="实验编号">
                            <el-select v-model="labKey" style="width: 160px">
                                <el-option v-for="item in experiments" :key="item" :label="item" :value="item" />
                            </el-select>
                        </el-form-item>
                        <el-form-item label="模式">
                            <el-select v-model="labModes" multiple collapse-tags style="width: 220px">
                                <el-option v-for="item in modeOptions" :key="item" :label="item" :value="item" />
                            </el-select>
                        </el-form-item>
                        <el-form-item>
                            <el-button type="primary" size="small" @click="runLab">开跑</el-button>
                            <el-button size="small" @click="callLabResults(() => api.labResults(labKey, 1, 20))">刷新结果</el-button>
                        </el-form-item>
                    </el-form>
                    <el-table :data="labItems" border stripe size="small" max-height="320">
                        <el-table-column prop="mode" label="模式" width="120" />
                        <el-table-column prop="finishReason" label="结束原因" min-width="140" />
                        <el-table-column prop="steps" label="步数" width="90" />
                        <el-table-column prop="toolCalls" label="工具调用" width="100" />
                        <el-table-column prop="promptTokens" label="prompt token" width="120" />
                        <el-table-column prop="completionTokens" label="完成 token" width="120" />
                        <el-table-column prop="elapsedMillis" label="耗时 ms" width="110" />
                        <el-table-column prop="detail" label="说明" min-width="180" show-overflow-tooltip />
                    </el-table>
                    <ResultView :result="labResult" title="本次实验返回" :max-height="220" style="margin-top: 10px" />
                </div>
            </el-tab-pane>
        </el-tabs>
    </div>
</template>

<style scoped>
.stream-box {
    border: 1px solid var(--lab-border);
    border-radius: 10px;
    background: #fbfcfe;
    max-height: 340px;
    overflow: auto;
    padding: 10px 12px;
}

.stream-row {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    padding: 6px 0;
    border-bottom: 1px dashed #eef1f7;
}

.stream-row:last-child {
    border-bottom: none;
}

.session-list {
    max-height: 340px;
    overflow: auto;
}

.session-item {
    padding: 8px 10px;
    border-radius: 8px;
    cursor: pointer;
    margin-bottom: 6px;
    background: #fbfcfe;
    border: 1px solid var(--lab-border);
}

.session-item--active {
    background: var(--lab-primary-soft);
    border-color: #b9cdf7;
}
</style>
