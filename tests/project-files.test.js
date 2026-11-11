"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");

test("start.cmd 使用 Windows CRLF 换行，避免 cmd.exe 解析错误", async () => {
  const buffer = await fs.readFile(path.join(ROOT, "start.cmd"));
  const content = buffer.toString("utf8");
  const crlfCount = (content.match(/\r\n/g) || []).length;
  const lfCount = (content.match(/(?<!\r)\n/g) || []).length;

  assert.ok(crlfCount > 0, "start.cmd 应包含 CRLF 换行");
  assert.equal(lfCount, 0, "start.cmd 不应包含裸 LF 换行");
  assert.match(content, /server\.js/);
  // cmd.exe 会把部分 UTF-8 中文 rem 注释截断后当成命令执行（报
  // "'...' is not recognized as an internal or external command"）。
  const remLines = content
    .split(/\r?\n/)
    .filter((line) => /^\s*rem\b/i.test(line));
  for (const line of remLines) {
    assert.ok(
      /^[\x00-\x7F]*$/.test(line),
      `rem 注释必须保持 ASCII：${line}`
    );
  }
});

test(".gitattributes 固定 cmd 文件使用 CRLF", async () => {
  const content = await fs.readFile(
    path.join(ROOT, ".gitattributes"),
    "utf8"
  );
  assert.match(content, /\*\.cmd\s+text\s+eol=crlf/);
});

test("仓库工具栏保留 TortoiseGit 外部打开入口", async () => {
  const [html, shell] = await Promise.all([
    fs.readFile(path.join(ROOT, "public", "index.html"), "utf8"),
    fs.readFile(path.join(ROOT, "src", "shell.js"), "utf8")
  ]);
  assert.match(html, /data-repo-action="openTortoiseGit"/);
  assert.match(shell, /TortoiseGitProc\.exe/);
  assert.match(shell, /\/command:log/);
});

test("拖拽排序乐观更新写入当前工作区 orders（无需刷新即生效）", async () => {
  const app = await fs.readFile(
    path.join(ROOT, "public", "app.js"),
    "utf8"
  );
  const start = app.indexOf("async function moveRepositoryOrder(");
  assert.ok(start > 0, "应存在 moveRepositoryOrder()");
  const end = app.indexOf("\n  }\n", start);
  assert.ok(end > start, "应能定位 moveRepositoryOrder 函数体");
  const body = app.slice(start, end);
  assert.match(
    body,
    /repository\.orders\[workspaceId\]\s*=\s*index/,
    "拖拽后必须立即写入 orders[当前工作区]；只重排顶层数组会导致要 F5 才生效"
  );
  assert.match(body, /previousOrders/, "保存失败要能按旧 orders 精确回滚");
  assert.doesNotMatch(
    body,
    /state\.repositories\[index\]\s*=/,
    "v4 不应再靠重排顶层 repositories 数组表达显示顺序"
  );
});

test("分支列表按提交时间倒序返回", async () => {
  const summary = await fs.readFile(
    path.join(ROOT, "src", "git-summary.js"),
    "utf8"
  );
  assert.match(
    summary,
    /"branch",\s*\n\s*"--sort=-committerdate"/,
    "git branch 命令必须带 --sort=-committerdate，保证分支面板最新分支排在最前"
  );
});

test("看门狗不再「心跳一断就退出」，且默认超时足够宽", async () => {
  const [desktop, config] = await Promise.all([
    fs.readFile(path.join(ROOT, "src", "desktop.js"), "utf8"),
    fs.readFile(path.join(ROOT, "src", "config.js"), "utf8")
  ]);
  assert.match(desktop, /createHeartbeatWatchdog/, "应有可测试的纯逻辑看门狗");
  assert.match(desktop, /suspectSince/, "超时后必须再经过确认窗口");
  assert.match(desktop, /gap > suspendThresholdMs/, "必须识别系统睡眠造成的时钟跳变");
  assert.match(config, /120000/, "显式启用时超时不能退回 30 秒这种易误杀的值");
  assert.match(config, /GITDECK_HEARTBEAT === "1"/, "自动退出必须显式开启");
  assert.match(config, /\?\s*Number\(process\.env\.GITDECK_HEARTBEAT_TIMEOUT_MS\)[\s\S]{0,40}:\s*0/,
    "默认不启用心跳自动退出（0 = 由窗口进程 exit 决定）");
});

