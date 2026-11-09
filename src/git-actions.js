"use strict";

// @module git-actions
// 仓库动作白名单分发：暂存/提交/还原/分支/Stash/Diff/文件读写。
// 修改注意：runRepositoryAction 的 switch 是动作白名单边界；新增动作必须在此登记并补测试。

const fs = require("node:fs/promises");
const path = require("node:path");
const { MAX_DIFF_BYTES } = require("./config");
const { httpError } = require("./http");
const { gitAction, runGit } = require("./process");
const { acquireRepositoryLock } = require("./locks");
const {
  validateRepositoryPath,
  resolveEditableFile,
  hashContent,
  isProbablyBinary,
  createUntrackedPatch
} = require("./paths");
const {
  assertRepositoryAvailable,
  getStatusSummary,
  getRepositoryDetail,
  getRemotes,
  resolveRemoteTarget
} = require("./git-summary");
const { openExplorer, openTerminal, openTortoiseGit, openVisualStudio } = require("./shell");

async function runRepositoryAction(repository, body) {
  const action = body.action;
  await assertRepositoryAvailable(repository);

  const release = await acquireRepositoryLock(repository.id);
  try {
    let output = "";
    let warnings = [];

    switch (action) {
      case "fetch":
        output = await gitAction(repository.path, [
          "fetch",
          "--all",
          "--prune"
        ]);
        break;
      case "pull":
        output = await gitAction(repository.path, ["pull", "--ff-only"]);
        break;
      case "push":
        output = await gitAction(repository.path, ["push"]);
        break;
      case "stageAll":
        output = await gitAction(repository.path, ["add", "-A"]);
        break;
      case "unstageAll":
        output = await unstageAll(repository.path);
        break;
      case "stageFile":
        output = await gitAction(repository.path, [
          "add",
          "--",
          validateRepositoryPath(repository.path, body.path)
        ]);
        break;
      case "stageFiles":
        output = await stagePaths(repository.path, body.paths);
        break;
      case "unstageFile":
        output = await unstagePath(
          repository.path,
          validateRepositoryPath(repository.path, body.path)
        );
        break;
      case "discardFile":
        output = await discardPath(
          repository.path,
          validateRepositoryPath(repository.path, body.path)
        );
        break;
      case "discardFiles":
        output = await discardPaths(repository.path, body.paths);
        break;
      case "commit":
        output = await commit(repository.path, body);
        break;
      case "commitSelected":
        output = await commitSelected(repository.path, body);
        break;
      case "checkoutBranch":
        output = await checkoutBranch(repository.path, body.name);
        break;
      case "createBranch":
        output = await createBranch(repository.path, body.name);
        break;
      case "deleteBranch":
        {
          const result = await deleteBranches(repository.path, [
            {
              name: body.name,
              deleteRemote: body.deleteRemote === true,
              forceDelete: body.forceDelete === true
            }
          ]);
          output = result.output;
          warnings = result.warnings;
        }
        break;
      case "deleteBranches":
        {
          const result = await deleteBranches(
            repository.path,
            body.branches
          );
          output = result.output;
          warnings = result.warnings;
        }
        break;
      case "mergeBranch":
        output = await mergeBranch(repository.path, body.name);
        break;
      // 提交历史分支标签右键菜单：引用级动作。参数先经过 validateRevision /
      // validateCommitHash 校验，避免把任意字符串当作 revision 或选项。
      case "checkoutRef":
        output = await checkoutRef(repository.path, body.ref);
        break;
      case "checkoutCommit":
        output = await checkoutCommit(repository.path, body.hash);
        break;
      case "createBranchAt":
        output = await createBranchAt(
          repository.path,
          body.name,
          body.base,
          body.switchTo === true
        );
        break;
      case "createTagAt":
        output = await createTagAt(
          repository.path,
          body.name,
          body.base,
          body.message
        );
        break;
      case "pushRef":
        output = await pushRef(repository.path, body.ref);
        break;
      case "deleteRef":
        output = await deleteRef(
          repository.path,
          body.ref,
          body.force === true
        );
        break;
      case "stashSave":
        output = await gitAction(repository.path, [
          "stash",
          "push",
          "--include-untracked",
          "-m",
          String(body.message || "").trim() || "GitDeck 自动暂存"
        ]);
        break;
      case "stashPop":
        output = await stashPop(repository.path, body.ref);
        break;
      case "openExplorer":
        await openExplorer(repository.path);
        output = "已打开资源管理器。";
        break;
      case "openTerminal":
        await openTerminal(repository.path);
        output = "已打开终端。";
        break;
      case "openTortoiseGit":
        await openTortoiseGit(repository.path);
        output = "已打开 TortoiseGit。";
        break;
      case "openVisualStudio":
        {
          const solutionRelative = validateRepositoryPath(
            repository.path,
            body.path
          );
          const solutionPath = path.resolve(repository.path, solutionRelative);
          await openVisualStudio(solutionPath);
          output = "已用 Visual Studio 打开。";
        }
        break;
      default:
        throw httpError(400, "不支持的 Git 操作。");
    }

    const detail = await getRepositoryDetail(repository);
    return { ...detail, output: output.trim(), warnings };
  } finally {
    release();
  }
}

