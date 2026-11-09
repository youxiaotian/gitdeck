"use strict";

// @module index-lock
// .git/index.lock 冲突的默认处理：**只在用户主动触发的 git 命令失败时介入**，
// 不注册任何后台巡检（后台碰仓库会和 TortoiseGit / IDE 抢 .git）。
//
// 判据：Windows 上以 FileShare.None 独占打开锁文件。能打开 => 没有任何进程
// 持有它，是陈旧锁，删除后重试一次；打不开 => 仍有进程持有，绝不删除，并把
// 可能占用该仓库的进程一并写进错误提示。探测本身失败时一律保守不删。

const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { httpError } = require("./http");

const execFileAsync = promisify(execFile);

const LOCK_FILE = "index.lock";
const PROBE_TIMEOUT_MS = 8000;
const MAX_HOLDERS = 10;
const MAX_COMMAND_CHARS = 160;

// 路径通过环境变量传入，脚本用 -EncodedCommand 执行：既避免引号 / 换行
// 在 Windows 命令行里被拆开，也杜绝路径里特殊字符造成的命令注入。
const PROBE_SCRIPT = `$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$lockPath = $env:GITDECK_LOCK_PATH
$repoPath = $env:GITDECK_REPOSITORY_PATH
$held = $false
$reason = ''
try {
  $stream = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
  $stream.Close()
} catch {
  $held = $true
  $reason = [string]$_.Exception.Message
}
$holders = @()
if ($held) {
  $known = '^(git|git-remote-http|git-remote-https|git-credential.*|git-credential-manager|TortoiseGitProc|TGitCache|devenv|Code|node|SourceTree|Fork|SmartGit|GitHubDesktop|TortoiseGitMerge|TortoiseGitIDiff)(\\.exe)?$'
  $needle = ''
  if ($repoPath) { $needle = $repoPath.ToLowerInvariant() }
  $all = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
  $matched = @()
  $others = @()
  foreach ($p in $all) {
    $cmd = [string]$p.CommandLine
    $isKnown = $p.Name -match $known
    $inRepo = $needle -and $cmd -and $cmd.ToLowerInvariant().Contains($needle)
    if (-not ($isKnown -or $inRepo)) { continue }
    $item = [ordered]@{
      pid = [int]$p.ProcessId
      name = [string]$p.Name
      command = $cmd
      inRepo = [bool]$inRepo
    }
    if ($inRepo) { $matched += $item } else { $others += $item }
  }
  $holders = @($matched + $others | Select-Object -First 10)
}
[pscustomobject]@{
  probed = $true
  held = $held
  reason = $reason
  holders = @($holders)
} | ConvertTo-Json -Compress -Depth 5`;

function isIndexLockError(message) {
  if (typeof message !== "string" || !/index\.lock/i.test(message)) {
    return false;
  }
  // 只认 Git 的锁冲突文案，避免把用户仓库里同名文件内容误判成锁错误。
  return /unable to create|file exists|could not lock|another git process|is locked|被占用/i.test(
    message
  );
}

function extractLockPath(message) {
  const match = message.match(/['"]([^'"\r\n]*index\.lock)['"]/i);
  if (!match) {
    return null;
  }
  const candidate = path.resolve(match[1]);
  return path.basename(candidate).toLowerCase() === LOCK_FILE ? candidate : null;
}

// .git 可能是目录，也可能是 worktree / submodule 里写着 gitdir: 的文件。
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
  const content = await fs.readFile(dotGit, "utf8").catch(() => "");
  const match = content.match(/^gitdir:\s*(.+)$/im);
  return match ? path.resolve(repositoryPath, match[1].trim()) : null;
}

function isUnder(child, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return (
    relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

// 只接受 git 目录内部的 index.lock；工作树里被跟踪的同名文件绝不能删。
async function locateLock(repositoryPath, message) {
  const gitDir = await resolveGitDir(repositoryPath);
  const fromMessage = extractLockPath(message);
  const fallback = gitDir ? path.join(gitDir, LOCK_FILE) : null;
  const candidates = [...new Set([fromMessage, fallback].filter(Boolean))];

  for (const candidate of candidates) {
    const stat = await fs.stat(candidate).catch(() => null);
    if (!stat || !stat.isFile()) {
      continue;
    }
    if (
      path.basename(candidate).toLowerCase() === LOCK_FILE &&
      gitDir &&
      isUnder(candidate, gitDir)
    ) {
      return { gitDir, lockPath: candidate, exists: true };
    }
    return { gitDir, lockPath: candidate, exists: true, unsafe: true };
  }

  // 锁文件已经不在了（另一个进程刚刚释放）：允许重试一次，但不删任何东西。
  if (candidates.length) {
    return { gitDir, lockPath: candidates[0], exists: false };
  }
  return null;
}

async function probeIndexLock(lockPath, repositoryPath) {
  if (process.platform !== "win32") {
    return null;
  }
  const encoded = Buffer.from(PROBE_SCRIPT, "utf16le").toString("base64");
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        encoded
      ],
      {
        timeout: PROBE_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
        encoding: "utf8",
        env: {
          ...process.env,
          GITDECK_LOCK_PATH: lockPath,
          GITDECK_REPOSITORY_PATH: repositoryPath
        }
      }
    ));
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(String(stdout).trim());
    if (!parsed || parsed.probed !== true || typeof parsed.held !== "boolean") {
      return null;
    }
    const rawHolders = Array.isArray(parsed.holders)
      ? parsed.holders
      : parsed.holders
        ? [parsed.holders]
        : [];
    return {
      held: parsed.held,
      reason: String(parsed.reason || "").slice(0, 200),
      holders: rawHolders.slice(0, MAX_HOLDERS)
    };
  } catch {
    return null;
  }
}

