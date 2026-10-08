<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { RefreshRight, Upload } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/upload';
import { computeFileHash, formatBytes, type HashMode, type HashResult } from '@/utils/fileHash';

/**
 * 文件分片上传实验台。
 *
 * <p>这一页要回答三个问题：
 * <ol>
 *   <li>分片上传到底比整文件传好在哪——看并发与断点续传</li>
 *   <li>断网/刷新之后能不能接着传——看「重新初始化」按钮，它会把已收分片问回来</li>
 *   <li>特大文件为什么不能全量算指纹——看 full 与 sample 的耗时差</li>
 * </ol>
 *
 * <p>分片状态用网格可视化：每一格是一个分片，灰色待传、蓝色在传、绿色已收、红色失败。
 * 断点续传的效果在网格上最直观——重新初始化之后，绿色的格子会被直接点亮，只补灰色的。
 */

/** 分片状态。 */
type ChunkState = 'pending' | 'uploading' | 'done' | 'failed';

const file = ref<File | null>(null);
const hashMode = ref<HashMode>('sample');
const hashResult = ref<HashResult | null>(null);
const hashing = ref(false);
const hashProgress = reactive({ done: 0, total: 0 });

const chunkSize = ref(5 * 1024 * 1024);
const concurrency = ref(3);
const uploadId = ref('');
const totalChunks = ref(0);
const chunkStates = ref<ChunkState[]>([]);
const uploading = ref(false);
const paused = ref(false);
const instant = ref(false);
const finished = ref(false);

const startedAt = ref(0);
const elapsedMs = ref(0);
let timer: number | undefined;

const { result: statusResult, call: callStatus } = useApi<api.UploadStatusResponse>();
const { result: taskResult, call: callTasks } = useApi<{ total: number; list: api.UploadTaskResponse[] }>();
const { call: callComplete } = useApi<string>();
const { call: callCancel } = useApi<null>();

/**
 * 已上传分片数。
 */
const doneCount = computed(() => chunkStates.value.filter((state) => state === 'done').length);

/**
 * 上传进度百分比。
 */
const percent = computed(() => (totalChunks.value === 0 ? 0 : Math.round((doneCount.value / totalChunks.value) * 100)));

/**
 * 平均速度，MB/s。
 */
const speed = computed(() => {
    if (elapsedMs.value <= 0 || !file.value) {
        return '0.0';
    }
    const bytes = doneCount.value * chunkSize.value;
    return ((bytes / 1024 / 1024) / (elapsedMs.value / 1000)).toFixed(1);
});

/**
 * 选择文件。
 *
 * @param target 事件目标
 */
function onPick(target: EventTarget | null): void {
    const input = target as HTMLInputElement;
    const picked = input.files?.[0];
    if (!picked) {
        return;
    }
    resetAll();
    file.value = picked;
    void computeHash();
}

/**
 * 计算文件指纹，两种模式都可以在这里对比耗时。
 */
async function computeHash(): Promise<void> {
    if (!file.value) {
        return;
    }
    hashing.value = true;
    hashProgress.done = 0;
    hashProgress.total = 0;
    try {
        hashResult.value = await computeFileHash(file.value, hashMode.value, (done, total) => {
            hashProgress.done = done;
            hashProgress.total = total;
        });
    } finally {
        hashing.value = false;
    }
}

/**
 * 初始化上传任务，拿到已收分片点亮网格。
 */
async function prepare(): Promise<void> {
    if (!file.value || !hashResult.value) {
        ElMessage.warning('先选文件并算完指纹');
        return;
    }
    const res = await api.init({
        fileName: file.value.name,
        fileSize: file.value.size,
        chunkSize: chunkSize.value,
        fileHash: hashResult.value.hash,
        hashMode: hashMode.value,
    });
    if (!res.ok || !res.data) {
        ElMessage.error(res.message);
        return;
    }
    uploadId.value = res.data.uploadId;
    totalChunks.value = res.data.totalChunks;
    instant.value = res.data.instant;
    finished.value = res.data.instant;
    chunkStates.value = Array.from({ length: res.data.totalChunks }, () => 'pending');
    for (const index of res.data.uploadedChunks) {
        if (index < chunkStates.value.length) {
            chunkStates.value[index] = 'done';
        }
    }
    if (res.data.instant) {
        ElMessage.success('命中秒传，这个文件服务端已经有了，无需再传');
    } else if (res.data.uploadedChunks.length > 0) {
        ElMessage.success(`续传：已有 ${res.data.uploadedChunks.length} 个分片，只补剩下的`);
    }
}