async function commit(repositoryPath, body) {
  const message = String(body.message || "").trim();
  const amend = body.amend === true;
  if (!message && !amend) {
    throw httpError(400, "请输入提交说明。");
  }

  const args = ["commit"];
  if (amend) {
    args.push("--amend");
  }
  if (message) {
    args.push("-m", message);
  } else {
    args.push("--no-edit");
  }
  return gitAction(repositoryPath, args);
}

async function stagePaths(repositoryPath, inputPaths) {
  const paths = normalizePaths(repositoryPath, inputPaths);
  await gitAction(
    repositoryPath,
    ["add", "-A", "--pathspec-from-file=-", "--pathspec-file-nul"],
    { input: `${paths.join("\0")}\0` }
  );
  return `已暂存 ${paths.length} 个文件。`;
}

async function commitSelected(repositoryPath, body) {
  const message = String(body.message || "").trim();
  const amend = body.amend === true;
  if (!message && !amend) {
    throw httpError(400, "请输入提交说明。");
  }
  const paths = normalizePaths(repositoryPath, body.paths);
  const pathInput = `${paths.join("\0")}\0`;
  await gitAction(
    repositoryPath,
    ["add", "-A", "--pathspec-from-file=-", "--pathspec-file-nul"],
    { input: pathInput }
  );

  const args = ["commit"];
  if (amend) {
    args.push("--amend");
  }
  if (message) {
    args.push("-m", message);
  } else {
    args.push("--no-edit");
  }
  args.push(
    "--only",
    "--pathspec-from-file=-",
    "--pathspec-file-nul"
  );
  return gitAction(repositoryPath, args, { input: pathInput });
}

function normalizePaths(repositoryPath, inputPaths) {
  if (!Array.isArray(inputPaths) || !inputPaths.length) {
    throw httpError(400, "请选择文件。");
  }
  if (inputPaths.length > 500) {
    throw httpError(400, "一次最多处理 500 个文件。");
  }
  return [
    ...new Set(
      inputPaths.map((filePath) =>
        validateRepositoryPath(repositoryPath, filePath)
      )
    )
  ];
}

async function checkoutBranch(repositoryPath, branchName) {
  await validateBranchName(repositoryPath, branchName);
  return gitAction(repositoryPath, ["switch", branchName]);
}

async function createBranch(repositoryPath, branchName) {
  await validateBranchName(repositoryPath, branchName);
  return gitAction(repositoryPath, ["switch", "-c", branchName]);
}

