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
- 扫描上级目录并批量选择发现的仓库：结果默认全选，列表上方提供**全选 / 反选**，右侧实时把已选仓库名用顿号拼接展示（`已选 N/M 个：A、B、C`）；完整路径放在悬停提示里，过长时单行省略。底部按钮同步显示「添加 N 个仓库」，0 选中时禁用。
- 新仓库加入当前工作区。

**实现位置**

- `addRepository()` 获取 Git 顶层目录，并支持 Windows 所有权不一致时的精确 `safe.directory` 回退。
- `discoverRepositories()` 递归扫描，并跳过常见构建与依赖目录。
- `listDirectories()` 为内置目录选择器提供数据。
- 前端：`openAddRepositoryModal()`、`openScanModal()`、`openDirectoryPicker()`、`renderDirectoryPicker()`。
- 扫描选择条：`renderScanModalBody()` 在 `.scan-selection-bar` 里渲染按钮与 `#scanSelectionSummary`，复选框带 `data-scan-name`；`scanRepositoryInputs()` / `updateScanSelectionUI()` 增量改写清单文本、按钮禁用态和底部文案，勾选变化走 `elements.modalBody` 的 `change` 委托，不重建 `.scan-results`；`handleModalAction()` 分发 `scan-select-all` / `scan-invert-selection`。
- 多选：`state.directoryMultiple` / `directorySelected`（`Set`，跨目录保留）、`handleDirectoryCheck()`、`updateDirectorySelectionUI()`、`syncDirectoryRowChecks()`、`selectAllVisibleRepositories()`、`addSelectedDirectories()`；批量添加复用 `POST /api/repositories` 串行落盘，单次上限 50 个，失败项留在选择集里可重试。
- 滚动性能：`public/styles.css` 的 `.directory-list`（`contain: layout paint`、`overscroll-behavior: contain`）与 `.directory-backdrop`（无 `backdrop-filter`）；`hideContextMenu()` 用 passive 监听且菜单已隐藏时不写 DOM；已无自动刷新定时器，滚动期间不会有后台整页重绘。

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
- 打开应用时读取一次状态；之后不做任何后台自动刷新，只在用户点顶栏「抓取全部」或执行 Git 动作后更新。避免持续 `git status` 与用户正在操作的 TortoiseGit / IDE 抢同一个 `.git`。

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
- 文件列表工具区的 `.sln` 按钮开启后进入「解决方案」模式：与 Git 状态完全无关，**一次汇总所有已添加仓库根目录第一层**的 `.sln`（含未发生改动、已提交的文件；**不递归子目录**，避免大仓库刷新卡顿），文件列表变成带仓库名的快捷列表；状态筛选条与批量暂存勾选隐藏。关闭后恢复普通 Git 变更视图。
- 列表顶部提供搜索框（按仓库名/路径过滤）、「全部仓库 / 当前仓库」范围切换与「重新扫描」。扫描结果按仓库缓存在内存：切换仓库、搜索、切范围都不会重复读磁盘；切换仓库也不会关闭该模式，只更新「当前仓库」标记。
- 单击选中后右侧预览显示仓库与相对路径；**双击列表项**或点击「用 Visual Studio 打开」会按该解决方案所属的仓库直接打开，不必先切换仓库。
- 双击链路专门防「点了没反应」：单击只增量切换选中态（**不重建列表 DOM**，否则浏览器不会把它判定为同一元素连续两次点击，`dblclick` 根本不派发）；真实双击由 `dblclick` 与第二次 `click(detail=2)` 双通道触发并短时去重。打开前即时提示「正在启动 Visual Studio」，失败明确报错；打开请求不进入通用 Git 动作队列，避免被其它仓库操作的 busy 锁静默丢弃或触发整页重渲染。
- 空态不再把「当前仓库没有」误报成「目录下没有 .sln 文件」：区分「没有匹配结果」（一键清空筛选）与「所有仓库都没扫到 .sln」（重新扫描）；接口失败显示明确原因，旧服务缺少接口时提示重新运行 `start.cmd`。
- 点击文件立即显示 Diff。
- Diff 行内变动对齐 TortoiseGitMerge 的 inline diff：默认 **word-wise（按整词）**，把行切成标识符 / 数字 / 汉字串 / 空白 / 标点后做词级 LCS，改一个字符时整个词一起高亮，不拆成一堆零碎字符。配对的修改行未变部分改用中性的 modified 底色，只有变化片段用删除侧深红、新增侧深绿，不会在整行红/绿底上再叠一层深色。变更块里的 `-` / `+` 行按顺序配对（对应乌龟两栏里同一行的左右两侧），相似度太低、整行重写、超过 3000 字符的行或超大变更块退回行级着色。主预览区与提交改动 Diff 弹窗共用同一渲染。
- 状态徽标使用颜色区分：新增/未跟踪绿色，删除红色，修改/重命名蓝色。

