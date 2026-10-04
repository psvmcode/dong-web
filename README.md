# dong-web

`dong`（中间件与分布式场景实验室）的**可视化控制台**。后端只有接口，没有页面；这个项目把 13 个实验场景
做成可交互的页面，让每个场景都能在浏览器里跑起来、看到真实数字、并做对照实验。

技术栈：Vue 3 + TypeScript + Vite + Element Plus + Pinia + ECharts。

## 快速开始

```bash
# 1. 先启动后端（默认 8090），在 dong 目录下：
mvn spring-boot:run

# 2. 安装依赖
npm install --include=dev
# 若环境里 NODE_ENV=production，npm 会跳过 devDependencies，必须显式加 --include=dev

# 3. 启动前端
npm run dev          # http://127.0.0.1:5178
```

其它命令：

```bash
npm run typecheck    # vue-tsc 类型检查
npm run build        # 类型检查 + 生产构建
npm run preview      # 预览构建产物
```

### 后端地址怎么改

dev 阶段走 Vite 代理，**后端不需要开 CORS**：`/api`、`/actuator`、`/v3` 三类前缀都会被转发到
`http://127.0.0.1:8090`。后端不在本机时：

```bash
DONG_BACKEND_TARGET=http://10.0.0.5:8090 npm run dev
```

生产部署时把 `dist` 交给任意静态服务器，并用 nginx 反向代理同样的三个前缀即可。

## 目录结构

```
src/
├── api/            接口层，一个模块一个文件，与后端 Controller 一一对应
│   ├── http.ts     axios 封装：Result 解包、耗时统计、query/body 两种参数形态
│   └── types.ts    后端 DTO 的 TypeScript 镜像
├── components/     通用展示块：StatCard / ResultView / EChart / SectionHead
├── composables/
│   └── useApi.ts   useApi（loading/result） 与 runBurst（并发压测）
├── layouts/        左侧场景导航 + 右侧工作区
├── router/         路由表与侧边菜单（同一份数据）
├── utils/          金额、耗时、日期等展示层格式化
└── views/          每个场景一到两个页面
```

### 两条约定

1. **接口不抛异常**。`unwrap()` 把失败也包成 `ApiResult`，页面自己决定怎么展示。
   实验室的价值在于「看到后端到底返回了什么」，包括 1004 未启用、1005 依赖不可用这类失败，
   把它们折成一句 toast 就丢掉了最关键的信息。
2. **对照而不是单测**。凡是能对比的（有锁/无锁、推/拉、四类限流算法、有无布隆过滤器）
   都做成同一屏里并排的两个按钮或两张表，单个结果说明不了问题。

## 页面清单

| 场景 | 路由 | 能验证什么 |
| --- | --- | --- |
| 总览 | `/dashboard` | 后端连通性、ES 文档数、缓存命中率、消息实现 |
| 商品与多级缓存 | `/cache/product` | L1 → L2 → 回源的读路径、布隆过滤、失效 |
| 命中率与穿透 | `/cache/lab` | 各层命中贡献、穿透对照、手动 probe 与失效 |
| 检索工作台 | `/search/explore` | 全文检索、高亮、分面、补全、聚合、地理检索 |
| 一致性与运维 | `/search/ops` | 对账报告、按差异修复、全量同步、零停机重建 |
| 秒杀 | `/seckill` | 并发压测下四道防线各拦下多少 |
| 抢红包 | `/red-packet` | 并发抢不重复发放、副本丢失后重建 |
| 订单状态机 | `/order` | 可用事件、流转日志、乐观锁并发对照 |
| TCC | `/tcc` | 强制失败回滚、分支状态、手工恢复 |
| 消息引擎 | `/mq` | 普通/延迟/顺序/批量四类消息与消费语义 |
| 短链 | `/classic/short-link` | 点击计数缓存累加与回写 |
| 签到与 UV | `/classic/sign` | bitmap 日历、HyperLogLog 估算 |
| 排行榜 | `/classic/rank` | zset 排序与反查、周榜结算 |
| GEO 与延迟队列 | `/classic/geo` | geohash 附近的人、按 score 排序的延迟队列 |
| 发号器/锁/限流 | `/classic/lab` | 四种 id 策略、加锁对照、四算法突发对比 |
| 账户与汇率 | `/crossborder/account` | 开户、冻结解冻、制裁名单、锁汇 |
| 汇款与合规 | `/crossborder/remittance` | 幂等汇款、五级合规、人工审核与退汇 |
| 清算批次 | `/crossborder/settlement` | 渠道熔断、批次归集与清算 |
| 风控 | `/crossborder/risk` | 渠道路由评分、AML 画像、汇率敞口 |
| 对账 | `/crossborder/recon` | 注入差错后执行对账并处理差异 |
| 关注关系 | `/social/relation` | set 的关注/粉丝/共同关注 |
| 时间线推拉 | `/social/timeline` | 写扩散与读扩散的耗时对比 |
| 多数据源 | `/replica` | 第二数据源的本地事务与读一致性 |
| MongoDB 日志 | `/doc/operation-log` | 无 schema 写入与查询 |
| Agent 实验台 | `/agent` | 会话运行、工具清单、SSE 流式、停止闸门 |

## 首次使用时可能的空数据

这些场景依赖远程中间件，初次打开某些页面可能没有数据，按下面的顺序点一下就有：

- **检索页 0 条**：ES 索引是空的话，先去「一致性与运维」点「全量重建索引」。
- **Agent 全部 1004**：后端 `dong.agent.enabled` 默认为 `false`，改成 `true` 并重启后端。
- **MariaDB 不可用**：`/replica` 会返回 1004；顶栏会提示「N 个组件不可用」，不影响其它页面。
- **红包的 1002**：并发抢时部分请求会拿到 `stock is busy`，那是锁竞争的正常表现，
  失败原因会按 code 分组展示在压测结果里。
