# GitDeck 文档中心

本目录是 GitDeck 的知识库，面向人类维护者和后续 AI 会话。

## 当前快照

- 产品：Windows 本地多仓库 Git 工作台。
- 运行环境：Node.js 18+、Git、浏览器。
- 运行时依赖：无。
- 默认地址：`http://127.0.0.1:4321`。
- 数据文件：`data/repositories.json`。
- 数据版本：版本 2，包含工作区和仓库归属。
- 自动化测试：`node --test`。
- 文档检查：`node tools/check-docs.js`。

## 按任务阅读文档

| 任务 | 优先阅读 |
| --- | --- |
| 首次接手或新 AI 会话 | `AGENTS.md`，再读本文件 |
| 理解整体设计 | `ARCHITECTURE.md` |
| 查找功能代码 | `FEATURES.md` |
| 修改接口或 Git 动作 | `API.md`、`SECURITY.md` |
| 修改持久化数据 | `DATA-MODEL.md` |
| 修改 UI 行为或布局 | `UI-MAP.md`、`FEATURES.md` |
| 新增或修复测试 | `TESTING.md` |
| 排查 Git 错误 | `TROUBLESHOOTING.md` |
| 查看技术取舍 | `DECISIONS.md` |
| 规划下一轮迭代 | `ROADMAP.md`、`ITERATION-LOG.md` |

## 文档目录

- `AGENT-GUIDE.md`：AI 上下文加载、修改流程和验证规范。
- `ARCHITECTURE.md`：系统组成、进程和请求流程。
- `CODE-MAP.md`：英文符号索引，用于按函数名定位代码。
- `FEATURES.md`：功能到代码、接口和测试的索引。
- `API.md`：HTTP 接口与仓库动作参数。
- `DATA-MODEL.md`：数据版本、迁移和浏览器本地存储。
- `UI-MAP.md`：页面区域、DOM、前端状态和响应式规则。
- `DEVELOPMENT.md`：本地运行、编码约定和实现检查清单。
- `TESTING.md`：自动化测试和手工验证矩阵。
- `SECURITY.md`：信任边界、路径、符号链接和 Git 所有权。
- `TROUBLESHOOTING.md`：常见现象和排查方法。
- `DECISIONS.md`：关键设计决策和后果。
- `ROADMAP.md`：已知不足和后续方向。
- `ITERATION-LOG.md`：按日期记录已完成的迭代。
- `templates/FEATURE-RECORD.md`：新功能记录模板。

## 代码地图

```text
.
├─ AGENTS.md                  # 根级 AI 工作约定
├─ server.js                  # HTTP 服务、API、Git 动作、文件安全
├─ src/
│  ├─ git-utils.js            # 状态、日志、分支解析和路径工具
│  └─ repository-store.js     # 工作区/仓库 JSON 存储与迁移
├─ public/
│  ├─ index.html              # 静态页面与 SVG 图标
│  ├─ styles.css              # 工作台布局、响应式和视觉样式
│  └─ app.js                  # UI 状态、渲染、请求、弹窗和交互
├─ tests/
│  ├─ api.test.js             # 真实临时仓库的端到端 API 测试
│  ├─ git-utils.test.js       # 解析和路径工具测试
│  └─ project-files.test.js   # 启动脚本和项目文件约束
├─ docs/                      # 当前知识库
├─ data/                      # 运行时数据，已忽略
└─ start.cmd                  # Windows 启动脚本
```

## 快速查找命令

```powershell
rg -n "url\.pathname|runRepositoryAction" server.js
rg -n "function render|function request|function perform" public/app.js
rg -n "^##|^###" docs
node --test
```

## 事实来源

- Git 行为以本机 Git 可执行文件为准，不使用第三方 Git 库。
- 工作区和仓库状态以 `src/repository-store.js` 为事实来源。
- API 动作白名单位于 `server.js` 的 `runRepositoryAction()`。
- 前端状态位于 `public/app.js` 顶部的 `state` 对象。
- 文档和代码不一致时，先核对代码，再修正行为并同步文档。
