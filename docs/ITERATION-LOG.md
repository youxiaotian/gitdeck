# 迭代日志

本文件记录已经实现且用户可感知的迭代。新记录放在顶部；复杂功能可以在 `docs/features/` 下新增详细记录。

## 模板

```markdown
## YYYY-MM-DD - 简短标题

- 目标：
- 改动：
- 数据/API 影响：
- 验证：
- 已知限制：
```

## 2026-11-04 - 提交历史改为 TortoiseGit 风格 SVG 泳道图

- 目标：原 `git log --graph` ASCII 字符直接排版导致图线错位、观感差；改为 TortoiseGit 风格的彩色泳道图。
- 改动：
  - 服务端 `getCommitHistory()` 去掉 `--graph`，`--pretty` 增加完整哈希 `%H` 与父提交 `%P`；`parseGraphHistory()` 重写为 `parseCommitHistory()`，返回结构化行（含 `parents`），不再返回 ASCII 图线与 `maxGraphWidth`；
  - 前端新增 `buildHistoryGraph()` 泳道分配算法（拓扑序维护泳道数组，处理分支新建、合并汇入、同哈希多泳道、泳道压缩位移、根提交终止）与 `historyGraphSvg()` SVG 绘制（彩色竖线 + 贝塞尔合并弧线 + 描边圆点，8 色调色板）；
  - 删除 `renderHistoryGraph()` ASCII 渲染、connector 行及对应 CSS（`graph-char` 等）。
- 数据/API 影响：`/history` 行结构变化（`type`/`graph`/`maxGraphWidth` 移除，新增 `hash`/`parents`）。
- 验证：构造多分支多合并演示仓库，无头 Chrome CDP 实测截图——泳道跨行连续对齐、合并弧线正确汇入、零 console error；`node --test` 通过（git-utils 断言更新为 parents 解析）。

## 2026-11-04 - 修复窗口每次打开过窄的问题

- 目标：窗口每次打开都很窄，需要手动拖大才能看到右侧分支面板。
- 根因：Chrome 在已有实例运行时会忽略 `--window-size` 参数；且页面加载时立即上报实际尺寸，把存档的好尺寸覆盖成被忽略参数后的小窗口，形成恶性循环。
- 改动：
  - `public/index.html` 内联脚本：加载后读取 `GET /api/window` 存档并 `window.resizeTo()` 恢复尺寸；应用预设期间的 resize 事件不上报（防覆盖存档，也防窗口外框差值导致的逐次缩小漂移），仅用户手动调整时保存；
  - `src/desktop.js`：默认尺寸 1440×900 → 1680×1000，下限 640×480 → 1200×800。
- 数据/API 影响：无新接口。
- 验证：无头 Chrome CDP 检查页面加载零 console error、`/api/window` GET 正常发起；`node --check` 通过。

## 2026-11-04 - 分支列表按提交时间倒序

- 目标：分支面板原按名称字母序返回，时间列看起来乱序；改为最新提交的分支排在最前。
- 改动：`src/git-summary.js` 仓库详情的 `git branch` 命令增加 `--sort=-committerdate`。
- 数据/API 影响：无（`detail.branches` 数组顺序变为时间倒序）。
- 验证：临时多分支仓库对比实测（默认字母序 vs 时间倒序）；`node --test tests/project-files.test.js tests/git-utils.test.js` 全部通过，含新增的排序断言。

## 2026-11-04 - 应用图标与开始菜单/桌面快捷方式

- 目标：让 GitDeck 像应用一样可快捷启动、可固定任务栏，并有高辨识度专属图标。
- 改动：
  - 新增 `tools/make-icon.js`：零依赖手写 PNG 编码（zlib + CRC32）+ ICO 容器，SDF 数学绘制抗锯齿图形；主题与 `styles.css` 设计 token 同源（深绿底 + 绿色分支图 + 米白分支节点）；
  - 生成 `assets/gitdeck.ico`（16/24/32/48/64/128/256 共 7 档）与 `public/favicon.png`；
  - 新增 `tools/install-shortcut.js`：通过 PowerShell WScript.Shell COM 在开始菜单与桌面创建 `GitDeck.lnk`（图标指向 `assets/gitdeck.ico`）；
  - 新增 `tools/gitdeck-launch.vbs`：静默启动器，运行 `start.cmd` 无控制台闪烁；
  - `src/static.js` fileMap 增加 `/favicon.png`、`/favicon.ico`；`src/config.js` MIME 增加 `.png`、`.ico`；
  - `public/index.html` 增加 `<link rel="icon">`。
