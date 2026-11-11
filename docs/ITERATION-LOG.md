# 迭代日志

本文件记录已经实现且用户可感知的迭代。新记录放在顶部；复杂功能可以在 `docs/features/` 下新增详细记录。

## 2026-11-11 - 文件列表支持 Shift 范围框选并批量勾选提交

- 用户反馈：改动文件多时逐行点勾选框太慢，希望「选中第一个 → 按住 Shift 点后面一个 → 中间整段被选中（类似 VSCode / TortoiseGit 的多行高亮）→ 点其中一个勾选框就批量都勾上」，以便一次提交。
- 根因：原先文件行只有「单击切预览」与「单行勾选」两条路径，`state.selectedFiles` 没有范围选区这一层；「全选当前」只能全选当前筛选结果，无法只挑连续一段。
- 实现（纯前端 `public/app.js` / `styles.css` / `index.html`）：
  - 新增 `fileRangeAnchor` + `fileRangeSelection`，与「提交勾选」`selectedFiles` **相互独立**：Shift 框选只是临时高亮，不会预先改动提交选择。
  - 普通点击文件行设起点并结束上一次框选；Shift 点击另一行调 `computeFileRange()` 按**当前可见 DOM 顺序**（`getClientRects()` 排除折叠目录隐藏行）截取含两端的整段，`applyFileRangeHighlight()` 只切 `.range-selected` class，不切预览、不打断编辑器、不重建列表。
  - 点范围内任一勾选框时 `resolveFileCheckTargets()` 把整段统一成「点击行的新状态」（已勾选则批量取消），`syncFileCheckButtons()` 增量改写复选框；也支持直接 Shift + 点勾选框一步框选并勾选。范围大小显示在「已选 N · 范围 M 个」，并带手势说明 title。
  - 切换筛选 / 目录树-平铺视图 / 折叠目录 / 仓库 / `.sln` 模式、点范围外、全选、按 Esc 都会 `resetFileRange()`；`renderFileTree()` 会剔除刷新后已消失的路径。`mousedown` 阻止 Shift 点击产生文本选区，CSS 加 `user-select: none` 兜底。
- 验证：`tests/file-range.test.js` 6 项（从 `app.js` 抽取真实纯函数做正/逆序、失效锚点、批量勾选/取消、Shift 点勾选框、隐藏文件不参与等行为断言 + 源码约束）；独立端口 + 独立数据目录 + 沙盒测试仓库的 CDP 真实鼠标点检：Shift 框选 6 行 → 点第 3 行勾选框 6 个全勾上且按钮显示「提交 6 个选中文件」→ 再点一次批量取消 → 点范围外只剩 1 个，页面 0 个 JS 错误。`node --test` 全通过、`check-docs` 23 份。

## 2026-11-09 - 顶栏新增 Log 按钮，批量操作失败可逐条查看完整错误

- 用户反馈：「抓取全部」显示 21 成功 / 3 失败，toast 里只有第一条错误的全文（其余看不到）；要求排查原因并在「抓取全部」旁加 `Log` 按钮查看错误日志。
- 只读取证：`AgisoBase/.git` 下已无任何 `*.lock`，`refs/remotes/origin` 多个目录在 17:08:42 被更新；`data/server.log` 只有启动 / 退出 / 一条 index-lock 清理记录，**Git 动作失败完全没有落盘**。失败原因是 `git fetch --all --prune` 的 prune 阶段创建 `refs/remotes/origin/yg_keyhelper.lock` 时该锁已存在（`File exists`），属远端引用锁，现有 `src/index-lock.js` 只识别 `.git/index.lock`，未覆盖。
- 实现：`src/action-log.js` 在 API 失败时把结构化记录（时间 / 状态码 / 接口 / 仓库名 / 动作名 / 错误全文）写 `data/errors.log`（JSON Lines、256KB 轮转），并由 `logError()` 在 `server.log` 留摘要；`server.js` 统一 catch 只记录 `/api/` 失败，`src/routes.js` 的 `action` 分支附加仓库名与动作名；新增 `GET /api/logs?limit=`（需会话令牌，最多 300 条）。
- 前端：`#logButton` 紧挨「抓取全部」，复用宽弹窗展示可展开的操作错误全文 + `server.log` 尾部，带刷新；`logRequest` 计数避免迟到响应回填到已关闭弹窗。
- 边界：无后台巡检、不记录令牌、只写 `<repo>/data/`；日志写入失败不影响接口响应。未扩展 `refs/**/*.lock` 的自动清理（用户本轮只要求日志）。
- 验证：`tests/action-log.test.js` 7 项（真实文件读写 / 轮转 / 坏行 / 多行 / 续行合并）、`tests/api.test.js` 端到端（失败 `deleteRef` 进日志、403 鉴权）、`tests/project-files.test.js` 防回归；`node --test` 全通过、`check-docs` 23 份。

