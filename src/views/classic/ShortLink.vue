<script setup lang="ts">
import { reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { CopyDocument, Link, RefreshRight } from '@element-plus/icons-vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/classic';
import type { ShortLinkResponse } from '@/api/types';

/**
 * 短链服务。
 *
 * <p>短链看起来只是「长地址换短码」，真正的设计取舍在点击数上：
 * 每点一次都写库，热门链接会把数据库打穿，所以计数先在 Redis 里累加，
 * 再由 flush-hits 批量回写。代价是 Redis 挂掉会丢一小段时间的点击，
 * 页面把这一点摆在最显眼的位置：点「模拟访问」看数字涨，点「回写」看它落库。
 */

const url = ref('https://example.com/very/long/path?utm_source=lab&utm_campaign=demo');
const expireMinutes = ref(60);

/**
 * 本地保存的短链列表。后端没有「我的短链」接口，
 * 这一页只记本次会话里生成过的短码，刷新即清空——够用来做实验，也不假装是个产品库。
 */
interface LinkItem {
    code: string;
    originUrl: string;
    hitCount: number;
    enabled: boolean;
    createTime: string;
}

const links = ref<LinkItem[]>([]);
const latest = ref<LinkItem | null>(null);

const { result: createResult, call: callCreate } = useApi<string>();
const { result: detailResult, call: callDetail } = useApi<ShortLinkResponse>();
const { result: hitsResult, call: callHits } = useApi<number>();
const { call: callResolve } = useApi<string>();
const { result: flushResult, call: callFlush } = useApi<number>();
const { call: callToggle } = useApi<null>();

/**
 * 生成短链。
 */
async function create() {
    const res = await callCreate(() => api.createShortLink(url.value, expireMinutes.value));
    if (!res.ok || !res.data) {
        return;
    }
    const item: LinkItem = {
        code: res.data,
        originUrl: url.value,
        hitCount: 0,
        enabled: true,
        createTime: new Date().toLocaleString('zh-CN', { hour12: false }),
    };
    links.value.unshift(item);
    latest.value = item;
    ElMessage.success('短链已生成');
}

/**
 * 短链完整地址。
 *
 * @param code 短码
 */
function shortUrl(code: string): string {
    return `${window.location.origin}/s/${code}`;
}

/**
 * 复制文本。
 *
 * @param text 文本
 */
async function copy(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        ElMessage.success('已复制');
    } catch {
        ElMessage.warning('浏览器拒绝了剪贴板访问，请手动选中复制');
    }
}

/**
 * 模拟一次访问：解析短码会让点击数 +1。
 *
 * @param item 短链
 */
async function visit(item: LinkItem) {
    if (!item.enabled) {
        ElMessage.warning('这条短链已停用，跳转会被直接拒绝');
        return;
    }
    const res = await callResolve(() => api.resolveShortLink(item.code));
    if (res.ok) {
        item.hitCount += 1;
        ElMessage.success(`已跳转到 ${res.data}`);
        return;
    }
    ElMessage.warning(res.message);
}

/**
 * 从后端重新拉一次点击数，确认缓存里的数有没有回写。
 *
 * @param item 短链
 */
async function reload(item: LinkItem) {
    await Promise.all([callDetail(() => api.shortLinkDetail(item.code)), callHits(() => api.shortLinkHits(item.code))]);
    if (hitsResult.value?.ok) {
        item.hitCount = hitsResult.value.data;
    }
}

/**
 * 启用 / 停用。
 *
 * @param item 短链
 */
async function toggle(item: LinkItem) {
    const next = !item.enabled;
    const res = await callToggle(() => api.toggleShortLink(item.code, next));
    if (res.ok) {
        item.enabled = next;
        ElMessage.success(next ? '已启用' : '已停用，跳转会立刻被拒绝');
    }
}

/**
 * 把 Redis 里累加的点击数回写数据库。
 */
async function flush() {
    const res = await callFlush(api.flushShortLinkHits);
    if (res.ok) {
        ElMessage.success(`已回写 ${res.data} 条点击数`);
    }
}
</script>

