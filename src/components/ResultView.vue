<script setup lang="ts">
import { computed } from 'vue';
import { CircleCheck, CircleClose, Timer } from '@element-plus/icons-vue';
import type { ApiResult } from '@/api/http';
import { duration, pretty } from '@/utils/format';

/**
 * 接口响应面板。
 *
 * <p>每个实验的核心价值在于「看到后端到底返回了什么」，包括失败。
 * 所以这个面板刻意把 code / message / 耗时都摊开，而不是把失败折成一句 toast。
 */

const props = withDefaults(
    defineProps<{
        result: ApiResult<unknown> | null;
        loading?: boolean;
        title?: string;
        emptyText?: string;
        maxHeight?: number;
    }>(),
    {
        loading: false,
        title: '响应',
        emptyText: '还没有调用，填好参数点上面的按钮',
        maxHeight: 420,
    },
);

const bodyText = computed(() => (props.result ? pretty(props.result.data) : ''));
const isPlainText = computed(() => typeof props.result?.data === 'string');
</script>

<template>
    <div v-loading="loading" class="result-box" :class="{ 'result-box--error': result && !result.ok, 'result-box--text': isPlainText }">
        <div class="result-box__head">
            <el-tag v-if="!result" type="info" size="small" effect="plain">{{ title }}</el-tag>
            <template v-else>
                <el-tag :type="result.ok ? 'success' : 'danger'" size="small" effect="dark" round>
                    <el-icon v-if="result.ok"><CircleCheck /></el-icon>
                    <el-icon v-else><CircleClose /></el-icon>
                    <span style="margin-left: 4px">{{ result.ok ? '成功' : `错误 ${result.code}` }}</span>
                </el-tag>
                <span>{{ result.message }}</span>
                <span class="lab-spacer" />
                <el-tooltip content="本机发出请求到收完响应体的耗时，含网络往返" placement="top">
                    <span class="lab-row" style="gap: 4px">
                        <el-icon><Timer /></el-icon>
                        {{ duration(result.elapsed) }}
                    </span>
                </el-tooltip>
            </template>
        </div>
        <pre v-if="result" class="result-box__body" :style="{ maxHeight: `${maxHeight}px` }">{{ bodyText }}</pre>
        <div v-else class="result-box__body" :style="{ maxHeight: `${maxHeight}px` }">{{ emptyText }}</div>
        <slot />
    </div>
</template>