**实现位置**

- `collectChangedEntries()`
- `renderFileTree()`、`renderTreeNode()`、`renderFlatFileList()`
- `updateFileViewToggle()`（同时切换 `solution-mode` 类）、`getVisibleEntries()`（解决方案模式返回汇总结果，普通模式按状态筛选）
- `fetchSolutions({ force })`（并发 4 个扫所有仓库、按 `state.solutionCache` 缓存）、`buildSolutionCatalog()`、`refreshSolutionCurrentFlag()`、`getVisibleSolutions()`、`makeSolutionKey()` / `findSolutionByKey()`
- `renderSolutionView()`（独立视图）、`renderSolutionList()`、`renderSolutionPreview()`（只重建右侧预览）、`updateSolutionToolbar()`、`toSolutionEntry()`、`resolveFileEntry()`
- `selectSolutionItem()`（增量选中）、`requestOpenSolution()`（双击双通道 + 去重）、`isSolutionFile()`、`openInVisualStudio(target)`（独立发动作请求并自行反馈，支持带 `repositoryId` 的跨仓库条目；`dblclick` 监听 + 预览区 `openSolution` 动作）
- DOM：`#solutionToolbar`、`#solutionSearchInput`、`[data-solution-scope]`、`[data-solution-rescan]`、`[data-solution-select]`、`[data-solution-key]`、`[data-solution-clear-filters]`
- 后端：`directories.listSolutions()`（只读仓库根目录第一层、不递归子目录、返回文件名）、`shell.openVisualStudio()`（用 `vswhere.exe` 定位 `devenv.exe`，回退常见版本目录）、`git-actions` 的 `openVisualStudio` 动作（经 `validateRepositoryPath` 校验路径在仓库内）、路由 `GET /api/repositories/:id/solutions`
- `fileStatus()`
- `getPreviewKey()`、`loadFilePreview()`、`renderDiff()`、`diffLineKind()`、`buildInlineMarks()`、`tokenizeDiffLine()`、`inlineDiffSegments()`、`diffLineSimilarity()`、`diffTokens()`
- CSS：`.file-status.added`、`.deleted`、`.modified`、`.conflict`、`solution-filter-toggle`、`.solution-file`、`.solution-open-button`、`.diff-marker`、`.diff-inline-del`、`.diff-inline-add`

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
- **Shift 范围框选**：单击文件行确定起点，按住 Shift 点另一行，按当前可见顺序高亮整段（淡蓝底，与绿色的当前预览行区分）；再点范围内任一勾选框，整段统一勾选或取消，用于一次提交几十个文件。也支持直接 Shift + 点勾选框现算范围。范围提示显示在「已选 N」旁（`范围 M 个`）。
- 全选当前筛选结果。
- 一次暂存多个文件。
- 一次还原多个已跟踪文件，并删除选中的未跟踪文件。
- 只提交勾选文件。

**实现位置**

- 状态：`selectedFiles`、`fileRangeAnchor`、`fileRangeSelection`、`fileFilter`、`batchBusy`
- 前端：`computeFileRange()`、`resolveFileCheckTargets()`、`getVisibleFilePaths()`、`handleFileRangeClick()`、`applyFileRangeHighlight()`、`resetFileRange()`、`syncFileCheckButtons()`、`updateRangeHint()`
- 范围按 DOM 可见顺序计算（`getClientRects()` 排除折叠目录里的行），批量勾选只增量改写复选框，不重建文件列表；切换筛选、目录树/平铺视图、折叠目录、仓库、`.sln` 模式、点范围外或按 Esc 都会结束框选。
- 服务端动作：`stageFiles`、`discardFiles`、`commitSelected`
- `stagePaths()` 和 `commitSelected()` 使用 NUL 分隔的 pathspec 输入，规避 Windows 命令行长度限制。
- `commitSelected()` 使用 `git commit --only`，不会提交其他已暂存文件。

