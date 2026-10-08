import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

/**
 * 路由表。
 *
 * <p>路径与 src/router/menu.ts 里的叶子项一一对应，
 * 侧边栏的高亮靠 router.currentRoute 自己算，不需要在两个地方维护 active 状态。
 */

const routes: RouteRecordRaw[] = [
    { path: '/', redirect: '/dashboard' },
    {
        path: '/dashboard',
        name: 'dashboard',
        component: () => import('@/views/Dashboard.vue'),
        meta: { title: '实验总览' },
    },
    {
        path: '/cache/product',
        name: 'cache-product',
        component: () => import('@/views/cache/CacheProduct.vue'),
        meta: { title: '商品与多级缓存' },
    },
    {
        path: '/cache/lab',
        name: 'cache-lab',
        component: () => import('@/views/cache/CacheLab.vue'),
        meta: { title: '命中率与穿透实验' },
    },
    {
        path: '/search/explore',
        name: 'search-explore',
        component: () => import('@/views/search/SearchExplore.vue'),
        meta: { title: '检索工作台' },
    },
    {
        path: '/search/ops',
        name: 'search-ops',
        component: () => import('@/views/search/SearchOps.vue'),
        meta: { title: '一致性与运维' },
    },
    {
        path: '/seckill',
        name: 'seckill',
        component: () => import('@/views/Seckill.vue'),
        meta: { title: '秒杀' },
    },
    {
        path: '/red-packet',
        name: 'red-packet',
        component: () => import('@/views/RedPacket.vue'),
        meta: { title: '抢红包' },
    },
    {
        path: '/order',
        name: 'order',
        component: () => import('@/views/OrderStateMachine.vue'),
        meta: { title: '订单状态机' },
    },
    {
        path: '/tcc',
        name: 'tcc',
        component: () => import('@/views/Tcc.vue'),
        meta: { title: 'TCC 分布式事务' },
    },
    {
        path: '/mq',
        name: 'mq',
        component: () => import('@/views/Mq.vue'),
        meta: { title: '消息投递实验' },
    },
    {
        path: '/classic/short-link',
        name: 'short-link',
        component: () => import('@/views/classic/ShortLink.vue'),
        meta: { title: '短链' },
    },
    {
        path: '/classic/sign',
        name: 'sign-uv',
        component: () => import('@/views/classic/SignUv.vue'),
        meta: { title: '签到与 UV' },
    },
    {
        path: '/classic/rank',
        name: 'rank',
        component: () => import('@/views/classic/Leaderboard.vue'),
        meta: { title: '排行榜' },
    },
    {
        path: '/classic/geo',
        name: 'geo',
        component: () => import('@/views/classic/GeoDelay.vue'),
        meta: { title: 'GEO 与延迟队列' },
    },
    {
        path: '/classic/lab',
        name: 'classic-lab',
        component: () => import('@/views/classic/ConcurrencyLab.vue'),
        meta: { title: '发号器 / 锁 / 限流' },
    },
    {
        path: '/crossborder/account',
        name: 'cb-account',
        component: () => import('@/views/crossborder/AccountFx.vue'),
        meta: { title: '账户与汇率' },
    },
    {
        path: '/crossborder/remittance',
        name: 'cb-remittance',
        component: () => import('@/views/crossborder/Remittance.vue'),
        meta: { title: '汇款与合规' },
    },
    {
        path: '/crossborder/settlement',
        name: 'cb-settlement',
        component: () => import('@/views/crossborder/Settlement.vue'),
        meta: { title: '清算批次' },
    },
    {
        path: '/crossborder/risk',
        name: 'cb-risk',
        component: () => import('@/views/crossborder/Risk.vue'),
        meta: { title: '风控' },
    },
    {
        path: '/crossborder/recon',
        name: 'cb-recon',
        component: () => import('@/views/crossborder/Recon.vue'),
        meta: { title: '对账' },
    },
    {
        path: '/social/relation',
        name: 'social-relation',
        component: () => import('@/views/social/Relation.vue'),
        meta: { title: '关注关系' },
    },
    {
        path: '/social/timeline',
        name: 'social-timeline',
        component: () => import('@/views/social/Timeline.vue'),
        meta: { title: '时间线推拉对比' },
    },
    {
        path: '/replica',
        name: 'replica',
        component: () => import('@/views/Replica.vue'),
        meta: { title: '多数据源' },
    },
    {
        path: '/doc/operation-log',
        name: 'operation-log',
        component: () => import('@/views/doc/OperationLog.vue'),
        meta: { title: 'MongoDB 操作日志' },
    },
    {
        path: '/upload',
        name: 'upload',
        component: () => import('@/views/upload/UploadLab.vue'),
        meta: { title: '文件分片上传' },
    },
    {
        path: '/agent',
        name: 'agent',
        component: () => import('@/views/agent/AgentLab.vue'),
        meta: { title: 'Agent 工程实验台' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
];

export const router = createRouter({
    history: createWebHistory(),
    routes,
    scrollBehavior: () => ({ top: 0 }),
});
