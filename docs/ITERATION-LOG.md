# 迭代日志

本文件记录已经实现且用户可感知的迭代。新记录放在顶部；复杂功能可以在 `docs/features/` 下新增详细记录。

## 2026-11-06 - 修正 .sln 过滤：与 Git 无关，直接扫描目录

- 目标：用户反馈开启 `.sln` 按钮后列表为空——原实现只在 Git 变更条目里筛 `.sln`，已提交/未改动的文件不显示。
- 根因：`.sln` 过滤与 Git 状态耦合。
- 改动：按钮开启后改为调 `GET /api/repositories/:id/solutions`（后端 `directories.listSolutions()` 递归扫描仓库目录、跳过 `.git`、返回相对路径），前端 `fetchSolutions()` → `renderSolutionView()` 直接展示目录下所有 `.sln`，不再受状态筛选约束；隐藏状态筛选条与批量暂存勾选（`changesView` 切 `solution-mode` 类）；点击/双击 `.sln` 解析走 `resolveFileEntry()`，不依赖 Git 状态；预览区仅显示「用 Visual Studio 打开」。
- 数据/API 影响：新增仓库子路由 `solutions`；`openVisualStudio` 动作不变。
- 验证：`node --test` 25/25（含 `listSolutions` 真实扫描单测，证明跳过 `.git`、含子目录、排除非 `.sln`），`node tools/check-docs.js` 通过，服务冒烟首页/app.js 200、`solutions` 路由无 token 返 403。
- 已知限制：扫描带深度(8)/文件数(2万)/解数量(500)上限；非 Windows 或未装 VS 时打开动作返回明确错误。

## 模板

```markdown
## YYYY-MM-DD - 简短标题

- 目标：
- 改动：
- 数据/API 影响：
- 验证：
- 已知限制：
```

## 2026-11-06 - 文件列表支持 .sln 过滤并双击用 Visual Studio 打开

- 目标：在变更文件列表（目录树/平铺）提供 `.sln` 过滤按钮，点一下只显示仓库内解决方案文件；双击 `.sln` 或预览区「用 Visual Studio 打开」直接用 VS 打开项目。
- 改动：
  - 前端 `index.html` 在文件列表工具区新增 `.sln` 过滤按钮（`data-action="toggle-solution-filter"`）；`app.js` 增加 `solutionFilter` 状态、`getVisibleEntries()` 统一筛选（状态筛选与 `.sln` 后缀叠加）、`isSolutionFile()`、`openInVisualStudio()`，`elements.fileGroups` 绑定 `dblclick` 只在 `.sln` 上触发，预览区对 `.sln` 额外渲染「用 Visual Studio 打开」按钮。
  - 后端 `shell.openVisualStudio()` 用 `vswhere.exe` 定位 `devenv.exe`（回退 2022/2019 的 Community/Professional/Enterprise 目录），`git-actions` 登记 `openVisualStudio` 动作并经 `validateRepositoryPath` 校验路径在仓库内，禁止越界。
- 数据/API 影响：新增仓库动作 `openVisualStudio`（仅 Windows），无数据模型变化。
- 验证：`node --test` 通过；新增 `tests/project-files.test.js` 特性断言（按钮、筛选、双击、后端动作与路径校验、样式）；`node --check` 通过；手动 UI 验证前端改动 F5 生效、后端改动需重启 GitDeck。
- 已知限制：仅 Windows 支持；未安装 Visual Studio 时给出「未找到 devenv.exe」提示。

## 2026-11-05 - 修复沙盒脚本在全新 clone 下不可用

- 根因：`.workbuddy/` 被 `.gitignore` 忽略，clone 后该目录不存在；`tools/clean-scratch.js` 的 `assertBoundary()` 无条件对 `<repo>/.workbuddy` 执行 `realpathSync()`，直接抛 ENOENT，导致 `--new` / `--dry-run` / 清理全部不可用。
- 修复：边界校验前用 `fs.mkdirSync(workbuddy, { recursive: true })` 建好目录再做真实路径比对；符号链接指向外部仍会被 `samePath()` 拦下，安全边界不变。
- 验证：在 `<repo>/.workbuddy/scratch/` 内复制脚本模拟无 `.workbuddy` 的干净 clone，`--new` → `--dry-run` → 清理全部成功；当前环境回归、`node --test` 23/23、`node tools/check-docs.js` 通过，探针目录已由清理脚本收净。
- 数据/API 影响：无。

## 2026-11-05 - 文档路径统一为 `<repo>` 相对基准

