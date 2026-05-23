# Stock Desk 开发计划

> 更新日期: 2026-05-15

## 项目定位

Stock Desk 是一个个人美股/期权桌面工作台。它把行情、持仓、自选、期权链、新闻、AI 分析和定时市场洞察放在一个 Electron 应用里，主要面向需要每天快速查看市场、持仓风险和交易机会的个人用户。

---

## 当前技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | Electron 31 |
| 渲染层 | React 18 + TypeScript + Vite 5 |
| UI 样式 | Tailwind CSS 3 暗色主题 |
| 图标 | lucide-react |
| 图表 | lightweight-charts + Recharts |
| 状态管理 | Zustand + TanStack Query |
| 本地存储 | better-sqlite3 |
| 行情数据 | yahoo-finance2 |
| 新闻数据 | Finnhub 可选 + Yahoo fallback |
| AI 聊天/导入 | Claude Code CLI `stream-json` |
| AI 股票分析 | OpenRouter Chat Completions API |
| 多模态导入 | 截图/PDF -> base64 image -> Claude vision |
| 定时任务 | node-cron + date-holidays |

---

## 当前架构

| 模块 | 文件 | 责任 |
|---|---|---|
| Electron 主进程 | `electron/main.ts` | 窗口、Tray、全局快捷键、单例锁、scheduler |
| 安全桥 | `electron/preload.ts` | 暴露 `window.api`，隔离 renderer 和 main |
| IPC 注册 | `electron/ipc/index.ts` | 聚合 market、portfolio、analysis、insight、watchlist、chat、stock handler |
| 行情服务 | `electron/services/market.ts` | quote、history、intraday、options、search、screeners、indices、sectors、news |
| 本地数据库 | `electron/services/db.ts` | SQLite migration 和 CRUD |
| 缓存层 | `electron/services/cache.ts` | TTL cache + stale fallback |
| 限流 | `electron/services/ratelimit.ts` | Yahoo/Finnhub token bucket |
| Claude 服务 | `electron/services/claude.ts` | Claude Code 聊天、截图导入辅助、legacy 类型 |
| API Provider | `electron/services/ai/openrouter.ts` | OpenRouter 文本生成、流式输出、搜索工具 |
| 持仓导入 | `electron/services/parser.ts` | 图片/PDF 转 Claude vision，解析持仓 JSON |
| 调度器 | `electron/services/scheduler.ts` | 每日机会榜、板块机会、整点 insight、AI 资料预取 |

---

## 数据表

| 表 | 用途 |
|---|---|
| `holdings` | 股票和期权持仓 |
| `quote_cache` | 行情、榜单、新闻、期权链等 TTL 缓存 |
| `daily_picks` | 每日 AI 机会股 |
| `sector_picks` | 每日 AI 板块机会 |
| `insights` | 整点持仓 insight |
| `search_history` | 搜索历史 |
| `settings` | 本地设置 |
| `watchlist_groups` | 自选分组 |
| `watchlist_items` | 自选股票 |
| `stock_profile` | 个股长期 profile |
| `stock_catalyst` | 个股每日催化剂 |
| `stock_ratings` | 个股评级摘要 |
| `stock_earnings` | 个股财报摘要 |

---

## 页面与功能

| 页面 | 状态 | 说明 |
|---|---|---|
| 市场首页 `Dashboard` | 已实现 | 指数、榜单、板块、AI 机会、内嵌 Claude 聊天 |
| 持仓 `Portfolio` | 已实现 | 股票/期权持仓列表、手动维护、截图/PDF 导入 |
| 个股详情 `Detail` | 已实现 | 报价、K 线、新闻、期权链、AI 分析、收藏 |
| 自选 `Watchlist` | 已实现 | 分组管理和 ticker 管理 |
| Claude `Chat` | 已实现 | 独立流式聊天页，继续使用 Claude Code |
| 设置 `Settings` | 已实现 | Claude 检测、OpenRouter 模型/API Key、prefetch 配置 |

---

## 数据刷新策略

| 数据类型 | TTL / 频率 | 说明 |
|---|---|---|
| quote | 5 分钟 | `TTL.QUOTE` |
| screener | 15 分钟 | 涨幅榜、跌幅榜、指数、板块 |
| option chain | 30 分钟 | 未来到期链短缓存，已到期链长缓存 |
| news | 1 小时 | Finnhub 或 Yahoo fallback |
| search | 1 小时 | ticker 搜索结果 |
| history 1d | 5 分钟 | 日内分钟线 |
| history 1mo | 盘中 4 小时，收盘后长缓存 | 包含今日 bar |
| history 3mo+ | 长缓存 | 已收盘历史数据视为不可变 |
| daily picks | 每个交易日 09:00 ET | Claude 生成 |
| hourly insight | 交易日 09:30 和 10:00-16:00 ET | 有持仓时生成 |
| AI prefetch | 默认关闭 | 开启后按设置限量预取，默认不搜索 |