## 2026-11-09 - index.lock 冲突增加默认处理：陈旧锁自动清理，活锁报出占用进程

- 用户反馈：提交时报 `index.lock` / `File exists` 删不掉；上一轮只读取证确认是旧版后台动作被强杀后留下的 3 天陈旧锁（0 字节、无人持有）。用户要求把「无人持有就删掉、有人持有就打印是谁」做成默认逻辑。
- 新增 `src/index-lock.js`（仅 Windows 独占探测）：从 Git 报错识别锁冲突 → 解析真实 Git 目录（含 `.git` 文件的 `gitdir:`）→ 用 PowerShell `-EncodedCommand` 以 `FileShare.None` 独占打开锁文件，路径走环境变量避免注入。
  - 独占打开成功（无人持有）→ 删除 Git 目录内的陈旧锁、写 `[index-lock]` 日志、返回恢复说明；
  - 独占打开失败（仍有进程持有）→ 绝不删除，抛 423，列出可能占用的进程（名称 / PID / 命令行，按仓库路径匹配优先）+ 占用判据 + Git 原始错误；
  - 探测失败、无法确定 Git 目录、或锁在工作树里 → 一律保守不删。
- `src/process.js` 的 `runGit()` 在失败时接入恢复，**只自动重试一次**；`gitAction()` 与 `runRepositoryAction()`（经 `consumeRecoveryNotes()`）把恢复说明汇总进动作结果，用户能看到「已自动删除并重试成功」且不重复。
- `public/app.js` / `styles.css`：含换行的错误 toast 加 `.has-detail`，保留换行、可滚动、停留 20 秒、容器加宽，避免进程清单被 3 行截断或 5 秒消失。
- **边界**：没有后台巡检、没有定时器，只在用户主动触发的 Git 命令失败时介入；与「禁止后台自动操作用户仓库」的约定一致。
- 验证：新增 `tests/index-lock.test.js`（7 项，含真实 Git 仓库的陈旧锁 / 活锁 / `commitSelected` 端到端）；`node --test` 全通过，文档校验通过。**`src/` 是后端代码，需重新运行 `.\start.cmd` 才生效；前端 toast 改动按 F5 即可。**

## 2026-11-09 - 顶栏「刷新」改为「抓取全部」

- 用户反馈：顶栏「刷新」按钮「好像没啥用」，要求改为抓取所有仓库。
- 根因：该按钮只调 `refreshAllSummaries({ force: true })`，并发读一遍 `GET /api/repositories/:id/status`（纯本地 `git status`），完全不碰远端，所以看不到任何 `origin/*` 变化。
- 改动（纯前端，F5 生效）：
  - `public/index.html` 按钮文案改「抓取全部」、图标改 `#i-download`、title 标明 `git fetch --all --prune`。
  - `public/app.js` 新增 `fetchAllRepositories()`，顶部按钮 click 绑定它：对 `state.repositories` **全部**仓库调用 `executeBulkAction("fetch", ids)`，按钮期间禁用并显示「抓取中 N/M」。
  - `executeBulkAction()` 由一次性 `Promise.allSettled(ids.map(...))` 改成 **4 个一批**串行批次 + `onProgress` 回调；每批更新 summary、重绘列表，结束汇总成功/失败并刷新当前仓库详情。避免一次拉起 24 个 git 进程与 TortoiseGit / IDE 抢 `.git`。
  - **关键约束**：`refreshAllSummaries()` 本身没动，首次加载 / 窗口恢复 / Git 动作后的状态刷新仍是纯本地读取，没有任何后台抓取；抓取只在用户点击时发生。新增防回归断言检查这条边界和 `index += 4` 限流。
- 验证：`node --test` 42/42、`check-docs` 23 份、`node --check`。文档 FEATURES / ARCHITECTURE / UI-MAP 同步。

## 2026-11-09 - 行内 diff 改为 TortoiseGitMerge 的 word-wise 算法

- 用户反馈：上一版「效果还是不对」，要求先查乌龟的单文件单行 diff 算法再改代码。
- 查证（TortoiseGitMerge 官方手册）：inline diff 默认 **word-wise**——「改一个字符时整个词高亮」，char-wise 会把变量名改动拆成「一堆没意义的零碎字符」；只有「改动相对小」的行算 modified line，**未变部分用中性的 modified 背景，变化片段才用 inline added / removed 颜色**；超过 3000 字符的行不做行内差异。
- 上一版的三个偏差：① 逐字符 LCS（正是乌龟默认不用的 char-wise）；② 在整行红/绿底上再叠一层深红/深绿，对比度糊在一起，看不出哪儿变了；③ 单行 600 字符 / 160000 格上限，稍长的代码行直接退回整行着色，等于没效果。
- 实现（`public/app.js`、`public/styles.css`，纯前端 F5 生效）：
  - `tokenizeDiffLine()` 按标识符 / 数字 / 连续汉字 / 空白 / 单标点分词；`inlineDiffSegments()` 先剥相同首尾词，再对词序列做 LCS，连续同状态的词合并成一段，整词高亮。
  - `buildInlineMarks()` 由「全局找最相似」改为**按块内位置顺序配对**（对应两栏里同一行的左右两侧），相似度 < 0.3 或公共词太少直接退回行级着色。
  - 有片段的行加 `.inline` class，CSS 用中性 modified 底色覆盖整行红/绿，`<mark>` 用更饱和的红/绿只标变化片段。
  - 上限对齐乌龟：单行 3000 字符、400 词、40000 DP 格；单块 80 行、200 配对仍保留。
