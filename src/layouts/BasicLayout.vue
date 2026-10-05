<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Link, Refresh } from '@element-plus/icons-vue';
import { menuGroups, type MenuLeaf } from '@/router/menu';
import { probeHealth, type HealthProbe } from '@/api/system';
import TraceDrawer from '@/components/TraceDrawer.vue';

/**
 * 基础布局：左侧场景导航 + 右侧工作区。
 *
 * <p>侧边栏直接由 menuGroups 渲染，加场景不用改这里。
 * 顶部的连通状态每 30 秒探一次活，实验室依赖大量中间件，
 * 「是不是后端挂了」必须一眼可见，否则所有报错都会被误读成业务失败。
 */

const route = useRoute();
const router = useRouter();

const leafMap = computed(() => {
    const map = new Map<string, MenuLeaf>();
    menuGroups.forEach((group) => group.children.forEach((leaf) => map.set(leaf.path, leaf)));
    return map;
});

const current = computed(() => leafMap.value.get(route.path) ?? null);
const probe = ref<HealthProbe | null>(null);
const healthLoading = ref(false);
const checkedAt = ref('');

/**
 * 探测后端健康状态。
 *
 * <p>actuator 在中间件不可用时返回 503，但那不等于后端没启动。
 * 判定逻辑统一放在 probeHealth 里：拿到响应（含 503）就算在线，
 * actuator 完全不可用时再退回业务接口探活。
 */
async function refreshHealth() {
    healthLoading.value = true;
    try {
        probe.value = await probeHealth();
        checkedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    } finally {
        healthLoading.value = false;
    }
}

const online = computed(() => probe.value?.reachable ?? false);
const activePath = computed(() => route.path);

const components = computed(() =>
    Object.entries(probe.value?.components ?? {}).map(([name, body]) => ({ name, status: body.status })),
);
const downComponents = computed(() =>
    components.value.filter((item) => item.status !== 'UP').map((item) => item.name),
);

onMounted(() => {
    void refreshHealth();
    window.setInterval(() => void refreshHealth(), 30_000);
});
</script>

<template>
    <div class="lab-shell">
        <aside class="lab-aside">
            <div class="lab-aside__brand">
                <div class="lab-aside__title">dong · 场景实验室</div>
                <div class="lab-aside__sub">中间件用法做成可运行、可对比、可量化的实验</div>
            </div>
            <div class="lab-aside__menu">
                <el-menu
                    :default-active="activePath"
                    background-color="transparent"
                    text-color="#b9c5da"
                    active-text-color="#ffffff"
                    router
                >
                    <el-sub-menu v-for="group in menuGroups" :key="group.key" :index="group.key">
                        <template #title>
                            <el-icon><component :is="group.icon" /></el-icon>
                            <span>{{ group.title }}</span>
                        </template>
                        <el-menu-item v-for="leaf in group.children" :key="leaf.path" :index="leaf.path">
                            <el-icon><component :is="leaf.icon" /></el-icon>
                            <span>{{ leaf.title }}</span>
                        </el-menu-item>
                    </el-sub-menu>
                </el-menu>
            </div>
        </aside>

        <div class="lab-main">
            <header class="lab-header">
                <div>
                    <div class="lab-header__title">{{ current?.title ?? '实验场景' }}</div>
                    <div class="lab-header__desc">{{ current?.desc ?? '' }}</div>
                </div>
                <div class="lab-row">
                    <el-tag size="small" effect="plain" round>后端 127.0.0.1:8090（vite 代理）</el-tag>
                    <el-tooltip
                        v-if="downComponents.length > 0"
                        :content="`以下组件不可用：${downComponents.join('、')}。业务接口仍可用，只是相关实验会返回 1004/1005。`"
                        placement="bottom"
                    >
                        <el-tag type="warning" size="small" effect="dark" round>{{ downComponents.length }} 个组件不可用</el-tag>
                    </el-tooltip>
                    <el-tooltip v-if="probe?.note" :content="probe.note" placement="bottom">
                        <el-tag :type="online ? 'success' : 'danger'" size="small" effect="dark" round>
                            {{ online ? (probe?.status === 'UP' ? '后端在线' : '后端在线（降级）') : '后端离线' }}
                        </el-tag>
                    </el-tooltip>
                    <el-tag v-else :type="online ? 'success' : 'danger'" size="small" effect="dark" round>
                        {{ online ? '后端在线' : '后端离线' }}
                    </el-tag>
                    <el-button size="small" :icon="Refresh" :loading="healthLoading" @click="refreshHealth">
                        {{ checkedAt ? `${checkedAt} 检查过` : '检查' }}
                    </el-button>
                    <el-button size="small" :icon="Link" text @click="router.push('/dashboard')">场景总览</el-button>
                </div>
            </header>

            <main class="lab-content">
                <router-view v-slot="{ Component }">
                    <transition name="fade" mode="out-in">
                        <component :is="Component" />
                    </transition>
                </router-view>
            </main>
        </div>

        <TraceDrawer />
    </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.16s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

:deep(.el-menu-item.is-active) {
    background: linear-gradient(90deg, rgba(61, 111, 245, 0.9), rgba(61, 111, 245, 0.55));
}

:deep(.el-sub-menu__title:hover),
:deep(.el-menu-item:hover) {
    background: rgba(255, 255, 255, 0.06);
}
</style>
