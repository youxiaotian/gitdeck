# 开发指南

## 环境要求

- Windows 10/11
- Node.js 18+
- `git` 已加入 `PATH`
- 无 npm 运行依赖

## 本地运行

```powershell
node server.js
```

也可以双击 `start.cmd`。

默认会自动打开浏览器；设置 `GITDECK_NO_OPEN=1` 可关闭。

`start.cmd` 必须保持 CRLF 换行。仓库通过 `.gitattributes` 固定了
`*.cmd text eol=crlf`，不要用会强制 LF 的编辑器保存它。

独立运行方式（在项目根目录 `<repo>` 下执行）：

1. 双击当前目录下的 `.\start.cmd`；
2. 保持弹出的命令行窗口开启；
3. 浏览器会自动打开；
4. 关闭命令行窗口或按 `Ctrl+C` 停止服务。

如果端口被占用，控制台会显示实际地址；默认从 `4321` 开始尝试。

## 环境变量

| 变量 | 作用 |
| --- | --- |
| `PORT` | 首次尝试端口，默认 `4321` |
| `GITDECK_DATA_DIR` | 覆盖运行数据目录 |
| `GITDECK_NO_OPEN` | `1` 表示不自动打开浏览器 |
| `NODE_ENV` | `production` 时隐藏 500 内部错误细节 |

## 常用命令

```powershell
node --check server.js
node --check public/app.js
node --test
node tools/check-docs.js
```

## 编码约定

### 服务端

- 使用 CommonJS。
- API 路由默认保留在 `server.js`，只有明确复用时才拆模块。
- 使用 `spawn()` 参数数组，禁止 shell 命令字符串。
- 普通 Git 操作使用 `runGit()`。
- 需要返回操作摘要时使用 `gitAction()`。
- JSON 响应使用 `sendJson()`。
- 用户可读错误使用 `httpError(status, message)`。
- 同一仓库的修改动作必须放在 `runRepositoryAction()` 的锁范围内。

### 前端

- 使用原生 JavaScript，不引入框架。
- 新控件优先接入 `data-*` 事件委托。
- 动态 HTML 必须经过 `escapeHtml()`，或直接构建 DOM 节点。
- 永久 DOM 节点缓存在 `elements` 中。
- 功能状态加入 `state` 顶部对象。
- 在适当时保留输入草稿、当前工作区和分隔条宽度。
- 按钮文案要简洁；只有含义明确时才使用纯图标。

### CSS

- 复用 `:root` 中的 CSS 变量。
- 面板圆角不超过 8 px。
- 采用紧凑的操作型界面，不使用营销式大卡片布局。
- 图标按钮、状态徽标和分隔条保持固定尺寸。
- 状态色语义：
  - 绿色：新增/未跟踪；
  - 红色：删除/破坏性；
  - 蓝色：修改/重命名。

## 新增仓库动作

1. 在 `runRepositoryAction()` 的 `switch` 中增加动作。
2. 在服务端构造 Git 参数，校验路径和分支名。
3. 返回用户可读的 `output`。
4. 可能部分成功时返回 `warnings`。
5. 在前端 `actionLabels` 中增加文案。
6. 通过 `performRepoAction()` 调用。
7. 破坏性操作必须确认。
8. 扩展 `tests/api.test.js`。
9. 更新 `docs/API.md` 和 `docs/FEATURES.md`。

## 新增非动作接口

1. 在 `handleApi()` 中、通用仓库路由之前添加路由。
2. 所有接口自动受令牌校验保护。
3. 校验输入并限制大小。
4. 返回结构化 JSON。
5. 增加 API 测试和文档。

## 新增工作区或仓库操作

1. 通过 `STORE.loadState()` 读取状态。
2. 禁止对仓库目录使用 `fs.rm()`。
3. 修改仓库元数据或工作区归属。
4. 通过 `STORE.saveState()` 保存。
5. 同步前端状态并重新渲染。
6. 数据结构变化必须验证旧数据迁移。

## 新增 UI 功能

1. 找到最接近的渲染函数。
2. 添加稳定 DOM ID 或 `data-*` 属性。
3. 在 `app.js` 顶部增加所需状态。
4. 接入事件委托。
5. 只有确有价值时才增加快捷键。
6. 补充响应式样式。
7. 检查桌面和窄屏。
8. 更新 `docs/UI-MAP.md` 和 `docs/FEATURES.md`。

## 目录边界（一律在当前 git 目录内）

所有开发、测试、浏览器验证和清理都在 `<repo>` 内完成，不引用任何机器专属的固定目录。GitDeck 产品可以管理 `<repo>` 之外的用户仓库，但那是产品功能，不是开发者与 AI 的工作目录。

- 临时仓库、Chrome profile、截图、探针脚本一律放 `<repo>/.workbuddy/scratch/`。
- 用 `node tools/clean-scratch.js --new <prefix>` 创建，用 `node tools/clean-scratch.js` 清理，禁止 `rm -rf` 与通配符批量删除。
- 不要通过修改仓库 ACL 或全局关闭 Git 安全目录检查来绕过沙箱限制。

## 开发中的数据安全

- 能用 `<repo>/.workbuddy/scratch/` 里的临时仓库测试时，不要直接编辑 `data/repositories.json` 伪造数据。
- 临时目录已被 `.gitignore` 忽略，不要在项目根另建临时目录。
- 浏览器自动化结束后用 `node tools/clean-scratch.js` 清理测试元数据、仓库和目录。
- 不得影响用户现有工作区和业务仓库。

## 代码职责表

| 关注点 | 位置 |
| --- | --- |
| HTTP 路由 | `handleApi()` |
| Git 动作 | `runRepositoryAction()` 及动作辅助函数 |
| Git 进程执行 | `runProcess()`、`runGit()`、`gitAction()` |
| 持久化结构 | `src/repository-store.js` |
| Git 输出解析 | `src/git-utils.js` |
| UI 状态和交互 | `public/app.js` |
| 页面结构 | `public/index.html` |
| 视觉样式 | `public/styles.css` |
| 验收测试 | `tests/` |