- 验证：真实源码行为测试改为断言「整词高亮」「汉字成一个词」「配对行有 `.inline`」；`node --test` 42/42、`check-docs` 23 份、`node --check` 通过。
- 仍未做（等用户确认）：左右并排双栏视图；提交改动弹窗 `pre.commit-patch` 仍是纯文本。

## 2026-11-09 - Diff 增加行内变动高亮（初版，已被上面的 word-wise 版本替换）

- 用户反馈：截图参考 TortoiseGit 的行内差异效果，「某一行有变动，看起来容易看不懂是哪儿变化了」。
- 现状：`renderDiff()` 把 `git diff` 文本按行包成 `.diff-line.added/removed`，整行同色，行内改动位置不可见；后端 `GET diff` 返回原始补丁文本，未做解析。
- 取舍：**只增强行内粒度，不改布局、不加并排视图开关、不动后端**；保持现有统一视图与操作习惯，纯前端改动 F5 即生效（不用重启 `start.cmd`）。
- 实现（`public/app.js`）：
  - `diffLineKind()` 统一分类（header / hunk / added / removed / context），补齐 `similarity index` / `rename` / `Binary files` / mode 等 header。
  - `buildInlineMarks()` 在每个 hunk 内把连续的 `-` / `+` 行划为变更块，用 `diffLineSimilarity()`（token 集合重合度）把新增行与最相似的删除行贪心配对，能处理「一行拆两行 / 顺序微调」。
  - `charDiffSegments()` 对配对行做字符级 LCS，生成 `{ text, changed }` 片段；公共字符比例 < 0.3（整行重写）时返回 null，退回整行着色。
  - `renderDiff()` 对有片段的行把 `+` / `-` 前缀单独包 `.diff-marker`，变化片段包 `<mark class="diff-inline-del|add">`，其余 `escapeHtml()` 原样输出；上下文行、header、hunk 不标亮。
  - 规模保护：单行 ≤ 600 字符、LCS ≤ 160000 格、单块 ≤ 80 行、全局 ≤ 200 配对，超出退回行级着色，避免大 diff 卡顿。
- 样式（`public/styles.css`）：`.diff-inline-del` 深红、`.diff-inline-add` 深绿，叠加在原有浅色行背景上；`<mark>` 默认底色被覆盖，深色主题下可读。
- 验证：`tests/project-files.test.js` 新增两组**真实源码行为测试**——用 `new Function` 加载 `app.js` 里的纯渲染函数（只注入等价 `escapeHtml`），断言 `MD5 → SHA` 只标变化片段、上下文行无 mark、两处入口共用 `renderDiff`、HTML 转义安全、整行重写 / 超长行 / 超大块退回行级；`node --test` 全量、`check-docs`、`node --check`。
- 未做（等用户确认）：截图里的左右并排双栏视图；提交改动弹窗 `pre.commit-patch` 仍是纯文本，未接行内高亮。

## 2026-11-09 - 修掉「分支删不掉」，并让 .sln 只扫根目录第一层

