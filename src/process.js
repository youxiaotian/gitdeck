"use strict";

// @module process
// 子进程执行封装。runGit 注入精确 safe.directory 与可选锁环境。
// 修改注意：禁止 shell:true；GIT_TERMINAL_PROMPT=0 避免挂起。

const path = require("node:path");
const { spawn } = require("node:child_process");
const { httpError } = require("./http");

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
      clearTimeout(timeout);
      resolve({ code: 127, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
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
  const result = await runProcess(
    "git",
    [
      "-c",
      "color.ui=false",
      "-c",
      `safe.directory=${toGitPath(repositoryPath)}`,
      "-C",
      repositoryPath,
      ...args
    ],
    options
  );
  if (result.code !== 0) {
    const message =
      result.stderr.trim() ||
      result.stdout.trim() ||
      `Git 命令失败，退出码 ${result.code}`;
    throw httpError(422, message);
  }
  return result;
}

async function gitAction(repositoryPath, args, options = {}) {
  const result = await runGit(repositoryPath, args, {
    timeout: 180000,
    ...options
  });
  return (
    [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n") ||
    "操作已完成。"
  );
}

module.exports = { runProcess, runGit, gitAction, toGitPath };
