# Stock Desk 开发计划

> 更新日期:2026-05-14

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | Electron 31 |
| 渲染层 | React 18 + TypeScript + Vite 5 |
| UI 样式 | Tailwind CSS 3(暗色主题) |
| 图表 | lightweight-charts + Recharts(待接入) |
| 状态管理 | Zustand + TanStack Query(待接入) |
| 本地存储 | better-sqlite3(待接入) |
| 数据源 | yahoo-finance2(主) + Finnhub(备用,新闻) |
| AI 分析 | claude CLI(`-p --output-format stream-json --resume`) |
| 多模态 OCR | 截图/PDF → base64 → claude vision |

---

## 全局快捷键

| 快捷键 | 作用 |
|---|---|
| `Cmd+Opt+\` (macOS) / `Ctrl+Alt+\` (Win) | 全局切换窗口显示/隐藏 |
| `Cmd+K` | 应用内股票搜索(M4 实现) |
| `Cmd+W` | 隐藏窗口(不退出,保持后台 scheduler) |
| `Cmd+Q` | 真正退出 |

---

## 数据刷新策略

| 数据类型 | 频率 | 说明 |
|---|---|---|
| 持仓报价 | 5 分钟/次(仅开盘时段) | 收盘后停止 |
| K 线 | 按需拉取 | 默认日 K,可切 5min |
| 涨跌榜单 | 15 分钟缓存 | 带 TTL 显示"更新于 X 分钟前" |
| 期权链 | 30 分钟缓存 | 详情页打开时按需拉 |
| 新闻 | 30 分钟缓存 | 分析时批量拉 |
| 机会榜 | 每日 09:00 ET | claude 筛选一次,全天不变 |
| 整点 insight | 每小时(09:30-16:00 ET) | 工作日开盘期间 |

---

## 功能列表

| # | 功能 | 里程碑 | 状态 |
|---|---|---|---|
| 1 | 截图/PDF 导入持仓(claude vision → 结构化 JSON) | M3 | 待开发 |
| 2 | 持仓/期权实时价格与趋势(日 K + 成本线 + sparkline) | M4/M5 | 待开发 |
| 3 | 一键 AI 分析(涨跌归因/买卖理由/利好利空/期权仓位建议) | M5 | 待开发 |
| 4 | 任意股票搜索(`Cmd+K`,支持 ticker/公司名) | M4 | 待开发 |
| 5 | 主界面三榜单(涨幅/跌幅/AI 机会榜) | M4 | 待开发 |
| 6 | 整点持仓 insight(开盘期间每小时,系统通知) | M6 | 待开发 |
| 7 | 全局快捷键显示/隐藏 + Tray + 关窗不退出 | M1 | **已完成** |

---

## 里程碑详情

### M1 — 脚手架 ✅ 已完成 (commit `da80046`)

- [x] Electron + Vite + React 18 + TypeScript 跑通
- [x] 全局快捷键 `Cmd+Opt+\` 切换显示/隐藏
- [x] 单例锁(防双开)+ 关窗变隐藏
- [x] Tray 图标 + 右键菜单
- [x] IPC contextIsolation 安全桥 (preload + contextBridge)
- [x] claude CLI 自动探测(多候选路径)
- [x] Tailwind 暗色主题
- [x] 推送 GitHub: https://github.com/wugekelvin04-sys/stock

---

### M2 — 数据层(Yahoo + Finnhub + 缓存)

**目标**:所有行情数据都能拿到,限流安全,缓存透明。

- [ ] 安装 `yahoo-finance2` + `axios`
- [ ] `electron/services/market.ts`:
  - `getQuotes(symbols[])` — 批量报价
  - `getHistory(symbol, period)` — 日 K/周 K 历史
  - `getOptionChain(symbol)` — 期权链
  - `search(query)` — ticker 搜索
  - `getGainers() / getLosers()` — 涨跌榜
- [ ] `electron/services/cache.ts`:
  - SQLite 表 `quote_cache(symbol, type, data_json, fetched_at, ttl_seconds)`
  - 读:先查缓存,命中且未过期直接返回
  - 写:网络成功后写入
  - TTL 分级:报价 300s / 榜单 900s / 期权链 1800s / 新闻 1800s / 基本面 86400s
- [ ] `electron/services/ratelimit.ts`:简单令牌桶,Yahoo 自限 2 req/s,Finnhub 1 req/s
- [ ] IPC 暴露 `market:quotes` / `market:history` / `market:search`
- [ ] UI 显示"数据更新于 X 分钟前"

---

### M3 — 持仓导入(截图/PDF → 持仓)

**目标**:上传一张券商截图或 PDF,自动识别出持仓表格。

- [ ] 安装 `pdfjs-dist`
- [ ] `electron/services/parser.ts`:
  - PDF 页 → canvas → base64 PNG
  - 图片文件直接 base64
  - 调 `claude -p <prompt> --image <base64>` 提取持仓 JSON
  - 输出结构:`[{ symbol, type, qty, costBasis, strike?, expiry?, side?, exchange? }]`
- [ ] `electron/services/db.ts`:
  - SQLite 表 `holdings` / `options_positions` / `search_history` / `daily_picks` / `insights`
  - CRUD 封装
- [ ] IPC `portfolio:import` / `portfolio:list` / `portfolio:delete`
- [ ] `src/pages/Import.tsx`:拖拽上传区 + 识别结果预览 + 确认入库

---

### M4 — 主界面(三榜单 + 持仓列表 + 全局搜索)

**目标**:打开 app 就能看到市场全局和自己的仓位。

- [ ] 安装 `zustand` + `@tanstack/react-query`
- [ ] `src/pages/Dashboard.tsx`:
  - 涨幅榜 Top 10(Yahoo screener `day_gainers`)
  - 跌幅榜 Top 10(Yahoo screener `day_losers`)
  - 机会榜 Top 10(读 `daily_picks` 表,开盘前 claude 筛一次)
  - 每行:ticker / 公司名 / 现价 / 当日涨跌% / 5日涨跌%
- [ ] `src/pages/Portfolio.tsx`:
  - 持仓列表:symbol / 持仓量 / 成本价 / 现价 / 盈亏% / 7日 sparkline
  - 期权列表:symbol / strike / expiry / 方向 / 现价 / IV
  - 总览卡片:总市值 / 总盈亏 / 当日变化
- [ ] `src/components/SearchBar.tsx`:
  - `Cmd+K` 全局唤起
  - yahoo-finance2.search 防抖 300ms
  - 结果分组 Stocks / ETFs
  - 点击跳转详情页
  - 历史记录持久化

---

### M5 — 详情页(趋势图 + 流式 AI 分析)

**目标**:点任意一支股票/期权,看走势和 AI 一键分析。

- [ ] 安装 `lightweight-charts`
- [ ] `src/pages/Detail.tsx`:
  - 日 K 趋势图 + 20/50 日均线 + 成本线(持仓才有)
  - 可切周期:1M / 3M / 6M / 1Y
  - 基本面快照:PE / 市值 / 52周高低
  - "一键分析"按钮
- [ ] `electron/services/claude.ts` 扩展:
  - `analyzeStock(symbol, context)`:spawn claude `--resume analysis-<symbol> --output-format stream-json`
  - 解析 NDJSON 流,逐 token emit 给渲染层
  - Prompt 模板:当日涨跌归因 / 买入理由 / 卖出理由 / 主要利好 / 主要利空 / 期权仓位建议
- [ ] `src/components/AnalysisPanel.tsx`:
  - 流式文字逐字渲染(SSE-like)
  - 结构化展示:归因 / 多方 / 空方 / 建议

---

### M6 — 整点 insight + 每日机会榜

**目标**:开盘期间自动推送持仓摘要,开盘前自动筛机会。

- [ ] 安装 `node-cron` + `nyse-trading-days`
- [ ] `electron/services/scheduler.ts`:
  - **每日 09:00 ET**(开盘前 30 分钟):
    - 用 claude `--resume daily-screen-<YYYYMMDD> --allowedTools WebFetch,WebSearch`
    - Prompt:"今天美股最值得关注的 10 支股票,结合隔夜新闻+技术面+板块轮动"
    - 解析结果 → 写入 `daily_picks` 表
  - **工作日 09:30-16:00 ET 每整点**:
    - 汇总当前持仓 P&L + 当日新闻
    - claude `--resume hourly-<YYYYMMDD>` 生成 insight
    - 写入 `insights` 表
    - 推送系统通知(`Notification` API)
- [ ] `src/components/HourlyInsight.tsx`:历史 insight 列表(今日回顾)

---

### M7 — 打磨

- [ ] 快捷键自定义 UI(设置页)
- [ ] 限流触发时 UI 提示(toast:"数据源限流,使用缓存")
- [ ] 错误边界(React ErrorBoundary)
- [ ] 空状态设计(无持仓 / 无网络 / claude 未安装)
- [ ] 开盘/收盘状态标识(Tray 图标颜色变化)
- [ ] 菜单栏:今日机会榜快速预览(不开窗口)

---

## claude CLI 会话策略

| 会话 ID | 用途 | 生命周期 |
|---|---|---|
| `analysis-<SYMBOL>` | 单标的深度分析 | 按需创建,可追问 |
| `hourly-<YYYYMMDD>` | 当日整点 insight | 每个交易日一个 |
| `daily-screen-<YYYYMMDD>` | 每日机会榜筛选 | 每个交易日一次 |
| (无 resume) | OCR 持仓识别 | 一次性,不复用 |

---

## 关键风险

| 风险 | 缓解 |
|---|---|
| Yahoo Finance 非官方 API,随时可能变 | 缓存兜底 + UI 标"数据陈旧" + Finnhub 备用 |
| claude CLI 路径/登录态失效 | 启动时探测,失败给用户引导文案 |
| 期权数据质量参差 | 允许用户手填 strike/expiry 作兜底 |
| 开盘时段判断(时区) | 用 `nyse-trading-days` 库,避免手写节假日 |
| claude 调用成本 | 会话复用降成本;OCR/分析按需触发,不轮询 |
