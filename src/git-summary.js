"use strict";

// @module git-summary
// 仓库状态摘要、详情、提交历史、远端解析与可用性断言。
// 修改注意：getRepositoryDetail 并发跑 6 条 git；新增字段要同步 detail 接口契约。

const fs = require("node:fs/promises");
const {
  parseBranches,
  parseCommitHistory,
  parseLog,
  parseStashes,
  parseStatus
} = require("./git-utils");
const { httpError } = require("./http");
const { runGit } = require("./process");

async function getStatusSummary(repository, includeMetadata = false) {
  await assertRepositoryAvailable(repository);
  const statusResult = await runGit(repository.path, [
    "status",
    "--porcelain=v2",
    "--branch",
    "--untracked-files=all",
    "-z"
  ]);
  const status = parseStatus(statusResult.stdout);

  let latestCommit = null;
  if (status.oid && !status.oid.startsWith("000000")) {
    const logResult = await runGit(repository.path, [
      "log",
      "-1",
      "--pretty=format:%h%x1f%H%x1f%an%x1f%ae%x1f%aI%x1f%s"
    ]).catch(() => null);
    latestCommit = logResult ? parseLog(logResult.stdout)[0] || null : null;
  }

  let remote = "";
  if (includeMetadata) {
    const remotes = await getRemotes(repository.path);
    remote = remotes.find((item) => item.type === "fetch")?.url || "";
  }

  return {
    ...status,
    latestCommit,
    remote,
    checkedAt: new Date().toISOString()
  };
}

async function getRepositoryDetail(repository) {
  await assertRepositoryAvailable(repository);

  const [
    status,
    logResult,
    branchResult,
    stashResult,
    remoteResult,
    remoteBranchResult
  ] =
    await Promise.all([
      getStatusSummary(repository),
      runGit(repository.path, [
        "log",
        "-n",
        "50",
        "--pretty=format:%h%x1f%H%x1f%an%x1f%ae%x1f%aI%x1f%s%x1e"
      ]).catch((error) => ({ stdout: "", stderr: error.message })),
      runGit(repository.path, [
        "branch",
        "--sort=-committerdate",
        "--format=%(refname:short)%00%(HEAD)%00%(upstream:short)%00%(committerdate:iso-strict)%00%(authorname)"
      ]).catch(() => ({ stdout: "" })),
      runGit(repository.path, [
        "stash",
        "list",
        "--pretty=format:%gd%x1f%s%x1e"
      ]).catch(() => ({ stdout: "" })),
      getRemotes(repository.path),
      runGit(repository.path, [
        "for-each-ref",
        "--format=%(refname:short)",
        "refs/remotes"
      ]).catch(() => ({ stdout: "" }))
    ]);

  const remoteBranches = remoteBranchResult.stdout
    .split(/\r?\n/)
    .filter((line) => line && !line.endsWith("/HEAD"));
  const branchNames = remoteResult
    .filter((remote) => remote.type === "fetch")
    .map((remote) => remote.name);
  const branches = parseBranches(branchResult.stdout).map((branch) => {
    const upstreamTarget = resolveRemoteTarget(branch.upstream, branchNames);
    const fallbackTarget = branchNames
      .map((remote) =>
        resolveRemoteTarget(`${remote}/${branch.name}`, branchNames)
      )
      .find(
        (target) =>
          target &&
          remoteBranches.includes(`${target.remote}/${target.branch}`)
      );
    const remoteTarget =
      upstreamTarget &&
      remoteBranches.includes(
        `${upstreamTarget.remote}/${upstreamTarget.branch}`
      )
        ? upstreamTarget
        : fallbackTarget || null;
    return {
      ...branch,
      remoteTarget
    };
  });

  return {
    repository,
    summary: status,
    commits: parseLog(logResult.stdout),
    branches,
    stashes: parseStashes(stashResult.stdout),
    remotes: remoteResult
  };
}

async function getCommitHistory(repository, scopeInput, limitInput) {
  await assertRepositoryAvailable(repository);
  const scope = scopeInput === "current" ? "current" : "all";
  const limit = Math.min(
    Math.max(Number(limitInput) || 100, 20),
    200
  );
  const branchResult = await runGit(repository.path, [
    "branch",
    "--show-current"
  ]).catch(() => ({ stdout: "" }));
  const branch = branchResult.stdout.trim();
  const scopeArgs =
    scope === "all" ? ["--all"] : [branch ? branch : "HEAD"];

  let result;
  try {
    result = await runGit(repository.path, [
      "log",
      "--decorate=short",
      "--date=iso-strict",
      "--topo-order",
      "--pretty=format:%x1e%H%x1f%P%x1f%h%x1f%an%x1f%aI%x1f%D%x1f%s",
      ...scopeArgs,
      "-n",
      String(limit)
    ]);
  } catch (error) {
    if (
      /does not have any commits|unknown revision|bad revision|ambiguous argument/i.test(
        error.message
      )
    ) {
      return {
        scope,
        branch,
        rows: []
      };
    }
    throw error;
  }

  return {
    scope,
    branch,
    rows: parseCommitHistory(result.stdout)
  };
}

async function getRemotes(repositoryPath) {
  const result = await runGit(repositoryPath, ["remote", "-v"]).catch(() => ({
    stdout: ""
  }));
  return result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.+?)\t(.+?) \((fetch|push)\)$/);
      return match
        ? { name: match[1], url: match[2], type: match[3] }
        : null;
    })
    .filter(Boolean);
}

function resolveRemoteTarget(remoteRef, remoteNames) {
  const value = String(remoteRef || "");
  const remote = [...remoteNames]
    .sort((left, right) => right.length - left.length)
    .find((name) => value.startsWith(`${name}/`));
  if (!remote) {
    return null;
  }
  return {
    remote,
    branch: value.slice(remote.length + 1)
  };
}

async function assertRepositoryAvailable(repository) {
  const stat = await fs.stat(repository.path).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw httpError(410, "仓库目录已移动或当前不可访问。");
  }
}

module.exports = {
  getStatusSummary,
  getRepositoryDetail,
  getCommitHistory,
  getRemotes,
  resolveRemoteTarget,
  assertRepositoryAvailable
};