- 目标：清除文档里所有机器专属固定目录，把开发、测试、验证、清理的目录全部收敛到当前 git 目录内，避免照文档跑到工作区外触发权限确认。
- 改动：
  - 根 `AGENTS.md`、`docs/README.md`、根 `README.md`、`docs/API.md` 定义 `<repo>` = 当前 Git 仓库根目录，所有 `./`、`data/`、`.workbuddy/scratch/`、`tools/`、`tests/` 相对它解析。
  - 操作指令去掉盘符：`docs/DEVELOPMENT.md` 的启动方式改为双击 `.\start.cmd`；`docs/TROUBLESHOOTING.md` 的日志读取改为 `Get-Content .\data\server.log`、CRLF 修复脚本改为相对路径；Node / TortoiseGit 安装位置改用系统环境变量表达。
  - 示例数据去固定路径：`docs/API.md`（4 处）与 `docs/DATA-MODEL.md`（1 处）里的仓库路径、扫描根目录、目录浏览路径统一写成 `<repo>/.workbuddy/scratch/...` 占位，并说明真实运行时展开为绝对路径。
  - 删掉所有「到当前工作区之外验证」的措辞：`AGENTS.md`、`docs/AGENT-GUIDE.md`、`docs/DEVELOPMENT.md`、`docs/TESTING.md`、`docs/TROUBLESHOOTING.md` 明确验证一律在 `<repo>/.workbuddy/scratch/` 内；历史描述也去掉固定盘符。
- 数据/API 影响：无产品代码、接口或数据结构变化；`<repo>` 仅用于文档示例，运行时仍按 `docs/SECURITY.md` 校验真实路径。
- 验证：`node tools/check-docs.js` 通过；交付文档复扫无盘符路径、无越界操作指令；`node --test` 23/23。
- 已知限制：产品 UI 里的仓库路径输入占位符、Windows 路径解析单测里的假路径，都是给用户看或纯字符串断言，不是工作目录，保留。

## 2026-11-05 - 建立 AI 临时产物沙盒，减少权限确认打断

- 目标：把 AI 工作产生的测试仓库、探针脚本、截图等临时产物收拢到工作区内的单一目录，清理时不再反复触发授权确认，且不需要开启「允许完全访问」。
- 根因：默认权限按「路径 + 操作类型 + 命令」三重判定。`docs/TESTING.md` 与 `docs/AGENT-GUIDE.md` 原约定把测试仓库放在 `<repo>` 之外的父目录，清理又用递归通配；项目根还散落 `.tmp-*` / `.ui-*` / `.chrome-*`。当前 `settings.json` 中工作区 `.` 的读/写/删本来就是 allow，真正挡路的是越界与高危动作。
- 改动：
  - 新增 `.workbuddy/scratch/` 作为唯一临时目录（已被 `.gitignore` 忽略）。
  - 新增 `tools/clean-scratch.js`：路径由 `__dirname` 推导、不接受路径参数；`--new` 建唯一目录、`--dry-run` 预览、`--older-than` / `--keep`；只删除沙盒第一层条目，跳过符号链接与 `.gitkeep`，用 `fs.rm` 带重试删除。注册为 `npm run clean:scratch`。
  - `tests/api.test.js` 的 fixture 从项目根 `.tmp-api-test-*` 和系统 `os.tmpdir()` 改到沙盒内。
  - 根 `AGENTS.md`、`docs/TESTING.md`、`docs/AGENT-GUIDE.md` 同步新约定，明确 `data/`、`.workbuddy/memory/` 永不清理；workspace `MEMORY.md` 记录长期约定。
- 数据/API 影响：无产品代码、接口或数据结构变化。
- 验证：沙盒内创建 → `--dry-run` → 清理 → `.gitkeep` 保留、`data/` 未动，全程无授权弹窗；`node --test` 23/23 通过；`node tools/check-docs.js` 通过；测试后残留的 `api-test-*` 目录用清理脚本一次收净。
- 已知限制：清理命令本身仍属于「执行脚本命令」，若命令安全规则未放行仍需确认一次；可在安全中心把 `npm run clean:scratch` 加入命令白名单，或首次弹窗时选「不再询问」。灾难性命令（如 `rm -rf /`）在任何模式下都会强制确认。

## 2026-11-05 - 目录选择器支持多选，一次添加多个仓库

- 目标：在「添加 Git 仓库 → 选择目录」里勾选多个仓库目录，一次性加入当前工作区；扫描目录的目录选择仍保持单选。
- 改动：
  - `state.directoryMultiple` / `directorySelected`（`Set`）：选择集跨目录保留，打开/关闭选择器时重置，`renderDirectoryPicker()` 回填 `checked`。
  - 目录行从单个 `<button>` 改为 `.directory-row` 容器 + 独立复选框 + `.directory-row-open` 进入按钮；只有 `isRepository` 行可勾选，普通目录禁用并提示可进入后继续选择。
  - 新增选择条：已选计数、「全选 Git 仓库」、「加入当前目录」（当前目录本身是仓库时）、「清空」；底部主按钮显示「添加 N 个仓库」，同时保留「选择当前目录」走原输入框流程。
  - `addSelectedDirectories()` 复用 `POST /api/repositories` 串行落盘，单次上限 50 个；部分失败时成功项入库、失败项留在选择集，可修好后直接重试。
  - 勾选/全选/清空只做增量 DOM 更新（计数、按钮文案、行 `class`），不重建 `.directory-list`，保留上一轮的滚动性能修复。
