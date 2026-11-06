# 本地 HTTP API

## 路径基准

本文所有路径相对当前 Git 仓库根目录 `<repo>`，完整约定见根 `AGENTS.md`。JSON 示例中的 `<repo>/...` 是占位写法，真实请求时展开为本机绝对路径；**开发、测试、目录浏览验证一律在 `<repo>` 内完成**，临时目录固定为 `<repo>/.workbuddy/scratch/`。

## 通用约定

- 基础地址：`http://127.0.0.1:<端口>`。
- 默认端口：`4321`。
- 所有 `/api/*` 请求必须携带 `X-GitDeck-Token`。
- 修改数据的请求需要 `Content-Type: application/json`。
- 错误返回 HTTP 状态码和 `{ "error": "提示信息" }`。
- 服务端不提供任意 shell 或任意 Git 参数接口。

令牌通过以下 meta 标签注入页面：

```html
<meta name="gitdeck-token" content="...">
```

## 初始化

### `GET /api/ping`

公开接口，不需要 `X-GitDeck-Token`。用于桌面模式下的单实例探测。

```json
{ "ok": true, "app": "gitdeck" }
```

### `GET /api/bootstrap`

返回工作区、仓库、平台和版本。

```json
{
  "workspaces": [
    {
      "id": "workspace-default",
      "name": "默认工作区",
      "createdAt": "2026-10-27T02:26:30.454Z"
    }
  ],
  "repositories": [
    {
      "id": "368a329adeae",
      "name": "AgisoCodes",
      "path": "<repo>/.workbuddy/scratch/demo-repository",
      "workspaceIds": ["workspace-default", "ws_1234567890ab"],
      "addedAt": "2026-10-26T07:51:09.563Z",
      "orders": { "workspace-default": 0, "ws_1234567890ab": 2 }
    }
  ],
  "platform": "win32",
  "version": "1.0.0"
}
```

## 桌面壳

### `POST /api/heartbeat`

前端每 5 秒上报一次心跳，并在窗口恢复可见、获得焦点、网络恢复时立即补发。任何通过令牌校验的 API 请求也会刷新心跳。

桌面模式**默认服务常驻**，心跳中断不会导致进程退出（浏览器后台冻结、系统睡眠都可能让心跳长时间停止）。只有显式设置 `GITDECK_HEARTBEAT=1` 才启用自动退出：连续 120 秒无心跳后进入 15 秒确认窗口，窗口内仍无心跳才退出；系统睡眠/进程挂起造成的时钟跳变会重置计时，不参与超时判定。可用 `GITDECK_HEARTBEAT_TIMEOUT_MS` / `_GRACE_MS` 调整（毫秒）。

### `GET /api/window`

返回上次记住的窗口尺寸 `{ width, height }`。

### `POST /api/window`

```json
{ "width": 1280, "height": 720 }
```

持久化到 `data/window.json`，下次以 `--app` 模式启动时读取。宽高被限制在 `640..4096` / `480..2160`。

## 工作区接口

### `POST /api/workspaces`

创建名称唯一的工作区。

```json
{ "name": "多平台" }
```

返回：`201 { "workspace": { ... } }`。

### `PATCH /api/workspaces/:id`

重命名工作区。

```json
{ "name": "后端服务" }
```

### `DELETE /api/workspaces/:id`

删除工作区，并摘除所有仓库对该工作区的归属；失去全部归属的仓库移动到第一个剩余工作区。最后一个工作区不能删除。

```json
{
  "removed": true,
  "workspaceId": "workspace-default",
  "movedRepositoryCount": 4,
  "updated": [
    { "id": "368a329adeae", "workspaceIds": ["workspace-default"], "orders": { "workspace-default": 0 } }
  ]
}
```

`workspaceId` 是失去全部归属时迁入的兜底工作区；`movedRepositoryCount` 是迁入兜底工作区的仓库数；`updated` 是所有被摘除归属的仓库的最新 `workspaceIds` 与 `orders`，前端据此同步，避免本地重算漏掉兜底排序值。