- 用户反馈：右键删除 `remove-app-related` 一直失败，报 `The branch '...' is not fully merged`；同时 `.sln` 目录刷新很慢，要求「不要递归扫描，只要扫描目录下的第一层的 .sln 文件」。
- 删除引用根因：后端 `deleteRef(path, ref, force)` 本来就支持 `force ? "-D" : "-d"`，但分支标签右键「删除引用」的确认框只发 `{ ref }`，永远走安全的 `git branch -d`，Git 对未合并分支直接拒绝。项目里「强制删除未合并分支（-D）」选项此前只做在批量删除弹窗，右键路径漏了。
- 改动（前端）：`delete-ref` 确认框用 `bodyExtra` 补上 `#forceDeleteRef`（默认不勾选，复用 `.branch-force-option` 样式），确认时读取勾选状态并把 `force` 传给 `deleteRef`；`not fully merged` 失败时把原始英文报错换成中文引导并聚焦勾选框。`runModalConfirmation()` 在动作抛错时不会 `closeModal()`，弹窗保持打开，勾选后可直接重试，无需重新右键。
- 扫描慢根因：`listSolutions()` 用 `walk()` 递归到 8 层、上限 2 万个目录，`.sln` 模式还会并发对所有已添加仓库各跑一遍。
- 改动（后端 + 前端文案）：`listSolutions()` 改为只 `readdir(repository.path)` 一次，收集第一层 `*.sln` 文件名，删除 `walk` / `MAX_DEPTH` / `MAX_ENTRIES` / `MAX_SOLUTIONS`；列表头与空态标明「仅仓库根目录第一层」，重新扫描按钮说明同步。范围/搜索/缓存逻辑不变。
- 实测（`AgisoCodes.Work` 真实目录）：旧递归 16 个 / **2010ms**，新第一层 14 个 / **7ms**（子目录里的 2 个不再列出）；全部 24 个仓库新实现合计 **3ms**、共 47 个第一层 `.sln`。
- 验证：`node --test` 40/40、`node tools/check-docs.js` 23 份通过、`node --check`；`tests/api.test.js` 新增端到端用例（不勾 `-D` 被拒且分支仍在 → `force: true` 后分支真的消失），并改为断言子目录 `nested/Lib.sln` 不返回；`tests/project-files.test.js` 增加「不得递归」「必须 `isFile()`」「`deleteRef` 必须带 `force`」「强制删除默认关闭」防回归断言。
- 文档同步：`API.md`、`FEATURES.md`、`MAP.md`、`UI-MAP.md`、`TESTING.md`、`SECURITY.md`、`TROUBLESHOOTING.md`、本文件。
- 注意：`src/directories.js` 是后端代码，F5 只刷新 `public/`；**需要重新运行 `.\start.cmd`**（或关掉窗口再打开）才能加载新的扫描逻辑。

## 2026-11-09 - 修掉 .sln 列表「双击打开没反应」

- 用户反馈：列表能列出 16 个 `.sln`，但双击完全没反应。**先排除后端**：拦截 `spawn` 实证 `vswhere.exe` 定位到 `VS2022 Enterprise\Common7\IDE\devenv.exe`、参数是正确的绝对 `.sln` 路径；运行中服务 `POST /action` 的 `openVisualStudio` 分支可达（非法路径按预期返回 400）；`AgisoCodes.Work` 的 `/solutions` 返回 16 个。后端整条链路没问题。
- 根因在前端交互：单击 `[data-solution-select]` 时调用 `renderChanges()` → `renderSolutionView()` → `elements.fileGroups.innerHTML = ...` **重建了列表 DOM**。浏览器要求双击的两次 `click` 落在同一元素上，节点被换掉后 `dblclick` 根本不会派发，于是「双击毫无反应」。上一轮 CDP 探针用 `dispatchEvent(new MouseEvent('dblclick'))` 直接派发事件，绕过了真实鼠标序列，所以没测出来。
- 次要问题：`openInVisualStudio()` 原先走 `performRepoAction()`，仓库被其它 Git 操作标记为 busy 时会静默 `return null`；成功后还会重渲染整个详情面板，拖慢反馈。
- 改动（**纯前端，F5 即生效，不用重启后端**）：
  - 抽出 `renderSolutionPreview()` 只重建右侧预览；新增 `selectSolutionItem()` 单击时仅增量切 `.selected` class + 刷新预览头与预览区，**列表节点保持不变**。
  - `requestOpenSolution()` 汇总 `dblclick` 与第二次 `click(detail>=2)` 两条通道（兼容不派发 `dblclick` 的输入设备），用 800ms 短时去重保证只打开一次。
  - `openInVisualStudio()` 改为 `async` 直接调 `api()` 发 `openVisualStudio` 动作，自带「正在启动 / 已打开 / 打开失败」反馈，不再进 busy 队列、不再触发整页重渲染。
- 验证：`node --test` 40/40（新增防回归断言：单击函数内不得出现 `renderChanges` / `fileGroups.innerHTML`、双击双通道与去重、打开不得经 `performRepoAction`）、`check-docs`；真实浏览器改用 CDP `Input.dispatchMouseEvent` 发**真实鼠标双击序列**（隔离 `PORT=4407` + 两个临时仓库）：单击后列表节点 `isSameNode=true`、两次双击都派发 `dblclick`、3 次打开请求路径分别为 `App.sln` / `App.sln` / `src/Lib.sln` 且都指向仓库 A、去重生效、控制台 0 错误。

## 2026-11-09 - .sln 改为跨仓库汇总，修掉「明明有文件却显示 0」