function formatHolders(holders) {
  if (!holders.length) {
    return "  （没有找到命令行包含该仓库路径的进程，可能是后台服务或未记录命令行的进程。）";
  }
  return holders
    .map((holder) => {
      const command = String(holder.command || "").trim();
      const clipped =
        command.length > MAX_COMMAND_CHARS
          ? `${command.slice(0, MAX_COMMAND_CHARS)}…`
          : command;
      const tag = holder.inRepo ? "· 命令行包含该仓库" : "· 常见 Git 客户端";
      return `  • ${holder.name || "进程"} (PID ${holder.pid}) ${tag}${clipped ? `\n    ${clipped}` : ""}`;
    })
    .join("\n");
}

function formatIndexLockHeldError(rawMessage, probe) {
  return [
    "仓库索引仍被其他进程占用，GitDeck 不会删除正在使用的 .git/index.lock。",
    "占用判定：以独占方式打开锁文件失败" +
      (probe.reason ? `（${probe.reason}）` : "") +
      "。",
    "",
    "可能持有该锁的进程：",
    formatHolders(probe.holders),
    "",
    "请关闭上述程序后重试；若确认是残留锁，再手动移除 .git/index.lock。",
    `Git 原始错误：${rawMessage}`
  ].join("\n");
}

function formatIndexLockUnknownError(rawMessage, lockPath) {
  return [
    lockPath
      ? `无法确认 ${lockPath} 是否仍被进程占用（进程探测失败），为安全起见没有删除它。`
      : "无法确定仓库的 .git 目录，为安全起见没有删除任何文件。",
    "请确认没有其他 Git 客户端 / IDE 正在操作该仓库，然后手动移除锁文件再重试。",
    `Git 原始错误：${rawMessage}`
  ].join("\n");
}

// 返回 null 表示与锁无关；返回 { note, deleted } 表示已可安全重试；
// 锁仍被占用或探测失败时抛 423，绝不静默删锁。
async function recoverIndexLock(repositoryPath, rawMessage) {
  if (!isIndexLockError(rawMessage)) {
    return null;
  }
  const location = await locateLock(repositoryPath, rawMessage);
  if (location?.unsafe) {
    throw httpError(
      423,
      [
        "检测到的 index.lock 不在仓库的 Git 目录内，为安全起见没有删除任何文件。",
        "GitDeck 只会自动清理 .git 目录里无人占用的陈旧锁；请手动检查该冲突。",
        `Git 原始错误：${rawMessage}`
      ].join("\n")
    );
  }
  if (!location || (location.exists && !location.gitDir)) {
    throw httpError(423, formatIndexLockUnknownError(rawMessage, location?.lockPath));
  }
  if (!location.exists) {
    return {
      note: ".git/index.lock 已由其他进程释放，已自动重试。",
      deleted: false
    };
  }

  const probe = await probeIndexLock(location.lockPath, repositoryPath);
  if (!probe) {
    throw httpError(
      423,
      formatIndexLockUnknownError(rawMessage, location.lockPath)
    );
  }
  if (probe.held) {
    throw httpError(423, formatIndexLockHeldError(rawMessage, probe));
  }

  try {
    await fs.unlink(location.lockPath);
  } catch {
    throw httpError(
      423,
      formatIndexLockUnknownError(rawMessage, location.lockPath)
    );
  }
  console.warn(`[index-lock] 已清理无人持有的陈旧锁：${location.lockPath}`);
  return {
    note: "检测到无人占用的陈旧 .git/index.lock，已自动删除并重试成功。",
    deleted: true
  };
}

module.exports = {
  isIndexLockError,
  extractLockPath,
  resolveGitDir,
  formatHolders,
  formatIndexLockHeldError,
  formatIndexLockUnknownError,
  probeIndexLock,
  recoverIndexLock,
  LOCK_FILE,
  PROBE_SCRIPT
};