- 数据/API 影响：无（纯静态资源与桌面集成）。
- 验证：
  - `start.cmd` 静默链路实测：`/api/ping` 200、`/favicon.ico` 与 `/favicon.png` 200（4265 字节）、首页 200；
  - 快捷方式实际写入开始菜单 `Programs` 与桌面；
  - ICO 头/目录/内嵌 PNG 签名逐项校验通过。
- 已知限制：Windows 不允许编程固定到任务栏，需在开始菜单右键 GitDeck → 固定到任务栏（仅一次）；运行中的 `--app` 窗口任务栏图标来自 favicon，从任务栏直接固定 Chrome 窗口会带 Chrome 标识，建议从开始菜单的 GitDeck 快捷方式固定。

## 2026-11-03 - 桌面壳 A（app 模式独立窗口）

- 目标：脱离浏览器标签页，以独立桌面窗口形态运行。
- 改动：
  - 新增 `src/desktop.js`：探测 Chrome/Edge，以 `--app` 模式拉起无地址栏独立窗口；
  - `server.js` 在 `GITDECK_DESKTOP=1` 时固定端口、单实例探测（已存在实例则只开窗口并退出）、启动心跳看门狗；
  - 新增 `GET /api/ping`（公开，单实例探测）、`POST /api/heartbeat`、`GET/POST /api/window`；
  - `index.html` 增加内联心跳与窗口尺寸上报脚本，每 5 秒一次心跳；
  - 窗口尺寸持久化到 `data/window.json`，下次启动按上次尺寸打开；
  - `start.cmd` 改为桌面模式，通过 PowerShell `Start-Process -WindowStyle Hidden` 隐藏控制台。
- 数据/API 影响：
  - 新增 3 个 API（ping/heartbeat/window）；
  - `data/window.json` 为运行时数据，已忽略。
- 验证：
  - `node --check` 全部通过；
  - 桌面模式冒烟：ping 公开返回 200，单实例第二次启动 exit 0，心跳 200，窗口尺寸 GET/POST 正确并落盘，无 token 心跳 403；
  - `tests/project-files.test.js` 3/3 通过。
- 已知限制：
  - 任务栏图标仍是 Chrome/Edge（后续 PWA manifest 可换成自有图标）；
  - 桌面模式下端口被非 GitDeck 程序占用时报错退出，不自增端口。

## 2026-11-03 - 服务端模块拆分与数据模型 v3

- 目标：为后续桌面化和体验打磨打基础，降低单文件巨石的迭代成本。
- 改动：
  - 把 1999 行的 `server.js` 拆成薄入口 + 13 个 `src/` 模块（config/http/static/routes/workspace/git-summary/git-actions/paths/directories/process/locks/shell/repository-store/git-utils），每个模块加 `@module` 头注释；
  - 新增 `docs/MAP.md` 作为"需求 → 文件 → 符号"单一速查表，`AGENTS.md` 精简并指向它；
  - `docs/CODE-MAP.md` 改为指向 `MAP.md` 的入口，避免双份符号表漂移；
  - `tools/check-docs.js` 把 `docs/MAP.md` 加入必需文档清单；
  - 数据模型升级到版本 3，仓库增加显式 `order` 字段；`loadState()` 自动迁移 v2 并按 `(workspaceIndex, order)` 排序；`reorderRepositories` 改为只更新 `order`，不再重排顶层数组；
  - `tests/project-files.test.js` 的 TortoiseGit 断言随代码迁移到 `src/shell.js`。
- 数据/API 影响：
  - `repositories.json` 版本 2 → 3，迁移可重复执行；
  - API 行为不变，`bootstrap` 返回顺序仍按工作区显示顺序。
- 验证：
  - 全部模块 `node --check` 通过；
  - 用临时数据目录跑 read/write 回归：bootstrap、status、detail、history、diff、file、stageFile、unstageAll、createWorkspace、reorder、discover、directories、404、403 全部符合预期；
  - v2→v3 迁移在真实数据副本上验证：9 个仓库全部获得连续 `order`，版本写入 3；
  - `tests/project-files.test.js` + `tests/git-utils.test.js` 共 8/8 通过。

