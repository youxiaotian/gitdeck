# 功能地图

本文件用于在修改功能前快速定位最小代码范围。

## 工作区

**用户行为**

- 创建、重命名、删除和切换工作区。
- 工作区是左侧仓库列表的当前分组。
- 删除工作区会把仓库移动到其他工作区，不会删除磁盘目录。
- 当前工作区记录在浏览器本地存储中。

**实现位置**

- 存储：`RepositoryStore.loadState()`、`saveState()`、`workspaceId()`。
- 服务端：`/api/workspaces`、`createWorkspace()`、`renameWorkspace()`、`deleteWorkspace()`。
- 前端：`setActiveWorkspace()`、`renderWorkspacePicker()`、`openWorkspacesModal()`、`openWorkspaceNameModal()`。
- DOM：`#workspacePicker`、`#workspaceSwitcher`、`#workspaceDropdown`、`#workspaceDropdownList`。

## 仓库接入

**用户行为**

- 手动输入路径添加仓库。
- 使用内置目录浏览器选择目录。
- 扫描上级目录并批量选择发现的仓库。
- 新仓库加入当前工作区。

**实现位置**

- `addRepository()` 获取 Git 顶层目录，并支持 Windows 所有权不一致时的精确 `safe.directory` 回退。
- `discoverRepositories()` 递归扫描，并跳过常见构建与依赖目录。
- `listDirectories()` 为内置目录选择器提供数据。
- 前端：`openAddRepositoryModal()`、`openScanModal()`、`openDirectoryPicker()`、`renderDirectoryPicker()`。

## 工作区仓库维护

**用户行为**

- 在当前工作区添加仓库。
- 把仓库移动到其他工作区。
- 从工作区移除单个或多个仓库。
- 拖拽仓库行调整当前工作区顺序。
- 移除只影响 GitDeck 列表，不删除磁盘目录或 Git 历史。

**实现位置**

- 服务端：`moveRepositoryToWorkspace()`、`removeRepositoriesFromWorkspace()`、`addRepository()`。
- 前端：工作区下方添加按钮、仓库右键菜单、批量选择栏。
- 排序：HTML5 Drag and Drop、`moveRepositoryOrder()`。
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
- 点击文件立即显示 Diff。
- 状态徽标使用颜色区分：新增/未跟踪绿色，删除红色，修改/重命名蓝色。

**实现位置**

- `collectChangedEntries()`
- `renderFileTree()`、`renderTreeNode()`
- `renderFlatFileList()`、`updateFileViewToggle()`
- `fileStatus()`
- `getPreviewKey()`、`loadFilePreview()`、`renderDiff()`
- CSS：`.file-status.added`、`.deleted`、`.modified`、`.conflict`

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
- 所有分支模式显示多色轨道、连接线、分支/远端/标签徽标。
- 提交历史显示主题、短哈希、作者和相对时间。
- Stash 与远端信息始终保留在下方。

**实现位置**

- 状态：`contextView`、`contextHistoryScope`、`contextHistory`
- 接口：`GET /api/repositories/:id/history`
- 服务端：`getCommitHistory()`、`parseGraphHistory()`
- 前端：`ensureContextHistory()`、`renderContextHistory()`、
  `renderHistoryGraph()`、`renderHistoryDecorations()`
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

**实现位置**

- 动作：`fetch`、`pull`、`push`
- 拉取固定使用 `git pull --ff-only`
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
