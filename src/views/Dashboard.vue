<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Refresh } from '@element-plus/icons-vue';
import StatCard from '@/components/StatCard.vue';
import SectionHead from '@/components/SectionHead.vue';
import { menuGroups } from '@/router/menu';
import { cacheStats } from '@/api/cache';
import { docCount, currentIndex } from '@/api/search';
import { status as mqStatus } from '@/api/mq';
import { health, type HealthBody } from '@/api/system';
import { thousand } from '@/utils/format';

/**
 * 实验总览。
 *
 * <p>这一页回答三件事：后端通不通、各场景现在是什么状态、下一步去哪个实验。
 * 所有指标都做成「拉不到就显示未获取」而不是报错——
 * 中间件没开的场景本来就应该被看到，而不是让整页挂掉。
 */

const router = useRouter();

const healthBody = ref<HealthBody | null>(null);
const esDocs = ref<number | null>(null);
const indexName = ref('');
const hits = ref<number | null>(null);
const mqImpl = ref('');
const loading = ref(false);

const scenes = computed(() => menuGroups.filter((group) => group.key !== 'overview'));

/**
 * 拉取四个探针指标。任何一个失败都不影响其余指标的展示。
 */
async function refresh() {
    loading.value = true;
    try {
        const [healthRes, docRes, statRes, mqRes, idxRes] = await Promise.all([
            Promise.resolve(health()),
            docCount(),
            cacheStats(),
            mqStatus(),
            currentIndex(),
        ]);
        healthBody.value = healthRes;
        esDocs.value = docRes.ok ? docRes.data : null;
        indexName.value = idxRes.ok ? idxRes.data : '';
        hits.value = statRes.ok ? statRes.data.hitRatioPercent : null;
        // status 返回的是 { active, local, rocketmq, kafka }，active 才是当前生效的实现
        mqImpl.value = mqRes.ok ? String(mqRes.data.active ?? '未知') : '未启用';
    } finally {
        loading.value = false;
    }
}

/**
 * actuator 会因为某个中间件不可用而整体 DOWN，
 * 但业务接口此时仍可用。这里区分「不可达」与「有组件不可用」。
 */
const reachable = computed(() => healthBody.value !== null);
const healthUp = computed(() => healthBody.value?.status === 'UP');
const downComponents = computed(() => components.value.filter((item) => item.status !== 'UP').map((item) => item.name));
const components = computed(() =>
    Object.entries(healthBody.value?.components ?? {}).map(([name, body]) => ({
        name,
        status: body.status,
    })),
);

onMounted(refresh);
</script>

<template>
    <div>
        <SectionHead
            title="实验总览"
            desc="一个入口看到后端连通性与各场景关键指标。中间件没开时对应指标会显示「未启用」，这本身就是实验想让人看到的事实。"
        >
            <template #actions>
                <el-button size="small" :icon="Refresh" :loading="loading" @click="refresh">刷新指标</el-button>
            </template>
        </SectionHead>

        <el-alert
            v-if="!reachable"
            type="error"
            show-icon
            :closable="false"
            title="后端不可达"
            description="请先在 dong 目录执行 mvn spring-boot:run（端口 8090），再回来刷新。"
            style="margin-bottom: 16px"
        />
        <el-alert
            v-else-if="downComponents.length > 0"
            type="warning"
            show-icon
            :closable="false"
            title="有中间件不可用"
            :description="`${downComponents.join('、')} 状态不是 UP，相关场景会返回 1004（未启用）或 1005（依赖不可用）。业务接口本身仍然可用。`"
            style="margin-bottom: 16px"
        />

        <div class="lab-grid lab-grid--4">
            <StatCard
                label="后端健康"
                :value="reachable ? (healthUp ? 'UP' : '降级运行') : '未获取'"
                :tone="healthUp ? 'good' : 'warn'"
                :loading="loading"
                :hint="`actuator/health · 组件 ${components.length} 个`"
            />
            <StatCard
                label="ES 文档数"
                :value="esDocs === null ? '未启用' : thousand(esDocs)"
                tone="accent"
                :loading="loading"
                :hint="indexName ? `别名指向 ${indexName}` : '索引别名暂不可用'"
            />
            <StatCard
                label="缓存命中率"
                :value="hits === null ? '未获取' : `${hits}%`"
                :tone="hits !== null && hits >= 60 ? 'good' : 'warn'"
                :loading="loading"
                hint="累计口径，可在缓存页重置"
            />
            <StatCard label="消息实现" :value="mqImpl || '未获取'" tone="accent" :loading="loading" hint="可在 mq 页查看实现细节" />
        </div>

        <div class="lab-card">
            <div class="lab-card__title">健康组件</div>
            <div class="lab-card__desc">后端 actuator 暴露出来的各组件状态，中间件单独不可用时会在这里先看到。</div>
            <div v-if="components.length === 0" class="lab-hint">暂无组件数据</div>
            <div v-else class="lab-row">
                <el-tag
                    v-for="item in components"
                    :key="item.name"
                    size="small"
                    effect="plain"
                    :type="item.status === 'UP' ? 'success' : 'warning'"
                    round
                >
                    {{ item.name }} · {{ item.status }}
                </el-tag>
            </div>
        </div>

        <template v-for="group in scenes" :key="group.key">
            <SectionHead :title="group.title" />
            <div class="lab-grid lab-grid--3">
                <div v-for="leaf in group.children" :key="leaf.path" class="scene-card" @click="router.push(leaf.path)">
                    <div class="scene-card__title">
                        <el-icon :size="16" color="#3d6ff5"><component :is="leaf.icon" /></el-icon>
                        {{ leaf.title }}
                    </div>
                    <div class="scene-card__desc">{{ leaf.desc }}</div>
                    <div class="scene-card__tags">
                        <el-tag v-for="tag in leaf.tags" :key="tag" size="small" effect="light" round>{{ tag }}</el-tag>
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>
