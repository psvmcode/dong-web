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
    <el-skeleton :loading="!!loading" animated>
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
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    padding: 14px 16px;
    min-height: 92px;
}

.stat-card__label {
    font-size: 12px;
    color: var(--lab-muted);
}

.stat-card__value {
    margin-top: 8px;
    font-size: 24px;
    font-weight: 600;
    letter-spacing: 0.4px;
    color: var(--lab-text);
}

.stat-card__hint {
    margin-top: 6px;
    font-size: 12px;
    color: #93a0b5;
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
