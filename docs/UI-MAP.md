# UI 与前端状态地图

## 顶层布局

`public/index.html` 包含：

- `header.topbar`
- `aside.repo-sidebar`
- `main#mainPanel`
- `aside#contextPanel`
- 两个工作区级分隔条
- 模态框、目录选择器和 toast 层

主工作区包含：

- 仓库操作栏；
- 分支、同步和状态条；
- 工作区/历史标签；
- 变更文件目录树；
- 目录树分隔条；
- Diff/编辑器；
- 提交区；
- 右侧分支搜索、分支列表、Stash 和远端。

## 主要 DOM 位置

| 区域 | 关键 ID / 选择器 |
| --- | --- |
| 工作区切换 | `#workspaceSwitcher`、`#workspaceDropdown`、`#workspaceDropdownList` |
| 添加仓库 | `[data-action="add-repository"]` |
| 仓库搜索 | `#repoSearch` |
| 仓库列表 | `#repoList`、行 `[data-open-repo]` |
| 仓库拖拽排序 | `[data-reorder-repo]`、`.repo-drag-handle` |
| TortoiseGit | `[data-repo-action="openTortoiseGit"]` |
| 仓库批量操作 | `[data-bulk-action]`、`[data-bulk-remove]` |
| 文件筛选 | `[data-file-filter]` |
| 变更目录树 | `#fileGroups`、行 `[data-preview-file]` |
| 文件视图切换 | `#fileViewToggle`、`#fileTreeTitle` |
| 文件批量操作 | `[data-file-select-all]`、`[data-batch-stage]`、`[data-batch-discard]` |
| Diff/编辑器 | `#filePreview`、`#codeEditor` |
| 预览模式 | `[data-preview-mode="diff|edit"]` |
| 提交区 | `#commitMessage`、`#amendCheckbox`、`[data-action="commit"]` |
| 分支搜索 | `#branchSearch` |
| 分支列表 | `#branchList`、行 `[data-branch-row]`、复选框 `[data-branch-select]` |
| 右侧视图切换 | `[data-context-view]` |
| 右侧提交历史 | `#contextHistorySection`、`#contextCommitHistory`、`.context-history-row[data-commit-hash]` |
| 历史分支徽标 | `.context-history-decoration[data-ref][data-ref-full][data-ref-kind]` |
| 历史范围切换 | `[data-history-scope="current|all"]` |
| 分支删除弹窗 | `[data-modal-action="delete-branches"]`、`#forceDeleteBranches` |
| 分栏拖动 | `[data-resizer="sidebar|filetree|context"]` |
| 主弹窗 | `#modalBackdrop`、`#modalPanel` |
| 目录选择器 | `#directoryPickerBackdrop`、`.directory-selection-bar`、`input[data-directory-check]`、`#directoryPrimaryButton` |
| 扫描结果选择条 | `.scan-selection-bar`、`#scanSelectionSummary`、`[data-modal-action="scan-select-all\|scan-invert-selection"]`、`input[name="scan-repository"]` |
| 右键菜单 | `#contextMenu`、`.context-menu-wide`、`button[data-menu-action]`、`.context-menu button.primary`、`button[disabled]` |
| .sln 解决方案模式 | `#solutionFilterToggle`、`#solutionToolbar`、`#solutionSearchInput`、`[data-solution-scope]`、`[data-solution-rescan]`、`[data-solution-select]`、`[data-solution-key]`、`[data-solution-clear-filters]`、`.solution-row` |
| 提交差异弹窗 | `#modalPanel.modal-wide`、`pre.commit-patch` |
| 历史引用表单 | `#historyRefName`、`#historySwitchToRef`、`#historyTagMessage`、`[data-modal-action="create-history-ref"]` |
| 提示 | `#toastRegion` |

目录选择器列表滚动期间保持轻量：`hideContextMenu()` 在菜单已隐藏时不再写 `hidden` 属性，`window` 的滚动监听使用 `passive`；已移除自动刷新定时器，滚动期间不会有后台整页 `render()`；样式上 `.directory-list` 使用 `contain: layout paint` 与 `overscroll-behavior: contain`，`.directory-backdrop` 不使用全屏 `backdrop-filter`。

「添加仓库」场景（`openDirectoryPicker(..., { multiple: true })`）启用多选：目录行结构是 `.directory-row` 容器 + 独立复选框 `label.directory-check` + `.directory-row-open` 进入按钮（按钮内不能嵌套交互元素）。只有 `isRepository` 的行可勾选；选择集 `state.directorySelected` 是 `Set`，翻页/进入子目录不清空，`renderDirectoryPicker()` 回填 `checked`，勾选与计数更新走 `updateDirectorySelectionUI()` 的增量写入，不重建 `.directory-list`。`data-directory-action` 新增 `select-all` / `select-current` / `clear-selection` / `add-selected`；扫描目录场景不带 `multiple`，仍是单选并回填路径输入框。

