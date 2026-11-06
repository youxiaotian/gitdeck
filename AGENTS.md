# GitDeck AI 工作约定

本仓库是面向 Windows 的本地多仓库 Git 工作台。后续 AI 或人类开发者进入项目时，应先把本文件作为工作规则的入口。

## 路径基准（所有文档共用）

本文及 `docs/` 下所有文档中的 `<repo>` 一律指**当前 Git 仓库根目录**，即包含本 `AGENTS.md` 的目录。文档里的 `./`、`data/`、`.workbuddy/scratch/`、`tools/`、`tests/` 全部相对 `<repo>` 解析。

- **开发、测试、验证、清理一律在 `<repo>` 内完成**，禁止引用或操作任何机器专属的固定目录（盘符路径、用户目录、父目录、系统临时目录）。
- 临时产物唯一目录是 `<repo>/.workbuddy/scratch/`，见下方「AI 临时产物沙盒」。
- 示例需要一个具体路径时用 `<repo>/...` 占位；真实运行时把 `<repo>` 展开为本机绝对路径即可。
- GitDeck 产品本身可以管理 `<repo>` 之外的用户仓库；这条约定只约束**开发者与 AI 的工作目录**，不改变产品功能。
- 仓库内文件参数仍受 `docs/SECURITY.md` 的路径逃逸校验约束，与本文档路径基准不是同一层。

## 修改前必须阅读

按顺序阅读：

1. `docs/MAP.md`：需求 → 文件 → 符号的单一速查表。**定位代码首选这份。**
2. `docs/README.md`：文档地图和项目快照。
3. `docs/ARCHITECTURE.md`：运行结构和请求流程。
4. `docs/DATA-MODEL.md`：持久化数据和迁移规则（当前版本 3）。
5. `docs/API.md`：HTTP 接口和 Git 动作参数。
6. `docs/UI-MAP.md`：页面区域、前端状态和交互。
7. `docs/TESTING.md`：本次改动需要执行的验证。

`docs/FEATURES.md` 和 `docs/CODE-MAP.md` 是行为级补充说明，深度改动时再查。很小的视觉改动至少读 `docs/MAP.md` 和 `docs/UI-MAP.md`。

## 项目目标

- GitDeck 是用户本机 Git 的浏览器工作台。
- 只能依赖 Node.js、Git 和浏览器原生能力；没有用户明确要求时，不增加 npm 运行依赖。
- 项目优先支持 Windows，不要破坏 Windows 路径、CRLF、目录所有权、资源管理器、终端和盘符浏览。
- GitDeck 只管理仓库列表元数据。除非用户明确要求删除目录，否则不能删除 Git 工作目录。

## 不可破坏的工程规则

### 进程和 API 安全

- 服务只能监听 `127.0.0.1`。
- 所有 API 请求必须校验进程级 `X-GitDeck-Token`。
- 前端不能传入 shell 命令字符串。使用 `spawn()` 参数数组和服务端动作白名单。
- 仓库内路径必须经过 `validateRepositoryPath()`（`src/paths.js`）校验。
- 禁止通过符号链接读取或修改仓库外部文件。
- 文本编辑器保存必须保留 SHA-256 内容哈希冲突检测。

### 服务进程与前端资源

- `public/` 下静态资源带 `no-store`，前端改动按 F5 即生效。
- `src/` 下的后端代码**只在 Node 进程启动时加载**。服务默认常驻，关掉窗口或刷新页面都不会重启进程；任何后端 / 启动行为改动，必须重新运行 `.\start.cmd`。
- `start.cmd` 会先调用 `tools/restart-server.ps1`，精确停掉占用 GitDeck 端口且命令行包含 `server.js` 的旧进程，再启动新进程。不要删掉这一步，否则新接口会一直返回 404，界面会连着昨天的旧代码。
- 前端调用后端新增接口失败时，必须显示明确错误与重启指引，**不能把请求失败渲染成「没有数据」**（曾因此把 `.sln` 404 误报为「目录下没有 .sln 文件」）。

