"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  AUTO_FETCH_INITIAL_DELAY_MS,
  AUTO_FETCH_LOCK_MAX_AGE_MS,
  AUTO_FETCH_CONCURRENCY
} = require("../src/config");
const { hasActiveGitLock, LOCK_FILES } = require("../src/auto-fetch");

// 所有临时目录都在 <repo>/.workbuddy/scratch/ 内，见 AGENTS.md 路径基准。
const SCRATCH = path.resolve(__dirname, "..", ".workbuddy", "scratch");

async function makeFixture(prefix) {
  await fs.mkdir(SCRATCH, { recursive: true });
  return fs.mkdtemp(path.join(SCRATCH, prefix));
}

function cleanup(t, target) {
  t.after(() =>
    fs.rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  );
}

test("近期 .git 锁会被识别，本轮应跳过该仓库", async (t) => {
  const repo = await makeFixture("autofetch-lock-");
  cleanup(t, repo);
  await fs.mkdir(path.join(repo, ".git", "objects"), { recursive: true });

  assert.equal(await hasActiveGitLock(repo), false, "无锁时不应跳过");
  await fs.writeFile(path.join(repo, ".git", "index.lock"), "", "utf8");
  assert.equal(await hasActiveGitLock(repo), true, "用户正在写 index，必须跳过");
});

test("陈旧 maintenance.lock 不能让仓库永远不被抓取", async (t) => {
  const repo = await makeFixture("autofetch-stale-");
  cleanup(t, repo);
  await fs.mkdir(path.join(repo, ".git", "objects"), { recursive: true });
  const lock = path.join(repo, ".git", "objects", "maintenance.lock");
  await fs.writeFile(lock, "", "utf8");
  const stale = new Date(Date.now() - AUTO_FETCH_LOCK_MAX_AGE_MS - 60 * 60 * 1000);
  await fs.utimes(lock, stale, stale);

  assert.equal(await hasActiveGitLock(repo), false);
});

test("worktree 的 .git 文件（gitdir:）也能解析到锁", async (t) => {
  const worktree = await makeFixture("autofetch-worktree-");
  cleanup(t, worktree);
  const gitDir = path.join(worktree, "real-git");
  await fs.mkdir(gitDir, { recursive: true });
  await fs.writeFile(path.join(worktree, ".git"), `gitdir: ${gitDir}\n`, "utf8");

  assert.equal(await hasActiveGitLock(worktree), false);
  await fs.writeFile(path.join(gitDir, "HEAD.lock"), "", "utf8");
  assert.equal(await hasActiveGitLock(worktree), true);
});

test("不存在的目录不会抛错", async () => {
  assert.equal(await hasActiveGitLock(path.join(SCRATCH, "autofetch-missing")), false);
});

test("后台 fetch 默认延迟首轮、低并发，避免启动瞬间抢仓库", async () => {
  assert.ok(AUTO_FETCH_INITIAL_DELAY_MS > 0, "首轮必须延迟");
  assert.ok(AUTO_FETCH_CONCURRENCY <= 2, "并发不能太高");
  const source = await fs.readFile(
    path.resolve(__dirname, "..", "src", "auto-fetch.js"),
    "utf8"
  );
  assert.match(source, /maintenance\.auto=false/, "fetch 必须禁用自动 maintenance");
  assert.match(source, /AUTO_FETCH_INITIAL_DELAY_MS/, "首轮延迟必须真正生效");
  assert.match(source, /hasActiveGitLock\(repository\.path\)/, "抓取前必须检查锁");
});

test("锁清单覆盖常见 git 锁文件", () => {
  for (const name of [
    "index.lock",
    "packed-refs.lock",
    "FETCH_HEAD.lock",
    "objects/maintenance.lock"
  ]) {
    assert.ok(LOCK_FILES.includes(name), `缺少 ${name}`);
  }
});