/**
 * 开始上传，按并发度推进所有待传分片。
 */
async function start(): Promise<void> {
    if (!file.value) {
        ElMessage.warning('先选一个文件');
        return;
    }
    if (!uploadId.value) {
        await prepare();
    }
    if (instant.value || finished.value) {
        return;
    }
    uploading.value = true;
    paused.value = false;
    startedAt.value = Date.now();
    timer = window.setInterval(() => {
        elapsedMs.value = Date.now() - startedAt.value;
    }, 200);
    const queue = chunkStates.value
        .map((state, index) => ({ state, index }))
        .filter((item) => item.state !== 'done')
        .map((item) => item.index);
    await runPool(queue, concurrency.value);
    window.clearInterval(timer);
    elapsedMs.value = Date.now() - startedAt.value;
    uploading.value = false;
    if (!paused.value && chunkStates.value.every((state) => state === 'done')) {
        await merge();
    }
    void loadTasks();
}

/**
 * 并发执行任务队列。
 *
 * @param queue 待传分片下标
 * @param limit 并发上限
 */
async function runPool(queue: number[], limit: number): Promise<void> {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
        while (cursor < queue.length) {
            if (paused.value) {
                return;
            }
            const index = queue[cursor];
            cursor += 1;
            await uploadOne(index);
        }
    });
    await Promise.all(workers);
}

/**
 * 上传单个分片。
 *
 * @param index 分片下标
 */
async function uploadOne(index: number): Promise<void> {
    if (!file.value) {
        return;
    }
    chunkStates.value[index] = 'uploading';
    const start = index * chunkSize.value;
    const blob = file.value.slice(start, Math.min(start + chunkSize.value, file.value.size));
    const res = await api.chunk({ uploadId: uploadId.value, chunkIndex: index, blob });
    chunkStates.value[index] = res.ok ? 'done' : 'failed';
    if (!res.ok) {
        ElMessage.warning(`分片 #${index} 失败：${res.message}`);
    }
}

/**
 * 合并分片。
 */
async function merge(): Promise<void> {
    const res = await callComplete(() => api.complete(uploadId.value));
    if (res.ok) {
        finished.value = true;
        ElMessage.success('所有分片已合并，上传完成');
    } else {
        ElMessage.warning(res.message);
    }
}

/**
 * 暂停上传。正在传的分片会传完，队列不再取新的。
 */
function pause(): void {
    paused.value = true;
    uploading.value = false;
    window.clearInterval(timer);
    ElMessage.info('已暂停，点「继续」接着传');
}

/**
 * 模拟刷新页面：重新初始化，把服务端已收的分片问回来。
 */
async function reloadProgress(): Promise<void> {
    if (!file.value) {
        return;
    }
    await prepare();
    void loadTasks();
}

/**
 * 取消上传任务。
 */
async function cancelTask(): Promise<void> {
    if (!uploadId.value) {
        return;
    }
    await callCancel(() => api.cancel(uploadId.value));
    ElMessage.success('任务已取消');
    resetAll();
    void loadTasks();
}

/**
 * 清空本地状态但保留文件选择之外的所有上下文。
 */
function resetAll(): void {
    uploadId.value = '';
    totalChunks.value = 0;
    chunkStates.value = [];
    instant.value = false;
    finished.value = false;
    uploading.value = false;
    paused.value = false;
    elapsedMs.value = 0;
    window.clearInterval(timer);
}

/**
 * 加载任务列表。
 */
function loadTasks(): void {
    void callTasks(() => api.tasks({ pageNum: 1, pageSize: 8 }));
}

const taskRows = computed<api.UploadTaskResponse[]>(() =>
    taskResult.value?.ok && taskResult.value.data ? taskResult.value.data.list : [],
);

onMounted(loadTasks);
</script>

