<script setup lang="ts">
/**
 * 页面标题块。统一每页的标题、一句话说明与右侧操作区。
 */

defineProps<{
    title: string;
    desc?: string;
}>();
</script>

<template>
    <div class="section-head">
        <div>
            <div class="section-head__title">{{ title }}</div>
            <div v-if="desc" class="section-head__desc">{{ desc }}</div>
        </div>
        <div class="lab-row">
            <slot name="actions" />
        </div>
    </div>
</template>

<style scoped>
.section-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 12px;
    flex-wrap: wrap;
}

.section-head__title {
    font-size: 15px;
    font-weight: 600;
}

.section-head__desc {
    margin-top: 4px;
    font-size: 12px;
    color: var(--lab-muted);
    line-height: 1.6;
    max-width: 760px;
}
</style>