### Git 行为

- 每次 Git 调用都要通过精确路径设置 `safe.directory`。
- 普通仓库操作禁止使用 `safe.directory=*`。
- 不需要修改索引的读取、状态和还原操作应保持 `GIT_OPTIONAL_LOCKS=0`。
- `pull` 默认只能快进；除非用户明确要求合并流程。
- 破坏性操作和远程分支删除必须经过明确确认。
- 勾选文件提交必须使用 `git commit --only` 语义，不能带上其他已暂存文件。
- 删除远程分支必须从本地跟踪关系推导，并且只在对应本地分支删除成功后执行。

### 用户数据

- `data/repositories.json` 是用户数据。测试和开发不得重置它。
- 测试必须在工作区内创建临时仓库，并在清理阶段删除。
- 从工作区移除仓库只删除 GitDeck 元数据，不删除磁盘文件。
- 不得覆盖或回滚工作区中与本任务无关的现有改动。

## AI 临时产物沙盒（减少权限弹窗的硬约定）

**唯一允许存放 AI 工作临时产物的目录：`<repo>/.workbuddy/scratch/`。** 它已被 `.gitignore` 忽略（`.workbuddy/`），不入库、不影响 `git status`。

必须放进去的东西：测试用 Git 仓库与裸远端、CDP / 无头 Chrome 探针脚本与 `--user-data-dir`、截图、临时备份、探针日志、一次性生成的验证脚本。

- **禁止**在项目根目录散落 `.tmp-*`、`.ui-*`、`.chrome-*`、`.commit-*` 等临时目录。
- **禁止**在 `<repo>` 之外创建测试仓库或临时目录（包括父目录、用户目录、系统临时目录）。
- 用 `node tools/clean-scratch.js --new <prefix>` 在 `<repo>/.workbuddy/scratch/` 内创建唯一临时目录，拿到的路径始终在 `<repo>` 内。
- 清理统一用 `node tools/clean-scratch.js`（先加 `--dry-run` 预览）。该脚本的 `ROOT` 由 `__dirname` 推导，只删除沙盒第一层条目，不跟随符号链接，不递归到沙盒之外。
- 删除工作目录内**任意**指定文件/目录时用 `--path <repo 相对路径>`（可重复），例如 `node tools/clean-scratch.js --path .workbuddy/scratch/probe.txt`。绝对路径、`..` 越界、符号链接、以及 `.git`、`node_modules`、`package.json`、`data/repositories.json`、`data/server.log`、`.workbuddy/memory/` 等受保护目标一律拒绝。
- **禁止** `rm -rf`、通配符批量删除、以及 PowerShell `Add-Type` 调回收站 API 来清理临时产物。工作目录之外的删除不走本工具，需走正常审批。
- `data/`、`data/repositories.json`、`data/server.log`、`.workbuddy/memory/` 是用户数据或运行数据，永远不在清理范围内。

**权限边界（已实证，2026-11-06）**：反复弹出的确认并不是「路径越界」或「命令规则为空」，而是 `file-safety.bulk-delete.needs-approval` —— 按**一次请求累计删除文件数**触发的批量删除保护（默认阈值 50），与路径无关。`node --test` 删除临时 Git 仓库时一次删 100+ 个文件即超过阈值，且该待确认状态会挂到同一请求后续命令上，导致连 `node --test | grep` 也被拦。

落地配置：

| 层 | 位置 | 内容 |
| --- | --- | --- |
| 路径边界 | 用户级 `settings.json` 的 `sandbox.orderedRules.file` | 工作区 `.` 的 read/write/delete 原本就是 `allow`；工作区外没有 allow 规则，仍照常审批 |
| 数量阈值 | 用户级 `settings.json` 的 `sandbox.safeDeleteBulkThreshold` | 由 50 调为 500，覆盖正常测试清理；超过 500 项的批量删除仍会审批 |
| 命令白名单 | `<repo>/.codebuddy/settings.json` 的 `permissions.allow` | 只放行 `node tools/clean-scratch.js` 与 `npm run clean:scratch`，仅在本项目生效 |

