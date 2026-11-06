# 功能地图

本文件用于在修改功能前快速定位最小代码范围。

## 工作区

**用户行为**

- 创建、重命名、删除和切换工作区。
- 工作区是左侧仓库列表的当前分组。
- 一个仓库可以同时归属多个工作区（自由组合），每个工作区有独立的排序。
- 删除工作区会摘除仓库对该工作区的归属，仓库保留在其他工作区或移动到兜底工作区，不会删除磁盘目录。
- 当前工作区记录在浏览器本地存储中。

**实现位置**

- 存储：`RepositoryStore.loadState()`、`saveState()`、`workspaceId()`。
- 服务端：`/api/workspaces`、`createWorkspace()`、`renameWorkspace()`、`deleteWorkspace()`。
- 前端：`setActiveWorkspace()`、`renderWorkspacePicker()`、`openWorkspacesModal()`、`openWorkspaceNameModal()`。
- DOM：`#workspacePicker`、`#workspaceSwitcher`、`#workspaceDropdown`、`#workspaceDropdownList`。

## 仓库接入

**用户行为**

- 手动输入路径添加仓库。
- 使用内置目录浏览器选择目录；列表滚动保持流畅（遮罩不做全屏模糊、滚动时不写 DOM、选目录期间暂停后台整页刷新）。
- 目录浏览器支持**多选批量添加**：勾选多个 Git 仓库后一次加入当前工作区；可「全选 Git 仓库」、清空、把当前目录加入选择，并且切换目录后已勾选的仓库仍保留。扫描目录的目录选择仍为单选。
- 扫描上级目录并批量选择发现的仓库。
- 新仓库加入当前工作区。

**实现位置**

- `addRepository()` 获取 Git 顶层目录，并支持 Windows 所有权不一致时的精确 `safe.directory` 回退。
- `discoverRepositories()` 递归扫描，并跳过常见构建与依赖目录。
- `listDirectories()` 为内置目录选择器提供数据。
- 前端：`openAddRepositoryModal()`、`openScanModal()`、`openDirectoryPicker()`、`renderDirectoryPicker()`。
- 多选：`state.directoryMultiple` / `directorySelected`（`Set`，跨目录保留）、`handleDirectoryCheck()`、`updateDirectorySelectionUI()`、`syncDirectoryRowChecks()`、`selectAllVisibleRepositories()`、`addSelectedDirectories()`；批量添加复用 `POST /api/repositories` 串行落盘，单次上限 50 个，失败项留在选择集里可重试。
- 滚动性能：`public/styles.css` 的 `.directory-list`（`contain: layout paint`、`overscroll-behavior: contain`）与 `.directory-backdrop`（无 `backdrop-filter`）；`hideContextMenu()` 用 passive 监听且菜单已隐藏时不写 DOM；自动刷新在目录选择器打开时跳过。

## 工作区仓库维护

**用户行为**

- 在当前工作区添加仓库。
- 把仓库加入其他工作区（多归属，保留原有归属）。
- 从当前工作区移除单个或多个仓库（只摘除该工作区归属；最后一个归属被摘除时条目从列表删除）。
- 拖拽仓库行调整当前工作区顺序（每个工作区独立排序）。
- 移除只影响 GitDeck 列表，不删除磁盘目录或 Git 历史。

**实现位置**

- 服务端：`moveRepositoryToWorkspace()`、`removeRepositoriesFromWorkspace()`、`addRepository()`。
- 前端：工作区下方添加按钮、仓库右键菜单、批量选择栏。
- 排序：HTML5 Drag and Drop、`moveRepositoryOrder()`；拖拽后立即写入当前工作区 `orders` 并重绘（无需刷新），保存失败按旧 `orders` 回滚。
- API：`POST /api/repositories/:id/workspace`、`POST /api/repositories/remove`、`DELETE /api/repositories/:id`。

## 状态总览

**用户行为**

