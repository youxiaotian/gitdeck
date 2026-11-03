"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  isPathInside,
  parseBranches,
  parseGraphHistory,
  parseLog,
  parseStatus
} = require("../src/git-utils");

test("parseStatus 能读取分支、同步状态和已/未暂存改动", () => {
  const output = [
    "# branch.oid abcdef123456",
    "# branch.head main",
    "# branch.upstream origin/main",
    "# branch.ab +2 -1",
    "1 M. N... 100644 100644 100644 aaa bbb src/app.js",
    "1 .M N... 100644 100644 100644 aaa bbb README.md",
    "? notes.txt",
    ""
  ].join("\0");

  const status = parseStatus(output);

  assert.equal(status.branch, "main");
  assert.equal(status.upstream, "origin/main");
  assert.equal(status.ahead, 2);
  assert.equal(status.behind, 1);
  assert.equal(status.counts.staged, 1);
  assert.equal(status.counts.unstaged, 1);
  assert.equal(status.counts.untracked, 1);
  assert.equal(status.counts.total, 3);
  assert.equal(status.staged[0].path, "src/app.js");
  assert.equal(status.unstaged[0].path, "README.md");
});

test("parseStatus 能正确处理重命名源路径", () => {
  const output = [
    "# branch.oid abcdef",
    "# branch.head main",
    "2 R. N... 100644 100644 100644 aaa bbb R100 new-name.js",
    "old-name.js",
    "1 .M N... 100644 100644 100644 aaa bbb later.js",
    ""
  ].join("\0");

  const status = parseStatus(output);

  assert.equal(status.staged.length, 1);
  assert.equal(status.staged[0].path, "new-name.js");
  assert.equal(status.staged[0].originalPath, "old-name.js");
  assert.equal(status.unstaged[0].path, "later.js");
});

test("parseLog 和 parseBranches 能正确拆分字段与记录分隔符", () => {
  const commits = parseLog(
    "a1b2c3\x1ffullhash\x1fAlice\x1falice@example.com\x1f2026-10-26T10:00:00+08:00\x1fInitial import\x1e"
  );
  const branches = parseBranches(
    "main\u0000*\u0000origin/main\u00002026-10-26T10:00:00+08:00\u0000Alice\r\nfeature\u0000 \u0000\u00002026-10-25T10:00:00+08:00\u0000Bob"
  );

  assert.equal(commits[0].subject, "Initial import");
  assert.equal(commits[0].author, "Alice");
  assert.equal(branches.length, 2);
  assert.equal(branches[0].current, true);
  assert.equal(branches[0].author, "Alice");
  assert.equal(branches[1].name, "feature");
  assert.equal(branches[1].author, "Bob");
});

test("parseGraphHistory 能保留多分支图线和提交信息", () => {
  const output = [
    "* \x1ea1b2c3\x1fAlice\x1f2026-11-03T10:00:00+08:00\x1fHEAD -> main, origin/main\x1f最新提交",
    "| * \x1ed4e5f6\x1fBob\x1f2026-11-02T09:00:00+08:00\x1ffeature/demo\x1f功能提交",
    "|/"
  ].join("\n");

  const history = parseGraphHistory(output);
  assert.equal(history.rows.length, 3);
  assert.equal(history.rows[0].type, "commit");
  assert.equal(history.rows[0].shortHash, "a1b2c3");
  assert.equal(history.rows[0].author, "Alice");
  assert.match(history.rows[0].decorations, /HEAD -> main/);
  assert.equal(history.rows[1].graph, "| * ");
  assert.equal(history.rows[2].type, "connector");
  assert.equal(history.maxGraphWidth, 4);
});

test("isPathInside 能拒绝路径逃逸并接受仓库内子路径", () => {
  const root = process.platform === "win32" ? "C:\\repo" : "/repo";
  const child =
    process.platform === "win32" ? "C:\\repo\\src\\a.js" : "/repo/src/a.js";
  const outside =
    process.platform === "win32" ? "C:\\repo2\\a.js" : "/repo2/a.js";

  assert.equal(isPathInside(root, child), true);
  assert.equal(isPathInside(root, outside), false);
});
