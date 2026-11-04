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
