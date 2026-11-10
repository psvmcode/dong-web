<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';

/**
 * 通用复制按钮。单号、id、traceId 这类值要能一键带去查询框或日志里排查，
 * 全局注册后模板里直接用，不必每个页面重复写一遍剪贴板兜底逻辑。
 */

const props = withDefaults(
    defineProps<{
        value: string | number | null | undefined;
        label?: string;
    }>(),
    { label: '复制' },
);

const copied = ref(false);

/**
 * 写入剪贴板，浏览器未授权时给出明确提示而不是静默失败。
 */
async function copy() {
    const text = props.value === null || props.value === undefined ? '' : String(props.value);
    if (!text) {
        return;
    }
    try {
        await navigator.clipboard.writeText(text);
        copied.value = true;
        window.setTimeout(() => {
            copied.value = false;
        }, 1500);
    } catch {
        ElMessage.warning('浏览器未授权剪贴板，请手动复制');
    }
}
</script>

<template>
    <el-button size="small" text :disabled="value === null || value === undefined || value === ''" @click="copy">
        {{ copied ? '已复制' : label }}
    </el-button>
</template>
