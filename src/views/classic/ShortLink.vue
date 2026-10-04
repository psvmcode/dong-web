<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Link, RefreshRight } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import ResultView from '@/components/ResultView.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/classic';
import type { ShortLinkResponse } from '@/api/types';

/**
 * 短链实验。
 *
 * <p>短链的核心取舍是「点击计数怎么落库」：每点一次都写库扛不住，
 * 所以计数先在 Redis 里累加，由 flush-hits 统一回写——
 * 代价是 Redis 挂掉会丢一小段时间的点击数。
 */

const createForm = reactive({ url: 'https://example.com/very/long/path?foo=bar', expireMinutes: 60 });
const code = ref('');

const { result: createResult, call: callCreate } = useApi<string>();
const { result: detailResult, call: callDetail } = useApi<ShortLinkResponse>();
const { result: resolveResult, call: callResolve } = useApi<string>();
const { result: hitsResult, call: callHits } = useApi<number>();
const { result: flushResult, call: callFlush } = useApi<number>();
const { call: callToggle } = useApi<null>();

const detail = computed(() => (detailResult.value?.ok ? detailResult.value.data : null));

/**
 * 生成短链。
 */
async function doCreate() {
    const res = await callCreate(() => api.createShortLink(createForm.url, createForm.expireMinutes));
    if (res.ok && res.data) {
        code.value = res.data;
        ElMessage.success(`短码 ${res.data}`);
        await loadDetail();
    }
}

/**
 * 查询详情。
 */
async function loadDetail() {
    if (!code.value) {
        return;
    }
    await Promise.all([callDetail(() => api.shortLinkDetail(code.value)), callHits(() => api.shortLinkHits(code.value))]);
}

/**
 * 解析一次（点击数 +1）。
 */
async function doResolve() {
    await callResolve(() => api.resolveShortLink(code.value));
    await callHits(() => api.shortLinkHits(code.value));
}

/**
 * 回写点击数。
 */
async function doFlush() {
    const res = await callFlush(api.flushShortLinkHits);
    if (res.ok) {
        ElMessage.success(`已回写 ${res.data} 条`);
        await loadDetail();
    }
}

/**
 * 启用 / 停用。
 *
 * @param enabled 目标状态
 */
async function toggle(enabled: boolean) {
    await callToggle(() => api.toggleShortLink(code.value, enabled));
    ElMessage.success(enabled ? '已启用' : '已停用，跳转会立刻被拒绝');
    await loadDetail();
}
</script>

<template>
    <div>
        <SectionHead
            title="短链"
            desc="短码生成、点击计数在 Redis 累加、回写数据库，以及立即生效的启停开关——这一组动作能看全缓存与数据库之间的延迟取舍。"
        />

        <div class="lab-grid lab-grid--2">
            <div class="lab-card">
                <div class="lab-card__title">生成短链</div>
                <div class="lab-card__desc">expireMinutes 不填则用后端默认过期时间。</div>
                <el-form size="small" label-width="86px">
                    <el-form-item label="原始地址">
                        <el-input v-model="createForm.url" type="textarea" :rows="2" />
                    </el-form-item>
                    <el-form-item label="有效分钟">
                        <el-input-number v-model="createForm.expireMinutes" :min="1" controls-position="right" />
                    </el-form-item>
                    <el-button type="primary" size="small" :icon="Link" @click="doCreate">生成短码</el-button>
                </el-form>
                <ResultView :result="createResult" title="短码" :max-height="120" style="margin-top: 10px" />
            </div>

            <div class="lab-card">
                <div class="lab-card__title">操作区</div>
                <div class="lab-card__desc">「解析」会累加一次点击数并命中缓存，「点击数」读的是累计值。</div>
                <el-form size="small" label-width="86px">
                    <el-form-item label="短码">
                        <el-input v-model="code" placeholder="生成后自动填入" clearable />
                    </el-form-item>
                </el-form>
                <div class="lab-row">
                    <el-button size="small" :icon="RefreshRight" @click="loadDetail()">详情</el-button>
                    <el-button size="small" type="primary" @click="doResolve">解析（+1 点击）</el-button>
                    <el-button size="small" @click="api.shortLinkJump(code).then((res) => ElMessage.info(res.ok ? String(res.data) : res.message))">
                        跳转式解析
                    </el-button>
                    <el-button size="small" type="success" @click="toggle(true)">启用</el-button>
                    <el-button size="small" type="danger" @click="toggle(false)">停用</el-button>
                    <el-button size="small" type="warning" @click="doFlush()">回写点击数</el-button>
                </div>
                <el-descriptions v-if="detail" :column="1" border size="small" style="margin-top: 12px">
                    <el-descriptions-item label="短码">{{ detail.code }}</el-descriptions-item>
                    <el-descriptions-item label="原始地址">{{ detail.originUrl }}</el-descriptions-item>
                    <el-descriptions-item label="点击数">{{ detail.hitCount }}</el-descriptions-item>
                    <el-descriptions-item label="创建时间">{{ detail.createTime }}</el-descriptions-item>
                </el-descriptions>
                <div class="lab-row" style="margin-top: 10px">
                    <el-tag v-if="hitsResult?.ok" size="small" effect="plain">实时点击数 {{ hitsResult.data }}</el-tag>
                </div>
            </div>
        </div>

        <div class="lab-card">
            <div class="lab-card__title">响应明细</div>
            <div class="lab-grid lab-grid--2">
                <ResultView :result="resolveResult" title="解析结果" :max-height="160" />
                <ResultView :result="flushResult" title="回写结果" :max-height="160" />
            </div>
            <ResultView :result="detailResult" title="详情原始返回" :max-height="200" style="margin-top: 10px" />
        </div>
    </div>
</template>