async function deleteBranches(repositoryPath, inputBranches) {
  if (!Array.isArray(inputBranches) || !inputBranches.length) {
    throw httpError(400, "请选择要删除的分支。");
  }
  if (inputBranches.length > 100) {
    throw httpError(400, "一次最多删除 100 个分支。");
  }

  const requested = [];
  const seen = new Set();
  for (const input of inputBranches) {
    const name = String(
      typeof input === "string" ? input : input?.name || ""
    ).trim();
    if (!name || seen.has(name)) {
      continue;
    }
    seen.add(name);
    requested.push({
      name,
      deleteRemote:
        typeof input === "object" && input?.deleteRemote === true,
      forceDelete:
        typeof input === "object" && input?.forceDelete === true
    });
  }
  if (!requested.length) {
    throw httpError(400, "请选择要删除的分支。");
  }

  const [localResult, currentResult, remoteResult, remoteBranchResult] =
    await Promise.all([
      runGit(repositoryPath, [
        "for-each-ref",
        "--format=%(refname:short)%00%(upstream:short)",
        "refs/heads"
      ]),
      runGit(repositoryPath, ["branch", "--show-current"]).catch(() => ({
        stdout: ""
      })),
      getRemotes(repositoryPath),
      runGit(repositoryPath, [
        "for-each-ref",
        "--format=%(refname:short)",
        "refs/remotes"
      ]).catch(() => ({ stdout: "" }))
    ]);

  const localBranches = new Map(
    localResult.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [name, upstream] = line.split("\0");
        return [name, { name, upstream: upstream || "" }];
      })
  );
  const currentBranch = currentResult.stdout.trim();
  const remoteNames = [
    ...new Set(
      remoteResult
        .filter((remote) => remote.type === "fetch")
        .map((remote) => remote.name)
    )
  ];
  const remoteBranches = new Set(
    remoteBranchResult.stdout
      .split(/\r?\n/)
      .filter((line) => line && !line.endsWith("/HEAD"))
  );
  const warnings = [];
  const deletable = [];

  for (const branch of requested) {
    if (branch.name === currentBranch) {
      warnings.push(`无法删除当前分支 ${branch.name}`);
      continue;
    }
    const localBranch = localBranches.get(branch.name);
    if (!localBranch) {
      warnings.push(`本地分支 ${branch.name} 不存在`);
      continue;
    }
    deletable.push({
      ...branch,
      upstream: localBranch.upstream
    });
  }

  if (!deletable.length) {
    throw httpError(422, warnings.join("；") || "没有可删除的本地分支。");
  }

  const localErrors = [];
  const safeBranches = deletable.filter((branch) => !branch.forceDelete);
  const forcedBranches = deletable.filter((branch) => branch.forceDelete);
  if (safeBranches.length) {
    try {
      await gitAction(repositoryPath, [
        "branch",
        "-d",
        "--",
        ...safeBranches.map((branch) => branch.name)
      ]);
    } catch (error) {
      localErrors.push(error.message);
    }
  }
  if (forcedBranches.length) {
    try {
      await gitAction(repositoryPath, [
        "branch",
        "-D",
        "--",
        ...forcedBranches.map((branch) => branch.name)
      ]);
    } catch (error) {
      localErrors.push(error.message);
    }
  }

  const remainingResult = await runGit(repositoryPath, [
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/heads"
  ]);
  const remaining = new Set(
    remainingResult.stdout.split(/\r?\n/).filter(Boolean)
  );
  const deleted = deletable.filter(
    (branch) => !remaining.has(branch.name)
  );
  if (!deleted.length) {
    throw httpError(
      422,
      localErrors.join("；") || "没有本地分支被删除。"
    );
  }
  if (deleted.length < deletable.length) {
    warnings.push(
      `有 ${deletable.length - deleted.length} 个分支因未合并或状态变化未删除`
    );
  }
  if (localErrors.length && deleted.length) {
    warnings.push(...localErrors);
  }

  const remoteGroups = new Map();
  for (const branch of deleted) {
    if (!branch.deleteRemote) {
      continue;
    }
    const upstreamTarget = resolveRemoteTarget(
      branch.upstream,
      remoteNames
    );
    const target =
      upstreamTarget &&
      remoteBranches.has(`${upstreamTarget.remote}/${upstreamTarget.branch}`)
        ? upstreamTarget
        : remoteNames
            .map((remote) => ({
              remote,
              branch: branch.name
            }))
            .find((candidate) =>
              remoteBranches.has(
                `${candidate.remote}/${candidate.branch}`
              )
            ) || null;
    if (!target) {
      warnings.push(`分支 ${branch.name} 没有找到对应的远程分支`);
      continue;
    }
    if (!remoteGroups.has(target.remote)) {
      remoteGroups.set(target.remote, new Set());
    }
    remoteGroups.get(target.remote).add(target.branch);
  }

  let remoteDeleted = 0;
  for (const [remote, branches] of remoteGroups) {
    const branchNames = [...branches];
    try {
      await gitAction(repositoryPath, [
        "push",
        remote,
        "--delete",
        ...branchNames
      ]);
      remoteDeleted += branchNames.length;
    } catch (error) {
      warnings.push(`远程 ${remote} 删除失败：${error.message}`);
    }
  }

  const localSummary =
    deleted.length === 1
      ? `已删除本地分支 ${deleted[0].name}`
      : `已删除 ${deleted.length} 个本地分支`;
  return {
    output:
      remoteDeleted > 0
        ? `${localSummary}，并删除 ${remoteDeleted} 个远程分支。`
        : `${localSummary}。`,
    warnings
  };
}