test("前端心跳在窗口恢复可见时补发，任何鉴权 API 也会续命", async () => {
  const [html, routes] = await Promise.all([
    fs.readFile(path.join(ROOT, "public", "index.html"), "utf8"),
    fs.readFile(path.join(ROOT, "src", "routes.js"), "utf8")
  ]);
  for (const event of ["visibilitychange", "pageshow", "focus", "online"]) {
    assert.ok(html.includes(event), `心跳应在 ${event} 时补发`);
  }
  assert.doesNotMatch(
    html,
    /setInterval\(heartbeat/,
    "不得再有 5 秒一次的定时心跳上报"
  );
  const trusted = routes.indexOf("!isTrustedRequest(request)");
  const touch = routes.indexOf("touchHeartbeat();", trusted);
  assert.ok(trusted > 0 && touch > trusted, "鉴权通过后应刷新心跳");
});

test("隐藏窗口启动也有文件日志与全局异常兜底", async () => {
  const [server, logger] = await Promise.all([
    fs.readFile(path.join(ROOT, "server.js"), "utf8"),
    fs.readFile(path.join(ROOT, "src", "logger.js"), "utf8")
  ]);
  assert.match(server, /installFileLogging\(\)/);
  assert.match(server, /process\.on\("uncaughtException"/);
  assert.match(server, /process\.on\("unhandledRejection"/);
  assert.match(logger, /server\.log/, "日志要落到 data/server.log 供排查");
  assert.match(server, /启动桌面窗口失败/, "拉起浏览器的 spawn 必须有 error 处理");
});

test("目录选择器滚动不再每帧写 DOM、不再做全屏模糊与整页重绘", async () => {
  const [app, css] = await Promise.all([
    fs.readFile(path.join(ROOT, "public", "app.js"), "utf8"),
    fs.readFile(path.join(ROOT, "public", "styles.css"), "utf8")
  ]);
  assert.match(app, /if \(!elements\.contextMenu\.hidden\)/,
    "隐藏状态下不能重复写 hidden 属性，否则每次滚动都触发样式失效");
  assert.match(app, /capture: true, passive: true/, "滚动监听必须 passive");
  assert.match(app, /if \(!elements\.directoryPickerBackdrop\.hidden\)/,
    "目录选择器可见性判断仍保留（Esc / 外部点击等交互）");
  const backdrop = css.slice(
    css.indexOf(".directory-backdrop {"),
    css.indexOf("body.modal-open {")
  );
  assert.match(backdrop, /backdrop-filter: none/, "目录遮罩不能带全屏模糊");
  const list = css.slice(
    css.indexOf(".directory-list {"),
    css.indexOf(".directory-row {")
  );
  assert.match(list, /contain: layout paint/, "列表要把重绘限制在自身");
  assert.match(list, /overscroll-behavior: contain/, "要阻止滚动链穿透");
});

test("目录选择器多选批量添加：跨目录保留与增量更新", async () => {
  const [app, css] = await Promise.all([
    fs.readFile(path.join(ROOT, "public", "app.js"), "utf8"),
    fs.readFile(path.join(ROOT, "public", "styles.css"), "utf8")
  ]);
  assert.match(app, /multiple: action === "browse"/,
    "只有添加仓库启用多选，扫描目录保持单选");
  assert.match(app, /directorySelected: new Set\(\)/, "选择集要跨目录保留");
  assert.match(app, /data-directory-check=/, "每个目录行要有复选框");
  assert.match(app, /directoryMultiple \? "add-selected" : "select"/,
    "底部主按钮在多选模式要指向批量添加动作");
  assert.match(app, /action === "add-selected"/, "要有批量添加的动作分发");
  assert.match(app, /MAX_DIRECTORY_BATCH_ADD = 50/, "批量添加要有上限保护");
  assert.match(app, /failures\.push/, "单个仓库失败不能中断其余仓库");

  const open = app.slice(
    app.indexOf("function openDirectoryPicker("),
    app.indexOf("async function loadDirectory(")
  );
  assert.match(open, /directorySelected\.clear\(\)/, "新开选择器要重置选择集");
  const load = app.slice(
    app.indexOf("async function loadDirectory("),
    app.indexOf("function renderDirectoryPicker(")
  );
  assert.doesNotMatch(load, /directorySelected\.clear\(\)/,
    "切换目录不能清空已勾选的仓库");
  const close = app.slice(
    app.indexOf("function closeDirectoryPicker("),
    app.indexOf("async function addRepositoryFromModal(")
  );
  assert.match(close, /directorySelected\.clear\(\)/, "关闭选择器要清空选择集");

  assert.match(app, /function updateDirectorySelectionUI\(/);
  assert.match(app, /function syncDirectoryRowChecks\(/);
  const updater = app.slice(
    app.indexOf("function updateDirectorySelectionUI("),
    app.indexOf("function selectAllVisibleRepositories(")
  );
  assert.doesNotMatch(updater, /directoryPickerBody\.innerHTML/,
    "勾选必须走增量 DOM 更新，不能重建列表破坏滚动性能");
  assert.match(css, /\.directory-selection-bar \{/);
  assert.match(css, /\.directory-check input \{/);
  assert.match(css, /accent-color: var\(--green\)/);
});

test("扫描结果支持全选 / 反选并拼接展示已选仓库", async () => {
  const [app, css] = await Promise.all([
    fs.readFile(path.join(ROOT, "public", "app.js"), "utf8"),
    fs.readFile(path.join(ROOT, "public", "styles.css"), "utf8")
  ]);

  const body = app.slice(
    app.indexOf("function renderScanModalBody("),
    app.indexOf("function scanRepositoryInputs(")
  );
  assert.match(body, /data-modal-action="scan-select-all"/, "要有全选按钮");
  assert.match(body, /data-modal-action="scan-invert-selection"/, "要有反选按钮");
  assert.match(body, /id="scanSelectionSummary"/, "要有已选清单展示区");
  assert.match(body, /data-scan-name=/, "复选框要带仓库名用于拼接展示");

  const updater = app.slice(
    app.indexOf("function updateScanSelectionUI("),
    app.indexOf("function openNewBranchModal(")
  );
  assert.match(updater, /\.join\("、"/, "选中项要拼接成名称清单");
  assert.match(updater, /summary\.textContent = text/, "清单要写回展示区");
  assert.match(updater, /summary\.title =/, "长清单要在悬停提示里给完整路径");
  assert.match(
    updater,
    /addButton\.disabled = selected\.length === 0/,
    "0 选中时禁用添加按钮"
  );
  assert.doesNotMatch(updater, /modalBody\.innerHTML/,
    "勾选必须增量更新，不能重建结果列表");

  const dispatch = app.slice(
    app.indexOf("async function handleModalAction("),
    app.indexOf("// 一次批量添加的上限")
  );
  assert.match(
    dispatch,
    /action === "scan-select-all" \|\| action === "scan-invert-selection"/,
    "两个按钮要接入现有动作分发"
  );
  assert.match(dispatch, /input\.checked = selectAll \? true : !input\.checked/,
    "反选要逐项取反");
  assert.match(app, /elements\.modalBody\.addEventListener\("change"/,
    "勾选变化要走容器委托");
  assert.match(
    app,
    /state\.modalType = "scan";[\s\S]{0,80}updateScanSelectionUI\(\)/,
    "打开弹窗要初始化清单"
  );
  const scan = app.slice(
    app.indexOf("async function scanFromModal("),
    app.indexOf("async function addScanResults(")
  );
  assert.match(scan, /updateScanSelectionUI\(\)/, "扫描完成要刷新清单与按钮");

  assert.match(css, /\.scan-selection-summary \{/);
  assert.match(css, /text-overflow: ellipsis/,
    "长清单要单行省略，不撑破布局");
});

test("文件列表的 .sln 模式汇总所有仓库的解决方案并支持快速打开", async () => {
  const [app, html, shell, css, actions] = await Promise.all([
    fs.readFile(path.join(ROOT, "public", "app.js"), "utf8"),
    fs.readFile(path.join(ROOT, "public", "index.html"), "utf8"),
    fs.readFile(path.join(ROOT, "src", "shell.js"), "utf8"),
    fs.readFile(path.join(ROOT, "public", "styles.css"), "utf8"),
    fs.readFile(path.join(ROOT, "src", "git-actions.js"), "utf8")
  ]);

  // 前端：工具区有 .sln 开关，以及跨仓库列表专用的搜索/范围/重新扫描工具条。
  assert.match(
    html,
    /data-action="toggle-solution-filter"/,
    "文件列表工具区应提供 .sln 按钮"
  );
  assert.match(html, /id="solutionToolbar"/, "应提供解决方案工具条");
  assert.match(html, /id="solutionSearchInput"/, "应提供解决方案搜索框");
  assert.match(html, /data-solution-scope="current"/, "应能切到仅当前仓库");
  assert.match(html, /data-solution-rescan/, "应能重新扫描");
  assert.match(app, /solutionFilter: false,/, "应存在 solutionFilter 状态");
  assert.match(
    app,
    /state\.solutionFilter = !state\.solutionFilter/,
    "点击 .sln 按钮应切换 solutionFilter"
  );
  // 核心修复：不再只扫当前仓库，而是汇总所有已添加仓库并缓存结果。
  assert.match(app, /solutionCatalog: \[\]/, "应维护跨仓库解决方案目录");
  assert.match(app, /solutionScope: "all"/, "默认范围为全部仓库");
  assert.match(app, /solutionCache: new Map\(\)/, "应按仓库缓存扫描结果");
  assert.match(
    app,
    /state\.repositories\.filter\(\s*\(repository\) => !state\.solutionCache\.has\(repository\.id\)/,
    "只扫描尚未缓存的仓库，而不是只看当前选中仓库"
  );
  assert.match(
    app,
    /async function fetchSolutions\(\{ force = false \} = \{\}\)[\s\S]{0,1200}\/api\/repositories\/\$\{repository\.id\}\/solutions/,
    "应对每个仓库调用 solutions 接口"
  );
  assert.match(app, /function buildSolutionCatalog\(/, "应构建跨仓库目录");
  assert.match(app, /function getVisibleSolutions\(/, "应按范围与关键字过滤");
  assert.match(app, /function renderSolutionList\(/, "应渲染独立的解决方案列表");
  assert.match(app, /function updateSolutionToolbar\(/, "应同步工具条状态");
  assert.match(app, /data-solution-select=/, "列表项应可单击选中");
  assert.match(app, /data-solution-key=/, "列表项应携带唯一键（跨仓库可能同名）");
  assert.match(
    app,
    /elements\.changesView\.classList\.toggle\([\s\S]{0,80}"solution-mode"/,
    "解决方案模式应切换 solution-mode 类以隐藏暂存勾选"
  );
  // 防回归：不能回到「只扫当前仓库、空了就说目录下没有 .sln」的旧实现。
  assert.doesNotMatch(
    app,
    /state\.solutions\.includes\(/,
    "不应再有只服务当前仓库的 solutions 数组"
  );
  assert.doesNotMatch(
    app,
    /目录下没有 \.sln 文件/,
    "空态不能把「当前仓库没有」误报成「目录下没有」"
  );
  assert.match(app, /没有找到 \.sln 文件/, "空态应说明已扫描全部仓库");

  // 双击或预览区按钮用 VS 打开：必须带上目标仓库 id，不能误用当前仓库。
  assert.match(app, /elements\.fileGroups\.addEventListener\("dblclick"/, "应绑定文件列表双击事件");
  assert.match(
    app,
    /closest\("\[data-solution-key\]"\)[\s\S]{0,220}requestOpenSolution\(/,
    "双击解决方案行应按唯一键打开"
  );
  assert.match(app, /function requestOpenSolution\(key\)/, "应有统一打开入口");
  assert.match(
    app,
    /lastSolutionOpen\.key === key[\s\S]{0,120}now - lastSolutionOpen\.at < 800/,
    "dblclick 与第二次 click 会重复触发，必须短时去重"
  );
  assert.match(
    app,
    /event\.detail >= 2[\s\S]{0,120}requestOpenSolution\(key\)/,
    "不派发 dblclick 的输入设备应由第二次 click 兜底打开"
  );
  // 根因防回归：单击选中若重建列表 DOM，浏览器就不会派发 dblclick，
  // 表现为「双击 .sln 完全没反应」。选中必须只做增量 class 切换。
  const selectBody = app.slice(
    app.indexOf("function selectSolutionItem("),
    app.indexOf("function requestOpenSolution(")
  );
  assert.ok(selectBody.length > 0, "应存在增量选中函数");
  assert.doesNotMatch(selectBody, /renderChanges\(/, "选中函数不能重建整个视图");
  assert.doesNotMatch(
    selectBody,
    /fileGroups\.innerHTML/,
    "选中函数不能重建列表 DOM"
  );
  assert.match(
    selectBody,
    /querySelectorAll\("\[data-solution-key\]"\)[\s\S]{0,220}classList\.toggle\("selected"/,
    "选中态只切换 class"
  );
  assert.match(app, /function renderSolutionPreview\(/, "右侧预览区应独立渲染");
  assert.match(
    app,
    /async function openInVisualStudio\(target\)[\s\S]{0,900}isSolutionFile\(relativePath\)[\s\S]{0,900}api\(`\/api\/repositories\/\$\{repositoryId\}\/action`/,
    "打开前必须校验 .sln，并直接向条目所属仓库发动作请求"
  );
  const openBody = app.slice(
    app.indexOf("async function openInVisualStudio("),
    app.indexOf("function requestPreviewMode(")
  );
  assert.ok(openBody.length > 0, "应存在独立的打开函数");
  assert.doesNotMatch(
    openBody,
    /performRepoAction\(/,
    "打开 VS 不能走通用动作队列，否则会被仓库 busy 锁静默丢弃"
  );
  assert.match(
    app,
    /item\?\.repositoryId \|\| state\.selectedId/,
    "跨仓库条目应携带 repositoryId"
  );
  assert.match(
    app,
    /showToast\([\s\S]{0,80}"正在启动 Visual Studio"/,
    "VS 启动慢，打开前应有即时反馈"
  );
  assert.match(
    app,
    /showToast\("打开解决方案失败"/,
    "打开失败必须明确提示，不能静默"
  );
  assert.match(app, /filePath\.toLowerCase\(\)\.endsWith\("\.sln"\)/, "双击只响应 .sln 文件");
  // 选中 .sln 时预览操作栏提供显式入口。
  assert.match(
    app,
    /data-preview-action="openSolution"/,
    "预览区应提供「用 Visual Studio 打开」按钮"
  );

  // 后端：新增与 git 无关的解决方案扫描接口。
  const routes = await fs.readFile(
    path.join(ROOT, "src", "routes.js"),
    "utf8"
  );
  assert.match(
    routes,
    /\(status\|detail\|diff\|file\|history\|commit\|action\|solutions\)/,
    "仓库路由正则应包含 commit 与 solutions 子路径"
  );
  assert.match(
    routes,
    /route === "solutions"[\s\S]{0,80}listSolutions\(repository\)/,
    "GET solutions 应调用 listSolutions 扫描目录"
  );
  const directories = await fs.readFile(
    path.join(ROOT, "src", "directories.js"),
    "utf8"
  );
  assert.match(
    directories,
    /async function listSolutions\(repository\)/,
    "directories 应导出 listSolutions"
  );
  assert.match(
    directories,
    /entry\.name === "\.git"/,
    "扫描解决方案应跳过 .git 目录"
  );
  assert.match(
    directories,
    /endsWith\("\.sln"\)/,
    "listSolutions 只收集 .sln 文件"
  );
  const solutionSource = directories.slice(
    directories.indexOf("async function listSolutions"),
    directories.indexOf("module.exports")
  );
  assert.doesNotMatch(
    solutionSource,
    /MAX_DEPTH|MAX_ENTRIES|async function walk|walk\(/,
    "listSolutions 不得递归扫描子目录，只读仓库根目录第一层"
  );
  assert.match(
    solutionSource,
    /entry\.isFile\(\)/,
    "只收集根目录下的文件，目录一律不进入"
  );

  // 后端：动作白名单登记 openVisualStudio，并用仓库路径校验防止越界。
  assert.match(
    actions,
    /case "openVisualStudio":/,
    "runRepositoryAction 应登记 openVisualStudio 动作"
  );
  assert.match(
    actions,
    /validateRepositoryPath\(repository\.path, body\.path\)/,
    "打开解决方案必须校验路径在仓库内，禁止越界"
  );
  assert.match(
    shell,
    /devenv\.exe/,
    "shell 应定位 Visual Studio 的 devenv.exe"
  );
  assert.match(shell, /vswhere\.exe/, "应优先用 vswhere 定位 VS 安装");
  assert.match(shell, /Microsoft\.VisualStudio\.Component\.CoreEditor/, "vswhere 应筛选带编辑器内核的版本");
  assert.match(shell, /function openVisualStudio\(/, "shell 应导出 openVisualStudio");
  assert.match(shell, /module\.exports = \{[\s\S]*openVisualStudio/, "openVisualStudio 应被导出");

  // 样式：过滤按钮激活态、跨仓库工具条与列表、普通 .sln 行标记。
  assert.match(css, /\.solution-filter-toggle \.solution-badge \{/);
  assert.match(css, /\.solution-toolbar \{/, "应有搜索/范围/重新扫描工具条样式");
  assert.match(css, /\.solution-row \{/, "应有跨仓库解决方案列表样式");
  assert.match(css, /\.solution-list-empty \{/, "空态应可操作而不是死胡同");
  assert.match(css, /\.solution-file \.tree-file-open::after/, "普通文件列表里的 .sln 仍应有 VS 标记");
});

test("listSolutions 只扫描根目录第一层的 .sln，与 git 状态无关", async () => {
  const { listSolutions } = require("../src/directories");
  const base = path.join(
    ROOT,
    ".workbuddy",
    "scratch",
    `sln-scan-${process.pid}-${Date.now()}`
  );
  await fs.mkdir(path.join(base, "src", "sub"), { recursive: true });
  await fs.mkdir(path.join(base, ".git"), { recursive: true });
  await fs.writeFile(path.join(base, "App.sln"), "");
  await fs.writeFile(path.join(base, "Zoo.sln"), "");
  // 子目录里的 .sln 不应再被递归扫出来
  await fs.writeFile(path.join(base, "src", "sub", "Lib.sln"), "");
  // .git 内部即便有 .sln 也不应被扫描出来
  await fs.writeFile(path.join(base, ".git", "ignoreme.sln"), "");
  // 非 .sln 文件不应出现
  await fs.writeFile(path.join(base, "readme.txt"), "");

  const solutions = await listSolutions({ path: base });

  assert.deepEqual(
    solutions,
    ["App.sln", "Zoo.sln"],
    "只返回仓库根目录第一层的 .sln（已排序），不递归子目录、排除 .git 与非 .sln 文件"
  );

  await fs.rm(base, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

test("解决方案读取失败必须明确报错，start.cmd 能真正重启后端", async () => {
  const [app, startCmd, restartScript] = await Promise.all([
    fs.readFile(path.join(ROOT, "public", "app.js"), "utf8"),
    fs.readFile(path.join(ROOT, "start.cmd"), "utf8"),
    fs.readFile(path.join(ROOT, "tools", "restart-server.ps1"), "utf8")
  ]);

  assert.match(app, /solutionsError: ""/, "应初始化解决方案错误状态");
  assert.match(app, /state\.solutionsRequest/, "切换仓库时应让在途扫描请求失效");
  assert.match(
    app,
    /\/接口不存在\|404\/\.test\(failures\[0\] \|\| ""\)[\s\S]{0,300}start\.cmd/,
    "404 应提示重新运行 start.cmd 重启服务，不能伪装成空目录"
  );
  assert.match(
    app,
    /state\.solutionsError && !items\.length[\s\S]{0,300}escapeHtml\(state\.solutionsError\)/,
    "解决方案列表错误态应显示明确原因"
  );
  assert.match(
    app,
    /if \(state\.solutionsError\)[\s\S]{0,260}无法读取解决方案列表/,
    "预览区错误态不应显示「目录下没有 .sln 文件」"
  );

  assert.match(
    startCmd,
    /tools\\restart-server\.ps1/,
    "start.cmd 启动前应先停掉旧服务进程"
  );
  assert.match(restartScript, /Get-NetTCPConnection -LocalPort/);
  assert.match(restartScript, /server\\\.js/, "只终止运行 server.js 的进程");
  assert.match(restartScript, /Stop-Process/);
});

test("桌面窗口进程退出即关闭后端", async () => {
  const [desktop, server, restartScript, processModule] = await Promise.all(
    [
      ["src", "desktop.js"],
      ["server.js"],
      ["tools", "restart-server.ps1"],
      ["src", "process.js"]
    ].map((parts) => fs.readFile(path.join(ROOT, ...parts), "utf8"))
  );

  assert.match(
    desktop,
    /--user-data-dir=\$\{WINDOW_PROFILE_DIR\}/,
    "必须用独立 profile，否则窗口关闭无法被后端感知"
  );
  assert.match(desktop, /function createWindowLifecycle/);
  assert.match(desktop, /attachAppWindow/);
  assert.match(server, /attachAppWindow\(child/);
  assert.match(server, /killActiveChildren\(\)/, "退出前清理在飞的 git 子进程");
  assert.match(server, /process\.exit\(0\)/, "关窗口应真正结束后端进程");
  assert.match(
    restartScript,
    /Stop-GitDescendants/,
    "强杀旧后端前先收敛其 git 子进程，避免留下 lock"
  );
  assert.match(
    restartScript,
    /--app=http:\/\/127\.0\.0\.1:\$port/,
    "重启时应精确收掉旧 GitDeck 窗口，避免留下孤儿窗口"
  );
  assert.match(processModule, /activeChildren/);
});

test("不再有任何后台自动抓取或定时状态刷新", async () => {
  const [server, config, app] = await Promise.all(
    [
      ["server.js"],
      ["src", "config.js"],
      ["public", "app.js"]
    ].map((parts) => fs.readFile(path.join(ROOT, ...parts), "utf8"))
  );

  assert.doesNotMatch(server, /auto-fetch|startAutoFetch|stopAutoFetch/);
  assert.doesNotMatch(config, /AUTO_FETCH/);
  assert.doesNotMatch(
    app,
    /autoRefreshTimer|setInterval/,
    "前端不得再注册定时状态刷新"
  );
  assert.match(
    app,
    /refreshAllSummaries\(\{ quiet: true \}\)/,
    "交互触发的本地状态刷新仍保留"
  );
  assert.match(
    app,
    /addEventListener\("click"[\s\S]{0,200}fetchAllRepositories\(\)/,
    "顶部按钮改为抓取所有仓库（仅用户点击）"
  );
  assert.match(app, /async function fetchAllRepositories\(\)/);
  assert.doesNotMatch(
    app,
    /addEventListener\("click"[\s\S]{0,200}refreshAllSummaries\(\{ force: true \}\)/,
    "顶部按钮不再只是本地状态刷新"
  );
  const refreshBody = app.slice(
    app.indexOf("async function refreshAllSummaries"),
    app.indexOf("async function fetchAllRepositories")
  );
  assert.doesNotMatch(
    refreshBody,
    /action:\s*"fetch"|method:\s*"POST"/,
    "自动/被动的状态刷新路径不得发起抓取"
  );
  assert.match(
    app,
    /index \+= 4/,
    "批量抓取必须分批限流，不能一次拉起所有仓库的 git 进程"
  );
  const exists = async (...parts) =>
    fs.access(path.join(ROOT, ...parts)).then(
      () => true,
      () => false
    );
  assert.equal(
    await exists("src", "auto-fetch.js"),
    false,
    "后台抓取模块应已删除"
  );
  assert.equal(
    await exists("tests", "auto-fetch.test.js"),
    false,
    "后台抓取的测试应一并删除"
  );
});

test("提交历史只有分支/标签徽标支持 TortoiseGit 风格右键菜单", async () => {
  const [app, css, actions, routes] = await Promise.all(
    [
      ["public", "app.js"],
      ["public", "styles.css"],
      ["src", "git-actions.js"],
      ["src", "routes.js"]
    ].map((parts) => fs.readFile(path.join(ROOT, ...parts), "utf8"))
  );

  // 历史行与装饰标签必须把哈希 / 引用信息写进 DOM，右键菜单才有上下文。
  assert.match(app, /data-commit-hash="\$\{escapeHtml\(\s*row\.hash/, "历史行必须携带完整提交哈希");
  assert.match(app, /data-ref-full="\$\{escapeHtml\(\s*decoration/, "装饰标签必须保留 %D 原文");
  assert.match(app, /data-ref-kind="\$\{kind\}"/, "装饰标签必须标注引用类型");
  assert.match(app, /refKind\s*=\s*decoration\.dataset\.refKind/);

  // 仓库行与徽标菜单共用渲染器，按上下文分发，不能落到仓库菜单动作上。
  assert.match(app, /function showContextMenu\(\{ label, items, position, context \}\)/);
  assert.match(app, /context-menu-wide/);
  assert.match(app, /state\.menuContext = context/);
  assert.match(app, /if \(context\.type === "repo"\)[\s\S]{0,120}handleRepoMenuAction/);
  assert.match(app, /handleHistoryMenuAction\(action, context\)/);
  assert.match(app, /function openRefMenu\(/);

  // 提交行右键菜单已移除：只有落在徽标上才拦截右键，其它位置保持浏览器默认行为。
  assert.doesNotMatch(app, /openCommitMenu\(/, "不应再有提交行右键菜单");
  assert.doesNotMatch(app, /type: "commit"/, "菜单上下文不应再有 commit 类型");
  assert.match(app, /const decoration = event\.target\.closest\("\.context-history-decoration"\)/);
  assert.match(app, /if \(!decoration \|\| !state\.selectedId\)/, "未命中徽标应直接返回");
  assert.match(app, /decoration\.closest\("\.context-history-row"\)/);

  // 核心诉求：右键分支标签要能快速切换到该分支。
  assert.match(app, /action === "switch-ref"[\s\S]{0,600}checkoutRef/, "切换引用必须走 checkoutRef 动作");
  assert.match(app, /action: "switch-ref"[\s\S]{0,120}primary: true/, "切换引用应是菜单主操作");
  assert.match(actions, /case "checkoutRef":/, "runRepositoryAction 必须登记 checkoutRef");
  assert.match(actions, /async function checkoutRef\(/);
  assert.match(actions, /"switch",\s*\n\s*"-c",\s*\n\s*target\.branch,\s*\n\s*"--track"/, "远端引用要创建同名跟踪分支");
  assert.match(actions, /"symbolic-ref",\s*\n\s*"--short"/, "origin/HEAD 要先解析成具体远端分支");

  // 其余分支级动作与 destructive 确认；提交级动作随提交行菜单一并清理。
  for (const action of [
    "checkoutCommit",
    "createBranchAt",
    "createTagAt",
    "pushRef",
    "deleteRef"
  ]) {
    assert.match(actions, new RegExp(`case "${action}":`), `动作白名单缺少 ${action}`);
  }
  for (const action of [
    "cherryPick",
    "revertCommit",
    "resetToCommit",
    "rebaseOnto"
  ]) {
    assert.doesNotMatch(
      actions,
      new RegExp(`case "${action}":`),
      `提交级动作 ${action} 已无入口，应删除`
    );
  }
  assert.doesNotMatch(app, /action: "merge-commit"|action: "cherry-pick"|action: "revert-commit"|action: "reset-to-commit"|action: "rebase-onto"/, "提交行专属菜单项应全部移除");
  assert.match(app, /openCreateRefAtModal|create-history-ref/, "创建分支/标签需要表单弹窗");
  assert.doesNotMatch(app, /historyResetMode/, "重置模式表单随提交行菜单一起移除");
  assert.match(app, /danger: true/, "破坏性动作需要危险确认");

  // 删除引用要能删掉未合并分支：确认框显式提供 -D 勾选，并把 force 传给后端。
  assert.match(app, /id="forceDeleteRef"/, "删除引用确认框要有强制删除 -D 选项");
  assert.doesNotMatch(
    app,
    /id="forceDeleteRef"[^>]*checked/,
    "强制删除默认关闭，必须用户显式勾选"
  );
  assert.match(
    app,
    /document\.getElementById\("forceDeleteRef"\)/,
    "确认时要读取强制删除勾选状态"
  );
  assert.match(app, /ref: context\.ref,\s*force/, "deleteRef 动作必须带上 force");
  assert.match(actions, /force \? "-D" : "-d"/, "后端 force 应切换为 git branch -D");
  assert.match(app, /function copyText\(/, "复制到剪贴板需要兼容非安全上下文的回退");
  assert.match(app, /navigator\.clipboard\?\.writeText/);

  // 差异接口：三种比较模式 + 参数校验 + 根提交回退。
  assert.match(routes, /route === "commit"[\s\S]{0,180}getCommitChanges\(/, "应登记 GET commit 接口");
  assert.match(actions, /async function getCommitChanges\(/);
  assert.match(actions, /\["worktree", "previous", "patch"\]/);
  assert.match(actions, /validateCommitHash\(repository\.path, hashInput\)/);
  assert.match(actions, /根提交没有父提交，退回 show/);
  assert.match(actions, /module\.exports = \{[\s\S]*getCommitChanges/, "getCommitChanges 必须导出");

  // 菜单变长后必须允许内部滚动，且不能把菜单自身滚动当成页面滚动。
  assert.match(css, /\.context-menu\.context-menu-wide \{/);
  assert.match(css, /max-height: min\(78vh, 640px\)/);
  assert.match(css, /\.context-menu button\.primary \{/);
  assert.match(css, /\.commit-patch \{/);
  assert.match(app, /elements\.contextMenu\.contains\(event\.target\)/, "菜单内部滚动不能关闭菜单");
});

// 直接执行 app.js 里的真实渲染函数（而不是只做源码字符串断言）：
// 行内 diff 是纯函数，只有 escapeHtml 依赖浏览器侧，注入等价实现即可。
function loadDiffRenderer(appSource) {
  const start = appSource.indexOf("  const MAX_INLINE_LINE_CHARS = 3000;");
  const end = appSource.indexOf("  async function handleModalAction(button) {");
  assert.ok(start > 0 && end > start, "应能从 app.js 提取行内 diff 渲染函数");
  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  return new Function(
    "escapeHtml",
    `${appSource.slice(
      start,
      end
    )}\nreturn { renderDiff, buildInlineMarks, inlineDiffSegments, tokenizeDiffLine, diffLineKind };`
  )(escapeHtml);
}

test("diff 行内变动按 TortoiseGitMerge 的 word-wise 规则标出整词", async () => {
  const [app, css] = await Promise.all([
    fs.readFile(path.join(ROOT, "public", "app.js"), "utf8"),
    fs.readFile(path.join(ROOT, "public", "styles.css"), "utf8")
  ]);
  const { renderDiff, inlineDiffSegments, tokenizeDiffLine, diffLineKind } =
    loadDiffRenderer(app);

  // 不能退回旧实现（整行 escapeHtml 后统一着色），两处入口都要共用新渲染。
  assert.match(app, /function buildInlineMarks\(lines\)/);
  assert.match(app, /function tokenizeDiffLine\(text\)/);
  assert.match(app, /function inlineDiffSegments\(before, after\)/);
  assert.match(app, /MAX_INLINE_LINE_CHARS = 3000/, "沿用乌龟的长行上限");
  assert.doesNotMatch(app, /charDiffSegments/, "不再使用逐字符 diff");
  assert.match(
    app,
    /function renderDiff\(diff\)[\s\S]{0,300}buildInlineMarks\(lines\)/,
    "renderDiff 必须先算行内片段再渲染"
  );
  assert.match(
    app,
    /elements\.filePreview\.innerHTML = `<pre class="diff-view">\$\{renderDiff\(/,
    "主预览区要走行内高亮渲染"
  );
  assert.match(app, /<pre class="diff-view">\$\{renderDiff\(diff\)\}<\/pre>/, "diff 弹窗也要走行内高亮渲染");
  assert.match(css, /\.diff-inline-del \{/);
  assert.match(css, /\.diff-inline-add \{/);
  assert.match(css, /\.diff-line\.added\.inline/, "配对的修改行改用中性 modified 底色");

  // word-wise：改一个标识符时整个词一起高亮，不拆成一堆零碎字符。
  const segments = inlineDiffSegments(
    "const value = createSaltedMD5(input);",
    "const value = createSaltedSHA(input);"
  );
  assert.ok(segments, "相似行应产生片段级差异");
  const changedLeft = segments.left
    .filter((segment) => segment.changed)
    .map((segment) => segment.text)
    .join("");
  const changedRight = segments.right
    .filter((segment) => segment.changed)
    .map((segment) => segment.text)
    .join("");
  assert.equal(changedLeft, "createSaltedMD5", "删除侧整个被替换的词一起高亮");
  assert.equal(changedRight, "createSaltedSHA", "新增侧整个新词一起高亮");
  const unchangedLeft = segments.left
    .filter((segment) => !segment.changed)
    .map((segment) => segment.text)
    .join("");
  assert.match(unchangedLeft, /const value =/);
  assert.match(unchangedLeft, /\(input\);/);
  assert.ok(
    tokenizeDiffLine("let 价格 = 10;").includes("价格"),
    "连续汉字作为一个词，不按字符拆"
  );

  const diff = [
    "diff --git a/app.js b/app.js",
    "index 1111111..2222222 100644",
    "--- a/app.js",
    "+++ b/app.js",
    "@@ -1,3 +1,3 @@",
    " const a = 1;",
    "-const value = createSaltedMD5(input);",
    "+const value = createSaltedSHA(input);",
    " const b = 2;"
  ].join("\n");
  const html = renderDiff(diff);

  assert.equal(diffLineKind("+++ b/app.js"), "header");
  assert.equal(diffLineKind("@@ -1,3 +1,3 @@"), "hunk");
  assert.equal(diffLineKind("+const x"), "added");
  assert.equal(diffLineKind("-const x"), "removed");
  assert.equal(diffLineKind(" const x"), "context");
  assert.match(html, /<span class="diff-line header">/);
  assert.match(html, /<span class="diff-line hunk">/);
  assert.match(html, /<span class="diff-line removed/);
  assert.match(html, /<span class="diff-line added/);
  assert.match(html, /<span class="diff-marker">-/);
  assert.match(html, /<span class="diff-marker">\+/);

  const delMarks = [
    ...html.matchAll(/<mark class="diff-inline-del">([\s\S]*?)<\/mark>/g)
  ].map((match) => match[1]);
  const addMarks = [
    ...html.matchAll(/<mark class="diff-inline-add">([\s\S]*?)<\/mark>/g)
  ].map((match) => match[1]);
  assert.ok(delMarks.length && addMarks.length, "删除行与新增行都要有行内标记");
  assert.ok(delMarks.join("").includes("createSaltedMD5"), "删除侧应标出整个被替换的词");
  assert.ok(addMarks.join("").includes("createSaltedSHA"), "新增侧应标出整个新词");
  assert.match(html, /class="diff-line removed inline"/, "删除行标记为 modified 行");
  assert.match(html, /class="diff-line added inline"/, "新增行标记为 modified 行");
  assert.match(
    html,
    /<span class="diff-line "> const a = 1;<\/span>/,
    "上下文行保持原样"
  );
  assert.ok(
    !/<span class="diff-line "> [^<]*<mark/.test(html),
    "上下文行不应被标亮"
  );
});

test("行内高亮有规模保护且不会破坏 HTML 转义", async () => {
  const app = await fs.readFile(path.join(ROOT, "public", "app.js"), "utf8");
  const { renderDiff, inlineDiffSegments } = loadDiffRenderer(app);

  // 整行重写 / 超长行：退回整行着色，避免零碎色块与 O(n^2) 卡顿。
  assert.equal(inlineDiffSegments("aaaaaaaaaaaa", "bbbbbbbbbbbb"), null);
  assert.equal(inlineDiffSegments("a".repeat(700), "b".repeat(700)), null);
  assert.equal(
    inlineDiffSegments("x ".repeat(1600), "y ".repeat(1600)),
    null,
    "超过 3000 字符的行不做行内差异"
  );

  const big = ["@@ -1,120 +1,120 @@"];
  for (let i = 0; i < 100; i += 1) big.push(`-line ${i} old`);
  for (let i = 0; i < 100; i += 1) big.push(`+line ${i} new`);
  const bigHtml = renderDiff(big.join("\n"));
  assert.ok(
    !bigHtml.includes("<mark"),
    "超过上限的变更块应退回行级着色，避免大 diff 卡顿"
  );

  // 代码里的 < > & 必须转义，不能被当成标签注入。
  const escaped = renderDiff(
    "@@ -1 +1 @@\n-const ok = a<b && c;\n+const ok = a<b && d;"
  );
  assert.ok(!escaped.includes("a<b"), "代码里的 < 必须转义");
  assert.match(escaped, /a&lt;b &amp;&amp;/);
  assert.ok(!escaped.includes("<script"), "不得产生可注入的标签");
});

test("index.lock 默认逻辑：只清理陈旧锁、绝不删活锁、不做后台巡检", async () => {
  const [indexLock, processModule, gitActions, server, app, css] =
    await Promise.all(
      [
        ["src", "index-lock.js"],
        ["src", "process.js"],
        ["src", "git-actions.js"],
        ["server.js"],
        ["public", "app.js"],
        ["public", "styles.css"]
      ].map((parts) => fs.readFile(path.join(ROOT, ...parts), "utf8"))
    );

  assert.doesNotMatch(
    indexLock,
    /setInterval|setTimeout|schedule|cron/,
    "锁处理不得注册任何后台巡检任务"
  );
  assert.doesNotMatch(
    server,
    /require\("\.\/src\/index-lock"\)|recoverIndexLock/,
    "锁处理只在用户触发的 git 命令里介入，服务启动/常驻路径不得调用"
  );
  assert.doesNotMatch(
    indexLock,
    /require\("\.\/process"\)/,
    "避免与 process.js 形成循环依赖"
  );
  assert.match(
    indexLock,
    /\[System\.IO\.FileShare\]::None/,
    "必须用独占打开判定是否有进程持有锁"
  );
  assert.match(indexLock, /isUnder\(candidate, gitDir\)/, "只处理 git 目录内的锁");
  assert.ok(
    indexLock.indexOf("if (probe.held)") < indexLock.indexOf("await fs.unlink("),
    "删锁之前必须先排除活锁"
  );
  assert.match(
    indexLock,
    /formatIndexLockHeldError\(rawMessage, probe\)/,
    "活锁错误必须带上占用进程信息"
  );
  assert.match(
    processModule,
    /recoverIndexLock\(repositoryPath, message\)/,
    "runGit 必须接入锁恢复"
  );
  assert.match(
    processModule,
    /const retry = await runProcess\("git", gitArgs, options\)/,
    "清理后只重试一次，不做循环重试"
  );
  assert.match(gitActions, /consumeRecoveryNotes\(/, "恢复说明要汇总进动作结果");

  // 多行错误详情必须能完整显示，不能被 toast 的 3 行截断和 5 秒消失吞掉。
  assert.match(app, /message\.includes\("\\n"\)/);
  assert.match(app, /" has-detail"/);
  assert.match(css, /\.toast\.has-detail \.toast-message/);
  assert.match(css, /white-space: pre-line/);
});

function loadLogRenderer(appSource) {
  const start = appSource.indexOf("  function formatLogTime(value) {");
  const end = appSource.indexOf("  function showConfirm({");
  assert.ok(start > 0 && end > start, "应能从 app.js 提取日志弹窗渲染函数");
  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  const elements = {
    modalBody: { innerHTML: "" },
    modalBackdrop: { hidden: false }
  };
  const factory = new Function(
    "escapeHtml",
    "elements",
    `${appSource.slice(start, end)}\nreturn { renderLogPanel, formatLogTime };`
  );
  return { ...factory(escapeHtml, elements), elements };
}

test("Log 弹窗渲染真实错误全文，不截断也不产生 HTML 注入", async () => {
  const app = await fs.readFile(path.join(ROOT, "public", "app.js"), "utf8");
  const { renderLogPanel, elements } = loadLogRenderer(app);

  renderLogPanel({
    errors: [
      {
        time: "2026-11-09T09:08:42.123Z",
        status: 422,
        method: "POST",
        path: "/api/repositories/abcdef123456/action",
        repository: "AgisoBase",
        action: "fetch",
        message:
          "error: cannot lock ref 'refs/remotes/origin/yg_keyhelper'\n<script>alert(1)</script>"
      }
    ],
    server: ["[2026-11-09T09:00:00.000Z] [WARN] [index-lock] 已清理陈旧锁"]
  });
  const html = elements.modalBody.innerHTML;
  assert.match(html, /AgisoBase/);
  assert.match(html, /fetch/);
  assert.match(html, /HTTP 422/);
  assert.match(html, /cannot lock ref/, "错误全文必须完整保留");
  assert.match(html, /&lt;script&gt;/, "错误内容必须 HTML 转义");
  assert.ok(!html.includes("<script>alert"), "不得注入可执行标签");
  assert.match(html, /<details class="log-entry" open>/, "第一条错误默认展开");
  assert.match(html, /log-server/);
  assert.match(html, /index-lock/, "服务日志尾部也要展示");

  renderLogPanel({ errors: [], server: [] });
  assert.match(elements.modalBody.innerHTML, /暂无记录的操作错误/);
  assert.match(elements.modalBody.innerHTML, /服务运行日志为空/);
});

test("顶栏 Log 按钮只读取本机错误日志，不引入任何后台巡检", async () => {
  const [html, app, server, routes, actionLog] = await Promise.all([
    fs.readFile(path.join(ROOT, "public", "index.html"), "utf8"),
    fs.readFile(path.join(ROOT, "public", "app.js"), "utf8"),
    fs.readFile(path.join(ROOT, "server.js"), "utf8"),
    fs.readFile(path.join(ROOT, "src", "routes.js"), "utf8"),
    fs.readFile(path.join(ROOT, "src", "action-log.js"), "utf8")
  ]);

  assert.match(html, /id="logButton"/, "顶栏要有 Log 按钮");
  assert.ok(
    html.indexOf('id="refreshAllButton"') < html.indexOf('id="logButton"') &&
      html.indexOf('id="logButton"') < html.indexOf('id="scanButton"'),
    "Log 必须紧挨在「抓取全部」后面"
  );
  assert.match(app, /elements\.logButton\.addEventListener\("click"/);
  assert.match(app, /\/api\/logs\?limit=100/, "Log 弹窗走日志接口");
  assert.match(app, /logRequest \+= 1/, "关闭弹窗要让在途日志请求失效");
  assert.match(app, /data-modal-action="log-refresh"/);
  assert.match(routes, /url\.pathname === "\/api\/logs"/);
  assert.match(routes, /readLogs\(limit\)/);
  assert.match(
    routes,
    /error\.gitdeckRepository = repository\.name/,
    "失败动作要带上仓库名与动作名"
  );
  assert.match(server, /recordApiError\(error, request\)/);
  assert.match(
    server,
    /startsWith\("\/api\/"\)/,
    "静态资源失败不该淹没错误日志"
  );
  assert.match(actionLog, /path\.join\(DATA_ROOT, "errors\.log"\)/);
  assert.doesNotMatch(
    actionLog,
    /SESSION_TOKEN|x-gitdeck-token/i,
    "日志不得记录会话令牌"
  );
  assert.doesNotMatch(
    actionLog,
    /setInterval|setTimeout|watchFile|cron/,
    "日志模块不得注册任何后台任务"
  );
});
