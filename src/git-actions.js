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
const { openExplorer, openTerminal, openTortoiseGit } = require("./shell");

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
  getFileContent,
  saveFileContent
};