async function mergeBranch(repositoryPath, branchName) {
  await validateBranchName(repositoryPath, branchName);
  return gitAction(repositoryPath, ["merge", "--no-edit", branchName]);
}

async function validateBranchName(repositoryPath, branchName) {
  const name = String(branchName || "").trim();
  if (!name) {
    throw httpError(400, "请输入分支名。");
  }
  if (name.startsWith("-")) {
    throw httpError(400, "分支名不能以连字符开头。");
  }
  const result = await runGit(repositoryPath, [
    "check-ref-format",
    "--branch",
    name
  ]);
  if (result.code !== 0) {
    throw httpError(400, "分支名不符合 Git 命名规则。");
  }
}

// ---- 提交历史右键菜单动作 ----
// 所有引用/哈希都作为独立 argv 交给 git（spawn，无 shell）；字符集再收紧一层，
// 防止 "-x"、空格、refspec 之类的输入被当成选项或路径。

function validateRefArgument(value) {
  const ref = String(value ?? "").trim();
  if (!ref || ref.startsWith("-") || !/^[A-Za-z0-9._/\-]+$/.test(ref)) {
    throw httpError(400, "引用名称无效。");
  }
  return ref;
}

async function validateRevision(repositoryPath, value) {
  const revision = validateRefArgument(value);
  await runGit(repositoryPath, [
    "rev-parse",
    "--verify",
    `${revision}^{commit}`
  ]);
  return revision;
}

async function validateCommitHash(repositoryPath, value) {
  const hash = String(value ?? "").trim();
  if (!/^[0-9a-fA-F]{7,40}$/.test(hash)) {
    throw httpError(400, "提交哈希无效。");
  }
  await validateRevision(repositoryPath, hash);
  return hash;
}

async function refExists(repositoryPath, fullRef) {
  try {
    await runGit(repositoryPath, [
      "show-ref",
      "--verify",
      "--quiet",
      fullRef
    ]);
    return true;
  } catch {
    return false;
  }
}

async function fetchRemoteNames(repositoryPath) {
  const remotes = await getRemotes(repositoryPath);
  return [
    ...new Set(
      remotes
        .filter((remote) => remote.type === "fetch")
        .map((remote) => remote.name)
    )
  ];
}

function splitRemoteRef(ref, remoteNames) {
  const remote = remoteNames.find((name) => ref.startsWith(`${name}/`));
  if (!remote) {
    return null;
  }
  return { remote, branch: ref.slice(remote.length + 1) };
}

