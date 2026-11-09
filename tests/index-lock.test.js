"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const SCRATCH_ROOT = path.join(ROOT, ".workbuddy", "scratch");
const {
  isIndexLockError,
  extractLockPath,
  resolveGitDir,
  formatHolders,
  formatIndexLockHeldError,
  formatIndexLockUnknownError,
  probeIndexLock,
  recoverIndexLock
} = require("../src/index-lock");
const { gitAction } = require("../src/process");
const { runRepositoryAction } = require("../src/git-actions");

function git(repositoryPath, args) {
  const result = spawnSync("git", args, {
    cwd: repositoryPath,
    encoding: "utf8"
  });
  assert.equal(
    result.status,
    0,
    `git ${args.join(" ")} 失败：${result.stderr}`
  );
  return result.stdout;
}

async function makeRepository(context) {
  const base = path.join(
    SCRATCH_ROOT,
    `index-lock-${process.pid}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`
  );
  const repositoryPath = path.join(base, "repo");
  context.after(async () => {
    await fs.rm(base, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 150
    });
  });
  await fs.mkdir(repositoryPath, { recursive: true });
  git(repositoryPath, ["init", "-b", "main"]);
  git(repositoryPath, ["config", "user.name", "GitDeck Test"]);
  git(repositoryPath, ["config", "user.email", "gitdeck@example.test"]);
  await fs.writeFile(path.join(repositoryPath, "a.txt"), "one\n", "utf8");
  git(repositoryPath, ["add", "."]);
  git(repositoryPath, ["commit", "-m", "init"]);
  await fs.writeFile(path.join(repositoryPath, "a.txt"), "two\n", "utf8");
  return { base, repositoryPath, lockPath: path.join(repositoryPath, ".git", "index.lock") };
}

test("只把 Git 的 index.lock 冲突当成锁错误", () => {
  assert.equal(
    isIndexLockError(
      "fatal: Unable to create 'C:/repo/.git/index.lock': File exists."
    ),
    true
  );
  assert.equal(
    isIndexLockError(
      "fatal: Unable to create '/repo/.git/index.lock': Permission denied"
    ),
    true
  );
  assert.equal(
    isIndexLockError(
      "error: pathspec 'index.lock' did not match any file(s) known to git"
    ),
    false
  );
  assert.equal(isIndexLockError("nothing to commit, working tree clean"), false);
  assert.equal(isIndexLockError(null), false);

  assert.equal(
    extractLockPath(
      "fatal: Unable to create 'C:/repo/.git/index.lock': File exists."
    ),
    path.resolve("C:/repo/.git/index.lock")
  );
  assert.equal(
    extractLockPath("fatal: Unable to create '/repo/.git/other.lock': File exists."),
    null
  );
});

test("活锁错误里打印占用进程、PID、判据与原始错误", () => {
  const message = formatIndexLockHeldError(
    "fatal: Unable to create 'C:/repo/.git/index.lock': File exists.",
    {
      held: true,
      reason: "另一个进程正在使用此文件",
      holders: [
        {
          pid: 4321,
          name: "TortoiseGitProc.exe",
          command: '/command:log /path:"C:\\repo"',
          inRepo: true
        }
      ]
    }
  );
  assert.match(message, /TortoiseGitProc\.exe/);
  assert.match(message, /PID 4321/);
  assert.match(message, /不会删除/);
  assert.match(message, /可能持有该锁的进程/);
  assert.match(message, /独占方式打开锁文件失败/);
  assert.match(message, /Git 原始错误/);
  assert.match(formatHolders([]), /没有找到命令行包含该仓库路径的进程/);
  assert.match(formatIndexLockUnknownError("raw", null), /没有删除任何文件/);
});

test("worktree 的 .git 文件也能解析出真实 git 目录", async (context) => {
  const { base, repositoryPath } = await makeRepository(context);
  const linkedPath = path.join(base, "linked");
  await fs.mkdir(path.join(linkedPath, ".git", "worktrees", "wt"), {
    recursive: true
  });
  const worktreePath = path.join(base, "wt");
  await fs.mkdir(worktreePath, { recursive: true });
  await fs.writeFile(
    path.join(worktreePath, ".git"),
    `gitdir: ${path.join(linkedPath, ".git", "worktrees", "wt")}\n`,
    "utf8"
  );
  assert.equal(
    await resolveGitDir(worktreePath),
    path.resolve(linkedPath, ".git", "worktrees", "wt")
  );
  assert.equal(
    await resolveGitDir(repositoryPath),
    path.join(repositoryPath, ".git")
  );
});

