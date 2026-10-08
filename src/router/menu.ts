import type { Component } from 'vue';
import {
    Box,
    Calendar,
    FolderOpened,
    UploadFilled,
    ChatLineSquare,
    Coin,
    Connection,
    Cpu,
    DataBoard,
    Document,
    Files,
    Goods,
    Histogram,
    Link,
    Location,
    Message,
    Money,
    PieChart,
    Present,
    Promotion,
    Refresh,
    Search,
    ShoppingCart,
    Timer,
    User,
    Van,
    Wallet,
    Warning,
} from '@element-plus/icons-vue';

/**
 * 侧边导航配置。
 *
 * <p>菜单、面包屑与首页的场景卡片共用这一份数据：
 * 加一个新场景只需要在这里补一条，不需要三处同步。
 */

/** 叶子菜单项。 */
export interface MenuLeaf {
    path: string;
    title: string;
    desc: string;
    icon: Component;
    /** 涉及的中间件或技术点，首页卡片会展示 */
    tags: string[];
}

/** 一级分组。 */
export interface MenuGroup {
    key: string;
    title: string;
    icon: Component;
    children: MenuLeaf[];
}

const menuGroups: MenuGroup[] = [
    {
        key: 'overview',
        title: '总览',
        icon: DataBoard,
        children: [
            {
                path: '/dashboard',
                title: '实验总览',
                desc: '后端连通性、各场景关键指标与场景导航',
                icon: DataBoard,
                tags: ['全场景'],
            },
        ],
    },
    {
        key: 'cache',
        title: '缓存实验室',
        icon: Coin,
        children: [
            {
                path: '/cache/product',
                title: '商品与多级缓存',
                desc: 'L1/L2/回源三层读写路径、布隆过滤器与缓存失效',
                icon: Goods,
                tags: ['Caffeine', 'Redis', '布隆过滤器'],
            },
            {
                path: '/cache/lab',
                title: '命中率与穿透实验',
                desc: '预热、统计、手动读写 key，对比有无布隆过滤器的穿透表现',
                icon: PieChart,
                tags: ['命中率', '缓存击穿'],
            },
        ],
    },
    {
        key: 'search',
        title: '搜索引擎',
        icon: Search,
        children: [
            {
                path: '/search/explore',
                title: '检索工作台',
                desc: '电商搜索的样子：补全下拉、关键词高亮、分类分面、价格分布与附近商品',
                icon: Search,
                tags: ['Elasticsearch', 'IK'],
            },
            {
                path: '/search/ops',
                title: '一致性与运维',
                desc: 'MySQL 与 ES 对账、按差异修复、全量同步与零停机重建',
                icon: Refresh,
                tags: ['对账', '别名切换'],
            },
        ],
    },
    {
        key: 'concurrency',
        title: '高并发场景',
        icon: Timer,
        children: [
            {
                path: '/seckill',
                title: '秒杀',
                desc: '秒杀会场：倒计时、库存条、并发抢购与压测，看四道防线各拦下多少',
                icon: ShoppingCart,
                tags: ['Redis Lua', 'RocketMQ'],
            },
            {
                path: '/red-packet',
                title: '抢红包',
                desc: '微信群红包：发红包、拆红包、一群人同时抢，抢到人数必须等于份数',
                icon: Present,
                tags: ['Redisson', '队列副本'],
            },
        ],
    },
    {
        key: 'consistency',
        title: '一致性与事务',
        icon: Connection,
        children: [
            {
                path: '/order',
                title: '订单状态机',
                desc: 'COLA 状态机：可用事件、流转日志、乐观锁并发对比',
                icon: Files,
                tags: ['COLA StateMachine'],
            },
            {
                path: '/tcc',
                title: 'TCC 分布式事务',
                desc: 'Try/Confirm/Cancel 三阶段、强制失败回滚与手工补偿',
                icon: Connection,
                tags: ['TCC'],
            },
            {
                path: '/replica',
                title: '多数据源',
                desc: 'MariaDB 第二数据源：本地事务与读一致性',
                icon: Box,
                tags: ['MariaDB', 'HikariCP'],
            },
        ],
    },
    {
        key: 'mq',
        title: '消息引擎',
        icon: Message,
        children: [
            {
                path: '/mq',
                title: '消息投递实验',
                desc: '普通、延迟、顺序、批量四类消息与消费语义对比',
                icon: Promotion,
                tags: ['RocketMQ', 'Kafka'],
            },
        ],
    },
    {
        key: 'classic',
        title: 'Redis 经典玩法',
        icon: Histogram,
        children: [
            {
                path: '/classic/short-link',
                title: '短链',
                desc: '短链服务：生成短码、模拟访问看点击数、回写数据库',
                icon: Link,
                tags: ['Redis String'],
            },
            {
                path: '/classic/sign',
                title: '签到与 UV',
                desc: '签到日历：bitmap 打卡与补签，HyperLogLog 估算 UV 的误差',
                icon: Calendar,
                tags: ['Bitmap', 'HyperLogLog'],
            },
            {
                path: '/classic/rank',
                title: '排行榜',
                desc: 'zset 榜单：领奖台、名次反查、前后范围与周榜结算',
                icon: Histogram,
                tags: ['ZSet'],
            },
            {
                path: '/classic/geo',
                title: 'GEO 与延迟队列',
                desc: '附近的人与按 score 排序的延迟队列',
                icon: Location,
                tags: ['GEO', 'ZSet'],
            },
            {
                path: '/classic/lab',
                title: '发号器 / 锁 / 限流',
                desc: '四种 id 策略、加锁与不加锁并发、四种限流算法对照',
                icon: Cpu,
                tags: ['Snowflake', 'Redisson', '令牌桶'],
            },
        ],
    },
    {
        key: 'crossborder',
        title: '跨境支付',
        icon: Money,
        children: [
            {
                path: '/crossborder/account',
                title: '账户与汇率',
                desc: '开户、冻结解冻、制裁名单、锁汇询价与牌价管理',
                icon: Wallet,
                tags: ['MySQL', 'Redis'],
            },
            {
                path: '/crossborder/remittance',
                title: '汇款与合规',
                desc: '幂等汇款、五级合规筛查、人工审核与退汇',
                icon: Money,
                tags: ['状态机', '幂等'],
            },
            {
                path: '/crossborder/settlement',
                title: '清算批次',
                desc: '渠道配置、批次归集清算与超期关闭',
                icon: Van,
                tags: ['定时任务'],
            },
            {
                path: '/crossborder/risk',
                title: '风控',
                desc: '渠道路由试算、AML 交易画像、拆分嫌疑与汇率敞口',
                icon: Warning,
                tags: ['Redis'],
            },
            {
                path: '/crossborder/recon',
                title: '对账',
                desc: '注入渠道差错后执行对账，查看差异并处理',
                icon: Files,
                tags: ['差错注入'],
            },
        ],
    },
    {
        key: 'social',
        title: '社交场景',
        icon: User,
        children: [
            {
                path: '/social/relation',
                title: '关注关系',
                desc: '关注取关、粉丝与关注列表、共同关注',
                icon: User,
                tags: ['Redis Set'],
            },
            {
                path: '/social/timeline',
                title: '时间线推拉对比',
                desc: '动态流：发布、点赞，推/拉两种读法的条数与耗时对比',
                icon: ChatLineSquare,
                tags: ['写扩散', '读扩散'],
            },
        ],
    },
    {
        key: 'upload',
        title: '文件分片上传',
        icon: FolderOpened,
        children: [
            {
                path: '/upload',
                title: '分片上传与断点续传',
                desc: '大文件切片并发上传，模拟刷新后只补传缺失分片，特大文件的指纹抽样策略对比',
                icon: UploadFilled,
                tags: ['分片', '断点续传', '秒传'],
            },
        ],
    },
    {
        key: 'doc',
        title: '文档数据库',
        icon: Document,
        children: [
            {
                path: '/doc/operation-log',
                title: 'MongoDB 操作日志',
                desc: '无 schema 写入与按业务类型分页查询',
                icon: Document,
                tags: ['MongoDB'],
            },
        ],
    },
    {
        key: 'agent',
        title: 'Agent 实验室',
        icon: Cpu,
        children: [
            {
                path: '/agent',
                title: 'Agent 工程实验台',
                desc: '会话运行、工具清单、停止闸门与对照实验',
                icon: ChatLineSquare,
                tags: ['SSE', '停止闸门'],
            },
        ],
    },
];

export { menuGroups };
