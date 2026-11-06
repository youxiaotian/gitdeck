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

test("文件列表支持 .sln 过滤并双击用 Visual Studio 打开", async () => {
  const [app, html, shell, css, actions] = await Promise.all([
    fs.readFile(path.join(ROOT, "public", "app.js"), "utf8"),
    fs.readFile(path.join(ROOT, "public", "index.html"), "utf8"),
    fs.readFile(path.join(ROOT, "src", "shell.js"), "utf8"),
    fs.readFile(path.join(ROOT, "public", "styles.css"), "utf8"),
    fs.readFile(path.join(ROOT, "src", "git-actions.js"), "utf8")
  ]);

  // 前端：文件列表工具区有 .sln 过滤按钮，且点击切换 solutionFilter。
  assert.match(
    html,
    /data-action="toggle-solution-filter"/,
    "文件列表工具区应提供 .sln 过滤按钮"
  );
  assert.match(app, /state\.solutionFilter = false/, "应存在 solutionFilter 状态");
  assert.match(
    app,
    /state\.solutionFilter = !state\.solutionFilter/,
    "点击 .sln 按钮应切换 solutionFilter"
  );
  // 过滤逻辑：解决方案模式与 git 无关，直接展示目录下所有 .sln；
  // 普通模式仍按状态（全部/未暂存/已暂存/未跟踪）筛选。
  assert.match(app, /function getVisibleEntries\(/, "应抽出统一的可见文件筛选函数");
  assert.match(
    app,
    /state\.solutionFilter[\s\S]{0,80}return entries;/,
    "解决方案模式应直接返回所有 .sln 条目，不受 git 状态约束"
  );
  assert.match(
    app,
    /function toSolutionEntry\(filePath\)[\s\S]{0,80}solution: true/,
    "应把 .sln 路径包装成解决方案条目"
  );
  assert.match(
    app,
    /async function fetchSolutions\(\)[\s\S]{0,500}\/api\/repositories\/\$\{[^}]+\}\/solutions/,
    "开启过滤应从后端扫描解决方案接口拉取列表"
  );
  assert.match(
    app,
    /function renderSolutionView\(\)/,
    "应存在独立的解决方案视图渲染"
  );
  assert.match(
    app,
    /function resolveFileEntry\(filePath\)/,
    "应抽出解析文件条目的函数，以便解决方案文件不依赖 git 状态"
  );
  assert.match(
    app,
    /state\.solutions\.includes\(filePath\)/,
    "点击 .sln 文件应能在解决方案列表里解析到，而不依赖 git 状态"
  );
  assert.match(
    app,
    /elements\.changesView\.classList\.toggle\([\s\S]{0,80}"solution-mode"/,
    "解决方案模式应切换 solution-mode 类以隐藏暂存勾选"
  );
  // 双击 .sln 行用 VS 打开；非 .sln 文件忽略。
  assert.match(app, /elements\.fileGroups\.addEventListener\("dblclick"/, "应绑定文件列表双击事件");
  assert.match(
    app,
    /const filePath = target\.dataset\.previewFile;[\s\S]{0,160}openInVisualStudio\(filePath\)/,
    "双击 .sln 行应触发用 VS 打开"
  );
  assert.match(
    app,
    /function openInVisualStudio\(filePath\)[\s\S]{0,200}isSolutionFile\(filePath\)[\s\S]{0,200}performRepoAction\(state\.selectedId, "openVisualStudio"/,
    "openInVisualStudio 必须经 isSolutionFile 校验后再发 openVisualStudio 动作"
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
    /\(status\|detail\|diff\|file\|history\|action\|solutions\)/,
    "仓库路由正则应包含 solutions 子路径"
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

  // 样式：过滤按钮激活态与 solution 行标记。
  assert.match(css, /\.solution-filter-toggle \.solution-badge \{/);
  assert.match(css, /\.solution-file \.tree-file-open::after/, "solution 文件应有 VS 标记");
});

test("listSolutions 直接扫描目录下的 .sln，与 git 状态无关且跳过 .git", async () => {
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
  await fs.writeFile(path.join(base, "src", "sub", "Lib.sln"), "");
  // .git 内部即便有 .sln 也不应被扫描出来
  await fs.writeFile(path.join(base, ".git", "ignoreme.sln"), "");
  // 非 .sln 文件不应出现
  await fs.writeFile(path.join(base, "readme.txt"), "");

  const solutions = await listSolutions({ path: base });

  assert.deepEqual(
    solutions.sort(),
    ["App.sln", "src/sub/Lib.sln"].sort(),
    "应返回目录下（含子目录）所有 .sln 的相对路径，排除 .git 与非 .sln 文件"
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
    /\/接口不存在\|404\/\.test\(message\)[\s\S]{0,300}start\.cmd/,
    "404 应提示重新运行 start.cmd 重启服务，不能伪装成空目录"
  );
  assert.match(
    app,
    /state\.solutionFilter && state\.solutionsError[\s\S]{0,300}无法读取解决方案列表/,
    "文件列表错误态应显示明确原因"
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
    /refreshAllSummaries\(\{ force: true \}\)/,
    "手动刷新入口必须保留"
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