## 仓库接口

### `POST /api/repositories`

添加仓库；若路径已存在，则把该仓库加入指定工作区（多归属，保留原有归属）。

```json
{
  "path": "<repo>/.workbuddy/scratch/demo-repository",
  "workspaceId": "ws_1234567890ab"
}
```

返回：`201 { "repository": { ... } }`。

### `POST /api/repositories/remove`

从一个工作区批量摘除仓库归属；失去全部归属的条目从 GitDeck 列表删除，不操作物理目录。

```json
{
  "workspaceId": "ws_1234567890ab",
  "ids": ["368a329adeae", "455499f4ab0c"]
}
```

返回：

```json
{
  "removedIds": ["368a329adeae"],
  "updated": [
    { "id": "455499f4ab0c", "workspaceIds": ["workspace-default"], "orders": { "workspace-default": 0 } }
  ]
}
```

`removedIds` 是失去全部归属、已从列表删除的仓库；`updated` 是仍属于其他工作区、仅摘除了归属的仓库。

### `POST /api/repositories/reorder`

保存一个工作区的仓库顺序。

```json
{
  "workspaceId": "ws_1234567890ab",
  "ids": ["order-first", "order-second"]
}
```

`ids` 必须完整覆盖该工作区当前所有仓库且不能重复。

### `POST /api/repositories/:id/workspace`

把单个仓库加入指定工作区（多归属，保留原有归属，幂等）。

```json
{ "workspaceId": "workspace-default" }
```

### `DELETE /api/repositories/:id`

从 GitDeck 元数据中移除单个仓库，不删除磁盘目录。

## 扫描和目录浏览器

### `POST /api/discover`

扫描目录中的 Git 仓库。

```json
{ "root": "<repo>/.workbuddy/scratch", "depth": 3 }
```

深度会限制在 `1..6`。

### `POST /api/directories/list`

为内置目录选择器返回目录信息。

```json
{ "path": "<repo>/.workbuddy/scratch" }
```

响应包含 `currentPath`、`parentPath`、`directories`、`roots`、`quickPaths` 和 `isRepository`。

## 仓库状态和详情

### `GET /api/repositories/:id/status`

返回左侧仓库列表使用的轻量摘要。

### `GET /api/repositories/:id/detail`

返回仓库元数据、状态、最近 50 条提交、本地分支、Stash、远端、远程分支匹配和目标信息。

### `GET /api/repositories/:id/history?scope=all&limit=100`

返回带 Git 图线的提交历史。

- `scope=all`：包含所有本地和远程跟踪分支，对应 `git log --all`。
- `scope=current`：只包含当前分支。
- `limit` 限制在 `20..200`。

```json
{
  "scope": "all",
  "branch": "main",
  "maxGraphWidth": 22,
  "rows": [
    {
      "type": "commit",
      "graph": "* ",
      "shortHash": "f410fb8597",
      "author": "youxiaojun",
      "date": "2026-11-02T17:23:10+08:00",
      "decorations": "HEAD -> main, origin/main",
      "subject": "提交主题"
    },
    {
      "type": "connector",
      "graph": "|/"
    }
  ]
}
```

## Diff

### `GET /api/repositories/:id/diff?path=src/a.js&staged=0`

返回纯文本补丁。

- `staged=1`：索引与 HEAD 比较。
- `staged=0`：工作区与索引比较。
- 未跟踪文本文件会生成模拟的新文件补丁。

```json
{ "diff": "diff --git ..." }
```

## 文件读取和保存

### `GET /api/repositories/:id/file?path=src/a.js`

返回可编辑的 UTF-8 内容。

```json
{
  "path": "src/a.js",
  "content": "统一换行为 LF 的内容",
  "lineEnding": "\n",
  "hash": "sha256...",
  "size": 1234,
  "editable": true
}
```