- 用户反馈（该功能第 4 次返工）：选中的是 `AgisoCodes.Work`，界面却显示 0 与「目录下没有 .sln 文件」。
- 取证：运行中服务 `GET /app.js` 带 `Cache-Control: no-store` 且返回最新代码；对 24 个仓库逐一调 `/solutions` 全部正常（有 `.sln` 的返回 1~16 个，与文件系统一致，其中 `AgisoCodes.Work` 为 16 个）。所以后端扫描没问题，问题在前端「只请求当前选中仓库这一条」的脆弱状态链：选中态与在途请求很容易把成功结果判为过期丢弃；常驻 `--app` 窗口不刷新也会一直跑旧 JS。
- 改动（**纯前端，F5 即生效，不用重启后端**）：
  - `.sln` 从「当前仓库的文件过滤」改为「跨仓库解决方案快捷列表」：`fetchSolutions()` 并发（4 个一批）扫所有已添加仓库，结果按仓库缓存在 `state.solutionCache`；`buildSolutionCatalog()` 汇总成带仓库名与唯一 `key` 的目录；`getVisibleSolutions()` 按 `solutionScope` / `solutionSearch` 过滤。
  - 新增 `#solutionToolbar`：搜索框、全部仓库/当前仓库、重新扫描（清缓存）。`renderSolutionView()` / `renderSolutionList()` 独立渲染，不再复用变更文件树；空态区分「没有匹配结果」（一键清空筛选）与「所有仓库都没扫到」（重新扫描），不再是死胡同。
  - 双击或预览区按钮用 `openInVisualStudio(target)` 携带目标 `repositoryId`，打开其它仓库的 `.sln` 无需先切换仓库；切换仓库不再关闭模式、也不打断在途的全局扫描（`solutionsRequest` 只在扫描自身与关闭模式时变化）。
  - 保留 404 → 提示重新运行 `start.cmd` 的明确错误态；删除「目录下没有 .sln 文件」这类把「当前仓库没有」误报成「物理目录没有」的文案。
- 验证：`node --test` 40/40、`check-docs`；真实浏览器（隔离 `PORT=4405` + CDP + 两个临时仓库，A 有 3 个 `.sln`、B 无）：A 下 3 个（含子目录）全部列出 → 切到 B 仍显示 3 个 → 搜索「Lib」剩 1 → 仅当前仓库 0 且可恢复 → 切回全部 3 → 重新扫描重新请求 4 次 → 单击预览正确 → 双击发出的 `openVisualStudio` 指向 A 仓库且 `path=App.sln` → 控制台 0 错误。
- 文档同步：`FEATURES.md`、`MAP.md`、`UI-MAP.md`、`API.md`、`TESTING.md`、本文件；`tests/project-files.test.js` 增加跨仓库与旧实现防回归断言。

## 2026-11-09 - 右键菜单收敛为「只在分支标签上」

- 用户反馈：右键提交历史行（非分支标签）弹出的比较 / 合并 / 重置 / 变基 / 遴选 / 还原等提交级菜单没用，主要需要的是操作分支的能力。
- 改动（前端 `public/app.js`）：`handleContextMenu()` 只有命中 `.context-history-decoration` 且能定位到所属 `.context-history-row` 时才 `preventDefault()` 并打开 `openRefMenu()`；历史行其它位置保留浏览器默认菜单。删除 `openCommitMenu()`、`merge-commit` / `reset-to-commit` / `rebase-onto` / `cherry-pick` / `revert-commit` / `copy-subject` / `copy-commit-info` 动作分支与 `#historyResetMode` 表单；`historyRowContext()` 精简为 `repoId` / `hash` / `shortHash` / `subject`。
- 改动（后端 `src/git-actions.js`）：删除已无入口的 `cherryPick` / `revertCommit` / `resetToCommit` / `rebaseOnto` 四个 action 及实现；分支标签菜单所需的 `checkoutRef` / `checkoutCommit` / `createBranchAt` / `createTagAt` / `pushRef` / `deleteRef` 与 `GET commit` 差异接口保持不变。
- 验证：`node --check`、`node --test`、`node tools/check-docs.js`；隔离服务 + 无头 Chrome/CDP 验证「右键非徽标不弹自定义菜单、右键徽标仍可弹出并切换分支」。
- 文档与测试同步：`API.md`、`MAP.md`、`UI-MAP.md`、`FEATURES.md`、`TESTING.md`、本文件；`tests/project-files.test.js` 增加防回归断言（`openCommitMenu` / `type: "commit"` / 四个提交级 action 不得回来），`tests/api.test.js` 的无参哈希校验改走 `checkoutCommit`。

## 2026-11-09 - 提交历史增加 TortoiseGit 风格右键菜单

- 用户反馈：右键提交历史里的分支标签时，希望能像 TortoiseGit 那样弹出菜单，快速切换到该分支；整套右键菜单也可参考乌龟补齐相关功能。
- 改动（前端 `public/app.js`、`public/styles.css`）：
  - 历史行补 `data-commit-hash`，`renderHistoryDecorations()` 为每个徽标补 `data-ref`（规范化引用名）、`data-ref-full`（`%D` 原文）、`data-ref-kind`（head/local/remote/remote-head/tag），并给出右键提示。
  - 抽出 `showContextMenu({ label, items, position, context })`，仓库行、分支徽标、提交行三类菜单共用渲染与实测宽高钳制；`state.menuContext` 决定 `handleContextMenuClick()` 分发到 `handleRepoMenuAction()` 还是 `handleHistoryMenuAction()`。`hideContextMenu()` 同步清理上下文与 `.context-menu-wide`。
  - 徽标菜单首项高亮「切换到 "xxx"」；提交行菜单覆盖比较 / 合并 / 重置 / 变基 / 检出 / 建分支标签 / 遴选 / 还原 / 复制 / 浏览 / 打开 TortoiseGit。改写仓库或远端的动作都有 `showConfirm()`，重置提供 soft/mixed/hard 单选，差异在 `.modal-wide` 的 `pre.commit-patch` 中展示，复制提供非安全上下文回退。
  - `.context-menu-wide` 加宽到 288px 并允许内部滚动；scroll 守卫用 `elements.contextMenu.contains(event.target)` 区分页面滚动与菜单内部滚动，避免误关。