## 2026-11-03 - 仓库拖拽排序与会话自动恢复

- 目标：允许自定义仓库顺序，并修复服务重启后的旧令牌错误。
- 改动：
  - 仓库行支持原生拖拽排序；
  - 排序写入 `repositories.json` 的仓库相对顺序；
  - 新增 `/api/repositories/reorder`；
  - 拖拽后抑制误点击；
  - 右键菜单移除失效的“打开终端”和“打开目录”；
  - API 返回 403 时自动刷新页面获取新会话令牌。
- 验证：
  - 排序接口测试验证顺序保存；
  - 浏览器拖拽和刷新后顺序保留；
  - 令牌失效自动刷新只执行一次，避免循环。

## 2026-11-03 - 分支整行选择

- 目标：减少必须精确点击复选框的操作成本。
- 改动：
  - 非当前分支行支持点击整行勾选；
  - 选中行显示绿色背景和左侧标记；
  - 行内切换、合并、删除按钮保持独立动作；
  - 复选框、行样式和批量计数同步更新。
- 验证：
  - 点击分支名称后复选框变为已选，整行高亮；
  - 点击删除按钮打开弹窗，选择计数保持为 1。

## 2026-11-03 - 修复未合并分支删除提示

- 目标：解释并处理 `branch is not fully merged`。
- 改动：
  - 错误标题改为“分支删除失败”；
  - 避免动作失败时重复弹出两条错误；
  - 删除弹窗增加显式“强制删除未合并分支（-D）”选项，默认关闭；
  - 后端支持每分支 `forceDelete`。
- 验证：
  - 未合并分支安全删除失败；
  - 勾选强制删除后 `-D` 成功；
  - 其他分支删除与远端清理测试保持通过。

## 2026-11-03 - 分支时间显示年份

- 目标：避免跨年分支时间无法判断年份。
- 改动：分支最近提交时间改为 `YYYY/MM/DD HH:mm`。
- 验证：浏览器显示格式检查。

## 2026-11-03 - 多分支提交树

- 目标：右侧历史同时展示多分支，并支持范围切换。
- 改动：
  - 新增历史接口 `GET /api/repositories/:id/history`；
  - 后端保留 `git log --graph` 的图线、连接线和 `%D` 装饰；
  - 前端绘制 6 色轨道；
  - 支持“当前分支 / 所有分支”，默认所有分支；
  - 分支、远端和标签显示为不同颜色徽标。
- 验证：
  - 所有分支模式显示 100 个提交、35 条连接线和 21 个装饰；
  - 当前分支模式无连接线，仅单分支历史；
  - 刷新后仍默认所有分支。

## 2026-11-03 - 右侧提交历史视图

- 目标：在右侧直接查看当前仓库提交历史。
- 改动：
  - 增加“提交历史 / 分支”双视图切换；
  - 默认显示提交历史；
  - 历史项显示图谱点、主题、短哈希、作者和相对时间；
  - 选择仓库时重置为提交历史。
- 验证：
  - 默认历史显示 50 条；
  - 切换分支和历史均正常；
  - 刷新后重新默认提交历史。

## 2026-11-03 - 打开 TortoiseGit 日志界面

- 目标：从仓库工具栏直接打开 TortoiseGit。
- 改动：
  - 增加 `TortoiseGit` 按钮；
  - 新增 `openTortoiseGit` 动作；
  - 自动查找 `TortoiseGitProc.exe`，避免误用 TortoiseSVN；
  - 使用当前仓库路径运行 `/command:log`。
- 验证：
  - API 动作返回成功；
  - 直接验证可打开 `Log Messages - TortoiseGit` 窗口；
  - 浏览器截图确认按钮位于终端和抓取之间。

## 2026-11-03 - 变更文件双视图切换

- 目标：在深层目录结构和平铺文件列表之间快速切换。
- 改动：
  - 文件面板增加单按钮双态切换；
  - 文件夹视图保留层级展开；
  - 平铺视图显示完整相对路径；
  - 两种视图共用筛选、勾选、预览和批量操作；
  - 使用 `gitdeck.fileTreeMode` 记住上次视图。
- 验证：
  - 临时仓库验证文件夹视图 3 层目录；
  - 平铺视图显示 2 个完整路径文件；
  - 刷新后仍保持平铺视图。

