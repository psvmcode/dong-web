<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Money, RefreshRight } from '@element-plus/icons-vue';
import { runBurst, useApi } from '@/composables/useApi';
import * as api from '@/api/redpacket';
import type { GrabResultResponse, RedPacketRecord, RedPacketResponse } from '@/api/types';
import { avatarColor, initialOf } from '@/utils/scene';

/**
 * 微信群红包。
 *
 * <p>红包是「预分配 + 原子弹出」最直白的载体：钱在发的那一刻就切好了，
 * 抢的人只是从队列里弹出一份。做成聊天界面的原因也在这里——
 * 「同一份不会被两个人拿到」这件事，只有在一群人同时点开同一个红包时才看得出来。
 */

/** 当前用户。 */
const me = ref(1001);

/** 群里的其他人，用来模拟并发抢红包的参与者。 */
const others = Array.from({ length: 8 }, (_, index) => 2001 + index);

/**
 * 聊天区的一条消息。
 */
interface ChatMessage {
    id: number;
    kind: 'system' | 'packet' | 'grabbed';
    text: string;
    mine?: boolean;
    userId?: number;
    packetNo?: string;
    amount?: number;
    totalAmount?: number;
    totalCount?: number;
    remainCount?: number;
    opened?: boolean;
}

const messages = ref<ChatMessage[]>([
    { id: 1, kind: 'system', text: '你邀请「实验员小李、实验员小王」加入了群聊' },
]);

const sendForm = reactive({ totalAmount: 10, totalCount: 5, lucky: true });
const sendDialog = ref(false);

const openPacket = ref<{ visible: boolean; packetNo: string; from: string; opened: boolean; amount: number; message: string }>({
    visible: false,
    packetNo: '',
    from: '',
    opened: false,
    amount: 0,
    message: '',
});

const detailDialog = ref<{ visible: boolean; packetNo: string; packet: RedPacketResponse | null; records: RedPacketRecord[] }>({
    visible: false,
    packetNo: '',
    packet: null,
    records: [],
});

const burstDialog = ref<{ total: number; success: number; failed: number; elapsedMs: number; amounts: number[] } | null>(null);
const burstVisible = ref(false);
const burstLoading = ref(false);
const burstCount = ref(20);

const { result: detailResult, call: callDetail } = useApi<RedPacketResponse>();
const { result: remainResult, call: callRemain } = useApi<Record<string, unknown>>();
const { result: recordsResult, call: callRecords } = useApi<RedPacketRecord[]>();
const { result: rebuildResult, call: callRebuild } = useApi<boolean>();
const { result: runtimeResult, call: callRuntime } = useApi<Record<string, unknown>>();

let seq = 1;

/**
 * 追加一条聊天消息。
 *
 * @param message 消息内容
 */
function push(message: Omit<ChatMessage, 'id'>) {
    seq += 1;
    messages.value.push({ ...message, id: seq });
}

/**
 * 发红包。
 */
async function send() {
    const res = await api.send({
        sponsorId: me.value,
        totalAmount: sendForm.totalAmount * 100,
        totalCount: sendForm.totalCount,
        packetType: sendForm.lucky ? 2 : 1,
    });
    if (!res.ok || !res.data) {
        ElMessage.error(res.message);
        return;
    }
    const packetNo = res.data;
    sendDialog.value = false;
    push({
        kind: 'packet',
        text: sendForm.lucky ? '恭喜发财，大吉大利' : `发了 ${sendForm.totalCount} 个固定红包`,
        mine: true,
        userId: me.value,
        packetNo,
        totalAmount: sendForm.totalAmount * 100,
        totalCount: sendForm.totalCount,
        remainCount: sendForm.totalCount,
        opened: false,
    });
    await refreshPacket(packetNo);
}

/**
 * 点开一个红包，先看还剩多少。
 *
 * @param message 红包消息
 */
async function openFrom(message: ChatMessage) {
    if (!message.packetNo) {
        return;
    }
    openPacket.value = {
        visible: true,
        packetNo: message.packetNo,
        from: message.mine ? '我' : `实验员${(message.userId ?? 2001) % 100}`,
        opened: message.opened ?? false,
        amount: message.amount ?? 0,
        message: message.opened ? '你已经抢过这个红包' : '',
    };
    await callRemain(() => api.remain(message.packetNo as string));
}

/**
 * 拆红包。
 */
