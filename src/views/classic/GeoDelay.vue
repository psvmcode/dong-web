<script setup lang="ts">
import { computed, reactive } from 'vue';
import { ElMessage } from 'element-plus';
import SectionHead from '@/components/SectionHead.vue';
import StatCard from '@/components/StatCard.vue';
import ResultView from '@/components/ResultView.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/classic';
import type { NearbyPlaceResponse } from '@/api/types';

/**
 * GEO 与延迟队列。
 *
 * <p>两个实验用的是同一个结构 zset，只是语义不同：
 * GEO 把经纬度编码成 score 后按距离排，延迟队列把到期时间当 score 后按时间取。
 * 摆在一页就是为了看「同一个结构能表达多少种语义」。
 */

const geo = reactive({
    city: 'shanghai',
    member: 'place-1',
    longitude: 121.4737,
    latitude: 31.2304,
    radiusKm: 30,
    limit: 10,
    first: 'place-1',
    second: 'place-2',
});

const delay = reactive({ payload: 'order-close-check', delaySeconds: 10, takeLimit: 10 });

const { result: addResult, call: callAdd } = useApi<number>();
const { result: nearbyResult, call: callNearby } = useApi<NearbyPlaceResponse[]>();
const { result: distanceResult, call: callDistance } = useApi<number>();
const { result: offerResult, call: callOffer } = useApi<null>();
const { result: takeResult, call: callTake } = useApi<string[]>();
const { result: sizeResult, call: callSize } = useApi<number>();

const nearby = computed<NearbyPlaceResponse[]>(() =>
    nearbyResult.value?.ok && nearbyResult.value.data ? nearbyResult.value.data : [],
);
const taken = computed<string[]>(() => (takeResult.value?.ok && takeResult.value.data ? takeResult.value.data : []));

/**
 * 添加坐标。
 */
async function add() {
    const res = await callAdd(() => api.addGeo(geo.city, geo.member, geo.longitude, geo.latitude));
    if (res.ok) {
        ElMessage.success(`已写入 ${geo.member}`);
    }
}

/**
 * 批量灌几个坐标，方便直接看「附近的人」。
 */
async function seed() {
    await Promise.all([
        api.addGeo(geo.city, 'place-1', 121.4737, 31.2304),
        api.addGeo(geo.city, 'place-2', 121.5, 31.24),
        api.addGeo(geo.city, 'place-3', 121.62, 31.29),
        api.addGeo(geo.city, 'place-4', 120.85, 31.35),
    ]);
    ElMessage.success('已写入 4 个坐标');
    await doNearby();
}

/**
 * 查询附近的成员。
 */
function doNearby() {
    void callNearby(() => api.nearbyGeo(geo.city, geo.longitude, geo.latitude, geo.radiusKm, geo.limit));
}

/**
 * 计算两个成员之间的距离。
 */
function doDistance() {
    void callDistance(() => api.geoDistance(geo.city, geo.first, geo.second));
}

/**
 * 投递延迟任务。
 */
async function offer() {
    await callOffer(() => api.offerDelay(delay.payload, delay.delaySeconds));
    ElMessage.success(`已投递，${delay.delaySeconds} 秒后可取`);
    await checkSize();
}

/**
 * 取出到期任务。
 */
async function take() {
    await callTake(() => api.takeDelay(delay.takeLimit));
    await checkSize();
}

/**
 * 查询待消费数量。
 */
function checkSize() {
    void callSize(api.delaySize);
}
</script>