因此「`<repo>` 内删改免审批、`<repo>` 外照常审批」由文件规则保证，白名单只是给唯一受控删除入口开口子；脚本自身的 `ROOT` 硬边界保证它删不到工作目录之外。清理命令要**单独执行**，不要与 `&&` / `;` / `|` 拼成复合命令，否则白名单要求所有子命令都命中，会重新触发审批。

## 模块结构

`server.js` 是薄入口，业务逻辑拆到 `src/` 下：

| 模块 | 职责 |
| --- | --- |
| `src/config.js` | 进程级常量与单例（端口、令牌、STORE、路径根） |
| `src/logger.js` | 轻量文件日志，把 console 输出同步写入 `data/server.log` |
| `src/http.js` | 响应/请求/鉴权工具 |
| `src/static.js` | 静态文件服务，注入会话令牌 |
| `src/routes.js` | `/api/*` 路由分发 |
| `src/workspace.js` | 工作区与仓库元数据 CRUD、排序、Git 顶层解析 |
| `src/git-summary.js` | 状态摘要、详情、提交历史、远端解析 |
| `src/git-actions.js` | 动作白名单分发（暂存/提交/还原/分支/Stash/Diff/文件） |
| `src/paths.js` | 仓库内路径校验、可编辑文件解析、哈希、二进制判定 |
| `src/directories.js` | 目录扫描与内置目录浏览器 |
| `src/process.js` | 子进程封装，`runGit` 注入 `safe.directory` |
| `src/locks.js` | 单仓库动作串行化锁 |
| `src/shell.js` | 资源管理器、终端、TortoiseGit |
| `src/desktop.js` | 桌面壳 A：浏览器探测、--app 窗口、单实例、心跳看门狗 |
| `src/repository-store.js` | JSON 存储与版本迁移 |
| `src/git-utils.js` | porcelain v2 / log / branch / stash 解析 |

前端结构见 `docs/UI-MAP.md`；需求到符号的映射见 `docs/MAP.md`。

## 修改流程

1. 先在 `docs/MAP.md` 找到需求对应的文件和符号，再阅读相关代码。
2. 修改前用 `rg` 确认函数名和所有调用点。
3. 做最小且完整的改动，不顺手重构无关代码。
4. 行为变化必须新增或更新自动化测试。
5. 运行 `node --check` 检查改动的每个文件，再运行 `node --test`。
6. UI 变化应使用真实浏览器验证；用户要求视觉改动时保留截图。
7. 同步文档：
   - 需求→符号映射：`docs/MAP.md`
   - 功能行为：`docs/FEATURES.md`
   - API 变化：`docs/API.md`
   - 数据结构变化：`docs/DATA-MODEL.md`
   - 架构取舍：`docs/DECISIONS.md`
   - 完成的迭代：追加到 `docs/ITERATION-LOG.md`
8. 修改文档链接后运行 `node tools/check-docs.js`。

## 基础验证命令

```powershell
node --check server.js
node --check src/*.js
node --check public/app.js
node --test
node tools/check-docs.js
curl.exe -s -o NUL -w "%{http_code}" http://127.0.0.1:4321/
```

所有验证都在 `<repo>` 内完成，不需要写入 `<repo>` 之外的业务仓库，因此不会触发越界拦截。遇到写入失败时先检查是否有其他 Git 进程占用或文件被锁定，不要通过放宽仓库安全设置来绕过限制。

## 文档规则

- 优先引用稳定函数名和路径，不依赖容易过期的行号。
- 本文件保持操作性强；详细说明放在 `docs/`。
- 暂不支持的行为要明确记录到 `docs/ROADMAP.md` 或 `docs/TROUBLESHOOTING.md`，不能暗示已经支持。
- 用户可感知行为变化必须在同一次改动中更新功能地图和迭代日志。
