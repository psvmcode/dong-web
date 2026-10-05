<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { RefreshRight } from '@element-plus/icons-vue';
import SectionHead from '@/components/SectionHead.vue';
import { useApi } from '@/composables/useApi';
import * as api from '@/api/classic';
import type { NearbyPlaceResponse } from '@/api/types';
import { avatarColor } from '@/utils/scene';

/**
 * 附近的人 + 延迟任务。
 *
 * <p>两个功能用的是同一个结构 zset，只是 score 的含义不同：
 * GEO 把经纬度编码进 score 按距离排，延迟队列把到期时间戳当 score 按时间取。
 * 摆在一页里就是为了让「同一个结构能表达多少种语义」这件事变得具体。
 */

const geo = reactive({
    city: 'shanghai',
    member: 'place-1',
    longitude: 121.4737,
    latitude: 31.2304,
    radiusKm: 100,
    limit: 20,
    first: 'place-1',
    second: 'place-2',
});

const delay = reactive({ payload: '订单超时关闭检查', delaySeconds: 10, takeLimit: 10 });

const { result: nearbyResult, call: callNearby } = useApi<NearbyPlaceResponse[]>();
const { result: distanceResult, call: callDistance } = useApi<number>();
const { result: offerResult, call: callOffer } = useApi<null>();
const { result: takeResult, call: callTake } = useApi<string[]>();
const { result: sizeResult, call: callSize } = useApi<number>();

const nearby = computed<NearbyPlaceResponse[]>(() => (nearbyResult.value?.ok && nearbyResult.value.data ? nearbyResult.value.data : []));
const taken = computed<string[]>(() => (takeResult.value?.ok && takeResult.value.data ? takeResult.value.data : []));

/**
 * 把经纬度换算成相对中心的百分比，用于在示意地图上标点。
 *
 * <p>这只是示意图：把经度差按纬度做余弦修正后折算成公里，再除以半径，
 * 得到 -1 ~ 1 之间的相对位置。真实地图要投影，这里的目的只是让「远近」看得见。
 *
 * @param item 附近成员
 */
function position(item: NearbyPlaceResponse): { left: string; top: string; size: string } {
    const dx = (item.longitude - geo.longitude) * Math.cos((geo.latitude * Math.PI) / 180) * 111;
    const dy = (item.latitude - geo.latitude) * 111;
    const scale = Math.max(1, geo.radiusKm);
    const left = 50 + (dx / scale) * 45;
    const top = 50 - (dy / scale) * 45;
    const near = Math.max(0.4, 1 - (item.distanceKm || 0) / scale);
    return {
        left: `${Math.min(96, Math.max(4, left))}%`,
        top: `${Math.min(96, Math.max(4, top))}%`,
        size: `${18 + near * 16}px`,
    };
}

/**
 * 添加坐标。
 */
async function add() {
    await api.addGeo(geo.city, geo.member, geo.longitude, geo.latitude);
    ElMessage.success(`已写入 ${geo.member}`);
    await doNearby();
}

/**
 * 灌一批示例坐标。
 */
async function seed() {
    const points: [string, number, number][] = [
        ['place-1', 121.4737, 31.2304],
        ['place-2', 121.62, 31.29],
        ['place-3', 121.2, 31.15],
        ['place-4', 120.85, 31.35],
        ['place-5', 121.9, 30.9],
    ];
    await Promise.all(points.map(([member, lon, lat]) => api.addGeo(geo.city, member, lon, lat)));
    ElMessage.success('已写入 5 个示例坐标');
    await doNearby();
}

/**
 * 查附近。
 */
function doNearby() {
    void callNearby(() => api.nearbyGeo(geo.city, geo.longitude, geo.latitude, geo.radiusKm, geo.limit));
}

/**
 * 算两点距离。
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
 * 查待消费数量。
 */
function checkSize() {
    void callSize(api.delaySize);
}

onMounted(() => {
    void doNearby();
    void checkSize();
});
</script>

