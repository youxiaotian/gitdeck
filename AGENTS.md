# GitDeck AI 工作约定

本仓库是面向 Windows 的本地多仓库 Git 工作台。后续 AI 或人类开发者进入项目时，应先把本文件作为工作规则的入口。

## 修改前必须阅读

按顺序阅读：

1. `docs/README.md`：文档地图和项目快照。
2. `docs/ARCHITECTURE.md`：运行结构和请求流程。
3. `docs/FEATURES.md`：功能到代码的索引。
4. `docs/DATA-MODEL.md`：持久化数据和迁移规则。
5. `docs/API.md`：HTTP 接口和 Git 动作参数。
6. `docs/UI-MAP.md`：页面区域、前端状态和交互。
7. `docs/TESTING.md`：本次改动需要执行的验证。

如果只是很小的视觉改动，前四份可以先快速浏览，但 `docs/UI-MAP.md` 和 `docs/TESTING.md` 仍然必须阅读。

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
- 仓库内路径必须经过 `validateRepositoryPath()` 校验。
- 禁止通过符号链接读取或修改仓库外部文件。
- 文本编辑器保存必须保留 SHA-256 内容哈希冲突检测。

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

## 功能定位

| 功能区域 | 主要文件 | 功能说明 |
| --- | --- | --- |
| 工作区和存储 | `src/repository-store.js`、`server.js`、`public/app.js` | `docs/FEATURES.md` |
| 仓库导入和扫描 | `server.js`、`public/app.js` | `docs/FEATURES.md` |
| 工作区仓库维护 | `server.js`、`public/app.js` | `docs/FEATURES.md` |
| 状态和 Diff | `server.js`、`src/git-utils.js`、`public/app.js` | `docs/FEATURES.md` |
| 内联编辑器 | `server.js`、`public/app.js` | `docs/FEATURES.md` |
| 批量暂存和选中提交 | `server.js`、`public/app.js` | `docs/FEATURES.md` |
| 分支管理 | `server.js`、`src/git-utils.js`、`public/app.js` | `docs/FEATURES.md` |
| 可拖拽分栏 | `public/index.html`、`public/styles.css`、`public/app.js` | `docs/FEATURES.md` |
| API 契约 | `server.js` | `docs/API.md` |
| 测试 | `tests/` | `docs/TESTING.md` |

## 修改流程

1. 先在 `docs/FEATURES.md` 找到功能，再阅读相关代码。
2. 修改前用 `rg` 确认函数名和所有调用点。
3. 做最小且完整的改动，不顺手重构无关代码。
4. 行为变化必须新增或更新自动化测试。
5. 运行 `node --check server.js`、`node --check public/app.js` 和 `node --test`。
6. UI 变化应使用真实浏览器验证；用户要求视觉改动时保留截图。
7. 同步文档：
   - 功能变化：`docs/FEATURES.md`
   - API 变化：`docs/API.md`
   - 数据结构变化：`docs/DATA-MODEL.md`
   - 架构取舍：`docs/DECISIONS.md`
   - 完成的迭代：追加到 `docs/ITERATION-LOG.md`
8. 修改文档链接后运行 `node tools/check-docs.js`。

## 基础验证命令

```powershell
node --check server.js
node --check public/app.js
node --test
node tools/check-docs.js
curl.exe -s -o NUL -w "%{http_code}" http://127.0.0.1:4321/
```

如果改动需要写入当前工作区之外的业务仓库，Codex 沙箱可能拦截写入，即使 Windows 权限允许。应使用正常本地权限启动服务完成验证，不要通过放宽仓库安全设置来绕过沙箱限制。

## 文档规则

- 优先引用稳定函数名和路径，不依赖容易过期的行号。
- 本文件保持操作性强；详细说明放在 `docs/`。
- 暂不支持的行为要明确记录到 `docs/ROADMAP.md` 或 `docs/TROUBLESHOOTING.md`，不能暗示已经支持。
- 用户可感知行为变化必须在同一次改动中更新功能地图和迭代日志。
