# 速查表

本文件是 GitDeck 的单一"需求 → 文件 → 符号"索引。改任何功能前先在这里定位，再用 `rg -n "<symbol>"` 找调用点。详细行为说明见 `FEATURES.md` / `UI-MAP.md`，符号级英文索引见 `CODE-MAP.md`。

## 服务端（server.js + src/）

| 需求 | 文件 | 关键符号 |
| --- | --- | --- |
| 启动、监听、拉起浏览器 | `server.js` | `main()` |
| 会话令牌与来源校验 | `src/http.js` | `isTrustedRequest()` |
| JSON 响应/请求/错误 | `src/http.js` | `sendJson()`、`sendError()`、`httpError()`、`readJson()` |
| 静态文件与令牌注入 | `src/static.js` | `serveStatic()` |
| 应用图标（favicon） | `src/static.js` | `serveStatic()` 中 `fileMap` 的 `/favicon.png`、`/favicon.ico` |
| 进程级常量与单例 | `src/config.js` | `SESSION_TOKEN`、`STORE`、`HOST`、`DEFAULT_PORT` |
| API 路由分发 | `src/routes.js` | `handleApi()` |
| 工作区 CRUD | `src/workspace.js` | `createWorkspace()`、`renameWorkspace()`、`deleteWorkspace()` |
| 仓库元数据增删/移动 | `src/workspace.js` | `addRepository()`、`removeRepository()`、`moveRepositoryToWorkspace()`、`removeRepositoriesFromWorkspace()` |
| 仓库排序 | `src/workspace.js` | `reorderRepositories()`、`nextOrderInWorkspace()` |
| 仓库 id 解析 | `src/workspace.js` | `getRepository()` |
| 状态摘要 | `src/git-summary.js` | `getStatusSummary()` |
| 仓库详情（50 提交+分支+stash+远端） | `src/git-summary.js` | `getRepositoryDetail()` |
| 提交历史（结构化行，含父提交） | `src/git-summary.js` | `getCommitHistory()` |
| 远端解析 | `src/git-summary.js` | `getRemotes()`、`resolveRemoteTarget()` |
| 仓库可用性断言 | `src/git-summary.js` | `assertRepositoryAvailable()` |
| 动作白名单分发 | `src/git-actions.js` | `runRepositoryAction()` |
| 抓取 / 拉取（仅用户主动触发） | `src/git-actions.js` | `runRepositoryAction()` 的 `fetch` / `pull` 分支 |
| 暂存/取消暂存 | `src/git-actions.js` | `stagePaths()`、`unstageAll()`、`unstagePath()` |
| 提交（全部已暂存） | `src/git-actions.js` | `commit()` |
| 选中文件提交 | `src/git-actions.js` | `commitSelected()`、`normalizePaths()` |
| 还原/删除文件 | `src/git-actions.js` | `discardPath()`、`discardPaths()` |
| 分支切换/创建/合并 | `src/git-actions.js` | `checkoutBranch()`、`createBranch()`、`mergeBranch()`、`validateBranchName()` |
| 历史徽标右键：引用级动作 | `src/git-actions.js` | `checkoutRef()`、`checkoutCommit()`、`createBranchAt()`、`createTagAt()`、`pushRef()`、`deleteRef()`、`validateRefArgument()`、`validateRevision()`、`validateCommitHash()`、`refExists()`、`splitRemoteRef()` |
| 分支删除（本地+远程） | `src/git-actions.js` | `deleteBranches()` |
| 提交差异（只读） | `src/git-actions.js` | `getCommitChanges()`（`patch` / `worktree` / `previous`，根提交回退） |
| Stash | `src/git-actions.js` | `stashPop()`（`stashSave` 在 switch 内联） |
| Diff | `src/git-actions.js` | `getDiff()` |
| 文件读/保存 | `src/git-actions.js` | `getFileContent()`、`saveFileContent()` |
| 仓库内路径校验 | `src/paths.js` | `validateRepositoryPath()` |
| 可编辑文件解析（拒符号链接） | `src/paths.js` | `resolveEditableFile()` |
| 内容哈希/二进制判定 | `src/paths.js` | `hashContent()`、`isProbablyBinary()` |
| 未跟踪文件补丁 | `src/paths.js` | `createUntrackedPatch()` |
| 目录扫描 | `src/directories.js` | `discoverRepositories()` |
| 目录浏览器 | `src/directories.js` | `listDirectories()`、`findExistingDirectory()`、`listSystemRoots()`、`listQuickPaths()` |
| 子进程封装 / 锁冲突重试 | `src/process.js` | `runProcess()`、`runGit()`（失败后 `recoverIndexLock()` + 只重试一次）、`gitAction()`、`toGitPath()`、`consumeRecoveryNotes()` |
| 陈旧索引锁处理 | `src/index-lock.js` | `isIndexLockError()`、`resolveGitDir()`、`probeIndexLock()`（Windows `FileShare.None` 独占探测 + 占用进程清单）、`recoverIndexLock()`、`formatIndexLockHeldError()` |
| 单仓库动作锁 | `src/locks.js` | `acquireRepositoryLock()` |
| 资源管理器/终端/TortoiseGit | `src/shell.js` | `openExplorer()`、`openTerminal()`、`openTortoiseGit()` |
| 桌面壳：app 窗口与单实例 | `src/desktop.js` | `launchAppWindow()`、`probeInstance()`、`createHeartbeatWatchdog()`、`startHeartbeatWatchdog()`、`stopHeartbeatWatchdog()`、`touchHeartbeat()`、`loadWindowSize()`、`saveWindowSize()`、`findBrowser()` |
| 运行日志与进程崩溃兜底 | `src/logger.js`、`server.js` | `installFileLogging()`、`logError()`、`process.on("uncaughtException")`、`process.on("unhandledRejection")` |
| API 错误日志 / Log 按钮 | `src/action-log.js`、`src/routes.js` | `recordApiError()`（server.js 统一 catch 调用）、`readLogs()`、`readJsonLines()`、`readServerLines()`、`GET /api/logs`；`action` 分支附加 `gitdeckRepository` / `gitdeckAction` |
| JSON 存储与迁移 | `src/repository-store.js` | `RepositoryStore.loadState()`、`saveState()`、`normalizeOrder()`、`sortRepositories()` |
| porcelain/log/branch/stash 解析 | `src/git-utils.js` | `parseStatus()`、`parseLog()`、`parseBranches()`、`parseStashes()`、`parseCommitHistory()`、`isPathInside()` |