// 右键分支标签的核心能力：本地分支直接 switch；远端分支先建同名跟踪分支；
// 标签切换到分离 HEAD；origin/HEAD 先解析成它指向的远端分支。
async function checkoutRef(repositoryPath, refInput) {
  let ref = validateRefArgument(refInput);
  const remoteNames = await fetchRemoteNames(repositoryPath);

  if (ref.endsWith("/HEAD") && splitRemoteRef(ref, remoteNames)) {
    const symbolic = await runGit(repositoryPath, [
      "symbolic-ref",
      "--short",
      `refs/remotes/${ref}`
    ]);
    ref = validateRefArgument(symbolic.stdout.trim());
  }

  const target = splitRemoteRef(ref, remoteNames);
  if (target) {
    if (!target.branch || target.branch === "HEAD") {
      throw httpError(400, "远端 HEAD 不能直接切换。");
    }
    await validateBranchName(repositoryPath, target.branch);
    if (await refExists(repositoryPath, `refs/heads/${target.branch}`)) {
      return gitAction(repositoryPath, ["switch", target.branch]);
    }
    try {
      return await gitAction(repositoryPath, [
        "switch",
        "-c",
        target.branch,
        "--track",
        ref
      ]);
    } catch {
      // 只有 refs/remotes 而没有 remote 配置的仓库无法建立跟踪信息，
      // 退化成普通起点创建，仍然切到该远端引用指向的提交。
      return gitAction(repositoryPath, ["switch", "-c", target.branch, ref]);
    }
  }

  if (await refExists(repositoryPath, `refs/tags/${ref}`)) {
    return gitAction(repositoryPath, [
      "switch",
      "--detach",
      `refs/tags/${ref}`
    ]);
  }
  await validateBranchName(repositoryPath, ref);
  return gitAction(repositoryPath, ["switch", ref]);
}

async function checkoutCommit(repositoryPath, hash) {
  const commit = await validateCommitHash(repositoryPath, hash);
  return gitAction(repositoryPath, ["switch", "--detach", commit]);
}

async function createBranchAt(repositoryPath, name, base, switchTo) {
  await validateBranchName(repositoryPath, name);
  const revision = await validateRevision(repositoryPath, base);
  if (switchTo) {
    return gitAction(repositoryPath, ["switch", "-c", name, revision]);
  }
  return gitAction(repositoryPath, ["branch", name, revision]);
}

async function createTagAt(repositoryPath, name, base, message) {
  const tag = validateRefArgument(name);
  await runGit(repositoryPath, ["check-ref-format", `refs/tags/${tag}`]);
  const revision = await validateRevision(repositoryPath, base);
  const note = String(message ?? "").trim();
  const args = ["tag"];
  if (note) {
    args.push("-a", "-m", note);
  }
  args.push(tag, revision);
  return gitAction(repositoryPath, args);
}

async function pushRef(repositoryPath, refInput) {
  const ref = validateRefArgument(refInput);
  const remoteNames = await fetchRemoteNames(repositoryPath);
  const target = splitRemoteRef(ref, remoteNames);
  const remote = target?.remote || remoteNames[0] || "origin";
  const branch = target?.branch || ref;
  if (!branch || branch === "HEAD") {
    throw httpError(400, "该引用不能直接推送。");
  }
  if (!target && (await refExists(repositoryPath, `refs/tags/${ref}`))) {
    return gitAction(repositoryPath, [
      "push",
      remote,
      `refs/tags/${ref}:refs/tags/${ref}`
    ]);
  }
  if (!(await refExists(repositoryPath, `refs/heads/${branch}`))) {
    throw httpError(422, `本地分支 ${branch} 不存在，无法推送。`);
  }
  return gitAction(repositoryPath, [
    "push",
    remote,
    `refs/heads/${branch}:refs/heads/${branch}`
  ]);
}

async function deleteRef(repositoryPath, refInput, force) {
  const ref = validateRefArgument(refInput);
  const remoteNames = await fetchRemoteNames(repositoryPath);
  const target = splitRemoteRef(ref, remoteNames);
  if (target) {
    if (!target.branch || target.branch === "HEAD") {
      throw httpError(400, "远端 HEAD 不能删除。");
    }
    return gitAction(repositoryPath, [
      "push",
      target.remote,
      "--delete",
      target.branch
    ]);
  }
  if (await refExists(repositoryPath, `refs/tags/${ref}`)) {
    return gitAction(repositoryPath, ["tag", "-d", ref]);
  }
  await validateBranchName(repositoryPath, ref);
  const current = await runGit(repositoryPath, ["branch", "--show-current"]);
  if (current.stdout.trim() === ref) {
    throw httpError(422, "不能删除当前检出的分支。");
  }
  return gitAction(repositoryPath, [
    "branch",
    force ? "-D" : "-d",
    "--",
    ref
  ]);
}