扫描结果弹窗在「自动跳过…」说明下方新增 `.scan-selection-bar`：左侧「全选 / 反选」按钮走 `data-modal-action`（`scan-select-all` / `scan-invert-selection`）接入 `handleModalAction()`，右侧 `#scanSelectionSummary` 把已选仓库名用顿号拼接为 `已选 N/M 个：A、B、C`，完整 `名称 — 路径` 清单放在 `title`，过长时单行省略。结果复选框带 `data-scan-name`。勾选变化由 `elements.modalBody` 的 `change` 委托触发 `updateScanSelectionUI()`，只增量改写清单文本、按钮禁用态与底部「添加 N 个仓库」文案，不重建 `.scan-results`；打开弹窗与扫描完成时各初始化一次。已全选时「全选」禁用，0 选中时底部添加按钮禁用。

## 前端状态分组

`public/app.js` 顶部的 `state` 对象包含：

### 工作区和仓库状态

- `repositories`、`workspaces`、`activeWorkspaceId`
- `summaries`、`errors`、`busyRepositories`
- `selectedId`、`detail`、`detailLoading`、`refreshing`
- 拖拽排序：`draggingRepoId`、`dragOverRepoId`、`dragOverPosition`

### 文件和预览状态

- `selectedFile`、`selectedFiles`、`fileFilter`
- `fileTreeMode`：`tree` 或 `flat`
- `previewMode`、`previewKey`、`previewRequest`、`previewLoading`
- `collapsedFolders`
- `editor.content`、`editor.originalContent`、`editor.hash`、
  `editor.lineEnding`、`editor.dirty`

### 分支状态

- `branchSelection`
- `branchSearch`
- `pendingBranchDeletion`
- `contextView`：默认 `history`，可切换为 `branches`
- `contextHistoryScope`：默认 `all`，可切换为 `current`
- `contextHistory`、`contextHistoryLoading`、`contextHistoryKey`

### 弹窗和工具状态

- `modalType`、`modalAction`
- `scanResults`、`scanRoot`
- 目录选择器字段
- `menuRepositoryId`
- `menuContext`：`{ type: "repo" | "ref", ... }`，决定右键菜单动作分发
- `historyRefDraft`、`commitPatchRequest`
- `drafts`
- `version`

## 渲染流程

```text
init()
  → api(/api/bootstrap)
  → resolveInitialWorkspaceId()
  → render()
  → refreshAllSummaries()
  → selectRepository()

render()
  → renderGlobalSummary()
  → renderRepoList()
  → renderMain()
  → renderContextPanel()
```

`renderRepositoryView()` 会渲染：

- 状态条；
- 分支选择；
- 工作区或提交历史；
- 文件目录树和预览；
- 分支、Stash、远端；
- 提交区。

## 事件分发

`handleDocumentClick()` 主要根据 `data-*` 属性分发：

- `data-action`
- `data-modal-action`
- `data-workspace-switch`、`data-workspace-rename`、
  `data-workspace-delete`、`data-workspace-move`
- `data-repo-action`
- `data-repo-menu`
- `data-file-filter`
- `data-file-select`、`data-file-select-all`
- `data-preview-file`、`data-preview-mode`、`data-preview-action`
- `data-batch-stage`、`data-batch-discard`
- `data-branch-select`、`data-branch-select-all`、
  `data-branch-batch-delete`
- `data-directory-action`
- `data-menu-action`（`#contextMenu` 内的点击委托 `handleContextMenuClick()`）
- `data-modal-action="create-history-ref"`（在指定提交创建分支/标签）
- `.sln` 模式：开启按钮走 `data-action="toggle-solution-filter"`；列表用 `data-solution-select` / `data-solution-key` 单选与双击打开（携带目标仓库 id）；搜索框 `input` 事件、范围与重新扫描按钮走 `data-solution-*` 委托；跨仓库结果存 `state.solutionCatalog` / `solutionCache`，切换仓库不关闭模式。
- `.sln` 双击约定：单击 `[data-solution-select]` 只走 `selectSolutionItem()`（增量切 `.selected` + 重建右侧 `renderSolutionPreview()`），**绝不重建列表 DOM**；否则浏览器不会派发 `dblclick`，表现为双击没反应。打开由 `requestOpenSolution()` 统一处理，`dblclick` 与第二次 `click(detail>=2)` 都会进入，靠 800ms 去重只发一次 `openVisualStudio` 动作请求。

右键事件由 `document` 上的 `contextmenu` 监听统一处理：命中 `[data-open-repo]` 打开仓库菜单；只有命中 `.context-history-decoration` 且能找到所属 `.context-history-row` 时才 `preventDefault()` 并打开引用菜单。历史行其它位置不拦截，保留浏览器默认菜单。新增按钮优先接入该事件体系，除非它需要独立持久状态或特殊键盘行为。

## Diff/编辑流程

- 自动选择第一个变更文件作为预览。
- `getPreviewKey()` 标识仓库、文件、暂存来源和预览模式。
- 通过 `previewRequest` 丢弃过期的异步响应。
- 编辑器有未保存内容时，切换文件或模式会要求确认。
- 保存后仍停留在编辑模式，同时更新哈希、原内容和状态。