- 数据/API 影响：无新增接口，数据结构不变；只向当前工作区新增仓库条目与 `orders`。
- 验证：CDP 真实点击 16/16 通过——多选渲染、仅 Git 仓库可勾选、计数与按钮实时更新、清空/全选、跨目录保留与回填、一次落盘 4 个仓库且排序连续、前端无需刷新即显示、扫描目录保持单选、零 console error；截图确认复选框/选择条/底部按钮排版正常；`MutationObserver` 确认勾选仅 2 次 DOM 写入且列表节点未重建。`tests/project-files.test.js` 新增源码回归断言。
- 已知限制：一次最多 50 个；目录列表本身仍受 `/api/directories/list` 的 500 条上限约束。

## 2026-11-05 - 修复添加仓库时目录选择器滚动卡顿

- 根因（真实浏览器滚轮 + DevTools 探针确认）：`window` 上捕获阶段的 `scroll` 监听每帧调用 `hideContextMenu()`，无条件写 `elements.contextMenu.hidden = true`；实测 40 次滚动事件对应 40 次 `hidden` 属性写入，反复触发样式失效。叠加全屏 `backdrop-filter: blur(2px)` 遮罩、滚动链穿透、以及每 20 秒一次 `refreshAllSummaries()` → `render()` 整页重绘，滚轮明显不跟手。
- 修复：
  - `hideContextMenu()` 在菜单已隐藏时跳过 DOM 写入；滚动监听改为 `{ capture: true, passive: true }` 且只在菜单可见时处理。
  - `.directory-backdrop` 去掉 `backdrop-filter`（深色半透明遮罩视觉几乎无变化）；`.directory-list` 增加 `contain: layout paint` 与 `overscroll-behavior: contain`。
  - 目录选择器打开时跳过定时自动刷新，关闭后自动恢复，避免滚动过程中后台重建整页 DOM。
- 数据/API 影响：无。
- 验证：真实浏览器合成滚轮事件复现「40 次滚动 / 40 次 hidden 写入」，修复后归零；右键菜单在可见状态下滚动仍会关闭；加速定时器验证打开时 0 次状态请求、关闭后恢复；截图确认弹窗与滚动条外观正常。`tests/project-files.test.js` 新增源码回归断言，全量 `node --test` 与 `check-docs` 通过。
- 已知限制：无头/虚拟显示环境会把 rAF 限速到约 10ms，无法量化 GPU 合成层的帧率差异；全屏模糊的开销按已知渲染陷阱移除，真机流畅度需用户实际滚动确认。

## 2026-11-04 - 修复桌面服务偶发自己退出（刷新报 ERR_CONNECTION_REFUSED）

- 根因：桌面壳用「30 秒收不到前端心跳就 `process.exit(0)`」判断窗口关闭。Chrome 后台节流/冻结、系统睡眠、页面卡顿都会让 `setInterval` 心跳停摆但窗口仍在，服务被误杀；`start.cmd` 隐藏窗口启动，stdout 全丢，连退出原因都查不到。真实复现：桌面模式服务启动后无心跳，30 秒打印「桌面窗口已关闭，GitDeck 退出。」并 exit 0。
- 修复：
  - **默认服务常驻**，不再因心跳中断自动退出；需要关窗退出时显式设 `GITDECK_HEARTBEAT=1`。
  - 看门狗改为可注入时钟的 `createHeartbeatWatchdog()`：120s 超时 + 15s 确认窗口 + 挂起感知（tick 间隔远超周期即判定睡眠/卡顿并重置计时），不会因墙钟跳变误判。
  - 前端在 `visibilitychange` / `pageshow` / `focus` / `online` 时补发心跳；任何通过令牌校验的 API 请求也会刷新心跳。
  - 新增 `src/logger.js`：console 输出同步落到 `data/server.log`；`server.js` 注册 `uncaughtException` / `unhandledRejection` 兜底（记录堆栈并继续服务）；所有拉起浏览器的 `spawn` 补 `error` 监听，避免未捕获异常直接终止进程。
