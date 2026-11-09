"use strict";

// @module process
// 子进程执行封装。runGit 注入精确 safe.directory 与可选锁环境。
// 修改注意：禁止 shell:true；GIT_TERMINAL_PROMPT=0 避免挂起。

const path = require("node:path");
const { spawn } = require("node:child_process");
const { httpError } = require("./http");
const { recoverIndexLock } = require("./index-lock");

// 关窗口 / 重启时若正好有 fetch 在跑，直接退出会留下写了一半的 FETCH_HEAD
// 或 lock 文件，用户在 TortoiseGit / VSCode 里就会撞上「仓库被占用」。
const activeChildren = new Set();

// 一次动作里可能有多条 git 命令（例如 commitSelected 是 add + commit），
// 恢复说明要汇总到动作结果里，让用户知道刚刚自动清理过陈旧锁。
const RECOVERY_NOTE_TTL_MS = 30000;
const recoveryNotes = new Map();

function recordRecoveryNote(repositoryPath, note) {
  const key = path.resolve(repositoryPath);
  const existing = recoveryNotes.get(key) || [];
  existing.push({ note, at: Date.now() });
  recoveryNotes.set(key, existing);
}

function consumeRecoveryNotes(repositoryPath) {
  const key = path.resolve(repositoryPath);
  const notes = recoveryNotes.get(key) || [];
  recoveryNotes.delete(key);
  const now = Date.now();
  return [
    ...new Set(
      notes
        .filter((entry) => now - entry.at < RECOVERY_NOTE_TTL_MS)
        .map((entry) => entry.note)
    )
  ];
}

function killActiveChildren() {
  for (const child of activeChildren) {
    try {
      child.kill();
    } catch {
      // 进程可能刚好结束。
    }
  }
}

function toGitPath(directoryPath) {
  return path.resolve(directoryPath).replaceAll("\\", "/");
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GIT_OPTIONAL_LOCKS: "0",
        LC_ALL: "C",
        ...options.env
      },
      windowsHide: true,
      shell: false
    });
    activeChildren.add(child);
    const release = () => activeChildren.delete(child);
    let stdout = "";
    let stderr = "";
    let settled = false;

    child.stdin.end(options.input || "");

    const timeout = setTimeout(() => {
      if (!settled) {
        child.kill();
      }
    }, options.timeout || 45000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      release();
      clearTimeout(timeout);
      resolve({ code: 127, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
      release();
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function runGit(repositoryPath, args, options = {}) {
  const gitArgs = [
    "-c",
    "color.ui=false",
    "-c",
    `safe.directory=${toGitPath(repositoryPath)}`,
    "-C",
    repositoryPath,
    ...args
  ];
  let result = await runProcess("git", gitArgs, options);
  if (result.code !== 0) {
    const message =
      result.stderr.trim() ||
      result.stdout.trim() ||
      `Git 命令失败，退出码 ${result.code}`;
    // 默认逻辑：陈旧 index.lock 自动清理并重试一次；活锁会在下面抛 423
    // 并带上占用进程，绝不删除。与锁无关的错误原样返回。
    const recovery = await recoverIndexLock(repositoryPath, message);
    if (!recovery) {
      throw httpError(422, message);
    }
    const retry = await runProcess("git", gitArgs, options);
    if (retry.code !== 0) {
      const retryMessage =
        retry.stderr.trim() ||
        retry.stdout.trim() ||
        `Git 命令失败，退出码 ${retry.code}`;
      throw httpError(422, `${recovery.note}\n但重试仍失败：${retryMessage}`);
    }
    recordRecoveryNote(repositoryPath, recovery.note);
    retry.recoveredNote = recovery.note;
    return retry;
  }
  return result;
}

async function gitAction(repositoryPath, args, options = {}) {
  const result = await runGit(repositoryPath, args, {
    timeout: 180000,
    ...options
  });
  const output =
    [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n") ||
    "操作已完成。";
  return result.recoveredNote
    ? `${result.recoveredNote}\n${output}`
    : output;
}

module.exports = {
  runProcess,
  runGit,
  gitAction,
  toGitPath,
  killActiveChildren,
  consumeRecoveryNotes
};