async function grabIt() {
    const packetNo = openPacket.value.packetNo;
    const res = await api.grab(packetNo, me.value);
    const data = res.ok ? (res.data as GrabResultResponse) : null;
    if (res.ok && data?.grabbed) {
        openPacket.value = { ...openPacket.value, opened: true, amount: data.amount };
        const target = messages.value.find((item) => item.packetNo === packetNo);
        if (target) {
            target.opened = true;
            target.amount = data.amount;
        }
        push({ kind: 'grabbed', text: '我', userId: me.value, mine: true, packetNo, amount: data.amount });
        void showDetail(packetNo);
        return;
    }
    openPacket.value = { ...openPacket.value, message: data?.message ?? res.message };
    ElMessage.warning(data?.message ?? res.message);
    await refreshPacket(packetNo);
}

/**
 * 查看红包详情与领取记录。
 *
 * @param packetNo 红包号
 */
async function showDetail(packetNo: string) {
    await Promise.all([callDetail(() => api.detail(packetNo)), callRecords(() => api.records(packetNo))]);
    detailDialog.value = {
        visible: true,
        packetNo,
        packet: detailResult.value?.ok ? detailResult.value.data : null,
        records: recordsResult.value?.ok && recordsResult.value.data ? recordsResult.value.data : [],
    };
    const target = messages.value.find((item) => item.packetNo === packetNo);
    if (target && detailResult.value?.ok && detailResult.value.data) {
        target.remainCount = detailResult.value.data.remainCount;
    }
}

/**
 * 刷新某个红包的剩余情况。
 *
 * @param packetNo 红包号
 */
async function refreshPacket(packetNo: string) {
    const res = await api.remain(packetNo);
    if (res.ok && res.data) {
        const remainCount = Number(res.data.remainCount ?? 0);
        const target = messages.value.find((item) => item.packetNo === packetNo);
        if (target) {
            target.remainCount = remainCount;
        }
        if (openPacket.value.packetNo === packetNo) {
            openPacket.value = { ...openPacket.value };
        }
    }
}

/**
 * 并发抢：一群人同时点开同一个红包。
 */
async function burstGrab() {
    const last = [...messages.value].reverse().find((item) => item.kind === 'packet' && item.packetNo);
    if (!last?.packetNo) {
        ElMessage.warning('先发一个红包');
        return;
    }
    const packetNo = last.packetNo as string;
    burstLoading.value = true;
    const amounts: number[] = [];
    try {
        const summary = await runBurst<GrabResultResponse>(burstCount.value, async (index) => {
            const userId = others[index % others.length] + Math.floor(index / others.length) * 1000;
            const res = await api.grab(packetNo, userId);
            if (res.ok && res.data?.grabbed) {
                amounts.push(res.data.amount);
                push({ kind: 'grabbed', text: `实验员${userId % 100}`, userId, packetNo, amount: res.data.amount });
            }
            return res;
        });
        burstDialog.value = {
            total: summary.total,
            success: summary.success,
            failed: summary.failed,
            elapsedMs: summary.elapsedMs,
            amounts,
        };
        await refreshPacket(packetNo);
        void callRuntime(api.runtime);
        burstVisible.value = true;
    } finally {
        burstLoading.value = false;
    }
}

/**
 * 重建 Redis 副本。
 */
async function rebuild() {
    const last = [...messages.value].reverse().find((item) => item.packetNo);
    if (!last?.packetNo) {
        ElMessage.warning('先发一个红包');
        return;
    }
    const res = await callRebuild(() => api.rebuild(last.packetNo as string));
    if (res.ok) {
        ElMessage.success('已按份额表重建副本');
        await refreshPacket(last.packetNo as string);
    }
}

const remainLeft = computed(() => {
    const data = remainResult.value?.ok ? remainResult.value.data : null;
    return data ? Number(data.remainCount ?? 0) : null;
});

const bestRecord = computed(() => {
    const list = detailDialog.value.records;
    if (list.length === 0) {
        return 0;
    }
    return Math.max(...list.map((item) => item.amount));
});

const runtimeEntries = computed(() => {
    const data = runtimeResult.value?.ok ? runtimeResult.value.data : null;
    return data ? Object.entries(data) : [];
});

/**
 * 头像底色。
 *
 * @param userId 用户 id
 */
function color(userId: number | undefined): string {
    return avatarColor(userId ?? 0);
}

