<script setup lang="ts">
import { computed } from 'vue';
import { DataLine, Delete } from '@element-plus/icons-vue';
import { useTraceStore } from '@/stores/trace';

/**
 * 内部链路抽屉。
 *
 * <p>产品界面不该被调试信息污染，但实验台又必须能回答「刚才那一下到底发生了什么」。
 * 折中的办法是把它收进右下角的抽屉：平时只有一个小按钮，点开才看到全部。
 */

const trace = useTraceStore();
const visible = computed(() => trace.visible);

/**
 * 把响应体压成一行摘要，避免抽屉里塞满 JSON。
 *
 * @param entry 记录
 */
function toneOf(entry: { ok: boolean; code: number }): 'success' | 'warning' | 'danger' {
    if (entry.ok) {
        return 'success';
    }
    return entry.code === -1 ? 'danger' : 'warning';
}
</script>

<template>
    <div class="trace-fab">
        <el-badge :value="visible.length" :hidden="visible.length === 0" :max="99" type="primary">
            <el-button circle type="primary" :icon="DataLine" title="内部链路" @click="trace.open = true" />
        </el-badge>
    </div>

    <el-drawer v-model="trace.open" title="内部链路" size="46%" :append-to-body="true">
        <template #header>
            <div class="trace-head">
                <span>内部链路</span>
                <div class="lab-row">
                    <el-checkbox v-model="trace.onlyCurrentPage" size="small">只看当前页面</el-checkbox>
                    <el-checkbox v-model="trace.enabled" size="small">继续记录</el-checkbox>
                    <el-button size="small" :icon="Delete" @click="trace.clear()">清空</el-button>
                </div>
            </div>
        </template>

        <el-alert
            type="info"
            :closable="false"
            title="这一层是给实验看的"
            description="上面那部分是产品界面，这里记录它背后每一次请求的耗时、返回码与命中情况。成功的请求是绿色的，业务拒绝（1002/1003/1004 等）是橙色，网络失败是红色。"
            style="margin-bottom: 12px"
        />

        <el-descriptions :column="3" border size="small" style="margin-bottom: 12px">
            <el-descriptions-item label="记录条数">{{ visible.length }}</el-descriptions-item>
            <el-descriptions-item label="最近 10 次平均耗时">{{ trace.avgElapsed }} ms</el-descriptions-item>
            <el-descriptions-item label="范围">{{ trace.onlyCurrentPage ? '当前页面' : '全部页面' }}</el-descriptions-item>
        </el-descriptions>

        <el-timeline v-if="visible.length > 0" class="trace-timeline">
            <el-timeline-item
                v-for="item in visible"
                :key="item.id"
                :type="toneOf(item)"
                :timestamp="`${new Date(item.at).toLocaleTimeString('zh-CN', { hour12: false })}`"
                placement="top"
            >
                <div class="trace-item">
                    <el-tag size="small" effect="dark" :type="toneOf(item)">{{ item.method }}</el-tag>
                    <span class="lab-mono">{{ item.url }}</span>
                    <span class="lab-spacer" />
                    <el-tag size="small" effect="plain">{{ item.elapsed }} ms</el-tag>
                    <el-tag size="small" effect="plain" :type="item.ok ? 'success' : 'warning'">
                        {{ item.ok ? 'code 0' : `code ${item.code}` }}
                    </el-tag>
                </div>
                <div class="trace-summary">{{ item.message }}<template v-if="item.summary"> · {{ item.summary }}</template></div>
            </el-timeline-item>
        </el-timeline>
        <div v-else class="lab-hint">当前范围没有请求记录，去页面上点几下就有。</div>
    </el-drawer>
</template>

<style scoped>
.trace-fab {
    position: fixed;
    right: 22px;
    bottom: 22px;
    z-index: 2000;
}

.trace-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 15px;
    font-weight: 600;
}

.trace-item {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.trace-summary {
    margin-top: 4px;
    font-size: 12px;
    color: var(--lab-muted);
    word-break: break-all;
}

.trace-timeline {
    padding-left: 4px;
    max-height: calc(100vh - 260px);
    overflow: auto;
}
</style>