<template>
    <div>
        <SectionHead
            title="文件分片上传"
            desc="大文件切成小块并发上传，中断之后只补传缺失的分片。特大文件还要解决一件事：指纹不能全量读进内存算。"
        >
            <template #actions>
                <el-button size="small" :icon="RefreshRight" @click="loadTasks()">刷新任务列表</el-button>
            </template>
        </SectionHead>

        <div class="up__hero">
            <div class="up__drop" @click="($refs.fileInput as HTMLInputElement | undefined)?.click()">
                <div class="up__drop-icon">📁</div>
                <div class="up__drop-text">
                    {{ file ? file.name : '点击选择文件，或拖到这里' }}
                </div>
                <div v-if="file" class="up__drop-sub">
                    {{ formatBytes(file.size) }} · 切成 {{ Math.ceil(file.size / chunkSize) }} 片（每片 {{ formatBytes(chunkSize) }}）
                </div>
                <div v-else class="up__drop-sub">支持任意大小，用来验证 GB 级文件的分片与续传</div>
                <input ref="fileInput" type="file" hidden @change="onPick($event.target)" />
            </div>

            <div class="up__hash">
                <div class="up__hash-title">
                    文件指纹
                    <el-radio-group v-model="hashMode" size="small" :disabled="!file" @change="computeHash()">
                        <el-radio-button value="sample">抽样</el-radio-button>
                        <el-radio-button value="full">全量</el-radio-button>
                    </el-radio-group>
                </div>
                <div v-if="hashResult" class="up__hash-value">{{ hashResult.hash }}</div>
                <div v-else class="up__hash-empty">选择文件后自动计算</div>
                <div v-if="hashResult" class="up__hash-meta">
                    模式 {{ hashResult.mode === 'full' ? '全量' : '抽样' }} · 参与块数
                    {{ hashResult.blocks }} · 耗时 {{ hashResult.elapsedMs }} ms
                </div>
                <el-progress
                    v-if="hashing"
                    :percentage="hashProgress.total ? Math.round((hashProgress.done / hashProgress.total) * 100) : 0"
                    :stroke-width="6"
                    style="margin-top: 8px"
                />
                <div class="up__hash-tip">
                    全量模式的块数随文件大小线性增长，抽样恒为 3 块。文件越大，两者的耗时差越明显。
                </div>
            </div>
        </div>

        <div class="up__panel">
            <div class="up__panel-title">上传控制</div>
            <el-form size="small" inline>
                <el-form-item label="分片大小">
                    <el-select v-model="chunkSize" style="width: 140px">
                        <el-option label="1 MB" :value="1024 * 1024" />
                        <el-option label="5 MB" :value="5 * 1024 * 1024" />
                        <el-option label="10 MB" :value="10 * 1024 * 1024" />
                    </el-select>
                </el-form-item>
                <el-form-item label="并发数">
                    <el-select v-model="concurrency" style="width: 120px">
                        <el-option label="1" :value="1" />
                        <el-option label="3" :value="3" />
                        <el-option label="6" :value="6" />
                    </el-select>
                </el-form-item>
                <el-form-item>
                    <el-button type="primary" :disabled="!file || uploading" @click="prepare()">初始化</el-button>
                    <el-button type="success" :disabled="!file || uploading || finished" @click="start()">
                        {{ doneCount > 0 && !finished ? '继续上传' : '开始上传' }}
                    </el-button>
                    <el-button :disabled="!uploading" @click="pause()">暂停</el-button>
                    <el-button :disabled="!file" @click="reloadProgress()">模拟刷新页面</el-button>
                    <el-button type="danger" plain :disabled="!uploadId" @click="cancelTask()">取消任务</el-button>
                </el-form-item>
            </el-form>
            <div class="up__hint">
                「模拟刷新页面」会重新调用初始化接口——这就是断点续传的全部秘密：
                服务端如实告诉前端「已经收过哪些分片」，前端只补剩下的。
            </div>
        </div>

        <div v-if="instant" class="up__instant">
            ⚡ 命中秒传：这个文件服务端已经有一份了，一个字节都不用再传
        </div>

        <div v-if="totalChunks > 0" class="up__panel">
            <div class="up__panel-title">
                上传进度
                <span class="up__progress-meta">
                    {{ doneCount }} / {{ totalChunks }} 片 · {{ speed }} MB/s · {{ (elapsedMs / 1000).toFixed(1) }} s
                </span>
            </div>
            <el-progress :percentage="percent" :stroke-width="14" :status="finished ? 'success' : undefined" />
            <div class="up__grid">
                <div
                    v-for="(state, index) in chunkStates"
                    :key="index"
                    class="up__cell"
                    :class="`up__cell--${state}`"
                    :title="`分片 #${index}：${state}`"
                >
                    {{ index }}
                </div>
            </div>
            <div class="up__legend">
                <span><i class="up__dot up__dot--pending"></i>待上传</span>
                <span><i class="up__dot up__dot--uploading"></i>上传中</span>
                <span><i class="up__dot up__dot--done"></i>已接收</span>
                <span><i class="up__dot up__dot--failed"></i>失败</span>
            </div>
        </div>

        <div class="up__panel">
            <div class="up__panel-title">上传任务</div>
            <el-table :data="taskRows" border stripe size="small" empty-text="还没有上传任务">
                <el-table-column prop="uploadId" label="任务号" min-width="200" show-overflow-tooltip />
                <el-table-column prop="fileName" label="文件名" min-width="150" show-overflow-tooltip />
                <el-table-column label="大小" width="100">
                    <template #default="{ row }">{{ formatBytes(row.fileSize) }}</template>
                </el-table-column>
                <el-table-column label="进度" width="130">
                    <template #default="{ row }">{{ row.uploadedChunks }} / {{ row.totalChunks }}</template>
                </el-table-column>
                <el-table-column prop="hashMode" label="指纹模式" width="100" />
                <el-table-column label="状态" width="110">
                    <template #default="{ row }">
                        <el-tag :type="row.status === 1 ? 'success' : row.status === 2 ? 'info' : 'warning'" size="small">
                            {{ row.statusName }}
                        </el-tag>
                    </template>
                </el-table-column>
            </el-table>
        </div>
    </div>