/**
 * 头像首字。
 *
 * @param text 名字
 */
function initial(text: string): string {
    return initialOf(text);
}
</script>

<template>
    <div class="rp">
        <div class="rp__phone">
            <div class="rp__phone-bar">
                <span>‹</span>
                <span class="rp__phone-title">实验室红包群 ({{ 1 + others.length }})</span>
                <span>···</span>
            </div>

            <div class="rp__chat">
                <template v-for="message in messages" :key="message.id">
                    <div v-if="message.kind === 'system'" class="rp__system">{{ message.text }}</div>

                    <div v-else-if="message.kind === 'grabbed'" class="rp__grabbed">
                        我 领取了 {{ message.amount }} 分
                    </div>

                    <div v-else class="rp__row" :class="{ 'rp__row--mine': message.mine }">
                        <div class="rp__avatar" :style="{ background: color(message.userId) }">
                            {{ message.mine ? '我' : initial(message.text) }}
                        </div>
                        <div class="rp__bubble-wrap">
                            <div class="rp__nick">{{ message.mine ? '我' : message.text }}</div>
                            <div class="rp__packet" @click="openFrom(message)">
                                <div class="rp__packet-icon">🧧</div>
                                <div class="rp__packet-text">
                                    <div class="rp__packet-title">{{ message.text }}</div>
                                    <div class="rp__packet-sub">
                                        <template v-if="message.opened">已领取 {{ message.amount }} 分</template>
                                        <template v-else-if="(message.remainCount ?? 0) <= 0">已被抢完</template>
                                        <template v-else>剩余 {{ message.remainCount }} / {{ message.totalCount }} 份</template>
                                    </div>
                                </div>
                                <div class="rp__packet-tag">微信红包</div>
                            </div>
                            <div class="rp__packet-ops">
                                <el-button link size="small" @click="showDetail(message.packetNo as string)">领取记录</el-button>
                            </div>
                        </div>
                    </div>
                </template>
            </div>

            <div class="rp__composer">
                <el-input :model-value="''" placeholder="说点什么…" size="small" disabled />
                <el-button type="danger" size="small" :icon="Money" @click="sendDialog = true">发红包</el-button>
            </div>
        </div>

        <div class="rp__tools">
            <div class="rp__tools-title">红包实验台</div>
            <div class="rp__tools-desc">
                下面的动作才是这个实验的重点：让一群人同时点开同一个红包，看「总份数」和「抢到的人数」是否严格相等。
            </div>
            <div class="lab-row">
                <el-input-number v-model="burstCount" :min="1" :max="100" size="small" controls-position="right" />
                <el-button type="danger" size="small" :loading="burstLoading" @click="burstGrab">
                    {{ burstCount }} 人同时抢
                </el-button>
                <el-button size="small" @click="rebuild">重建 Redis 副本</el-button>
                <el-button size="small" :icon="RefreshRight" @click="callRuntime(api.runtime)">运行时</el-button>
            </div>
            <div class="lab-row" style="margin-top: 8px">
                <el-tag v-for="[key, value] in runtimeEntries" :key="String(key)" size="small" effect="plain">
                    {{ key }} = {{ value }}
                </el-tag>
            </div>
            <el-alert
                class="rp__note"
                type="info"
                :closable="false"
                show-icon
                title="份额表是权威源，Redis 队列只是副本"
                description="「重建 Redis 副本」会以数据库里的未领取份额为准，把队列重新灌一遍。可以手动删掉 Redis 里的队列再重建，验证恢复过程。"
            />
        </div>

        <el-dialog v-model="sendDialog" title="发红包" width="360px">
            <el-form size="small" label-width="86px">
                <el-form-item label="总金额(元)">
                    <el-input-number v-model="sendForm.totalAmount" :min="1" :precision="2" controls-position="right" />
                </el-form-item>
                <el-form-item label="红包个数">
                    <el-input-number v-model="sendForm.totalCount" :min="1" :max="100" controls-position="right" />
                </el-form-item>
                <el-form-item label="红包类型">
                    <el-radio-group v-model="sendForm.lucky">
                        <el-radio-button :value="true">拼手气</el-radio-button>
                        <el-radio-button :value="false">固定金额</el-radio-button>
                    </el-radio-group>
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="sendDialog = false">取消</el-button>
                <el-button type="danger" @click="send">塞钱进红包</el-button>
            </template>
        </el-dialog>

        <el-dialog v-model="openPacket.visible" width="360px" :show-close="true" align-center>
            <div class="rp__open">
                <div class="rp__open-avatar" :style="{ background: color(me) }">我</div>
                <div class="rp__open-from">{{ openPacket.from }} 的红包</div>
                <div v-if="!openPacket.opened" class="rp__open-tip">
                    {{ remainLeft === 0 ? '来晚了，红包已被抢完' : '恭喜发财，大吉大利' }}
                </div>

                <div v-if="openPacket.opened" class="rp__open-result">
                    <div class="rp__open-amount">{{ openPacket.amount }}<span>分</span></div>
                    <el-button link size="small" @click="showDetail(openPacket.packetNo)">查看领取记录 ›</el-button>
                </div>
                <div v-else class="rp__open-seal" @click="grabIt">開</div>

                <div v-if="openPacket.message" class="rp__open-msg">{{ openPacket.message }}</div>
                <div v-else-if="remainLeft !== null" class="rp__open-left">剩余 {{ remainLeft }} 份</div>
            </div>
        </el-dialog>

        <el-dialog v-model="detailDialog.visible" title="红包领取记录" width="420px">
            <el-descriptions v-if="detailDialog.packet" :column="2" border size="small" style="margin-bottom: 12px">
                <el-descriptions-item label="红包号">{{ detailDialog.packet.packetNo }}</el-descriptions-item>
                <el-descriptions-item label="类型">{{ detailDialog.packet.packetType }}</el-descriptions-item>
                <el-descriptions-item label="总金额">{{ detailDialog.packet.totalAmount }} 分</el-descriptions-item>
                <el-descriptions-item label="总份数">{{ detailDialog.packet.totalCount }}</el-descriptions-item>
                <el-descriptions-item label="剩余份数">{{ detailDialog.packet.remainCount }}</el-descriptions-item>
                <el-descriptions-item label="状态">{{ detailDialog.packet.status }}</el-descriptions-item>
            </el-descriptions>
            <el-table :data="detailDialog.records" border size="small" max-height="300">
                <el-table-column label="领取人" min-width="150">
                    <template #default="{ row }">
                        <div class="lab-row" style="gap: 6px">
                            <div class="rp__tiny-avatar" :style="{ background: color(row.userId) }">
                                {{ row.userId === me ? '我' : String(row.userId % 100) }}
                            </div>
                            实验员{{ row.userId % 100 }}
                            <el-tag v-if="row.amount === bestRecord" size="small" type="warning" effect="dark">最佳手气</el-tag>
                        </div>
                    </template>
                </el-table-column>
                <el-table-column label="金额" width="110">
                    <template #default="{ row }">{{ row.amount }} 分</template>
                </el-table-column>
                <el-table-column prop="createTime" label="时间" min-width="150" />
            </el-table>
        </el-dialog>

        <el-dialog v-model="burstVisible" title="并发抢红包结果" width="480px">
            <div v-if="burstDialog" class="rp__burst">
                <div class="rp__burst-nums">
                    <div><span>{{ burstDialog.total }}</span>人开抢</div>
                    <div class="ok"><span>{{ burstDialog.success }}</span>抢到</div>
                    <div class="no"><span>{{ burstDialog.failed }}</span>没抢到</div>
                    <div><span>{{ burstDialog.elapsedMs }} ms</span>总耗时</div>
                </div>
                <el-alert
                    type="warning"
                    :closable="false"
                    show-icon
                    title="抢到的人数必须恰好等于红包份数"
                    description="多一个人拿到就说明同一份被发了两次。剩余的失败里常见的是「已被抢完」和锁竞争的 1002。"
                />
                <div class="rp__amounts">
                    <el-tag v-for="(amount, index) in burstDialog.amounts" :key="index" size="small" effect="light" type="danger">
                        {{ amount }} 分
                    </el-tag>
                    <span v-if="burstDialog.amounts.length === 0" class="lab-hint">没有人抢到</span>
                </div>
            </div>
        </el-dialog>
    </div>
