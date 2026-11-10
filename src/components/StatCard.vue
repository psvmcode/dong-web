<script setup lang="ts">
import { computed } from 'vue';

/**
 * 指标卡。首页与各个场景的头部都用它放一个数字 + 一句说明，
 * 统一之后「同一个数字在不同页面长得一样」。
 */

const props = defineProps<{
    label: string;
    value: string | number;
    hint?: string;
    tone?: 'plain' | 'good' | 'warn' | 'bad' | 'accent';
    loading?: boolean;
}>();

const toneClass = computed(() => `stat-card--${props.tone ?? 'plain'}`);
</script>

<template>
    <el-skeleton :loading="!!loading">
        <template #template>
            <div class="stat-card stat-card--plain">
                <el-skeleton-item variant="text" style="width: 60%" />
                <el-skeleton-item variant="text" style="width: 80%; margin-top: 10px" />
            </div>
        </template>
        <template #default>
            <div class="stat-card" :class="toneClass">
                <div class="stat-card__label">{{ label }}</div>
                <div class="stat-card__value">{{ value }}</div>
                <div v-if="hint" class="stat-card__hint">{{ hint }}</div>
                <slot />
            </div>
        </template>
    </el-skeleton>
</template>

<style scoped>
.stat-card {
    background: var(--lab-card);
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    padding: 12px 14px;
    min-height: 76px;
}

.stat-card__label {
    font-size: 12px;
    color: var(--lab-muted);
}

.stat-card__value {
    margin-top: 6px;
    font-size: 20px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--lab-text);
    word-break: break-all;
}

.stat-card__hint {
    margin-top: 4px;
    font-size: 12px;
    color: var(--lab-muted);
}

.stat-card--good .stat-card__value {
    color: var(--lab-success);
}

.stat-card--warn .stat-card__value {
    color: var(--lab-warn);
}

.stat-card--bad .stat-card__value {
    color: var(--lab-danger);
}

.stat-card--accent .stat-card__value {
    color: var(--lab-primary);
}
</style>