</template>

<style scoped>
.up__hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 14px;
    margin-bottom: 14px;
}

.up__drop {
    background: #fff;
    border: 2px dashed #c9d3e4;
    border-radius: var(--lab-radius);
    padding: 30px 20px;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.16s ease, background 0.16s ease;
}

.up__drop:hover {
    border-color: #3d6ff5;
    background: #fafcff;
}

.up__drop-icon {
    font-size: 40px;
}

.up__drop-text {
    font-size: 15px;
    font-weight: 600;
    margin-top: 8px;
    word-break: break-all;
}

.up__drop-sub {
    font-size: 12px;
    color: var(--lab-muted);
    margin-top: 4px;
}

.up__hash,
.up__panel {
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    padding: 14px 16px;
}

.up__hash-title {
    font-size: 13px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.up__hash-value {
    font-family: Menlo, Consolas, monospace;
    font-size: 12px;
    color: #3d6ff5;
    margin-top: 8px;
    word-break: break-all;
}

.up__hash-empty,
.up__hash-meta {
    font-size: 12px;
    color: var(--lab-muted);
    margin-top: 6px;
}

.up__hash-tip {
    font-size: 12px;
    color: var(--lab-muted);
    line-height: 1.7;
    margin-top: 10px;
}

.up__panel {
    margin-bottom: 14px;
}

.up__panel-title {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 10px;
}

.up__progress-meta {
    font-size: 12px;
    font-weight: 400;
    color: var(--lab-muted);
}

.up__hint {
    font-size: 12px;
    color: var(--lab-muted);
    line-height: 1.8;
    background: #fafbfd;
    border-radius: 8px;
    padding: 8px 12px;
    margin-top: 8px;
}

.up__instant {
    background: #fff9e6;
    border: 1px solid #ffe0a3;
    border-radius: var(--lab-radius);
    padding: 14px 16px;
    font-size: 14px;
    font-weight: 600;
    color: #b26a00;
    margin-bottom: 14px;
}

.up__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(34px, 1fr));
    gap: 5px;
    margin-top: 14px;
}

.up__cell {
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
    font-size: 11px;
    background: #f0f2f6;
    color: #7a869a;
}

.up__cell--uploading {
    background: #d9e4ff;
    color: #3d6ff5;
}

.up__cell--done {
    background: #d9f2e3;
    color: #16a34a;
    font-weight: 600;
}

.up__cell--failed {
    background: #ffe0dd;
    color: #dc4a4a;
}

.up__legend {
    display: flex;
    gap: 16px;
    margin-top: 10px;
    font-size: 12px;
    color: var(--lab-muted);
}

.up__dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 3px;
    margin-right: 4px;
}

.up__dot--pending {
    background: #f0f2f6;
}

.up__dot--uploading {
    background: #d9e4ff;
}

.up__dot--done {
    background: #d9f2e3;
}

.up__dot--failed {
    background: #ffe0dd;
}

@media (max-width: 1000px) {
    .up__hero {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
