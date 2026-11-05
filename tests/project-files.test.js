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
    "默认必须是常驻（0 = 不自动退出）");
});

test("前端心跳在窗口恢复可见时补发，任何鉴权 API 也会续命", async () => {
  const [html, routes] = await Promise.all([
    fs.readFile(path.join(ROOT, "public", "index.html"), "utf8"),
    fs.readFile(path.join(ROOT, "src", "routes.js"), "utf8")
  ]);
  for (const event of ["visibilitychange", "pageshow", "focus", "online"]) {
    assert.ok(html.includes(event), `心跳应在 ${event} 时补发`);
  }
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
    "目录选择器打开时要跳过后台整页重绘");
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
