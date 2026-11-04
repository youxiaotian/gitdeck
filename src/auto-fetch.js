"use strict";

// @module auto-fetch
// 定时后台 fetch：让 origin/* 远程跟踪分支保持最新（对标 VSCode git.autofetch）。
// 修改注意：失败必须静默（离线/无凭据是常态）；并发受 CONCURRENCY 限制，
// 避免仓库多时产生 git 进程风暴；跳过被用户动作占用的仓库。

const {
  AUTO_FETCH_INTERVAL_MS,
  AUTO_FETCH_CONCURRENCY
} = require("./config");
const { STORE } = require("./config");
const { gitAction, runGit } = require("./process");
const { repositoryLocks } = require("./locks");
const { getRemotes } = require("./git-summary");

let timer = null;
let running = false;

async function fetchRepository(repository) {
  if (repositoryLocks.has(repository.id)) {
    return { repository, skipped: true };
  }

  const remotes = await getRemotes(repository.path).catch(() => []);
  if (!remotes.some((remote) => remote.type === "fetch")) {
    return { repository, skipped: true };
  }

  try {
    await gitAction(repository.path, ["fetch", "--all"], { timeout: 60000 });
    return { repository, ok: true };
  } catch (error) {
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
    if (fetched) {
      console.log(
        `[auto-fetch] 完成 ${fetched}/${repositories.length} 个仓库，用时 ${Math.round((Date.now() - startedAt) / 1000)}s`
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
  fetchAllRepositories();
}

function stopAutoFetch() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { startAutoFetch, stopAutoFetch, fetchAllRepositories };
