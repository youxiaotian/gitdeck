# AI 工作手册

本文件是根级 `AGENTS.md` 的详细说明，目标是让新的 AI 会话不用从零摸索项目。

## 目标

用尽量少的上下文完成安全、连贯、可验证的改动，并留下后续可查的记录。

## 最小上下文

任何非平凡任务至少阅读：

1. `AGENTS.md`
2. `docs/FEATURES.md`
3. `docs/ARCHITECTURE.md`
4. `docs/TESTING.md`

再按需加载：

- API 改动：`docs/API.md`、`docs/SECURITY.md`
- 数据结构改动：`docs/DATA-MODEL.md`
- UI 改动：`docs/UI-MAP.md`
- 故障排查：`docs/TROUBLESHOOTING.md`

## 项目术语

| 术语 | 含义 |
| --- | --- |
| 工作区 Workspace | 左侧仓库列表中的命名分组 |
| 仓库 Repository | 已注册到 GitDeck 的一个 Git 工作目录 |
| 变更项 Changed entry | 合并已暂存、未暂存、未跟踪状态后的文件 |
| 预览 Preview | 右侧内联 Diff 或编辑器 |
| 选中文件 Selected files | 用于批量暂存、还原或提交的勾选文件 |
| 动作 Action | 服务端白名单中的一个 Git 操作 |
| 上下文面板 Context panel | 右侧分支、Stash、远端区域 |

## 上下文查找命令

```powershell
rg --files -g '!data/**'
rg -n "function render|function request|function perform" public/app.js
rg -n "case \"" server.js
rg -n "url\.pathname" server.js
rg -n "selectedFiles|commitSelected|stageFiles" public/app.js server.js tests
rg -n "workspace|repository" src/repository-store.js docs
```

## 按问题查代码

| 问题 | 查看位置 |
| --- | --- |
| 是否支持某动作 | `runRepositoryAction()` 的 `switch` |
| 请求参数是什么 | `docs/API.md` 和 `app.js` 调用处 |
| UI 状态在哪 | `public/app.js` 顶部的 `state` |
| 弹窗为什么打开 | `handleDocumentClick()` 和对应 `request*` 函数 |
| 样式为什么没生效 | `styles.css` 选择器与渲染时的 class 名 |
| 工作区如何保存 | `src/repository-store.js` |
| Git 状态如何解析 | `src/git-utils.js` |
| 哪些已经验证过 | `tests/` 和 `docs/ITERATION-LOG.md` |

## 常见修改流程

### 1. 新增仓库动作

1. 确认现有动作无法满足需求。
2. 在 `runRepositoryAction()` 中增加动作分支。
3. 在服务端校验路径、分支名和数量限制。
4. 尽量将同类操作合并成一次 Git 调用。
5. 批量操作可能部分失败时返回 `warnings`。
6. 在前端 `actionLabels` 中增加提示文字。
7. 在 `tests/api.test.js` 增加真实仓库测试。
8. 更新 `docs/API.md`、`docs/FEATURES.md` 和迭代日志。

### 2. 新增工作区或仓库字段

1. 修改 `repository-store.js` 的版本 2 结构和迁移逻辑。
2. 为旧数据设置安全默认值。
3. 更新 bootstrap 和前端模型。
4. 更新 `docs/DATA-MODEL.md` 的 JSON 示例和不变量。
5. 同时测试新数据和旧数据迁移。

### 3. 新增文件操作

1. 使用 `validateRepositoryPath()` 校验路径。
2. 拒绝路径逃逸和直接操作 `.git`。
3. 写入前通过真实路径检查符号链接逃逸。
4. 设置文件大小上限。
5. 不得修改未选中的文件。
6. 增加集成测试。

### 4. 新增 UI 操作

1. 使用稳定 ID 或 `data-*` 添加控件。
2. 只有需要跨渲染保留的数据才放入 `state`。
3. 点击事件优先接入 `handleDocumentClick()`。
4. 破坏性操作复用 `showConfirm()`。
5. 仓库动作复用 `performRepoAction()` 以统一刷新和提示。
6. 检查桌面和窄屏布局。
7. 更新 `docs/UI-MAP.md`。

### 5. 修改布局

1. 先检查 `styles.css` 的基础网格和媒体查询。
2. 不要破坏三个分隔条的坐标和命中区域。
3. 至少在 1440、1080、820、390 像素宽度下检查。
4. 确认文字没有重叠或被遮挡。
5. 固定尺寸控件不能因状态文字变化而跳动。
6. 用户要求视觉变化时保留截图。

### 6. 修复用户反馈的 Git 错误

1. 使用用户给出的真实路径复现。
2. 手动执行 GitDeck 使用的同一命令。
3. 检查目录所有权、锁文件、换行符和路径分类。
4. 先修正命令语义，再调整错误文案。
5. 增加回归测试。
6. 环境问题补充到 `docs/TROUBLESHOOTING.md`。

## 验证要求

最低要求：

```powershell
node --check server.js
node --check public/app.js
node --test
node tools/check-docs.js
```

所有写入与验证都在当前 git 目录 `<repo>` 内完成：

- 临时仓库建在 `<repo>/.workbuddy/scratch/`，不访问 `<repo>` 之外的业务仓库；
- 用 `node tools/clean-scratch.js --new <prefix>` 创建，验证后用 `node tools/clean-scratch.js` 清理；
- 操作后用 Git 检查真实状态；
- 清理测试元数据和临时目录，不动 `data/repositories.json`。

UI 交互验证：

- 使用真实浏览器，不能只看静态代码；
- 完成流程后检查控制台无错误；
- 保存最终界面截图。

## 证据标准

代码能编译不等于任务完成。不同改动应提供对应证据：

| 改动 | 证据 |
| --- | --- |
| 解析逻辑 | 单元断言 |
| API/Git 动作 | 真实临时仓库 + Git 状态 |
| 布局 | 桌面与窄屏截图 |
| 弹窗/流程 | 浏览器点击测试和最终状态 |
| 数据迁移 | 旧 JSON 迁移并检查结果 |
| 文档 | 链接检查结果 |

## 安全清理

- 所有临时产物只放在 `.workbuddy/scratch/`，规则见根 `AGENTS.md`。
- 清理统一运行 `node tools/clean-scratch.js`（先加 `--dry-run` 预览）。脚本路径由 `__dirname` 推导，不接受路径参数，只删除沙盒第一层条目，不跟随符号链接，不递归到沙盒之外。
- 不使用 `rm -rf`、通配符批量删除或 `Remove-Item -Recurse` 清理临时产物。
- 绝不清理用户工作区、业务仓库、`data/repositories.json`、`data/server.log` 或 `.workbuddy/memory/`。
- Windows 文件占用可能让测试留下空目录，跑一次清理脚本即可收尾，无需手工递归删除。

## 文档维护约定

行为变化后按以下顺序更新：

1. 代码和测试；
2. 功能地图；
3. 受影响的 API、数据或 UI 文档；
4. 迭代日志；
5. 用户可见摘要变化时再更新根 README。

功能地图和迭代日志不是可选项，它们是后续 AI 高效恢复上下文的主要入口。

## 当前环境注意事项

所有验证都在 `<repo>` 内完成，不访问工作区之外的目录，因此不会触发越界写入或权限确认。若仍遇到 `index.lock` 或写入失败，检查是否有其他 Git 进程占用，不要为了通过验证而放宽安全设置、修改仓库 ACL 或关闭 Git 安全目录检查。