## 前端（public/app.js，单 IIFE）

| 需求 | 符号 |
| --- | --- |
| 启动与自动刷新 | `init()`、`refreshAllSummaries()` |
| 令牌感知 fetch | `api()` |
| 总渲染协调 | `render()` |
| 全局摘要 | `renderGlobalSummary()` |
| 仓库列表与拖拽排序 | `renderRepoList()`、`handleRepoDragStart/Over/Drop()`、`moveRepositoryOrder()` |
| 工作区下拉 | `renderWorkspacePicker()`、`openWorkspaceDropdown()`、`closeWorkspaceDropdown()` |
| 主面板/仓库视图 | `renderMain()`、`renderRepositoryView()` |
| 变更文件树/平铺 | `renderChanges()`、`renderFileTree()`、`renderTreeNode()`、`renderFlatFileList()`、`updateFileViewToggle()`、`getVisibleEntries()` |
| 文件列表 Shift 范围框选与批量勾选 | `computeFileRange()`、`resolveFileCheckTargets()`、`getVisibleFilePaths()`、`handleFileRangeClick()`、`applyFileRangeHighlight()`、`resetFileRange()`、`syncFileCheckButtons()`、`updateRangeHint()`；状态 `fileRangeAnchor` / `fileRangeSelection` |
| .sln 解决方案快捷列表 | 与 Git 无关：按钮开启后 `fetchSolutions()` 并发调所有仓库的 `GET /api/repositories/:id/solutions` 并缓存在 `state.solutionCache`，`buildSolutionCatalog()` 汇总为带仓库名的目录；`getVisibleSolutions()` 按 `solutionScope` / `solutionSearch` 过滤，`renderSolutionView()` + `renderSolutionList()` 独立渲染，`updateSolutionToolbar()` 同步搜索/范围/重新扫描；`renderSolutionPreview()` 只重建右侧预览，`selectSolutionItem()` 单击时仅增量切 `.selected`（**不重建列表 DOM，否则浏览器不派发 `dblclick`**），`requestOpenSolution()` 汇总 `dblclick` 与 `click(detail>=2)` 并短时去重；双击 `[data-solution-key]` 或预览区 `openSolution` 调 `openInVisualStudio(target)`，独立发动作请求、自带即时/成功/失败反馈，不走 `performRepoAction()` 的 busy 队列，并带上条目所属 `repositoryId`。切换仓库不关闭模式（`refreshSolutionCurrentFlag()`）。后端：`directories.listSolutions()`（只读仓库根目录第一层，不递归子目录）、`shell.openVisualStudio()`、`openVisualStudio` 动作 |
| 文件状态 | `fileStatus()`、`collectChangedEntries()` |
| Diff/编辑器 | `loadFilePreview()`、`renderPreviewHeader()`、`renderEditor()`、`saveEditor()`、`revertEditorChanges()`；`renderDiff()`（word-wise 行内高亮：`diffLineKind()`、`buildInlineMarks()`、`tokenizeDiffLine()`、`inlineDiffSegments()`、`diffLineSimilarity()`、`diffTokens()`） |
| 选中提交 | `updateComposerState()`、`submitCommit()` |
| 批量暂存/还原 | `requestBatchStage()`、`requestBatchDiscard()`、`performBatchDiscard()` |
| 右侧提交历史 | `ensureContextHistory()`、`renderContextHistory()`、`renderHistoryGraph()`、`renderHistoryDecorations()` |
| 分支列表与批量删除 | `renderBranchList()`、`matchesBranchSearch()`、`toggleBranchSelection()`、`openDeleteBranchesModal()`、`deleteSelectedBranches()` |
| Stash | `renderStashList()`、`openStashModal()`、`requestStashAction()` |
| 远端 | `renderRemoteList()` |
| 弹窗 | `openModal()`、`closeModal()`、`showConfirm()`、`withModalButton()` |
| 目录选择器 | `openDirectoryPicker()`、`loadDirectory()`、`renderDirectoryPicker()` |
| 扫描结果全选 / 反选与已选清单 | `renderScanModalBody()`（含 `data-scan-name`）、`scanRepositoryInputs()`、`updateScanSelectionUI()`、`handleModalAction()` 的 `scan-select-all` / `scan-invert-selection` |
| 事件分发 | `handleDocumentClick()`、`handleKeydown()` |
| 分栏拖动 | `initializeResizers()`、`setResizerWidth()` |
| 右键菜单（仓库行 / 历史徽标） | `showContextMenu()`、`openRepoMenu()`、`openRefMenu()`、`historyRowContext()`、`handleContextMenuClick()`、`handleRepoMenuAction()`、`handleHistoryMenuAction()`、`hideContextMenu()`、`copyText()` |
| 提交差异与引用表单弹窗 | `openCommitChanges()`、`openCreateRefAtModal()`、`createHistoryRefFromModal()` |
| 批量仓库操作 | `toggleBulkRepository()`、`requestBulkAction()`、`executeBulkAction()`、`requestBulkRemoveRepositories()` |
| 提示 | `showToast()` |
| 工具 | `icon()`、`escapeHtml()`、`formatRelative()`、`formatDateTime()` |

## 数据与测试

| 需求 | 文件 |
| --- | --- |
| 用户数据 | `data/repositories.json`（版本 3，含 `order`） |
| 端到端 API 测试 | `tests/api.test.js` |
| 解析工具测试 | `tests/git-utils.test.js` |
| 项目文件约束测试 | `tests/project-files.test.js` |
| 文档检查 | `tools/check-docs.js` |
| 应用图标生成 | `tools/make-icon.js` → `assets/gitdeck.ico`、`public/favicon.png` |
| 应用快捷方式安装 | `tools/install-shortcut.js`、`tools/gitdeck-launch.vbs` |
| 启动脚本 | `start.cmd` |
