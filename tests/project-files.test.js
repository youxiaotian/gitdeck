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
  const [html, server] = await Promise.all([
    fs.readFile(path.join(ROOT, "public", "index.html"), "utf8"),
    fs.readFile(path.join(ROOT, "server.js"), "utf8")
  ]);
  assert.match(html, /data-repo-action="openTortoiseGit"/);
  assert.match(server, /TortoiseGitProc\.exe/);
  assert.match(server, /\/command:log/);
});
