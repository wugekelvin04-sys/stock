# Stock Desk

个人美股持仓、期权和市场机会桌面工作台。聊天和持仓导入保留 Claude Code，股票分析与自动任务使用可配置 API。

## 当前功能

- 市场首页：指数、板块、涨幅榜、跌幅榜、AI 机会榜和板块机会。
- 个股详情：分时/历史 K 线、报价、新闻、期权链、自选收藏、AI 分析。
- 持仓管理：手动新增/编辑/删除股票和期权持仓，支持截图/PDF 导入识别。
- 自选分组：创建自选分组，添加/移除 ticker。
- 全局搜索：`Cmd+K` / `Ctrl+K` 搜索 ticker 并跳转详情页。
- Claude Code 聊天：市场首页和独立聊天页支持流式问答。
- API 股票分析：个股一键分析、profile、catalyst、ratings、earnings。
- 后台任务：开盘日机会榜、板块机会、整点持仓 insight；后台预取可配置且默认关闭。
- 本地缓存：行情、榜单、新闻、期权链和 AI 结果写入 SQLite。

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | Electron 31 |
| 渲染层 | React 18 + TypeScript + Vite 5 |
| UI | Tailwind CSS 3 + lucide-react |
| 状态管理 | Zustand + TanStack Query |
| 图表 | lightweight-charts / Recharts |
| 本地存储 | better-sqlite3 |
| 行情 | yahoo-finance2 |
| 新闻 | Finnhub 可选，Yahoo news fallback |
| AI 聊天/导入 | Claude Code CLI stream-json |
| AI 股票分析 | OpenRouter Chat Completions API，默认 `deepseek/deepseek-v4-flash` |
| OCR/导入 | pdfjs-dist + canvas + Claude vision |

## 全局快捷键

| 快捷键 | 作用 |
|---|---|
| `Cmd+Opt+\` / `Ctrl+Alt+\` | 显示 / 隐藏主窗口 |
| `Cmd+K` / `Ctrl+K` | 应用内股票搜索 |
| `Cmd+Q` | 退出 |

## 开发

```bash
npm install
npm run dev
```

依赖：

- Node 20+
- Claude CLI 已安装并登录，用于聊天和截图/PDF 持仓导入
- OpenRouter API Key，用于个股分析、股票资料和自动任务
- 可选：`FINNHUB_API_KEY`，用于公司新闻接口

常用命令：

```bash
npm run typecheck
npm run build
```

## 主要目录

| 路径 | 说明 |
|---|---|
| `electron/main.ts` | Electron 窗口、Tray、快捷键、scheduler 启动 |
| `electron/preload.ts` | `window.api` 安全桥 |
| `electron/ipc/` | IPC handler |
| `electron/services/` | 行情、缓存、数据库、Claude、导入、调度服务 |
| `src/pages/` | 主要页面 |
| `src/components/` | 图表、搜索、分析面板、股票资料面板等组件 |
| `src/stores/` | Zustand store |

## AI 后端边界

| 功能 | 后端 |
|---|---|
| 主页“问 Claude” | Claude Code CLI |
| 侧边栏 Claude 聊天 | Claude Code CLI |
| 截图/PDF 持仓识别 | Claude Code vision |
| 个股一键分析 | OpenRouter API |
| profile / catalyst / ratings / earnings | OpenRouter API |
| 每日机会榜 / 板块机会榜 / 整点 insight | OpenRouter API |
| 后台 prefetch | OpenRouter API，可配置，默认关闭 |

OpenRouter 默认模型：

```text
analysis/search/cheap = deepseek/deepseek-v4-flash
api base = https://openrouter.ai/api/v1
```

可在设置页修改模型 id、API Key、搜索开关和后台预取开关。

## 当前里程碑

- [x] M1 脚手架 + 全局快捷键 + Tray + IPC
- [x] M2 数据源聚合 + SQLite 缓存 + 限流
- [x] M3 截图 / PDF 持仓导入
- [x] M4 主界面榜单 + 持仓列表 + 全局搜索 + 自选
- [x] M5 详情页趋势图 + 期权链 + 流式 AI 分析
- [x] M6 整点 insight + 每日机会榜 + 板块机会 + 后台预取
- [ ] M7 打磨：错误边界、空状态、设置项完善、生产构建体验