## 文件视图切换

- `fileTreeMode = "tree"`：按目录层级递归渲染。
- `fileTreeMode = "flat"`：按完整路径排序后平铺显示。
- 两种视图共用筛选、勾选、预览和批量操作。
- 当前视图保存在 `localStorage` 的 `gitdeck.fileTreeMode`。

## 选中文件提交流程

1. 勾选文件只更新 `selectedFiles`，不重绘整棵树。
2. `updateComposerState()` 把按钮文字改成 `提交 N 个选中文件`。
3. 点击提交调用 `commitSelected`。
4. 服务端只暂存选中路径并执行 `git commit --only`。
5. 成功后 UI 清空文件选择。

## 工作区下拉菜单

- 使用自定义菜单，不是原生 `<select>`。
- 点击 `#workspaceSwitcher` 展开或收起。
- 点击 `#workspacePicker` 外部自动关闭。
- `data-workspace-switch` 项切换工作区并保存到本地存储。
- 菜单底部有“新建工作区”和“管理工作区”。
- 工作区下方有全宽“添加仓库到当前工作区”按钮。

## 仓库拖拽排序

- 仓库行使用原生 HTML5 Drag and Drop。
- 拖到目标行上半部分插入到前面，下半部分插入到后面。
- 拖拽结束后立即把新顺序写入当前工作区的 `orders[workspaceId]` 并乐观重绘，再调用排序接口。v4 顶层 `repositories` 数组顺序不承载显示语义，只重排数组会导致拖拽后必须 F5 才生效。
- 保存失败时按拖拽前保存的 `orders` 精确回滚并提示。
- 拖拽后的短时间点击会被抑制，避免误打开仓库。

## 右侧视图切换

- 顶部双按钮：提交历史、分支。
- 默认 `contextView = "history"`。
- 切换仅影响右侧显示，不改变主工作区标签。
- 每次选择仓库时重置为提交历史。
- 历史范围默认 `all`，也可只看 `current`。
- 提交历史最多请求 100 条。
- 后端用 `git log --topo-order` 返回结构化行（`hash` / `parents` / `%D` 装饰），不再返回 ASCII 图线。
- 前端 `buildHistoryGraph()` 按拓扑序分配泳道、`historyGraphSvg()` 绘制多色 SVG 轨道；`renderHistoryDecorations()` 解析 `%D` 并写入 `data-ref*`。

## 提交历史分支标签右键菜单

- 只有分支/标签徽标右键 → `openRefMenu()`；首项 `switch-ref` 高亮，调用 `performRepoAction(..., "checkoutRef", { ref })`。右键历史行其它位置不弹自定义菜单。
- 差异类动作走 `GET /api/repositories/:id/commit?hash=&compare=`，在 `.modal-wide` 里用 `pre.commit-patch` 展示。
- `showContextMenu()` 用实测 `offsetWidth` / `offsetHeight` 钳制位置；宽菜单 `max-height` 限制后可内部滚动。
- 页面滚动、窗口缩放、Escape、点击菜单外都会经 `hideContextMenu()` 关闭；菜单自身的滚动事件因 `elements.contextMenu.contains(event.target)` 守卫不会误关。
- 改写仓库/远端的动作统一经 `showConfirm()`。

## 分支整行选择

- 非当前分支行带 `data-branch-row`。
- 点击行调用 `toggleBranchSelection()`。
- 勾选框、行背景和计数同步更新。
- 行内“切换 / 合并 / 删除”按钮先处理自身动作，不触发行选择。

## 可拖拽面板

`initializeResizers()` 绑定指针和键盘行为。

| 分隔条 | 默认宽度 |
| --- | --- |
| 仓库侧栏 | 桌面 268 px；1280 以下 242 px |
| 文件目录树 | 桌面 250 px；1280 以下 220 px |
| 上下文面板 | 桌面 330 px；1280 以下 298 px |

行为：

- 拖动更新 CSS 变量；
- 松开后保存宽度；
- 双击清除覆盖值；
- 方向键每次移动 16 px；
- 窄屏自动隐藏。

## 响应式规则

- 大于 1080 px：三列工作台。
- 820–1080 px：上下文面板移到主区域下方，上下文分隔条隐藏。
- 820 px 及以下：单列堆叠，所有分隔条隐藏。
- 长 Diff 行保持横向滚动。

## 交互安全

- 按 Escape 关闭弹窗。
- 主弹窗关闭时同时关闭嵌套目录选择器。
- 编辑器有未保存内容时阻止或确认切换。
- 破坏性操作使用危险样式和明确确认文案。
- Toast 只显示短消息，详细 Git 输出以接口结果为准。

## 状态颜色

- `added`：绿色
- `deleted`：红色
- `modified`：蓝色
- `conflict`：深红
- `renamed`/`copied`：沿用蓝色

这些颜色用于目录树和预览工具栏中的文件状态徽标。