- 改动（后端 `src/git-actions.js`、`src/routes.js`）：新增 `checkoutRef`（本地直切 / 远端建同名跟踪分支 / 标签分离 HEAD / `origin/HEAD` 解析符号引用）、`checkoutCommit`、`createBranchAt`、`createTagAt`、`cherryPick`、`revertCommit`、`resetToCommit`、`rebaseOnto`、`pushRef`、`deleteRef`；引用与哈希先经 `validateRefArgument()` / `validateRevision()` / `validateCommitHash()` 校验。新增只读 `GET /api/repositories/:id/commit?hash=&compare=patch|worktree|previous`，根提交自动回退 `git show`，输出上限 512 KB。
- 验证：`node --test` 40/40（新增 `tests/api.test.js` 端到端差异接口与动作断言、`tests/project-files.test.js` 源码约束）、`node --check`、`node tools/check-docs.js`；隔离服务 + 无头 Chrome/CDP 验证真实右键交互。
- 文档同步：`API.md`（同时修正 history 示例为结构化行）、`MAP.md`、`UI-MAP.md`（同时修正旧的 `--graph` 描述）、`FEATURES.md`、`TESTING.md`、本文件。

## 2026-11-09 - 扫描结果增加全选 / 反选与已选清单

- 用户反馈：「扫描本地仓库」结果多时逐项勾选不方便，希望加全选、反选，并把选中了哪些拼接展示在列表上方。
- 改动（`public/app.js`、`public/styles.css`）：
  - `renderScanModalBody()` 在「自动跳过…」说明下方新增 `.scan-selection-bar`：左侧「全选」「反选」按钮走 `data-modal-action` 接入 `handleModalAction()`；右侧 `#scanSelectionSummary` 显示 `已选 N/M 个：A、B、C`，完整 `名称 — 路径` 清单放 `title`，单行超长用省略号。结果复选框新增 `data-scan-name`，拼接不依赖 `state.scanResults` 的路径映射。
  - `scanRepositoryInputs()` / `updateScanSelectionUI()` 增量更新清单文本、全选按钮（已全选时禁用）、反选按钮和底部「添加 N 个仓库」文案及禁用态；勾选变化由 `elements.modalBody` 的 `change` 委托触发，不重建 `.scan-results`，滚动位置不丢失。打开弹窗与扫描完成后各初始化一次。
  - 底部 `addScanResults()` 读取选中项的逻辑不变。
- 验证：`tests/project-files.test.js` 新增源码约束（按钮、拼接、0 选中禁用、动作分发、增量更新、CSS 省略）；`node --test`、`node --check`、`node tools/check-docs.js`。
- 文档同步：`MAP.md`、`UI-MAP.md`、`FEATURES.md`、`TESTING.md`、本文件。

## 2026-11-06 - 移除全部后台自动抓取与定时刷新

- 用户反馈：TortoiseGit Log 打开后持续转圈，明确要求「把后台自动刷新的逻辑下掉」，之后自己主动拉取，不要自动功能。
- 实证：`data/server.log` 中 `17:37:43 → 17:38:14` 有一轮 `[auto-fetch] 完成 21/23 个仓库，用时 40s`，覆盖用户打开 Log 的时间段；两个远端不可达的仓库各阻塞数十秒。前端另有 `init()` 中每 20 秒一次的 `refreshAllSummaries()`，对当前工作区所有仓库并发 `git status`，不受 `GITDECK_AUTO_FETCH=0` 控制。
- 结论：不再做任何「让路」调优，直接移除两类后台动作。用户需要最新状态时点「刷新」，需要远端更新时主动执行抓取 / 拉取。
- 改动：
  - 删除 `src/auto-fetch.js` 与 `tests/auto-fetch.test.js`；`server.js` 不再 require / start / stop auto-fetch；`src/config.js` 删除全部 `AUTO_FETCH_*` 常量与环境变量。
  - `public/app.js` 删除 `state.autoRefreshTimer` 与 `init()` 里的 20s `setInterval`；保留启动时一次状态读取、「刷新」按钮、Git 动作后的刷新。
  - `public/index.html` 移除每 5 秒一次的心跳定时上报；保留页面加载及可见 / 焦点 / 网络恢复时的一次性上报（供可选看门狗），运行期不再有前端定时器。
  - 桌面模式关窗退出改为 `stopHeartbeatWatchdog()` + `killActiveChildren()`，不再涉及抓取定时器。
  - 新增防回归断言：源码中不得出现 auto-fetch / AUTO_FETCH / 前端定时刷新，且后台抓取模块与其测试文件不得存在。