## 索引锁冲突的默认处理

- 提交 / 暂存撞上 `Unable to create '.../.git/index.lock': File exists.` 时不再只抛英文原文。
- `src/index-lock.js` **只在用户主动触发的 git 命令失败时介入**，不注册任何后台巡检（后台碰仓库会与 TortoiseGit / IDE 抢 `.git`）。判据是 Windows 独占打开（`FileShare.None`）：
  - **无人持有（陈旧锁）**：只删除 Git 目录内的 `.git/index.lock`，自动重试该命令一次；动作结果追加「已自动删除并重试成功」，`data/server.log` 留下 `[index-lock]` 记录。
  - **仍有进程持有（活锁）**：绝不删除，返回 HTTP 423，错误提示里列出可能占用的进程（名称、PID、命令行；命令行包含该仓库路径的优先），并附占用判据与 Git 原始错误。
  - **探测失败 / 锁不在 Git 目录内 / 无法确定 Git 目录**：一律保守不删，给出中文手动处理引导；工作树里被跟踪的同名 `index.lock` 文件永不被删。
- `.git` 是文件（worktree / submodule）时会按 `gitdir:` 解析真实 Git 目录。
- 多行错误详情在 toast 里完整展开：保留换行、可滚动、停留 20 秒，不会被默认 3 行截断。

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

## 分支标签右键菜单（参考 TortoiseGit）

**用户行为**

- 只有右键提交历史里的分支/标签徽标才会弹出菜单；右键历史行的其它位置保持浏览器默认行为，不再显示提交级菜单（用户主要需要的是操作分支）。
- 菜单首项高亮「切换到 "xxx"」，可快速切到该引用。远端分支会在本地创建同名跟踪分支，`origin/HEAD` 解析为它指向的远端分支，标签进入分离 HEAD；当前检出分支该项禁用。
- 同一菜单还支持：合并到当前分支、在此版本创建分支/标签、检出此提交、推送引用、删除引用、显示此提交的改动、与工作区/上一版本比较、复制引用名与提交哈希、浏览仓库、用 TortoiseGit 打开日志。
- 合并、检出、推送、删除引用等会改写仓库或远端的操作都有确认弹窗，危险项使用红色样式。
- 「删除引用」对未合并的本地分支默认走 `git branch -d`，会被 Git 拒绝（提示 `not fully merged`）；确认框里显式提供「强制删除未合并分支（-D）」勾选，默认关闭。删除失败时确认框保持打开，勾选后可直接重试。
- 菜单较长时可内部滚动，页面滚动 / 点击别处 / Escape / 窗口缩放仍会关闭菜单。

**实现位置**

- 前端：`showContextMenu()`（仓库行与徽标菜单共用渲染与位置钳制）、`openRepoMenu()`、`openRefMenu()`、`historyRowContext()`、`handleContextMenuClick()`、`handleRepoMenuAction()`、`handleHistoryMenuAction()`、`openCreateRefAtModal()`、`createHistoryRefFromModal()`、`openCommitChanges()`、`copyText()`、`hideContextMenu()`；上下文存 `state.menuContext`。
- DOM：历史行 `data-commit-hash`，徽标 `data-ref` / `data-ref-full` / `data-ref-kind`；`#contextMenu` 的 `.context-menu-wide` 变体与 `[data-menu-action]`。
- 删除引用确认框：`#forceDeleteRef`（默认不勾选）；`handleHistoryMenuAction("delete-ref")` 把勾选状态作为 `force` 传给 `deleteRef`，后端按 `force ? "-D" : "-d"` 选择本地分支删除方式。
- 后端：`GET /api/repositories/:id/commit?hash=&compare=`（`getCommitChanges()`）；`src/git-actions.js` 的 `checkoutRef`、`checkoutCommit`、`createBranchAt`、`createTagAt`、`pushRef`、`deleteRef` 及引用/哈希校验。

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
- 顶栏「抓取全部」对**所有已添加仓库**执行 `git fetch --all --prune`：4 个一批限流，按钮显示「抓取中 N/M」，抓完刷新状态并汇总成功/失败数；部分仓库失败会单独提示，不影响其它仓库。原「刷新」按钮只并发读本地 `git status`、不碰远端，用户觉得没用，故改成抓取入口。
- **全部由用户主动触发，服务端没有任何定时抓取**。需要最新的 `origin/*` 时自己点抓取 / 拉取；GitDeck 不会在你使用 TortoiseGit / IDE 时后台碰仓库。此前做过定时后台 fetch，因与用户 GUI 操作撞车已整体移除，不再保留开关或「让路」策略。