test("无人持有的陈旧 index.lock 会被自动删除并重试成功", async (context) => {
  if (process.platform !== "win32") {
    return context.skip("锁占用探测依赖 Windows 独占打开语义");
  }
  const { repositoryPath, lockPath } = await makeRepository(context);
  await fs.writeFile(lockPath, "", "utf8"); // 模拟被强杀 git 进程留下的空锁

  const probe = await probeIndexLock(lockPath, repositoryPath);
  assert.ok(probe, "独占探测必须可用");
  assert.equal(probe.held, false, "无人打开的锁应判定为陈旧锁");

  const output = await gitAction(repositoryPath, ["add", "-A"]);
  assert.match(output, /已自动删除并重试成功/);
  assert.equal(
    await fs
      .stat(lockPath)
      .then(() => true)
      .catch(() => false),
    false,
    "陈旧锁必须已被删除"
  );
  assert.match(git(repositoryPath, ["status", "--porcelain"]), /^M /m);
});

test("仍被进程持有的 index.lock 绝不删除，错误里列出占用进程", async (context) => {
  if (process.platform !== "win32") {
    return context.skip("锁占用探测依赖 Windows 独占打开语义");
  }
  const { repositoryPath, lockPath } = await makeRepository(context);
  await fs.writeFile(lockPath, "", "utf8");
  // 持有句柄：此时 .NET 的 FileShare.None 独占打开必然失败 => 活锁。
  const handle = fsSync.openSync(lockPath, "r+");
  try {
    const probe = await probeIndexLock(lockPath, repositoryPath);
    assert.ok(probe, "独占探测必须可用");
    assert.equal(probe.held, true, "被进程打开时应判定为活锁");

    await assert.rejects(
      () => gitAction(repositoryPath, ["add", "-A"]),
      (error) => {
        assert.equal(error.statusCode, 423);
        assert.match(error.message, /不会删除正在使用的/);
        assert.match(error.message, /可能持有该锁的进程/);
        assert.match(error.message, /PID \d+/);
        return true;
      }
    );
    assert.equal(
      await fs
        .stat(lockPath)
        .then(() => true)
        .catch(() => false),
      true,
      "活锁绝不能被删除"
    );
    assert.equal(await fs.readFile(path.join(repositoryPath, "a.txt"), "utf8"), "two\n");
  } finally {
    fsSync.closeSync(handle);
  }
});

test("提交选中文件撞上陈旧锁时自动清理、成功提交并回报一次提示", async (context) => {
  if (process.platform !== "win32") {
    return context.skip("锁占用探测依赖 Windows 独占打开语义");
  }
  const { repositoryPath, lockPath } = await makeRepository(context);
  await fs.writeFile(lockPath, "", "utf8");

  const result = await runRepositoryAction(
    { id: `lock-test-${Date.now()}`, name: "repo", path: repositoryPath },
    {
      action: "commitSelected",
      paths: ["a.txt"],
      message: "chore: stale lock recovery"
    }
  );

  assert.match(result.output, /已自动删除并重试成功/);
  assert.equal(
    (result.output.match(/已自动删除并重试成功/g) || []).length,
    1,
    "恢复说明只能出现一次"
  );
  assert.equal(
    git(repositoryPath, ["log", "-1", "--pretty=%s"]).trim(),
    "chore: stale lock recovery"
  );
  assert.equal(git(repositoryPath, ["status", "--porcelain"]).trim(), "");
  assert.equal(
    await fs
      .stat(lockPath)
      .then(() => true)
      .catch(() => false),
    false
  );
});

test("恢复逻辑不会碰工作树里的同名 index.lock 文件", async (context) => {
  const { repositoryPath } = await makeRepository(context);
  const tracked = path.join(repositoryPath, "index.lock");
  await fs.writeFile(tracked, "user file, not a git lock\n", "utf8");

  await assert.rejects(
    () =>
      recoverIndexLock(
        repositoryPath,
        `fatal: Unable to create '${tracked}': File exists.`
      ),
    (error) => {
      assert.equal(error.statusCode, 423);
      assert.match(error.message, /没有删除/);
      return true;
    }
  );
  assert.equal(await fs.readFile(tracked, "utf8"), "user file, not a git lock\n");
});
