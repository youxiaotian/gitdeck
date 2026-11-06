"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const SCRIPT = path.join(ROOT, "tools", "clean-scratch.js");
const SCRATCH = path.join(ROOT, ".workbuddy", "scratch");

function run(args) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: "utf8"
  });
  return {
    status: result.status,
    output: `${result.stdout || ""}${result.stderr || ""}`
  };
}

test("clean-scratch --path 拒绝工作目录之外的路径与受保护目标", () => {
  const rejected = [
    "../outside.txt",
    "C:/Windows/win.ini",
    ".git",
    "node_modules",
    "package.json",
    "package-lock.json",
    "data/repositories.json",
    "data/server.log",
    ".workbuddy/memory",
    ""
  ];

  for (const target of rejected) {
    if (!target) continue;
    const result = run(["--path", target, "--dry-run"]);
    assert.equal(
      result.status,
      1,
      `${target} 应被拒绝，实际输出: ${result.output}`
    );
    assert.match(result.output, /拒绝/);
  }
});

test("clean-scratch --path 只删除工作目录内的目标，且保留 .gitkeep", () => {
  fs.mkdirSync(SCRATCH, { recursive: true });
  const probe = path.join(SCRATCH, `boundary-probe-${process.pid}.txt`);
  fs.writeFileSync(probe, "临时探针\n");

  try {
    const relative = path.relative(ROOT, probe).replace(/\\/g, "/");
    const dryRun = run(["--path", relative, "--dry-run"]);
    assert.equal(dryRun.status, 0, `dry-run 应成功: ${dryRun.output}`);
    assert.match(dryRun.output, /将删除/);
    assert.ok(fs.existsSync(probe), "dry-run 不应真的删除文件");

    const removed = run(["--path", relative]);
    assert.equal(removed.status, 0, `删除应成功: ${removed.output}`);
    assert.ok(!fs.existsSync(probe), "目标文件应已删除");
    assert.ok(
      fs.existsSync(path.join(SCRATCH, ".gitkeep")),
      ".gitkeep 必须保留"
    );
  } finally {
    if (fs.existsSync(probe)) fs.rmSync(probe, { force: true });
  }
});

test("clean-scratch --new 与 --path 互斥，拒绝未知参数", () => {
  const mutuallyExclusive = run(["--new", "probe", "--path", "a.txt"]);
  assert.equal(mutuallyExclusive.status, 2);
  assert.match(mutuallyExclusive.output, /不能同时使用/);

  const unknown = run(["--bogus"]);
  assert.equal(unknown.status, 2);
  assert.match(unknown.output, /未知参数/);
});

test("项目级权限白名单只放行受控清理命令", async () => {
  const content = await fs.promises.readFile(
    path.join(ROOT, ".codebuddy", "settings.json"),
    "utf8"
  );
  const config = JSON.parse(content);
  const rules = config.permissions.allow;

  assert.ok(Array.isArray(rules), "permissions.allow 应为数组");
  assert.ok(rules.every((rule) => /^Bash\(/.test(rule)), "只允许 Bash 规则");
  assert.ok(
    rules.every(
      (rule) =>
        rule.includes("clean-scratch.js") || rule.includes("clean:scratch")
    ),
    "白名单不得包含清理脚本以外的命令"
  );
  assert.equal(
    config.sandbox,
    undefined,
    "项目级不得覆盖用户级的 sandbox 文件规则"
  );
});