- 显示当前工作区中每个仓库的分支、文件改动数、领先/落后和最近提交。
- 每 20 秒自动刷新，也支持手动刷新。

**实现位置**

- `getStatusSummary()`
- `src/git-utils.js` 的 `parseStatus()`
- `refreshAllSummaries()`
- `renderGlobalSummary()`、`renderRepoList()`、`renderRepositoryView()`

## 工作区目录树与 Diff

**用户行为**

- 变更文件按真实目录层级显示。
- 可在文件夹树视图和带完整路径的平铺列表之间切换。
- 支持全部、未暂存、已暂存、未跟踪筛选。
- 文件列表工具区提供 `.sln` 过滤按钮：点击后只显示仓库内的 Visual Studio 解决方案文件，与状态筛选叠加生效（即在当前状态结果中再筛 `.sln`）。
- 双击 `.sln` 文件（或在选中它后点击预览区的「用 Visual Studio 打开」）会用本机 Visual Studio 直接打开该解决方案。
- 点击文件立即显示 Diff。
- 状态徽标使用颜色区分：新增/未跟踪绿色，删除红色，修改/重命名蓝色。

**实现位置**

- `collectChangedEntries()`
- `renderFileTree()`、`renderTreeNode()`、`renderFlatFileList()`
- `updateFileViewToggle()`、`getVisibleEntries()`（统一的可见文件筛选，含 `.sln` 后缀判断）
- `isSolutionFile()`、`openInVisualStudio()`（`elements.fileGroups` 的 `dblclick` 监听 + 预览区 `openSolution` 动作）
- 后端：`shell.openVisualStudio()`（用 `vswhere.exe` 定位 `devenv.exe`，回退常见版本目录）、`git-actions` 的 `openVisualStudio` 动作（经 `validateRepositoryPath` 校验路径在仓库内）
- `fileStatus()`
- `getPreviewKey()`、`loadFilePreview()`、`renderDiff()`
- CSS：`.file-status.added`、`.deleted`、`.modified`、`.conflict`、`solution-filter-toggle`、`.solution-file`、`.solution-open-button`

## 内联编辑

**用户行为**

- 文件可在 Diff 和编辑模式间切换。
- 使用 `Ctrl+S` 保存。
- 有未保存内容时，切换文件、模式、暂存或提交会被阻止或要求确认。

**实现位置**

- 服务端：`getFileContent()`、`saveFileContent()`、`resolveEditableFile()`
- 前端：`renderEditor()`、`handleEditorInput()`、`saveEditor()`、`revertEditorChanges()`、`requestPreviewMode()`
- 保存使用 SHA-256 预期哈希检测冲突。
- 保留 LF/CRLF 换行格式。

## 批量文件操作

**子功能**

- 勾选文件。
- 全选当前筛选结果。
- 一次暂存多个文件。
- 一次还原多个已跟踪文件，并删除选中的未跟踪文件。
- 只提交勾选文件。

**实现位置**

- 状态：`selectedFiles`、`fileFilter`、`batchBusy`
- 服务端动作：`stageFiles`、`discardFiles`、`commitSelected`
- `stagePaths()` 和 `commitSelected()` 使用 NUL 分隔的 pathspec 输入，规避 Windows 命令行长度限制。
- `commitSelected()` 使用 `git commit --only`，不会提交其他已暂存文件。

## 分支管理

**用户行为**

- 显示本地分支带年份的最近提交时间和作者。
- 分支按最近提交时间倒序排列，最新的在最上面。
- 按分支名或作者搜索。
- 点击非当前分支整行即可勾选或取消勾选。
- 选择一个或多个可删除分支。
- 安全删除本地分支。
- 未合并分支默认失败，可显式勾选强制删除 `-D`。
- 可选择同步删除匹配的远程分支。
- 批量选择只跟随当前搜索结果。

**实现位置**