**实现位置**

- 动作：`fetch`、`pull`、`push`
- 拉取固定使用 `git pull --ff-only`
- 前端：`requestRepoAction()`、`requestBulkAction()`、`executeBulkAction()`

## 错误日志

**用户行为**

- 顶栏「抓取全部」旁的 `Log` 按钮打开日志弹窗，查看**每一个失败仓库**的完整错误（批量 toast 只显示第一条），以及服务运行日志尾部；可刷新、可逐条展开。
- 日志只落在本机，含仓库路径，不记录会话令牌。

**实现位置**

- 后端：`src/action-log.js` 的 `recordApiError()`（API 失败时写 `data/errors.log` 一行 JSON，含时间 / 状态码 / 接口 / 仓库名 / 动作名 / 错误全文；超过 256KB 轮转为 `errors.log.1`）与 `readLogs()`；`logError()` 另在 `data/server.log` 留一条首行摘要。
- `server.js` 的统一 catch 只对 `/api/` 失败记录；`src/routes.js` 的 `action` 分支把仓库名与动作名挂到错误上；新增 `GET /api/logs?limit=`（同样需要会话令牌，最多 300 条）。
- 前端：`openLogPanel()`、`loadLogPanel()`、`renderLogPanel()`，复用 `openModal({ wide: true })`；`logRequest` 计数避免迟到响应回填到已关闭的弹窗。
- **没有任何后台巡检**：只在请求真正失败时写文件，日志写入失败绝不影响接口响应。

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

- 双击 `start.cmd` 以独立窗口形态启动，无地址栏、无标签页；窗口使用独立 `data/chrome-profile`，不复用日常 Chrome 实例。
- **关闭窗口即结束后端服务**；下次双击 `start.cmd` 重新拉起后端与窗口，加载的一定是最新代码。
- 判定依据是窗口进程的 `exit` 事件，不是心跳超时：浏览器后台冻结、系统睡眠、页面卡顿都不会被误判成"窗口已关闭"，不会自行退出报 `ERR_CONNECTION_REFUSED`。
- `GITDECK_HEARTBEAT=1` 可额外启用心跳自动退出（120 秒无心跳 + 15 秒确认窗口，睡眠/挂起不会误判）；默认不启用。
- 再次启动会接管已运行实例（只开窗口，不重复启动服务）；`start.cmd` 仍会先清理旧后端进程及其 git 子进程。
- 运行日志写入 `data/server.log`（启动、窗口生命周期、未捕获异常），隐藏窗口启动时也能排查。
- 窗口尺寸持久化，下次按上次尺寸打开；Chrome 在已有实例运行时会忽略 `--window-size`，因此页面加载后会读取存档尺寸并 `resizeTo` 恢复，应用预设期间的尺寸变化不上报（防止存档被小窗口覆盖）。

**实现位置**

- `src/desktop.js`：`findBrowser()`、`launchAppWindow()`、`attachAppWindow()`、`createWindowLifecycle()`、`probeInstance()`、可选的 `createHeartbeatWatchdog()` / `startHeartbeatWatchdog()` / `touchHeartbeat()`、`loadWindowSize()`、`saveWindowSize()`
- `server.js`：`GITDECK_DESKTOP=1` 时固定端口、单实例让位；窗口退出时收敛在飞 git 子进程后结束进程（已无定时抓取）；注册文件日志与全局异常兜底
- `src/process.js`：`killActiveChildren()`、`tools/restart-server.ps1` 的 `Stop-GitDescendants()`，避免强杀留下 `.lock`
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

- `openRepoMenu()`、`showContextMenu()`、`handleContextMenuClick()`、`handleRepoMenuAction()`
- DOM：`#contextMenu`
- 提交历史分支标签的右键菜单见上文「分支标签右键菜单」。

## 文件状态颜色

| 状态 | 徽标 | 含义 |
| --- | --- | --- |
| `A` 或未跟踪 | 绿色 `A`/`U` | 新增或未跟踪 |
| `D` | 红色 `D` | 删除 |
| `M` | 蓝色 `M` | 修改 |
| `R`/`C` | 蓝色 `R`/`C` | 重命名或复制 |
| `!` | 深红 `!` | 冲突 |
