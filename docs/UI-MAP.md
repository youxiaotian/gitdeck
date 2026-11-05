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
| 右侧提交历史 | `#contextHistorySection`、`#contextCommitHistory` |
| 历史范围切换 | `[data-history-scope="current|all"]` |
| 分支删除弹窗 | `[data-modal-action="delete-branches"]`、`#forceDeleteBranches` |
| 分栏拖动 | `[data-resizer="sidebar|filetree|context"]` |
| 主弹窗 | `#modalBackdrop`、`#modalPanel` |
| 目录选择器 | `#directoryPickerBackdrop` |
| 右键菜单 | `#contextMenu` |
| 提示 | `#toastRegion` |

目录选择器列表滚动期间保持轻量：`hideContextMenu()` 在菜单已隐藏时不再写 `hidden` 属性，`window` 的滚动监听使用 `passive`，自动刷新定时器在 `#directoryPickerBackdrop` 可见时跳过整页 `render()`；样式上 `.directory-list` 使用 `contain: layout paint` 与 `overscroll-behavior: contain`，`.directory-backdrop` 不使用全屏 `backdrop-filter`。

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

新增按钮优先接入该事件体系，除非它需要独立持久状态或特殊键盘行为。

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
- 后端保留 `git log --graph` 的图线前缀。
- 前端按字符列绘制多色轨道，并显示 `%D` 分支装饰。

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