- `parseBranches()` 返回名称、当前标记、上游、日期和作者。
- `getRepositoryDetail()` 为分支补充 `remoteTarget`。
- `deleteBranches()` 先安全删除本地分支，再按远端分组删除远程分支。
- 每项的 `forceDelete` 决定使用 `git branch -d` 还是 `-D`。
- 前端：`renderBranchList()`、`matchesBranchSearch()`、`openDeleteBranchesModal()`、`deleteSelectedBranches()`。
- 整行选择：`toggleBranchSelection()` 和 `data-branch-row`。

## 右侧提交历史视图

**用户行为**

- 右侧面板默认显示当前仓库提交历史。
- 可在“提交历史”和“分支”之间切换。
- 提交历史可切换“当前分支”和“所有分支”。
- 图线为 TortoiseGit 风格 SVG 泳道图：彩色泳道竖线、提交圆点、合并弧线；泳道按拓扑序自动分配与压缩。
- 所有分支模式显示分支/远端/标签徽标：本地分支绿色（当前检出分支实心绿）、远端分支棕黄、标签紫色。
- 提交历史显示主题、短哈希、作者和相对时间。
- Stash 与远端信息始终保留在下方。

**实现位置**

- 状态：`contextView`、`contextHistoryScope`、`contextHistory`
- 接口：`GET /api/repositories/:id/history`（返回 `hash` + `parents`，不再返回 ASCII 图线）
- 服务端：`getCommitHistory()`、`parseCommitHistory()`
- 前端：`ensureContextHistory()`、`renderContextHistory()`、
  `buildHistoryGraph()`（泳道分配）、`historyGraphSvg()`（SVG 绘制）、
  `renderHistoryDecorations()`
- DOM：`#contextHistorySection`、`#branchContextSection`、
  `#contextCommitHistory`、`[data-context-view]`

## Stash

**用户行为**

- 将已跟踪和未跟踪改动保存到 Stash。
- 恢复 `stash@{n}`。

**实现位置**

- `parseStashes()`
- 动作：`stashSave`、`stashPop`
- 前端：`renderStashList()`、`openStashModal()`、`requestStashAction()`

## 远端同步

**用户行为**

- 单仓库抓取、快进拉取、推送。
- 多选仓库后批量抓取、拉取、推送。
- 服务端定时后台 fetch（默认 5 分钟，`GITDECK_AUTO_FETCH_MS` 可调、`GITDECK_AUTO_FETCH=0` 关闭）：
  自动对有远端的仓库执行 `git fetch --all`（不含 prune），保持 `origin/*` 快照最新；
  跳过正被用户动作占用的仓库，失败静默不弹错。

**实现位置**

- 动作：`fetch`、`pull`、`push`
- 拉取固定使用 `git pull --ff-only`
- 定时抓取：`src/auto-fetch.js`（`startAutoFetch()`，server.js 监听后启动）
- 前端：`requestRepoAction()`、`requestBulkAction()`、`executeBulkAction()`

## TortoiseGit 外部界面

**用户行为**

- 在仓库工具栏点击 `TortoiseGit`。
- 使用当前仓库路径打开 TortoiseGit 日志窗口。

**实现位置**

- 动作：`openTortoiseGit`
- 服务端：`openTortoiseGit()` 查找 `TortoiseGitProc.exe`
- 命令：`/command:log /path:<仓库>`
- 前端：仓库操作栏的 `data-repo-action="openTortoiseGit"`

## 桌面壳 A

**用户行为**