async function getCommitChanges(repository, hashInput, compareInput) {
  await assertRepositoryAvailable(repository);
  const hash = await validateCommitHash(repository.path, hashInput);
  const compare = ["worktree", "previous", "patch"].includes(compareInput)
    ? compareInput
    : "patch";
  const common = ["--no-ext-diff", "--no-color"];
  const showArgs = [
    "show",
    ...common,
    "--format=fuller",
    "--stat",
    "--patch",
    hash
  ];
  let args = showArgs;
  if (compare === "worktree") {
    args = ["diff", ...common, hash];
  } else if (compare === "previous") {
    args = ["diff", ...common, `${hash}^`, hash];
  }

  let result;
  try {
    result = await runGit(repository.path, args);
  } catch (error) {
    if (compare !== "previous") {
      throw error;
    }
    // 根提交没有父提交，退回 show。
    result = await runGit(repository.path, showArgs);
  }

  const raw = result.stdout.trim() || "没有可显示的差异。";
  const buffer = Buffer.from(raw);
  const text =
    buffer.length > MAX_DIFF_BYTES
      ? `${buffer.subarray(0, MAX_DIFF_BYTES).toString("utf8")}\n\n… 输出过长，已截断。`
      : raw;
  return { hash, compare, text };
}

async function stashPop(repositoryPath, stashRef) {
  const ref = String(stashRef || "stash@{0}");
  if (!/^stash@\{\d+\}$/.test(ref)) {
    throw httpError(400, "Stash 引用无效。");
  }
  return gitAction(repositoryPath, ["stash", "pop", "--index", ref]);
}

async function unstageAll(repositoryPath) {
  const result = await runGit(repositoryPath, ["reset", "--quiet", "HEAD", "--"]);
  if (result.code === 0) {
    return result.stdout || "已取消暂存。";
  }
  return gitAction(repositoryPath, ["rm", "--cached", "-r", "--", "."]);
}

async function unstagePath(repositoryPath, filePath) {
  const result = await runGit(repositoryPath, [
    "reset",
    "--quiet",
    "HEAD",
    "--",
    filePath
  ]);
  if (result.code === 0) {
    return result.stdout || `已取消暂存 ${filePath}`;
  }
  return gitAction(repositoryPath, ["rm", "--cached", "--", filePath]);
}

async function discardPath(repositoryPath, filePath) {
  return discardPaths(repositoryPath, [filePath]);
}

async function discardPaths(repositoryPath, inputPaths) {
  if (!Array.isArray(inputPaths) || !inputPaths.length) {
    throw httpError(400, "请选择要还原的文件。");
  }
  if (inputPaths.length > 500) {
    throw httpError(400, "一次最多还原 500 个文件。");
  }

  const paths = [
    ...new Set(
      inputPaths.map((filePath) =>
        validateRepositoryPath(repositoryPath, filePath)
      )
    )
  ];
  const listed = await runGit(repositoryPath, [
    "ls-files",
    "-z",
    "--",
    ...paths
  ]);
  const trackedPaths = new Set(
    listed.stdout.split("\0").filter(Boolean)
  );
  const tracked = paths.filter((filePath) => trackedPaths.has(filePath));
  const untracked = paths.filter((filePath) => !trackedPaths.has(filePath));

  if (tracked.length) {
    await gitAction(
      repositoryPath,
      [
        "restore",
        "--worktree",
        "--pathspec-from-file=-",
        "--pathspec-file-nul"
      ],
      {
        env: { GIT_OPTIONAL_LOCKS: "0" },
        input: `${tracked.join("\0")}\0`
      }
    );
  }
  await Promise.all(
    untracked.map((filePath) =>
      fs.rm(path.resolve(repositoryPath, filePath), {
        recursive: true,
        force: true
      })
    )
  );

  if (paths.length === 1) {
    return untracked.length
      ? `已删除未跟踪文件 ${paths[0]}`
      : `已还原文件 ${paths[0]}`;
  }
  return `已还原 ${paths.length} 个文件（已跟踪 ${tracked.length}，未跟踪 ${untracked.length}）。`;
}