<template>
    <div>
        <SectionHead
            title="附近的人与延迟任务"
            desc="同一个 zset，两种语义：GEO 把经纬度编码进 score 按距离排，延迟队列把到期时间戳当 score 按时间取。"
        >
            <template #actions>
                <el-button size="small" @click="seed">灌示例坐标</el-button>
                <el-button size="small" type="primary" :icon="RefreshRight" @click="doNearby(); checkSize()">刷新</el-button>
            </template>
        </SectionHead>

        <div class="geo">
            <div class="geo__map-card">
                <div class="geo__map-title">{{ geo.city }} · 半径 {{ geo.radiusKm }} km</div>
                <div class="geo__map">
                    <div class="geo__ring"></div>
                    <div class="geo__ring geo__ring--inner"></div>
                    <div class="geo__center"></div>
                    <el-tooltip
                        v-for="item in nearby"
                        :key="item.member"
                        :content="`${item.member} · ${(item.distanceKm ?? 0).toFixed(1)} km`"
                        placement="top"
                    >
                        <div
                            class="geo__pin"
                            :style="{
                                left: position(item).left,
                                top: position(item).top,
                                width: position(item).size,
                                height: position(item).size,
                                background: avatarColor(item.member.length * 7),
                            }"
                        >
                            {{ item.member.slice(-1) }}
                        </div>
                    </el-tooltip>
                    <div v-if="nearby.length === 0" class="geo__map-empty">这里还没有人，点「灌示例坐标」</div>
                </div>
            </div>

            <div class="geo__panel">
                <div class="geo__panel-title">查询条件</div>
                <el-form size="small" label-width="76px">
                    <el-form-item label="城市 key">
                        <el-input v-model="geo.city" />
                    </el-form-item>
                    <div class="lab-grid lab-grid--2">
                        <el-form-item label="中心经度">
                            <el-input-number v-model="geo.longitude" :precision="4" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="中心纬度">
                            <el-input-number v-model="geo.latitude" :precision="4" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="半径 km">
                            <el-input-number v-model="geo.radiusKm" :min="1" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="条数">
                            <el-input-number v-model="geo.limit" :min="1" :max="200" controls-position="right" />
                        </el-form-item>
                    </div>
                    <el-button type="primary" size="small" @click="doNearby">看看附近</el-button>
                </el-form>

                <el-divider style="margin: 14px 0" />
                <div class="geo__panel-title">添加坐标</div>
                <el-form size="small" label-width="76px">
                    <el-form-item label="成员名">
                        <el-input v-model="geo.member" />
                    </el-form-item>
                    <div class="lab-grid lab-grid--2">
                        <el-form-item label="经度">
                            <el-input-number v-model="geo.longitude" :precision="6" controls-position="right" />
                        </el-form-item>
                        <el-form-item label="纬度">
                            <el-input-number v-model="geo.latitude" :precision="6" controls-position="right" />
                        </el-form-item>
                    </div>
                    <el-button size="small" @click="add">添加</el-button>
                </el-form>

                <el-divider style="margin: 14px 0" />
                <div class="geo__panel-title">两点距离</div>
                <div class="lab-row">
                    <el-input v-model="geo.first" style="width: 110px" />
                    <span>↔</span>
                    <el-input v-model="geo.second" style="width: 110px" />
                    <el-button size="small" @click="doDistance">算</el-button>
                    <el-tag v-if="distanceResult?.ok" size="small" type="success" effect="dark">
                        {{ (distanceResult.data ?? 0).toFixed(2) }} km
                    </el-tag>
                </div>
            </div>

            <div class="geo__list">
                <div class="geo__panel-title">按距离排序（近 → 远）</div>
                <div v-for="item in nearby" :key="item.member" class="geo__row">
                    <div class="geo__row-avatar" :style="{ background: avatarColor(item.member.length * 7) }">
                        {{ item.member.slice(-1) }}
                    </div>
                    <div class="geo__row-info">
                        <div class="geo__row-name">{{ item.member }}</div>
                        <div class="geo__row-meta">
                            {{ item.longitude.toFixed(4) }}, {{ item.latitude.toFixed(4) }}
                        </div>
                    </div>
                    <div class="geo__row-dist">{{ (item.distanceKm ?? 0).toFixed(1) }} km</div>
                </div>
                <div v-if="nearby.length === 0" class="lab-hint">还没有成员</div>
            </div>
        </div>

        <div class="dq">
            <div class="dq__head">
                <div>
                    <div class="dq__title">延迟任务队列</div>
                    <div class="dq__desc">
                        score 是「到期时间戳」，取的时候只取 score 小于等于当前时间的元素。
                        到期之前 Take 拿不到任何东西——这就是全部的延迟语义，没有后台定时器在催。
                    </div>
                </div>
                <div class="dq__count">
                    <div class="dq__count-value">{{ sizeResult?.ok ? sizeResult.data : '-' }}</div>
                    <div class="dq__count-label">待消费</div>
                </div>
            </div>

            <div class="lab-row">
                <el-input v-model="delay.payload" style="width: 240px" placeholder="任务内容" />
                <el-input-number v-model="delay.delaySeconds" :min="0" :max="86400" size="small" controls-position="right" />
                <el-button type="primary" size="small" @click="offer">投递</el-button>
                <el-input-number v-model="delay.takeLimit" :min="1" :max="200" size="small" controls-position="right" />
                <el-button size="small" @click="take">取出到期任务</el-button>
                <el-button size="small" :icon="RefreshRight" @click="checkSize">查数量</el-button>
            </div>

            <div v-if="taken.length > 0" class="dq__taken">
                <div class="dq__taken-title">本轮取到 {{ taken.length }} 条</div>
                <el-tag v-for="(item, index) in taken" :key="index" size="small" effect="light" type="success">
                    {{ item }}
                </el-tag>
            </div>
            <div v-else-if="takeResult" class="lab-hint">
                没有取到任务：要么还没到期，要么队列是空的。
            </div>
            <div v-if="offerResult" class="lab-hint">
                {{ offerResult.ok ? '投递成功' : `投递失败：${offerResult.message}` }}
            </div>
        </div>
    </div>
