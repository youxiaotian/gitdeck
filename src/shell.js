"use strict";

// @module shell
// 调用系统资源管理器、终端与 TortoiseGit。
// 修改注意：仅 Windows 实现；其他平台返回 501。

const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { httpError } = require("./http");
const { runProcess } = require("./process");

async function openExplorer(repositoryPath) {
  if (process.platform !== "win32") {
    throw httpError(501, "当前系统不支持从 GitDeck 打开资源管理器。");
  }
  spawn("explorer.exe", [repositoryPath], {
    detached: true,
    stdio: "ignore"
  }).unref();
}

async function openTerminal(repositoryPath) {
  if (process.platform !== "win32") {
    throw httpError(501, "当前系统不支持从 GitDeck 打开终端。");
  }

  const windowsTerminal = await runProcess("where.exe", ["wt.exe"]).catch(
    () => null
  );
  if (windowsTerminal && windowsTerminal.code === 0) {
    spawn("wt.exe", ["-d", repositoryPath], {
      detached: true,
      stdio: "ignore"
    }).unref();
    return;
  }

  spawn(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoExit",
      "-Command",
      "Set-Location -LiteralPath $env:GITDECK_REPOSITORY"
    ],
    {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        GITDECK_REPOSITORY: repositoryPath
      }
    }
  ).unref();
}

async function openTortoiseGit(repositoryPath) {
  if (process.platform !== "win32") {
    throw httpError(501, "TortoiseGit 仅支持 Windows。");
  }

  const candidates = [
    process.env.ProgramW6432 &&
      path.join(
        process.env.ProgramW6432,
        "TortoiseGit",
        "bin",
        "TortoiseGitProc.exe"
      ),
    process.env.ProgramFiles &&
      path.join(
        process.env.ProgramFiles,
        "TortoiseGit",
        "bin",
        "TortoiseGitProc.exe"
      ),
    process.env["ProgramFiles(x86)"] &&
      path.join(
        process.env["ProgramFiles(x86)"],
        "TortoiseGit",
        "bin",
        "TortoiseGitProc.exe"
      ),
    process.env.LocalAppData &&
      path.join(
        process.env.LocalAppData,
        "Programs",
        "TortoiseGit",
        "bin",
        "TortoiseGitProc.exe"
      )
  ].filter(Boolean);

  let executablePath = "";
  for (const candidate of candidates) {
    const stat = await fs.stat(candidate).catch(() => null);
    if (stat?.isFile()) {
      executablePath = candidate;
      break;
    }
  }

  if (!executablePath) {
    const located = await runProcess("where.exe", [
      "TortoiseGitProc.exe"
    ]).catch(() => null);
    if (located?.code === 0) {
      executablePath = located.stdout.split(/\r?\n/).find(Boolean) || "";
    }
  }

  if (!executablePath) {
    throw httpError(
      501,
      "未找到 TortoiseGitProc.exe，请先安装 TortoiseGit。"
    );
  }

  spawn(
    executablePath,
    ["/command:log", `/path:${repositoryPath}`],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: false
    }
  ).unref();
}

module.exports = { openExplorer, openTerminal, openTortoiseGit };
