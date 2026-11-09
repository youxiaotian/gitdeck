# 架构说明

## 系统组成

GitDeck 是一个单进程 Node.js 应用，同时提供静态页面和本地 JSON API。浏览器不能提交任意 shell 命令，所有 Git 操作都由服务端使用 `spawn()` 和参数数组构造。

```text
浏览器界面
  ↓ fetch + X-GitDeck-Token
Node HTTP 服务（server.js）
  ├─ 静态文件：public/
  ├─ 工作区/仓库元数据：data/repositories.json
  ├─ Git 子进程：git -C <仓库> ...
  └─ 已注册仓库内的文件读写
        ↓
本机 Git + Windows 文件系统
```

## 运行组件

### `server.js`

- 监听 `127.0.0.1`。
- 每次启动生成新的会话令牌。
- 提供 `public/index.html`、`public/app.js` 和 `public/styles.css`。
- 实现工作区、仓库、目录扫描、文件、Diff 和 Git 动作 API。
- 通过 `acquireRepositoryLock()` 将同一仓库的修改动作串行化。
- 在 Windows 上打开资源管理器或终端。

### `src/repository-store.js`

- 读写 `data/repositories.json`。
- 管理数据版本 2，并把旧版扁平仓库列表迁移到默认工作区。
- 使用进程内 Promise 队列串行化写入。
- 生成稳定的仓库 ID 和随机工作区 ID。

### `src/git-utils.js`

- 解析 `git status --porcelain=v2 -z`。
- 解析提交日志、本地分支和 Stash。
- 提供安全路径包含检查。

### `public/app.js`

- 管理全部浏览器状态。
- 获取 bootstrap、仓库状态和详情。
- 渲染工作区下拉、仓库列表、目录树、Diff/编辑器、分支、Stash、弹窗和提示。
- 将 UI 操作转换成服务端动作。
- 使用 `localStorage` 保存当前工作区和三个面板宽度。

### `public/index.html` 和 `public/styles.css`

- 提供静态应用骨架。
- 定义桌面工作台、响应式布局和视觉样式。
- 图标以内置 SVG symbol 保存，不使用运行时图标 CDN。

## 请求流程

### 初始加载

1. 浏览器加载 HTML，并从 meta 标签获取会话令牌。
2. `init()` 调用 `GET /api/bootstrap`。
3. 客户端从本地存储或仓库归属中确定当前工作区。
4. 请求当前工作区各仓库状态，再加载第一个仓库的详情。
5. 之后不再自动刷新；用户点顶栏「抓取全部」（抓取所有仓库后刷新状态）或执行 Git 动作后才重新读取状态。服务不注册任何碰用户仓库的后台定时任务。

### 仓库动作

1. UI 调用 `POST /api/repositories/:id/action`。
2. 服务端校验令牌、来源、仓库存在性和参数。
3. `runRepositoryAction()` 获取该仓库的动作锁。
4. 执行白名单中的 Git 或文件操作。
5. 服务端重新读取一次完整仓库详情。
6. UI 替换详情、重新渲染并显示结果或警告。

### 文件保存

1. UI 通过 `GET .../file` 读取文件。
2. 服务端拒绝二进制或超大文件，并返回 SHA-256 哈希。
3. 用户在内联编辑器中修改。
4. UI 提交内容、原哈希和原始换行格式。
5. 服务端校验哈希和符号链接边界后写入。
6. 保留 LF 或 CRLF 风格。

### 选中文件提交

1. UI 将选中路径和提交说明发送给 `commitSelected`。
2. 服务端只暂存这些路径。
3. 使用 `git commit --only` 提交选中内容。
4. 其他已暂存但不属于选中集合的内容继续保持暂存。
5. 服务端返回刷新后的详情，UI 清空选择。

## 状态边界

- 服务端持久状态：工作区和仓库归属。
- UI 持久状态：当前工作区 ID 和三个分隔条宽度。
- UI 临时状态：当前仓库、选中文件、Diff、编辑器内容、分支选择、搜索词、弹窗和忙碌标记。
- Git 状态：分支、索引、提交、远端、Stash 和文件内容。

## 布局结构

桌面布局包含五个逻辑区域：

```text
顶部栏
├─ 仓库侧栏
├─ 分隔条
├─ 主工作区
│  ├─ 变更目录树
│  ├─ 分隔条
│  └─ Diff/编辑器
├─ 分隔条
└─ 分支/Stash/远端面板
```

三个竖向分隔条分别修改以下 CSS 变量：

- `--sidebar-width`
- `--file-tree-width`
- `--context-width`

窄屏时上下文面板移动到主区域下方，或整个工作台改为单列，分隔条隐藏。

## 错误模型

- API 错误使用 `{ "error": "message" }` 和 HTTP 状态码。
- UI 将错误显示为 toast。
- Git 命令失败会直接反馈给用户，不静默重试。
- 批量分支操作部分失败时返回 `output` 和 `warnings`。

## 扩展位置

- 新 Git 用例：在 `runRepositoryAction()` 的 `switch` 中增加分支。
- 非单仓库动作：在 `handleApi()` 中增加专用路由。
- 新 UI：在 `public/app.js` 中增加 DOM、渲染函数、事件和状态。
- Git 操作或 API 契约变化：必须扩展 `tests/api.test.js`。