<template>
    <div class="sl">
        <div class="sl__hero">
            <div class="sl__hero-title">
                <el-icon><Link /></el-icon>
                把长链接变短
            </div>
            <div class="sl__hero-desc">生成短码、分享出去，再回来看看它被点了多少次。</div>
            <div class="sl__input-row">
                <el-input v-model="url" size="large" placeholder="粘贴一个长链接">
                    <template #prepend>原链接</template>
                </el-input>
                <el-select v-model="expireMinutes" size="large" style="width: 140px">
                    <el-option label="10 分钟" :value="10" />
                    <el-option label="1 小时" :value="60" />
                    <el-option label="1 天" :value="1440" />
                    <el-option label="7 天" :value="10080" />
                </el-select>
                <el-button type="primary" size="large" @click="create">生成短链</el-button>
            </div>
        </div>

        <div v-if="latest" class="sl__result">
            <div class="sl__result-left">
                <div class="sl__result-label">短链地址</div>
                <div class="sl__result-url">{{ shortUrl(latest.code) }}</div>
                <div class="sl__result-meta">
                    短码 {{ latest.code }} · 原链接 {{ latest.originUrl }} · 生成于 {{ latest.createTime }}
                </div>
            </div>
            <div class="sl__result-right">
                <el-button :icon="CopyDocument" @click="copy(shortUrl(latest.code))">复制</el-button>
                <el-tag size="large" effect="dark" type="danger">点击 {{ latest.hitCount }}</el-tag>
                <el-switch v-model="latest.enabled" active-text="启用" inactive-text="停用" @change="toggle(latest)" />
            </div>
        </div>

        <div class="sl__panel">
            <div class="sl__panel-head">
                <div class="sl__panel-title">我的短链</div>
                <span class="lab-spacer" />
                <el-button size="small" :icon="RefreshRight" @click="flush()">回写点击数到数据库</el-button>
                <span class="lab-hint">点击数平时只在 Redis 里累加，回写之后才落库</span>
            </div>
            <el-table :data="links" border stripe size="small" empty-text="还没有生成过短链">
                <el-table-column label="短码" width="140">
                    <template #default="{ row }">
                        <span class="lab-mono">{{ row.code }}</span>
                    </template>
                </el-table-column>
                <el-table-column label="短链" min-width="220">
                    <template #default="{ row }">
                        <span class="lab-mono">{{ shortUrl(row.code) }}</span>
                    </template>
                </el-table-column>
                <el-table-column prop="originUrl" label="原始地址" min-width="240" show-overflow-tooltip />
                <el-table-column label="点击数" width="100">
                    <template #default="{ row }">
                        <span class="sl__hits">{{ row.hitCount }}</span>
                    </template>
                </el-table-column>
                <el-table-column label="状态" width="100">
                    <template #default="{ row }">
                        <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
                            {{ row.enabled ? '启用' : '停用' }}
                        </el-tag>
                    </template>
                </el-table-column>
                <el-table-column label="操作" min-width="260">
                    <template #default="{ row }">
                        <el-button size="small" @click="visit(row)">模拟访问</el-button>
                        <el-button size="small" @click="reload(row)">刷新计数</el-button>
                        <el-button size="small" @click="copy(shortUrl(row.code))">复制</el-button>
                        <el-button size="small" :type="row.enabled ? 'danger' : 'success'" @click="toggle(row)">
                            {{ row.enabled ? '停用' : '启用' }}
                        </el-button>
                    </template>
                </el-table-column>
            </el-table>
        </div>

        <div class="sl__tips">
            <div class="sl__tip">
                <div class="sl__tip-title">为什么点击数不是实时的</div>
                <div class="sl__tip-desc">
                    每一次跳转都写一次库，热门短链会把数据库打穿。所以点击数先在 Redis 里累加，
                    由定时任务批量回写——点「回写点击数」可以立刻看到这一步。
                </div>
            </div>
            <div class="sl__tip">
                <div class="sl__tip-title">停用是立刻生效的</div>
                <div class="sl__tip-desc">
                    开关拨到停用后，解析接口会直接拒绝，哪怕短码还没过期。运营上封掉一个链接，
                    不需要等它自然失效。
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.sl {
    background: #f6f8fc;
    padding: 20px;
    border-radius: var(--lab-radius);
}

.sl__hero {
    background: linear-gradient(135deg, #3d6ff5, #6f8cf7);
    border-radius: 14px;
    padding: 28px 28px 24px;
    color: #fff;
    box-shadow: 0 8px 24px rgba(61, 111, 245, 0.22);
}

.sl__hero-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 26px;
    font-weight: 700;
}

.sl__hero-desc {
    margin: 8px 0 18px;
    font-size: 14px;
    opacity: 0.86;
}

.sl__input-row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
}

.sl__input-row :deep(.el-input) {
    flex: 1;
    min-width: 280px;
}

.sl__result {
    display: flex;
    align-items: center;
    gap: 16px;
    background: #fff;
    border: 1px solid var(--lab-border);
    border-left: 4px solid #3d6ff5;
    border-radius: var(--lab-radius);
    padding: 16px 18px;
    margin: 16px 0;
    box-shadow: var(--lab-shadow);
    flex-wrap: wrap;
}

.sl__result-left {
    flex: 1;
    min-width: 260px;
}

.sl__result-label {
    font-size: 12px;
    color: var(--lab-muted);
}

.sl__result-url {
    margin: 4px 0 6px;
    font-size: 20px;
    font-weight: 600;
    color: #3d6ff5;
    font-family: Menlo, Consolas, monospace;
}

.sl__result-meta {
    font-size: 12px;
    color: var(--lab-muted);
    word-break: break-all;
}

.sl__result-right {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}

.sl__panel {
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    padding: 14px 16px;
    box-shadow: var(--lab-shadow);
}

.sl__panel-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
    flex-wrap: wrap;
}

.sl__panel-title {
    font-size: 14px;
    font-weight: 600;
}

.sl__hits {
    font-weight: 600;
    color: #e1251b;
}

.sl__tips {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 12px;
    margin-top: 14px;
}

.sl__tip {
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    padding: 14px 16px;
}

.sl__tip-title {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 6px;
}

.sl__tip-desc {
    font-size: 12px;
    color: var(--lab-muted);
    line-height: 1.75;
}
</style>