- 文档同步：`AGENTS.md`、`ARCHITECTURE.md`、`FEATURES.md`、`DEVELOPMENT.md`、`TROUBLESHOOTING.md`、`API.md`、`MAP.md`、`UI-MAP.md`、`TESTING.md`、`DECISIONS.md`、`ROADMAP.md`。
- 注意：下方历史条目中保留 auto-fetch 的实现记录，属于当时事实，不作为当前行为说明。

## 2026-11-06 - 关窗口即退后端；后台 fetch 不再抢用户仓库

- 用户反馈：关闭应用后后端不重启（旧代码一直在跑），「关了软件就应该把后端关掉，打开软件再开后端」；同时 TortoiseGit Log 窗口打开后持续转圈、标题「未响应」，怀疑 GitDeck 把仓库锁死。
- 生命周期根因：`HEARTBEAT_TIMEOUT_MS=0` 时服务默认常驻，`launchAppWindow()` 又是 `detached + unref` 的独立浏览器进程，窗口与后端完全解耦。之前为修 `ERR_CONNECTION_REFUSED` 把心跳超时默认关掉，等于连「关窗退出」一起丢掉了。
- TortoiseGit 取证（结论：不是 GitDeck 死锁）：卡住的 `TortoiseGitProc.exe` `Responding=False`，CPU 182s → 226s 持续上涨（自身 UI 线程忙等），没有 git 子进程；目标仓库 `.git` 下无 `index.lock` / `packed-refs.lock` / `maintenance.lock`；当时系统里 GitDeck 的 `git.exe` 进程数为 0。另发现 `AgisoCodes/.git/index.lock`（16:32）与两个 2025 年的 `maintenance.lock`，均属用户仓库的历史残留，**未擅自删除**。
- 但自动抓取确有侵入性：`startAutoFetch()` 每次服务启动立即跑一轮，加上 5 分钟定时，对全部 23 个仓库 `git fetch --all`；为修 `.sln` 反复重启服务时叠加多轮，仓库 `FETCH_HEAD` 的写入时间与重启时间吻合。
- 修复：
  - `src/desktop.js`：`--app` 改用独立 `data/chrome-profile`（否则会被转发给日常 Chrome 实例，启动器秒退、永远感知不到关窗）；`launchAppWindow()` 返回 child；新增可注入时钟/定时器的 `createWindowLifecycle()` 与 `attachAppWindow()`，以窗口进程 `exit` 为唯一退出依据，带 10s 启动失败保护和 3s 宽限。睡眠/后台冻结不会误杀。
  - `server.js`：桌面模式挂载窗口生命周期，退出前 `stopAutoFetch()` + `killActiveChildren()` + `process.exit(0)`；`src/process.js` 新增 `activeChildren` 跟踪。
  - `tools/restart-server.ps1`：强杀旧后端前先递归收敛它的 `git.exe` 子进程（`Stop-GitDescendants()`），不碰 Chrome 窗口，避免半截 fetch 留下 `.lock`。
  - `src/config.js` / `src/auto-fetch.js`：首轮延迟 60s（`GITDECK_AUTO_FETCH_DELAY_MS`）；近期 `.git/*.lock` 整仓跳过（超过 10 分钟的陈旧锁忽略，支持 worktree 的 `gitdir:` 形式）；`fetch` 加 `-c maintenance.auto=false` 禁用自动 gc / pack-refs；失败仓库退避 15 分钟；并发 3 → 2；`GITDECK_AUTO_FETCH=0` 可完全关闭。
- 附带修复：`start.cmd` 的 UTF-8 中文 `rem` 注释会被 `cmd.exe` 截断后当成命令执行（实测报 `'…时加载，不清理会让新进程…' is not recognized as an internal or external command`，服务虽仍能启动但输出很脏）→ 启动脚本注释一律 ASCII，并在 `tests/project-files.test.js` 加 `rem` 行 ASCII 断言。
- 验证：
  - `node --test` 43/43、`node tools/check-docs.js` 通过；`restart-server.ps1` 语法、`start.cmd` CRLF、五个改动文件的 `node --check` 均通过。
  - 隔离端口 4399 端到端：关闭 `--app` 窗口 3 秒后日志依次出现「桌面窗口已关闭，GitDeck 服务准备退出」→「GitDeck 后端退出。」，监听归零、node 进程消失、任务 exit code 0。
  - 主服务重启后 `/api/ping` 200、`/solutions` 200 且返回 16 个 `.sln`；窗口命令行含 `data\chrome-profile`；日志出现「60s 后开始首轮抓取」。