## 2026-10-30 - 修复 start.cmd 无法双击启动

- 目标：让项目脱离 Codex 会话独立运行。
- 改动：
  - 定位 `start.cmd` 为 LF 换行，导致 `cmd.exe` 把命令截坏；
  - 改为标准 CRLF；
  - 增加 `.gitattributes`，固定批处理文件使用 CRLF；
  - 增加 Node.js 常见安装路径兜底；
  - 启动失败时保留窗口并显示退出码。
- 验证：
  - 使用 `cmd.exe /c call start.cmd` 实际启动；
  - 浏览器地址返回 HTTP 200。

## 2026-10-27 - 工作区维护、自定义下拉和选中提交

- 目标：完善多仓库分组和日常提交流程。
- 改动：
  - 数据结构升级为版本 2，并自动迁移旧仓库；
  - 新增自定义工作区下拉菜单；
  - 支持新建、重命名、删除工作区；
  - 支持向当前工作区添加仓库、跨工作区移动；
  - 支持从工作区单个或批量移除仓库，不删除物理目录；
  - 工作区添加按钮改为全宽显式按钮；
  - 新增选中文件暂存和 `git commit --only` 选中提交；
  - 文件状态颜色调整为新增绿、删除红、修改蓝。
- 数据/API 影响：
  - `repositories.json` 增加 `workspaces`；
  - 新增工作区 CRUD、仓库移动和批量移除接口；
  - 新增 `stageFiles`、`commitSelected` 动作。
- 验证：
  - 真实浏览器创建、切换、添加和移出工作区；
  - 勾选两个文件提交后，第三个文件仍保持未提交；
  - API 测试 `5/5` 通过。

## 2026-10-27 - 分支元数据和批量管理

- 目标：让分支清理更高效。
- 改动：
  - 分支显示最近提交时间和作者；
  - 支持分支名/作者搜索；
  - 支持批量删除本地分支；
  - 可选择删除匹配的远程分支；
  - 同一远端合并为一次 push，部分失败返回警告。
- 验证：
  - 使用本地裸远端测试单分支和批量远程删除；
  - 真实仓库验证搜索和多选。

## 2026-10-26 - 可拖拽分栏

- 目标：允许用户扩展狭窄目录树和长 Diff。
- 改动：
  - 三个竖向分隔条；
  - 指针拖动、方向键调整、双击恢复；
  - 本地存储保存宽度；
  - 窄屏自动隐藏。
- 验证：
  - 三个分隔条实际拖动；
  - 刷新后宽度保留；
  - 390 px 无横向溢出。

## 2026-10-26 - 目录树、内联 Diff 和编辑器

- 目标：减少弹窗操作并允许直接编辑。
- 改动：
  - 变更文件目录树；
  - 点击文件立即显示 Diff；
  - Diff/编辑模式切换；
  - `Ctrl+S` 保存；
  - SHA-256 冲突检测；
  - 保留 LF/CRLF。
- 验证：
  - 临时仓库修改、保存并重新读取 Diff；
  - 真实仓库渲染和控制台检查。

## 2026-10-26 - 批量还原

- 目标：加快大量文件清理。
- 改动：
  - 文件复选框和当前筛选全选；
  - 单次批量还原；
  - 已跟踪文件恢复，未跟踪文件删除。
- 验证：
  - 两个已跟踪文件和一个未跟踪文件一次完成还原。

## 2026-10-26 - 仓库信任和导入修复

- 目标：让真实 Windows 仓库可以被导入。
- 改动：
  - 精确 `safe.directory`；
  - 更明确的 Git 错误；
  - 用内置目录选择器替代 Windows 文件夹对话框；
  - 支持扫描和选择目录。
- 验证：
  - 成功导入 `AgisoCodes`；
  - 复现并修复用户反馈的“不是 Git 仓库”问题。

## 2026-10-26 - GitDeck 初始实现

- 目标：提供免费、本地、类似 TortoiseGit 的多仓库工作台。
- 改动：
  - 零依赖 Node 服务；
  - 仓库导入和扫描；
  - 状态总览；
  - Diff、提交区；
  - 分支和 Stash；
  - 仓库右键菜单和批量远端操作。
- 验证：
  - 真实临时 Git 仓库 API 测试；
  - 首轮桌面和窄屏视觉检查。
