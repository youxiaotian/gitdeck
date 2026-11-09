"use strict";

// @module directories
// 目录扫描、内置目录浏览器、系统盘符与快捷路径。
// 修改注意：discoverRepositories 的 ignoredNames 和 depth 上限是安全边界。

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { APP_ROOT } = require("./config");
const { httpError } = require("./http");

async function discoverRepositories(rootInput, maxDepth) {
  if (!rootInput || typeof rootInput !== "string") {
    throw httpError(400, "请提供要扫描的目录。");
  }

  const root = path.resolve(rootInput.trim());
  const stat = await fs.stat(root).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw httpError(400, "扫描目录不存在或无法访问。");
  }

  const repositories = [];
  const queue = [{ directory: root, depth: 0 }];
  const ignoredNames = new Set([
    ".git",
    ".svn",
    ".hg",
    "node_modules",
    "vendor",
    "dist",
    "build",
    "target",
    ".venv",
    "venv",
    "__pycache__"
  ]);

  while (queue.length && repositories.length < 250) {
    const current = queue.shift();
    const entries = await fs
      .readdir(current.directory, { withFileTypes: true })
      .catch(() => []);

    if (entries.some((entry) => entry.name === ".git")) {
      repositories.push({
        name: path.basename(current.directory),
        path: current.directory
      });
      continue;
    }

    if (current.depth >= maxDepth) {
      continue;
    }

    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        !ignoredNames.has(entry.name) &&
        !entry.name.startsWith(".")
      ) {
        queue.push({
          directory: path.join(current.directory, entry.name),
          depth: current.depth + 1
        });
      }
    }
  }

  return repositories.sort((left, right) =>
    left.path.localeCompare(right.path, "zh-CN")
  );
}

async function listDirectories(inputPath) {
  const currentPath = await findExistingDirectory(inputPath);
  let entries;
  try {
    entries = await fs.readdir(currentPath, { withFileTypes: true });
  } catch (error) {
    if (error.code === "EACCES" || error.code === "EPERM") {
      throw httpError(403, "无法读取这个目录，请检查访问权限后重试。");
    }
    throw error;
  }

  const directories = entries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name !== ".git" &&
        entry.name !== "node_modules"
    )
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"))
    .slice(0, 500);

  const directoryItems = await Promise.all(
    directories.map(async (entry) => {
      const directoryPath = path.join(currentPath, entry.name);
      return {
        name: entry.name,
        path: directoryPath,
        isRepository: await isRepositoryRoot(directoryPath)
      };
    })
  );

  const parentCandidate = path.dirname(currentPath);
  const parentPath =
    parentCandidate === currentPath ? null : parentCandidate;
  const [roots, quickPaths] = await Promise.all([
    listSystemRoots(),
    listQuickPaths(currentPath)
  ]);

  return {
    currentPath,
    parentPath,
    isRepository: await isRepositoryRoot(currentPath),
    directories: directoryItems,
    roots,
    quickPaths
  };
}

async function findExistingDirectory(inputPath) {
  let candidate;
  if (typeof inputPath === "string" && inputPath.trim()) {
    const trimmed = inputPath.trim();
    candidate =
      trimmed === "~"
        ? os.homedir()
        : trimmed.startsWith(`~${path.sep}`) ||
            trimmed.startsWith("~/") ||
            trimmed.startsWith("~\\")
          ? path.join(os.homedir(), trimmed.slice(2))
          : path.resolve(trimmed);
  } else {
    candidate = os.homedir() || APP_ROOT;
  }

  while (true) {
    const stat = await fs.stat(candidate).catch(() => null);
    if (stat?.isDirectory()) {
      return candidate;
    }
    if (stat?.isFile()) {
      candidate = path.dirname(candidate);
      continue;
    }
    const parent = path.dirname(candidate);
    if (parent === candidate) {
      break;
    }
    candidate = parent;
  }

  const fallback = (await fs.stat(APP_ROOT).catch(() => null))?.isDirectory()
    ? APP_ROOT
    : path.parse(process.cwd()).root;
  return fallback;
}

async function isRepositoryRoot(directoryPath) {
  const stat = await fs.stat(path.join(directoryPath, ".git")).catch(() => null);
  return Boolean(stat);
}

async function listSystemRoots() {
  if (process.platform !== "win32") {
    return [{ label: "/", path: "/" }];
  }

  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const accessible = await Promise.all(
    letters.map(async (letter) => {
      const root = `${letter}:\\`;
      const stat = await fs.stat(root).catch(() => null);
      return stat?.isDirectory()
        ? { label: `${letter}:`, path: root }
        : null;
    })
  );
  return accessible.filter(Boolean);
}

async function listQuickPaths(currentPath) {
  const candidates = [
    { label: "用户目录", path: os.homedir() },
    { label: "GitDeck 项目", path: APP_ROOT },
    { label: "当前目录", path: currentPath }
  ];
  const seen = new Set();
  const result = [];
  for (const candidate of candidates) {
    if (
      !candidate.path ||
      seen.has(candidate.path.toLowerCase()) ||
      !(await fs.stat(candidate.path).catch(() => null))?.isDirectory()
    ) {
      continue;
    }
    seen.add(candidate.path.toLowerCase());
    result.push(candidate);
  }
  return result;
}

// 列出仓库根目录第一层的 Visual Studio 解决方案文件（*.sln）。
// 与 git 状态无关：只读一次目录，未改动的文件也会返回。
// 不递归子目录：用户只要仓库根目录这一层，避免遍历大仓库目录树拖慢刷新。
async function listSolutions(repository) {
  const entries = await fs
    .readdir(repository.path, { withFileTypes: true })
    .catch(() => []);
  const solutions = [];
  for (const entry of entries) {
    // 目录（含 .git）一律不进入，只收集根目录下的普通文件。
    if (entry.name === ".git" || !entry.isFile()) {
      continue;
    }
    if (entry.name.toLowerCase().endsWith(".sln")) {
      solutions.push(entry.name);
    }
  }
  return solutions.sort((left, right) =>
    left.localeCompare(right, "zh-CN")
  );
}

module.exports = {
  discoverRepositories,
  listDirectories,
  findExistingDirectory,
  isRepositoryRoot,
  listSystemRoots,
  listQuickPaths,
  listSolutions
};