- 双击 `start.cmd` 以独立窗口形态启动，无地址栏、无标签页。
- 关闭窗口后服务默认继续在后台常驻，刷新或再次双击快捷方式都能立即打开；不会被浏览器后台冻结、系统睡眠等因素误判为"窗口已关闭"而自行退出。
- 需要"关窗后服务退出"时，启动前设置 `GITDECK_HEARTBEAT=1`；此时连续 120 秒无心跳 + 15 秒确认窗口才退出，睡眠/挂起不会误判。
- 再次启动会接管已运行实例（只开窗口，不重复启动服务）。
- 运行日志写入 `data/server.log`（启动、看门狗判定、未捕获异常），隐藏窗口启动时也能排查。
- 窗口尺寸持久化，下次按上次尺寸打开；Chrome 在已有实例运行时会忽略 `--window-size`，因此页面加载后会读取存档尺寸并 `resizeTo` 恢复，应用预设期间的尺寸变化不上报（防止存档被小窗口覆盖）。

**实现位置**

- `src/desktop.js`：`findBrowser()`、`launchAppWindow()`、`probeInstance()`、`createHeartbeatWatchdog()`、`startHeartbeatWatchdog()`、`touchHeartbeat()`、`loadWindowSize()`、`saveWindowSize()`
- `server.js`：`GITDECK_DESKTOP=1` 时固定端口、单实例让位；注册文件日志与全局异常兜底
- `src/logger.js`：把 console 输出同步写入 `data/server.log`，超 256 KB 轮转为 `.1`
- 接口：`GET /api/ping`、`POST /api/heartbeat`、`GET/POST /api/window`
- 前端：`public/index.html` 内联心跳与窗口尺寸上报脚本
- 启动：`start.cmd` 通过 PowerShell `Start-Process -WindowStyle Hidden` 隐藏控制台

## 应用图标与快捷方式

**用户行为**

- 开始菜单和桌面有 GitDeck 快捷方式，带专属分支图标。
- 双击快捷方式静默启动（无控制台闪烁），以独立窗口形态打开。
- 在开始菜单右键 GitDeck → 固定到任务栏（Windows 不允许编程固定，需手动一次）。
- Chrome `--app` 窗口的任务栏图标来自页面 favicon（`public/favicon.png`）。

**实现位置**

- 图标生成：`tools/make-icon.js`（零依赖手写 PNG/ICO 编码，SDF 绘制）→ `assets/gitdeck.ico`（16–256 共 7 档）+ `public/favicon.png`
- 快捷方式安装：`tools/install-shortcut.js`（PowerShell WScript.Shell COM 写 `.lnk`，图标指向 `assets/gitdeck.ico`）
- 静默启动：`tools/gitdeck-launch.vbs` 以隐藏窗口方式运行 `start.cmd`
- favicon 服务：`src/static.js` 的 `serveStatic()` fileMap 提供 `/favicon.png` 与 `/favicon.ico`
- 页面声明：`public/index.html` `<link rel="icon">`
- 重新生成图标：`node tools/make-icon.js`；重装快捷方式：`node tools/install-shortcut.js`

## 可拖拽分栏

**用户行为**

- 拖动分隔条调整仓库侧栏、变更目录树和上下文面板宽度。
- 双击恢复默认宽度。
- 方向键微调。
- 刷新后保留宽度。

**实现位置**

- DOM：`[data-resizer="sidebar"]`、`[data-resizer="filetree"]`、`[data-resizer="context"]`
- JS：`initializeResizers()`、`setResizerWidth()`、`persistResizerWidth()`
- CSS 变量：`--sidebar-width`、`--file-tree-width`、`--context-width`

## 仓库右键菜单

**用户行为**

- 右键仓库或点击仓库右侧的 `...`。
- 打开仓库、抓取、拉取、推送、移动工作区、从 GitDeck 移除。

**实现位置**

- `openRepoMenu()`
- `handleContextMenuClick()`
- DOM：`#contextMenu`

## 文件状态颜色

| 状态 | 徽标 | 含义 |
| --- | --- | --- |
| `A` 或未跟踪 | 绿色 `A`/`U` | 新增或未跟踪 |
| `D` | 红色 `D` | 删除 |
| `M` | 蓝色 `M` | 修改 |
| `R`/`C` | 蓝色 `R`/`C` | 重命名或复制 |
| `!` | 深红 `!` | 冲突 |