- 数据/API 影响：无数据结构变化；`/api/heartbeat` 语义不变，新增环境变量开关与确认窗口。
- 验证：真实桌面服务复现修复前退出；`tests/desktop.test.js` 6 组可控时钟用例（持续心跳、超时确认、确认窗口取消、8 小时睡眠跳变、唤醒后完整超时窗口）；真实服务端到端 10/10（心跳续命不退出、停止后按新逻辑退出且日志完整、默认无心跳仍常驻、日志落盘）；`tests/project-files.test.js` 新增 3 组源码回归断言；全量 `node --test` 通过。
- 已知限制：默认常驻后，关闭窗口会在后台保留一个 Node 进程（重复双击会复用，不会多开）；如不希望保留，设置 `GITDECK_HEARTBEAT=1` 启用带确认窗口的自动退出。

## 2026-11-04 - 修复拖拽排序要 F5 才生效（v4 回归）

- 根因：v4 把显示顺序从「顶层 `repositories` 数组顺序」改成「每工作区 `orders`」，但 `moveRepositoryOrder()` 的乐观更新仍只重排数组槽位、从不写 `orders[当前工作区]`；`renderRepoList()` → `getActiveRepositories()` 按旧 orders 排序，界面纹丝不动。后端 `reorder` 已正确落盘，所以 F5 重新 bootstrap 后才生效。
- 修复：拖拽后按新顺序直接写 `orders[workspaceId]`；保存失败时按拖拽前保存的旧 orders 精确回滚（旧的 `state.repositories.slice()` 浅拷贝既影响不到排序，也恢复不了对象内字段）；移除不再有意义的顶层数组重排。
- 验证：CDP 合成真实 HTML5 DragEvent，修复前复现「DOM 不变 / 后端 orders 已变」；修复后不刷新即从 `[a,b,c]` 变 `[b,c,a]`，后端一致、多归属仓库的其他工作区 orders 不受影响、零 console error（5/5）；注入 fetch 失败验证回滚 4/4。`tests/project-files.test.js` 新增源码回归断言。
- 顺带修复：`tests/api.test.js` 清理钩子等待服务进程退出后再带重试删除 fixture，避免 Windows 文件占用反复留下 `.tmp-api-test-*` 目录（连跑两次验证无残留）。

## 2026-11-04 - 多工作区归属的状态一致性收尾

- 删除工作区接口新增 `updated` 返回（受影响仓库的最新 `workspaceIds` / `orders`），前端改为以后端数据同步归属与排序，不再本地重算；修复「被迁入兜底工作区的仓库只有归属、缺排序值」的前后端状态不一致。
- 新建仓库改用 `nextOrderInWorkspace()` 计算排序值，不再硬编码 0，避免同一工作区内排序值重复。
- `loadState()` 的规范化变更检测补上 `orders` 的脏键/非法值比较，version 已为 4 的残留排序键也会清洗落盘，而不只留在内存。
- `upsertRepository()` 兜底补齐各归属的排序值；单个仓库移出时按是否仍保留其他归属区分提示文案。
- 验证：`api.test.js` 新增删除工作区返回体、新建仓库排序、脏 `orders` 落盘三组断言，2 个测试全部通过；CDP 断点读取前端闭包 `state`，删除工作区后迁入仓库的归属与 `orders` 与后端落盘一致，列表顺序正确、零 console error（10/10 项通过）。

## 2026-11-04 - 仓库可同时归属多个工作区

- 数据模型升级 v4：仓库 `workspaceId` 改为 `workspaceIds` 数组，`order` 改为按工作区的 `orders` 映射；启动时自动迁移，真实数据（26 仓库）迁移验证通过。
- 「移动到工作区」改为「加入其他工作区」（多归属，保留原有归属，幂等）；从工作区移出只摘除该工作区归属，最后一个归属被摘除时条目才从列表删除（磁盘目录始终不动）。
- 每个工作区有独立的仓库排序；顶层 `repositories` 数组顺序不再承载显示语义，前端按当前工作区 `orders` 排序。
- 验证：`api.test.js` 端到端通过；CDP 驱动真实 UI 点击（右键 → 加入其他工作区 → 切换工作区可见）零报错。

## 2026-11-04 - 服务端定时后台 fetch

- 新增 `src/auto-fetch.js`：服务启动后每 5 分钟（`GITDECK_AUTO_FETCH_MS` 可调，`GITDECK_AUTO_FETCH=0` 关闭）对有远端的仓库静默执行 `git fetch --all`。
- 目的与 VSCode `git.autofetch` 一致：让 `origin/*` 远程跟踪分支自动保持最新，右侧"所有分支"历史和领先/落后数字无需手动 fetch 即可反映远端进度。
- 并发限制 3，跳过正被用户动作占用的仓库；失败静默（离线/无凭据不影响使用）；不带 `--prune`，自动修剪远端快照过于激进，手动 fetch 按钮保持 prune 行为。
- 验证：本地裸仓库 + clone 端到端测试，远端新提交后在无人工操作下 clone 的 `origin/main` 自动追平。

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
