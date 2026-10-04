<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

/**
 * 轻量图表容器。
 *
 * <p>按需注册 ECharts 组件而不是全量引入：
 * 实验台只需要柱状、折线、饼图三类和坐标轴 / 提示 / 图例三个基础组件，
 * 打包体积能差出一个数量级。
 */

echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

const props = withDefaults(
    defineProps<{
        option: echarts.EChartsCoreOption;
        height?: number;
    }>(),
    { height: 240 },
);

const host = ref<HTMLDivElement | null>(null);
let instance: echarts.ECharts | null = null;

/**
 * 创建图表实例并挂到宿主元素上。
 */
function render() {
    if (!host.value) {
        return;
    }
    instance = echarts.init(host.value);
    instance.setOption(props.option);
}

/**
 * 自适应窗口变化。
 */
function onResize() {
    instance?.resize();
}

onMounted(() => {
    render();
    window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
    window.removeEventListener('resize', onResize);
    instance?.dispose();
    instance = null;
});

watch(
    () => props.option,
    (option) => {
        instance?.setOption(option, true);
    },
    { deep: true },
);
</script>

<template>
    <div ref="host" class="lab-chart" :style="{ height: `${height}px` }"></div>
</template>
