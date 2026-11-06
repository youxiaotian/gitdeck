"use strict";

// @module auto-fetch
// 定时后台 fetch：让 origin/* 远程跟踪分支保持最新（对标 VSCode git.autofetch）。
// 修改注意：这是「后台行为」，不能和用户正在进行的 Git 操作抢仓库。
// 首轮延迟、有近期 .git 锁整仓跳过、禁用 fetch 后的 auto maintenance、
// 失败仓库退避、低并发、失败静默。GITDECK_AUTO_FETCH=0 可完全关闭。

const fs = require("node:fs/promises");
const path = require("node:path");
const {
  AUTO_FETCH_INTERVAL_MS,
  AUTO_FETCH_INITIAL_DELAY_MS,
  AUTO_FETCH_FAILURE_BACKOFF_MS,
  AUTO_FETCH_LOCK_MAX_AGE_MS,
  AUTO_FETCH_CONCURRENCY,
  STORE
} = require("./config");
const { gitAction } = require("./process");
const { repositoryLocks } = require("./locks");
const { getRemotes } = require("./git-summary");

let timer = null;
let initialTimer = null;
let running = false;
const failedAt = new Map();

// git 会在这些文件上加锁；只要有一个是「近期」写入的，就说明用户/IDE/TortoiseGit
// 正在操作这个仓库，本轮整仓跳过，不碰它的 .git。
const LOCK_FILES = [
  "index.lock",
  "HEAD.lock",
  "config.lock",
  "packed-refs.lock",
  "FETCH_HEAD.lock",
  "ORIG_HEAD.lock",
  "shallow.lock",
  "objects/maintenance.lock",
  "objects/info/commit-graph.lock",
  "objects/pack/multi-pack-index.lock"
];

async function resolveGitDir(repositoryPath) {
  const dotGit = path.join(repositoryPath, ".git");
  const stat = await fs.stat(dotGit).catch(() => null);
  if (!stat) {
    return null;
  }
  if (stat.isDirectory()) {
    return dotGit;
  }
  if (!stat.isFile()) {
    return null;
  }
  // worktree / submodule 的 .git 是 "gitdir: <path>" 文本文件。
  const raw = await fs.readFile(dotGit, "utf8").catch(() => "");
  const match = raw.match(/^gitdir:\s*(.+)$/im);
  return match ? path.resolve(repositoryPath, match[1].trim()) : null;
}

async function hasActiveGitLock(repositoryPath) {
  const gitDir = await resolveGitDir(repositoryPath);
  if (!gitDir) {
    return false;
  }
  const cutoff = Date.now() - AUTO_FETCH_LOCK_MAX_AGE_MS;
  for (const relative of LOCK_FILES) {
    const stat = await fs.stat(path.join(gitDir, relative)).catch(() => null);
    if (stat && stat.mtimeMs >= cutoff) {
      return true;
    }
  }
  return false;
}

async function fetchRepository(repository) {
  if (repositoryLocks.has(repository.id)) {
    return { repository, skipped: true };
  }
  const lastFailed = failedAt.get(repository.path);
  if (lastFailed && Date.now() - lastFailed < AUTO_FETCH_FAILURE_BACKOFF_MS) {
    return { repository, skipped: true };
  }
  if (await hasActiveGitLock(repository.path)) {
    return { repository, skipped: true, locked: true };
  }

  const remotes = await getRemotes(repository.path).catch(() => []);
  if (!remotes.some((remote) => remote.type === "fetch")) {
    return { repository, skipped: true };
  }
  // getRemotes 期间用户可能已经开始操作，落盘前再确认一次。
  if (await hasActiveGitLock(repository.path)) {
    return { repository, skipped: true, locked: true };
  }

  try {
    // maintenance.auto=false：fetch 默认会顺带跑 git maintenance --auto，
    // 可能做 gc / pack-refs / commit-graph，与正在读 refs 的 GUI 抢 .git 目录。
    await gitAction(
      repository.path,
      ["-c", "maintenance.auto=false", "fetch", "--all"],
      { timeout: 60000 }
    );
    failedAt.delete(repository.path);
    return { repository, ok: true };
  } catch (error) {
    failedAt.set(repository.path, Date.now());
    console.log(
      `[auto-fetch] ${repository.name}: ${String(error.message || error).slice(0, 120)}`
    );
    return { repository, ok: false };
  }
}

async function runWithConcurrency(items, worker, limit) {
  const results = [];
  let cursor = 0;

  async function lane() {
    while (cursor < items.length) {
      const item = items[cursor++];
      results.push(await worker(item));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => lane())
  );
  return results;
}

async function fetchAllRepositories() {
  if (running) {
    return;
  }
  running = true;
  try {
    const state = await STORE.loadState();
    const seen = new Set();
    const repositories = state.repositories.filter((repository) => {
      if (seen.has(repository.path)) {
        return false;
      }
      seen.add(repository.path);
      return true;
    });

    const startedAt = Date.now();
    const results = await runWithConcurrency(
      repositories,
      fetchRepository,
      AUTO_FETCH_CONCURRENCY
    );
    const fetched = results.filter((item) => item.ok).length;
    const locked = results.filter((item) => item.locked).length;
    if (fetched || locked) {
      console.log(
        `[auto-fetch] 完成 ${fetched}/${repositories.length} 个仓库` +
          (locked ? `，跳过 ${locked} 个正在使用的仓库` : "") +
          `，用时 ${Math.round((Date.now() - startedAt) / 1000)}s`
      );
    }
  } catch (error) {
    console.log(`[auto-fetch] 轮次失败：${String(error.message || error).slice(0, 120)}`);
  } finally {
    running = false;
  }
}

function startAutoFetch() {
  if (timer || !AUTO_FETCH_INTERVAL_MS) {
    return;
  }
  timer = setInterval(fetchAllRepositories, AUTO_FETCH_INTERVAL_MS);
  timer.unref?.();
  // 启动瞬间不抓取：反复重启服务不应叠加多轮全量 fetch。
  const delay = Math.max(0, AUTO_FETCH_INITIAL_DELAY_MS || 0);
  initialTimer = setTimeout(() => {
    initialTimer = null;
    fetchAllRepositories();
  }, delay);
  initialTimer.unref?.();
  if (delay) {
    console.log(`[auto-fetch] ${Math.round(delay / 1000)}s 后开始首轮抓取`);
  }
}

function stopAutoFetch() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (initialTimer) {
    clearTimeout(initialTimer);
    initialTimer = null;
  }
}

module.exports = {
  startAutoFetch,
  stopAutoFetch,
  fetchAllRepositories,
  hasActiveGitLock,
  LOCK_FILES
};