- 文档同步：`AGENTS.md`、`docs/DEVELOPMENT.md`、`docs/FEATURES.md`、`docs/TROUBLESHOOTING.md`。

## 2026-11-06 - 修复 .sln 按钮「改两次仍为空」：后端进程未重启

- 现象：用户第二次反馈选中 `.sln` 按钮后列表为空，提示「目录下没有 .sln 文件」，但资源管理器里该仓库目录明确有 8 个以上 `.sln`。
- 实证根因（不是扫描逻辑，也不是 Git 状态解耦问题）：
  - 直接调用 `listSolutions({ path })` 扫描用户真实仓库目录，返回 16 个 `.sln`（含子目录）。
  - 运行中的服务进程启动于 2026/11/5 10:28，早于 `d449356` 新增 `/solutions` 路由；同一仓库 `/status` 返回 200，`/solutions` 返回 **404「接口不存在。」**。
  - F5 只刷新 `public/`，`src/` 在旧进程里仍是昨天的代码；`fetchSolutions()` 捕获 404 后把 `state.solutions` 置空，渲染成「目录下没有 .sln 文件」，把排查方向彻底带偏。
  - 服务默认常驻，且 `start.cmd` 原本只做 `Start-Process`；重新运行只会多起一个抢不到端口的进程，用户无法靠关窗口重开加载新后端。
- 改动：
  - `public/app.js`：新增 `solutionsError` / `solutionsRequest`；读取失败区分 404 并提示重启，文件列表与预览区显示明确错误而不是空目录文案；切换仓库时让在途请求失效。
  - `start.cmd` + 新增 `tools/restart-server.ps1`：启动前精确停掉占用 GitDeck 端口且运行 `server.js` 的旧进程，等待端口释放后再启动，保证「重新运行 start.cmd」真正重启后端。
  - `public/styles.css`：新增 `.group-empty-error` 错误态样式。
  - `AGENTS.md`、`docs/TROUBLESHOOTING.md` 固化「后端改动必须重新运行 `.\start.cmd`」与排查步骤。
- 验证：真实目录扫描 16 个 `.sln`；新增 API 端到端断言（未跟踪的 `.sln` 也返回）；源码特征断言覆盖错误态与重启脚本；重启服务后 `/solutions` 返回 200。

## 2026-11-06 - 工作目录内删改免审批，目录外照常审批

- 目标：用户要求「仅限在当前 git 工作目录下删除/修改文件不要审批，超出工作目录再找我审批」，解决反复弹出的删除确认。
- 根因（由 `~/.workbuddy/audit-log/2026-11-06.jsonl` 实证）：确认来自 `file-safety.bulk-delete.needs-approval`，payload 为 `count: 119~123 / threshold: 50`，目标是 `.workbuddy/scratch/api-test-*`。这是按**一次请求累计删除文件数**触发的批量删除保护，**与路径无关**；`node --test` 删临时 Git 仓库时一次删 100+ 文件即超阈值，待确认状态还会挂到同一请求后续命令上，所以连 `node --test | grep` 也被拦。此前「路径越界」「命令规则为空」两种推断均不成立：文件规则里工作区 `.` 的 read/write/delete 原本就是 `allow`。
- 改动（三层，均不启用「完全访问」）：
  - 用户级 `settings.json`：新增 `sandbox.safeDeleteBulkThreshold: 500`（默认 50，范围 1–99999），覆盖正常测试清理；超过 500 项的批量删除仍审批。文件规则不动，工作目录外的删除仍照常审批。
  - 项目级 `<repo>/.codebuddy/settings.json`：仅新增 `permissions.allow`，放行 `node tools/clean-scratch.js` 与 `npm run clean:scratch`，只在本项目生效；不含 `sandbox` 块，避免覆盖用户级文件规则。
  - `tools/clean-scratch.js`：新增 `--path <repo 相对路径>`（可重复），把「工作目录内删除」收拢到唯一受控入口。拒绝绝对路径、`..` 越界、符号链接，以及 `.git`、`node_modules`、`package.json`、`package-lock.json`、`data/repositories.json`、`data/server.log`、`.workbuddy/memory/`；用 `fs.rmSync` 走文件层，不是 shell 删除命令。
- 文档：`AGENTS.md` 新增「权限边界（已实证）」表并修正旧推断；`AGENT-GUIDE.md`、`TESTING.md` 同步 `--path` 用法与「清理命令单独执行」约定。
- 验证：`node --test` 29/29（新增 `tests/clean-scratch.test.js` 4 条边界断言）、`node tools/check-docs.js` 通过；跑完整测试（100+ 文件删除）后审计日志新增 0 条 `needs-approval`，清理 4 个残留目录（每个含 100+ 文件）全程免审批。
- 注意：清理命令必须单独执行；与 `&&` / `;` / `|` 拼成复合命令时，白名单要求所有子命令命中，会重新触发审批。

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