<template>
    <div>
        <SectionHead
            title="GEO 与延迟队列"
            desc="zset 的两种用法：GEO 用 geohash 编码经纬度后按距离排，延迟队列把到期时间戳当 score 按时间取。结构一样，语义完全不同。"
        />

        <div class="lab-grid lab-grid--2">
            <div class="lab-card">
                <div class="lab-card__title">添加坐标</div>
                <div class="lab-card__desc">同一个 city 是一个 key，成员名不能重复，重复写入等于更新坐标。</div>
                <el-form size="small" label-width="86px">
                    <div class="lab-grid lab-grid--2">
                        <el-form-item label="城市 key">
                            <el-input v-model="geo.city" />
                        </el-form-item>
                        <el-form-item label="成员名">
                            <el-input v-model="geo.member" />
                        </el-form-item>
                        <el-form-item label="经度">
                            <el-input-number v-model="geo.longitude" :precision="6" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="纬度">
                            <el-input-number v-model="geo.latitude" :precision="6" controls-position="right" />
                        </el-form-item>
                    </div>
                    <div class="lab-row">
                        <el-button type="primary" size="small" @click="add">添加</el-button>
                        <el-button size="small" @click="seed">灌 4 个示例坐标</el-button>
                    </div>
                </el-form>
                <ResultView :result="addResult" title="添加结果" :max-height="120" style="margin-top: 10px" />
            </div>

            <div class="lab-card">
                <div class="lab-card__title">查询附近</div>
                <div class="lab-card__desc">半径过滤后再按距离升序返回，返回的 distanceKm 由服务端算，不依赖前端。</div>
                <el-form size="small" label-width="86px">
                    <div class="lab-grid lab-grid--2">
                        <el-form-item label="中心经度">
                            <el-input-number v-model="geo.longitude" :precision="6" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="中心纬度">
                            <el-input-number v-model="geo.latitude" :precision="6" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="半径 km">
                            <el-input-number v-model="geo.radiusKm" :min="1" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="条数">
                            <el-input-number v-model="geo.limit" :min="1" :max="200" controls-position="right" />
                        </el-form-item>
                    </div>
                    <el-button type="primary" size="small" @click="doNearby">查询附近</el-button>
                </el-form>
                <el-table :data="nearby" border stripe size="small" max-height="260" style="margin-top: 10px">
                    <el-table-column prop="member" label="成员" min-width="140" />
                    <el-table-column label="经度" min-width="120">
                        <template #default="{ row }">{{ row.longitude.toFixed(4) }}</template>
                    </el-table-column>
                    <el-table-column label="纬度" min-width="120">
                        <template #default="{ row }">{{ row.latitude.toFixed(4) }}</template>
                    </el-table-column>
                    <el-table-column label="距离 km" min-width="110">
                        <template #default="{ row }">{{ row.distanceKm.toFixed(2) }}</template>
                    </el-table-column>
                </el-table>
            </div>
        </div>

        <div class="lab-card">
            <div class="lab-card__title">计算两点距离</div>
            <div class="lab-card__desc">成员不存在会直接报错——GEO 的命令都没有「查不到返回空」这种选项。</div>
            <div class="lab-row">
                <el-input v-model="geo.city" placeholder="城市 key" style="width: 160px" />
                <el-input v-model="geo.first" placeholder="成员 A" style="width: 160px" />
                <el-input v-model="geo.second" placeholder="成员 B" style="width: 160px" />
                <el-button type="primary" size="small" @click="doDistance">算距离</el-button>
                <el-tag v-if="distanceResult?.ok" size="small" effect="plain" type="success">
                    {{ distanceResult.data.toFixed(2) }} km
                </el-tag>
            </div>
            <ResultView :result="distanceResult" title="距离返回" :max-height="140" style="margin-top: 10px" />
        </div>

        <div class="lab-card">
            <div class="lab-card__title">延迟队列</div>
            <div class="lab-card__desc">
                score 是「到期时间戳」，取的时候只取 score 小于等于当前时间的元素。到期之前 take 拿不到任何东西，这就是全部的延迟语义。
            </div>
            <div class="lab-grid lab-grid--3">
                <StatCard label="待消费数量" :value="sizeResult?.ok ? sizeResult.data : '-'" tone="accent" hint="只统计已到期的" />
                <StatCard label="本次取出" :value="taken.length" tone="good" />
                <StatCard label="延迟秒数" :value="`${delay.delaySeconds} s`" />
            </div>
            <div class="lab-row" style="margin-top: 12px">
                <el-input v-model="delay.payload" placeholder="任务内容" style="width: 220px" />
                <el-input-number v-model="delay.delaySeconds" :min="0" :max="86400" size="small" controls-position="right" />
                <el-button type="primary" size="small" @click="offer">投递</el-button>
                <el-input-number v-model="delay.takeLimit" :min="1" :max="200" size="small" controls-position="right" />
                <el-button size="small" @click="take">取出到期任务</el-button>
                <el-button size="small" @click="checkSize">查数量</el-button>
            </div>
            <div class="lab-row" style="margin-top: 10px">
                <el-tag v-for="(item, index) in taken" :key="index" size="small" effect="light" type="success">{{ item }}</el-tag>
                <span v-if="taken.length === 0" class="lab-hint">（取到的任务会显示在这里）</span>
            </div>
            <ResultView :result="offerResult" title="投递返回" :max-height="120" style="margin-top: 10px" />
        </div>
    </div>
</template>