</template>

<style scoped>
.geo {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px 300px;
    gap: 14px;
    align-items: start;
    margin-bottom: 14px;
}

.geo__map-card,
.geo__panel,
.geo__list {
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    padding: 14px 16px;
}

.geo__map-title {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 10px;
}

.geo__map {
    position: relative;
    height: 320px;
    border-radius: 10px;
    background: linear-gradient(135deg, #eef4fb, #e4ecf7);
    overflow: hidden;
}

.geo__ring {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 90%;
    height: 90%;
    transform: translate(-50%, -50%);
    border: 1px dashed #b9cdf7;
    border-radius: 50%;
}

.geo__ring--inner {
    width: 45%;
    height: 45%;
    border-color: #cfdcf8;
}

.geo__center {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 12px;
    height: 12px;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background: #3d6ff5;
    box-shadow: 0 0 0 6px rgba(61, 111, 245, 0.18);
}

.geo__pin {
    position: absolute;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.2);
    cursor: pointer;
}

.geo__map-empty {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    font-size: 12px;
    color: #7a869a;
}

.geo__panel-title {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 10px;
}

.geo__row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 0;
    border-bottom: 1px solid #f2f4f8;
}

.geo__row:last-child {
    border-bottom: none;
}

.geo__row-avatar {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-weight: 600;
    flex: 0 0 34px;
}

.geo__row-info {
    flex: 1;
    min-width: 0;
}

.geo__row-name {
    font-size: 13px;
    font-weight: 600;
}

.geo__row-meta {
    font-size: 11px;
    color: var(--lab-muted);
}

.geo__row-dist {
    font-weight: 600;
    color: #3d6ff5;
}

.dq {
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    box-shadow: var(--lab-shadow);
    padding: 16px 18px;
}

.dq__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 14px;
}

.dq__title {
    font-size: 14px;
    font-weight: 600;
}

.dq__desc {
    font-size: 12px;
    color: var(--lab-muted);
    line-height: 1.7;
    margin-top: 4px;
    max-width: 700px;
}

.dq__count {
    text-align: center;
    min-width: 90px;
}

.dq__count-value {
    font-size: 30px;
    font-weight: 700;
    color: #3d6ff5;
}

.dq__count-label {
    font-size: 12px;
    color: var(--lab-muted);
}

.dq__taken {
    margin-top: 12px;
    padding: 12px;
    background: #f2fbf6;
    border: 1px solid #b6e6c9;
    border-radius: 10px;
}

.dq__taken-title {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 8px;
}

.dq__taken .el-tag {
    margin: 0 6px 6px 0;
}

@media (max-width: 1200px) {
    .geo {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