</template>

<style scoped>
.rp {
    display: grid;
    grid-template-columns: 420px minmax(0, 1fr);
    gap: 16px;
    align-items: start;
}

.rp__phone {
    background: #ededed;
    border-radius: 14px;
    border: 1px solid #dcdcdc;
    overflow: hidden;
    box-shadow: var(--lab-shadow);
}

.rp__phone-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: #ededed;
    border-bottom: 1px solid #dcdcdc;
    font-size: 14px;
    color: #1a1a1a;
}

.rp__phone-title {
    font-weight: 600;
}

.rp__chat {
    height: 460px;
    overflow-y: auto;
    padding: 12px;
    background: #f5f5f5;
}

.rp__system {
    text-align: center;
    font-size: 12px;
    color: #9b9b9b;
    margin: 6px 0 12px;
}

.rp__grabbed {
    text-align: center;
    font-size: 12px;
    color: #b26a00;
    background: #fff7e8;
    border-radius: 6px;
    padding: 4px 8px;
    margin: 0 auto 10px;
    width: fit-content;
}

.rp__row {
    display: flex;
    gap: 8px;
    margin-bottom: 14px;
}

.rp__row--mine {
    flex-direction: row-reverse;
}

.rp__avatar {
    width: 38px;
    height: 38px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 13px;
    flex: 0 0 38px;
}