async function getDiff(repository, filePath, staged) {
  await assertRepositoryAvailable(repository);
  if (!filePath) {
    const args = ["diff", "--no-ext-diff", "--no-color", "--stat"];
    if (staged) {
      args.splice(1, 0, "--cached");
    }
    const result = await runGit(repository.path, args);
    return result.stdout || "没有文本差异。";
  }

  const safePath = validateRepositoryPath(repository.path, filePath);
  const args = ["diff", "--no-ext-diff", "--no-color"];
  if (staged) {
    args.push("--cached");
  }
  args.push("--", safePath);
  const result = await runGit(repository.path, args);
  if (result.stdout.trim()) {
    return result.stdout;
  }

  const status = await getStatusSummary(repository);
  const isUntracked = status.untracked.some((file) => file.path === safePath);
  if (isUntracked) {
    return createUntrackedPatch(repository.path, safePath);
  }

  return "没有可显示的文本差异。";
}

async function getFileContent(repository, filePath) {
  await assertRepositoryAvailable(repository);
  const safePath = validateRepositoryPath(repository.path, filePath);
  const file = await resolveEditableFile(repository.path, safePath);
  if (!file) {
    throw httpError(404, "文件不存在，可能已被删除或移动。");
  }
  if (file.stat.size > MAX_DIFF_BYTES) {
    throw httpError(413, "文件超过 512 KB，暂不支持在内置编辑器中打开。");
  }

  const buffer = await fs.readFile(file.absolutePath);
  if (isProbablyBinary(buffer)) {
    throw httpError(415, "二进制文件不能在文本编辑器中打开。");
  }

  const rawContent = buffer.toString("utf8");
  const crlfCount = (rawContent.match(/\r\n/g) || []).length;
  const lfCount = (rawContent.match(/(?<!\r)\n/g) || []).length;
  const lineEnding = crlfCount > lfCount ? "\r\n" : "\n";
  return {
    path: safePath,
    content: rawContent.replaceAll("\r\n", "\n"),
    lineEnding,
    hash: hashContent(buffer),
    size: file.stat.size,
    editable: true
  };
}

async function saveFileContent(repository, body) {
  await assertRepositoryAvailable(repository);
  const safePath = validateRepositoryPath(repository.path, body.path);
  if (typeof body.content !== "string") {
    throw httpError(400, "文件内容无效。");
  }

  const file = await resolveEditableFile(repository.path, safePath);
  if (!file) {
    throw httpError(404, "文件不存在，无法保存。");
  }

  const currentBuffer = await fs.readFile(file.absolutePath);
  if (isProbablyBinary(currentBuffer)) {
    throw httpError(415, "二进制文件不能在文本编辑器中保存。");
  }
  if (body.expectedHash && hashContent(currentBuffer) !== body.expectedHash) {
    throw httpError(409, "文件已被其他程序修改，请重新打开后再编辑。");
  }

  const lineEnding = body.lineEnding === "\r\n" ? "\r\n" : "\n";
  const normalized = body.content.replaceAll("\r\n", "\n");
  const output =
    lineEnding === "\r\n" ? normalized.replaceAll("\n", "\r\n") : normalized;
  const outputBuffer = Buffer.from(output, "utf8");
  if (outputBuffer.length > MAX_DIFF_BYTES) {
    throw httpError(413, "保存后的文件超过 512 KB。");
  }

  await fs.writeFile(file.absolutePath, outputBuffer);
  return {
    saved: true,
    path: safePath,
    hash: hashContent(outputBuffer),
    size: outputBuffer.length,
    summary: await getStatusSummary(repository)
  };
}

module.exports = {
  runRepositoryAction,
  getDiff,
  getCommitChanges,
  getFileContent,
  saveFileContent
};
