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

async function openVisualStudio(solutionPath) {
  if (process.platform !== "win32") {
    throw httpError(501, "Visual Studio 仅支持 Windows。");
  }

  const executablePath = await findDevenv();
  if (!executablePath) {
    throw httpError(
      501,
      "未找到 devenv.exe，请先安装 Visual Studio。"
    );
  }

  // devenv.exe 通过文件路径参数直接打开解决方案，无需额外开关。
  spawn(executablePath, [solutionPath], {
    detached: true,
    stdio: "ignore",
    windowsHide: false
  }).unref();
}

// 定位本机 Visual Studio 的 devenv.exe：优先用 vswhere，再回退常见版本目录。
async function findDevenv() {
  const vswhereCandidates = [
    process.env.ProgramFiles &&
      path.join(
        process.env.ProgramFiles,
        "Microsoft Visual Studio",
        "Installer",
        "vswhere.exe"
      ),
    process.env["ProgramFiles(x86)"] &&
      path.join(
        process.env["ProgramFiles(x86)"],
        "Microsoft Visual Studio",
        "Installer",
        "vswhere.exe"
      )
  ].filter(Boolean);

  for (const vswhere of vswhereCandidates) {
    const stat = await fs.stat(vswhere).catch(() => null);
    if (!stat?.isFile()) {
      continue;
    }
    const located = await runProcess(vswhere, [
      "-latest",
      "-products",
      "*",
      "-requires",
      "Microsoft.VisualStudio.Component.CoreEditor",
      "-property",
      "installationPath"
    ]).catch(() => null);
    if (located?.code !== 0) {
      continue;
    }
    const installPath = located.stdout.split(/\r?\n/).find(Boolean);
    if (!installPath) {
      continue;
    }
    const candidate = path.join(
      installPath,
      "Common7",
      "IDE",
      "devenv.exe"
    );
    if ((await fs.stat(candidate).catch(() => null))?.isFile()) {
      return candidate;
    }
  }

  const years = ["2022", "2019"];
  const skus = ["Community", "Professional", "Enterprise"];
  const bases = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(
    Boolean
  );
  for (const year of years) {
    for (const sku of skus) {
      for (const base of bases) {
        const candidate = path.join(
          base,
          "Microsoft Visual Studio",
          year,
          sku,
          "Common7",
          "IDE",
          "devenv.exe"
        );
        if ((await fs.stat(candidate).catch(() => null))?.isFile()) {
          return candidate;
        }
      }
    }
  }

  return "";
}

module.exports = { openExplorer, openTerminal, openTortoiseGit, openVisualStudio };