超过 512 KB 的文件和二进制文件会被拒绝。

### `POST /api/repositories/:id/file`

带冲突检测地保存文本。

```json
{
  "path": "src/a.js",
  "content": "修改后的内容",
  "expectedHash": "sha256...",
  "lineEnding": "\r\n"
}
```

解析后指向仓库外部的符号链接会被拒绝；`expectedHash` 不匹配时返回 HTTP 409。

## 仓库动作

### `POST /api/repositories/:id/action`

请求必须包含 `action`。成功后返回完整仓库详情、`output`，必要时返回 `warnings`。

| 动作 | 参数 | 行为 |
| --- | --- | --- |
| `fetch` | `{}` | `git fetch --all --prune` |
| `pull` | `{}` | `git pull --ff-only` |
| `push` | `{}` | `git push` |
| `stageAll` | `{}` | 暂存全部改动 |
| `stageFile` | `{ "path" }` | 暂存单个文件 |
| `stageFiles` | `{ "paths": [] }` | 一次暂存多个选中文件 |
| `unstageAll` | `{}` | 取消全部暂存 |
| `unstageFile` | `{ "path" }` | 取消单文件暂存 |
| `discardFile` | `{ "path" }` | 还原已跟踪文件或删除未跟踪文件 |
| `discardFiles` | `{ "paths": [] }` | 批量还原并只刷新一次状态 |
| `commit` | `{ "message", "amend" }` | 提交全部已暂存内容 |
| `commitSelected` | `{ "paths": [], "message", "amend" }` | 只暂存并提交选中文件 |
| `checkoutBranch` | `{ "name" }` | 切换分支 |
| `createBranch` | `{ "name" }` | 创建并切换分支 |
| `deleteBranch` | `{ "name", "deleteRemote", "forceDelete" }` | 删除本地分支，可选强制 `-D` 和删远程 |
| `deleteBranches` | `{ "branches": [{ "name", "deleteRemote", "forceDelete" }] }` | 批量删除本地分支并分组删除远程 |
| `mergeBranch` | `{ "name" }` | 合并到当前分支 |
| `stashSave` | `{ "message" }` | 保存包含未跟踪文件的 Stash |
| `stashPop` | `{ "ref": "stash@{0}" }` | 恢复 Stash |
| `openExplorer` | `{}` | 打开仓库目录 |
| `openTerminal` | `{}` | 在仓库目录打开终端 |
| `openTortoiseGit` | `{}` | 用当前仓库打开 TortoiseGit 日志界面 |
| `openVisualStudio` | `{ "path" }` | 用 Visual Studio 打开指定 `.sln` 解决方案（`path` 必须相对仓库且经过 `validateRepositoryPath` 校验） |

响应结构：

```json
{
  "repository": {},
  "summary": {},
  "commits": [],
  "branches": [],
  "stashes": [],
  "remotes": [],
  "output": "可读的操作结果",
  "warnings": []
}
```

## 远程分支删除安全规则

- 本地分支使用 `git branch -d` 安全删除。
- `forceDelete=true` 时使用 `git branch -D`，会丢失未合并提交。
- 只有对应本地分支成功删除后，才处理远程分支。
- 远程目标来自本地分支上游或匹配的远程跟踪引用。
- 同一远端的远程分支合并为一次 push。
- 部分失败通过 `warnings` 返回。

## 常见状态码

| 状态码 | 含义 |
| --- | --- |
| 400 | 参数无效或仓库动作不支持 |
| 403 | 会话令牌无效或来源不可信 |
| 404 | 工作区、仓库、文件或接口不存在 |
| 409 | 工作区重名或文件哈希冲突 |
| 410 | 仓库目录移动或不可访问 |
| 413 | 文件过大 |
| 415 | 二进制文件不能进入编辑器 |
| 422 | Git 命令执行失败 |
