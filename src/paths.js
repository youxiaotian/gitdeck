"use strict";

// @module paths
// 仓库内路径校验、可编辑文件解析、SHA-256 哈希、二进制判定与未跟踪补丁。
// 修改注意：validateRepositoryPath 是所有仓库内文件操作的安全边界，不能放宽。

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { isPathInside, normalizeSqlPath } = require("./git-utils");
const { httpError } = require("./http");
const { MAX_DIFF_BYTES } = require("./config");

function validateRepositoryPath(repositoryPath, inputPath) {
  const relativePath = normalizeSqlPath(inputPath);
  if (!relativePath || relativePath.includes("\0")) {
    throw httpError(400, "文件路径无效。");
  }
  if (path.isAbsolute(relativePath)) {
    throw httpError(400, "文件路径必须相对于仓库。");
  }
  const absolutePath = path.resolve(repositoryPath, relativePath);
  if (!isPathInside(repositoryPath, absolutePath)) {
    throw httpError(400, "文件路径不能离开仓库目录。");
  }
  if (
    absolutePath === path.join(repositoryPath, ".git") ||
    absolutePath.startsWith(path.join(repositoryPath, ".git") + path.sep)
  ) {
    throw httpError(400, "不能直接操作 .git 目录。");
  }
  return relativePath;
}

async function resolveEditableFile(repositoryPath, safePath) {
  const absolutePath = path.resolve(repositoryPath, safePath);
  const stat = await fs.lstat(absolutePath).catch(() => null);
  if (!stat) {
    return null;
  }
  if (stat.isSymbolicLink()) {
    throw httpError(400, "不能通过符号链接编辑仓库外部文件。");
  }
  if (!stat.isFile()) {
    return null;
  }

  const [realRepository, realFile] = await Promise.all([
    fs.realpath(repositoryPath),
    fs.realpath(absolutePath)
  ]);
  if (!isPathInside(realRepository, realFile)) {
    throw httpError(400, "文件路径不能离开仓库目录。");
  }
  return { absolutePath, stat };
}

function hashContent(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function isProbablyBinary(buffer) {
  const sampleLength = Math.min(buffer.length, 8192);
  for (let index = 0; index < sampleLength; index += 1) {
    if (buffer[index] === 0) {
      return true;
    }
  }
  return false;
}

async function createUntrackedPatch(repositoryPath, filePath) {
  const absolutePath = path.resolve(repositoryPath, filePath);
  const stat = await fs.stat(absolutePath).catch(() => null);
  if (!stat || !stat.isFile()) {
    return "这是未跟踪的目录，无法显示文件补丁。";
  }
  if (stat.size > MAX_DIFF_BYTES) {
    return "文件过大，未加载内容。";
  }

  const content = await fs.readFile(absolutePath);
  if (content.includes(0)) {
    return "二进制文件，无法显示文本差异。";
  }

  const lines = content.toString("utf8").replace(/\r\n/g, "\n").split("\n");
  if (lines[lines.length - 1] === "") {
    lines.pop();
  }
  const patch = [
    `diff --git a/${filePath} b/${filePath}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${filePath}`,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map((line) => `+${line}`)
  ];
  return patch.join("\n");
}

module.exports = {
  validateRepositoryPath,
  resolveEditableFile,
  hashContent,
  isProbablyBinary,
  createUntrackedPatch
};