---

## 里程碑状态

### M1 - 桌面基础设施

- [x] Electron + Vite + React + TypeScript
- [x] 单例锁，防止双开
- [x] 关闭窗口时隐藏，Tray 保持后台运行
- [x] 全局快捷键 `Cmd+Opt+\` / `Ctrl+Alt+\`
- [x] preload + contextBridge 安全桥
- [x] Claude CLI 探测

### M2 - 数据层

- [x] Yahoo quote/history/options/search/screener
- [x] 指数和板块 ETF 数据
- [x] Finnhub 新闻，可回退 Yahoo news
- [x] SQLite cache
- [x] TTL 和 stale fallback
- [x] Yahoo/Finnhub 限流
- [x] market IPC 暴露

### M3 - 持仓导入

- [x] 图片持仓导入
- [x] PDF 转图片导入
- [x] 股票/期权/自动识别 prompt
- [x] 结构化 JSON 解析
- [x] 持仓保存、列表、更新、删除、清空
- [x] 持仓页面导入预览和确认

### M4 - 市场首页、持仓、自选、搜索

- [x] 市场首页指数卡片
- [x] 涨幅榜 / 跌幅榜
- [x] 每日 AI 机会榜
- [x] 板块机会榜
- [x] 持仓总览和明细
- [x] 自选分组
- [x] `Cmd+K` 全局搜索
- [x] 搜索跳转详情页

### M5 - 个股详情和 AI 分析

- [x] 分时和历史 K 线
- [x] 报价、涨跌幅、缓存标识
- [x] 新闻列表
- [x] 期权链
- [x] 收藏到自选
- [x] 流式 AI 分析
- [x] profile / catalyst / ratings / earnings 面板
- [x] 个股分析和资料面板迁移到 OpenRouter API

### M6 - 调度和自动洞察

- [x] 每日 09:00 ET AI 机会榜
- [x] 板块机会生成
- [x] 交易时段整点持仓 insight
- [x] 系统通知
- [x] scheduler 推送 renderer toast
- [x] Tray 市场开盘状态
- [x] 关注股票 AI 资料后台预取
- [x] 后台任务面板
- [x] prefetch 配置化，默认关闭

### M7 - 打磨与稳定性

- [x] 基础 toast
- [x] 简单权限保护持仓页
- [x] 部分空状态
- [ ] React ErrorBoundary
- [ ] 设置页完善：快捷键、数据源、缓存清理
- [ ] 导入失败和 Claude 登录态引导优化
- [ ] UI 响应式和布局细节继续打磨
- [ ] e2e/smoke test
- [ ] 打包发布流程

---

## Claude CLI 会话策略

| 用途 | 后端 | 生命周期 |
|---|---|---|
| 个股分析 | OpenRouter API | 按需生成，可取消同 symbol 旧请求 |
| 聊天 | Claude Code CLI | 单次流式问答 |
| 个股资料 | OpenRouter API | 生成后写 SQLite |
| OCR 导入 | Claude Code vision | 一次性识别 |
| 每日机会榜 | OpenRouter API | 每个交易日一次 |
| 整点 insight | OpenRouter API | 交易日盘中 |

---

## 已知风险和待处理

| 风险 / 问题 | 影响 | 处理方向 |
|---|---|---|
| Yahoo Finance 非官方 API | 接口变化会影响行情 | 保持缓存和 stale fallback，必要时增加备用源 |
| Claude CLI 路径和登录态 | 聊天和持仓导入不可用 | 启动检测和设置页引导 |
| Claude 调用使用 `--dangerously-skip-permissions` | 本机安全边界偏宽 | 仅保留在聊天/导入路径，后续收紧工具权限 |
| OpenRouter API Key 缺失 | 股票分析和自动任务不可用 | 设置页配置，或使用 `OPENROUTER_API_KEY` 环境变量 |
| API 搜索成本失控 | 频繁看股时成本上升 | 搜索次数、prefetch 默认关闭、后台默认不搜索 |
| 期权数据质量不稳定 | 期权链和持仓估值可能偏差 | 允许手动录入，增加数据源校验 |
| 市场节假日判断不完整 | 定时任务可能误触发 | 当前用 `date-holidays`，后续可换 NYSE 专用 calendar |
| 文档需要随代码更新 | 认知偏差 | README / PLAN 已按当前实现同步 |

---

## 下一步建议

1. 用真实 OpenRouter Key 手动验证个股分析、四个资料面板、机会榜。
2. 增加 ErrorBoundary 和关键 IPC 错误提示。
3. 为 market、parser、scheduler 的核心路径补最小测试。
4. 设置页继续补 Finnhub key、缓存清理、快捷键。
5. 做一次生产打包验证，确认 native deps 和 Electron 路径正常。