.rp__bubble-wrap {
    max-width: 260px;
}

.rp__row--mine .rp__bubble-wrap {
    text-align: right;
}

.rp__nick {
    font-size: 12px;
    color: #9b9b9b;
    margin-bottom: 4px;
}

.rp__packet {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: #f8a33d;
    border-radius: 8px;
    color: #fff;
    cursor: pointer;
    text-align: left;
    transition: transform 0.12s ease;
}

.rp__packet:hover {
    transform: scale(1.02);
}

.rp__packet-icon {
    font-size: 26px;
}

.rp__packet-title {
    font-size: 13px;
    font-weight: 600;
}

.rp__packet-sub {
    font-size: 11px;
    opacity: 0.86;
    margin-top: 2px;
}

.rp__packet-tag {
    font-size: 10px;
    opacity: 0.7;
    align-self: flex-end;
}

.rp__packet-ops {
    margin-top: 4px;
}

.rp__composer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: #f7f7f7;
    border-top: 1px solid #dcdcdc;
}

.rp__tools {
    background: #fff;
    border: 1px solid var(--lab-border);
    border-radius: var(--lab-radius);
    padding: 16px 18px;
    box-shadow: var(--lab-shadow);
}

.rp__tools-title {
    font-size: 14px;
    font-weight: 600;
}

.rp__tools-desc {
    font-size: 12px;
    color: var(--lab-muted);
    line-height: 1.7;
    margin: 6px 0 12px;
}

.rp__note {
    margin-top: 12px;
}

.rp__open {
    text-align: center;
    padding: 6px 0 10px;
}

.rp__open-avatar {
    width: 52px;
    height: 52px;
    border-radius: 8px;
    margin: 0 auto 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 16px;
}

.rp__open-from {
    font-size: 15px;
    font-weight: 600;
}

.rp__open-tip {
    margin-top: 4px;
    font-size: 12px;
    color: var(--lab-muted);
}

.rp__open-seal {
    width: 84px;
    height: 84px;
    margin: 22px auto 10px;
    border-radius: 50%;
    background: linear-gradient(160deg, #ffd76e, #f0a12e);
    color: #8a3b0e;
    font-size: 34px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 6px 18px rgba(214, 141, 26, 0.45);
    transition: transform 0.12s ease;
}

.rp__open-seal:hover {
    transform: scale(1.06);
}

.rp__open-result {
    margin: 18px 0 10px;
}

.rp__open-amount {
    font-size: 44px;
    font-weight: 700;
    color: #e1251b;
}

.rp__open-amount span {
    font-size: 16px;
    margin-left: 4px;
}

.rp__open-msg {
    margin-top: 10px;
    font-size: 12px;
    color: var(--lab-danger);
}

.rp__open-left {
    margin-top: 10px;
    font-size: 12px;
    color: var(--lab-muted);
}

.rp__tiny-avatar {
    width: 22px;
    height: 22px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 11px;
}

.rp__burst-nums {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    text-align: center;
    font-size: 12px;
    color: var(--lab-muted);
    margin-bottom: 12px;
}

.rp__burst-nums span {
    display: block;
    font-size: 22px;
    font-weight: 700;
    color: var(--lab-text);
}

.rp__burst-nums .ok span {
    color: var(--lab-success);
}

.rp__burst-nums .no span {
    color: var(--lab-danger);
}

.rp__amounts {
    margin-top: 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

@media (max-width: 1100px) {
    .rp {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
