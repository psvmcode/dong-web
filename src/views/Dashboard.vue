<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Refresh } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import StatCard from '@/components/StatCard.vue';
import { menuGroups } from '@/router/menu';
import { cacheStats } from '@/api/cache';
import { currentIndex, docCount } from '@/api/search';
import { status as mqStatus } from '@/api/mq';
import { probeHealth, type HealthProbe } from '@/api/system';
import { thousand } from '@/utils/format';

/**
 * 实验总览。
 *
 * <p>这一页回答三件事：后端通不通、各场景现在是什么状态、下一步去哪个实验。
 *
 * <p>四个指标各自独立加载，互不阻塞：ES 慢的时候只有 ES 那张卡在转圈，
 * 不会把整屏一起卡在骨架态里让人以为服务挂了。
 */

const router = useRouter();

const probe = ref<HealthProbe | null>(null);
const esDocs = ref<number | null>(null);
const indexName = ref('');
const hits = ref<number | null>(null);
const mqImpl = ref('');

const healthLoading = ref(false);
const esLoading = ref(false);
const cacheLoading = ref(false);
const mqLoading = ref(false);

const scenes = computed(() => menuGroups.filter((group) => group.key !== 'overview'));

/**
 * 探活后端。含 503 在内的任何响应都算在线，只有连不上才算离线。
 */
async function loadHealth() {
    healthLoading.value = true;
    try {
        probe.value = await probeHealth();
    } finally {
        healthLoading.value = false;
    }
}

/**
 * 取 ES 文档数与当前索引别名。
 */
async function loadEs() {
    esLoading.value = true;
    try {
        const [count, index] = await Promise.all([docCount(), currentIndex()]);
        esDocs.value = count.ok ? count.data : null;
        indexName.value = index.ok ? index.data : '';
    } finally {
        esLoading.value = false;
    }
}

/**
 * 取缓存命中率。
 */
async function loadCache() {
    cacheLoading.value = true;
    try {
        const res = await cacheStats();
        hits.value = res.ok ? res.data.hitRatioPercent : null;
    } finally {
        cacheLoading.value = false;
    }
}

/**
 * 取当前生效的消息实现。
 */
async function loadMq() {
    mqLoading.value = true;
    try {
        const res = await mqStatus();
        // status 返回 { active, local, rocketmq, kafka }，active 才是当前生效的实现
        mqImpl.value = res.ok ? String(res.data.active ?? '未知') : '未启用';
    } finally {
        mqLoading.value = false;
    }
}

/**
 * 刷新全部指标。四路并发，谁也不等谁。
 */
function refresh() {
    void loadHealth();
    void loadEs();
    void loadCache();
    void loadMq();
}

const reachable = computed(() => probe.value?.reachable ?? false);
const healthUp = computed(() => probe.value?.status === 'UP');
const components = computed(() =>
    Object.entries(probe.value?.components ?? {}).map(([name, body]) => ({ name, status: body.status })),
);
const downComponents = computed(() => components.value.filter((item) => item.status !== 'UP').map((item) => item.name));
const healthText = computed(() => {
    if (!probe.value) {
        return '未获取';
    }
    if (!probe.value.reachable) {
        return 'DOWN';
    }
    if (probe.value.status === 'UP') {
        return 'UP';
    }
    return probe.value.status === 'UNKNOWN' ? '在线' : '降级运行';
});

onMounted(refresh);
</script>

<template>
    <div>
        <SectionHead
            title="实验总览"
            desc="一个入口看到后端连通性与各场景关键指标。中间件没开时对应指标会显示「未启用」，这本身就是实验想让人看到的事实。"
        >
            <template #actions>
                <el-button size="small" :icon="Refresh" @click="refresh">刷新指标</el-button>
            </template>
        </SectionHead>

        <el-alert
            v-if="probe && !reachable"
            type="error"
            show-icon
            :closable="false"
            title="后端不可达"
            :description="`${probe.note || '连不上 8090'}。请先在 dong 目录执行 mvn spring-boot:run，再回来刷新。`"
            style="margin-bottom: 16px"
        />
        <el-alert
            v-else-if="downComponents.length > 0"
            type="warning"
            show-icon
            :closable="false"
            title="有中间件不可用（后端仍是活着的）"
            :description="`${downComponents.join('、')} 状态不是 UP，相关场景会返回 1004（未启用）或 1005（依赖不可用）。actuator 此时会返回 HTTP 503，但业务接口依然正常。`"
            style="margin-bottom: 16px"
        />

        <div class="lab-grid lab-grid--4">
            <StatCard
                label="后端健康"
                :value="healthText"
                :tone="healthUp ? 'good' : reachable ? 'warn' : 'bad'"
                :loading="healthLoading"
                :hint="probe?.httpStatus ? `actuator HTTP ${probe.httpStatus} · 组件 ${components.length} 个` : 'actuator 未响应'"
            />
            <StatCard
                label="ES 文档数"
                :value="esDocs === null ? '未获取' : thousand(esDocs)"
                tone="accent"
                :loading="esLoading"
                :hint="indexName ? `别名指向 ${indexName}` : '索引别名暂不可用'"
            />
            <StatCard
                label="缓存命中率"
                :value="hits === null ? '未获取' : `${hits}%`"
                :tone="hits !== null && hits >= 60 ? 'good' : 'warn'"
                :loading="cacheLoading"
                hint="累计口径，可在缓存页重置"
            />
            <StatCard
                label="消息实现"
                :value="mqImpl || '未获取'"
                tone="accent"
                :loading="mqLoading"
                hint="可在 mq 页查看实现细节"
            />
        </div>

        <div class="lab-card">
            <div class="lab-card__title">健康组件</div>
            <div class="lab-card__desc">
                后端 actuator 暴露出来的各组件状态。actuator 在任意组件 DOWN 时会整体返回 503——
                那代表降级运行，不代表后端没启动。
            </div>
            <div v-if="components.length === 0" class="lab-hint">
                {{ probe?.note || '暂无组件数据' }}
            </div>
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
