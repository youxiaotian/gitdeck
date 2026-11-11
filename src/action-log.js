"use strict";

// @module action-log
// API 失败日志。批量抓取时 toast 只能显示第一条错误，剩下的错误全文会丢；
// 这里在请求失败时把结构化记录落到 data/errors.log，并在 server.log 留摘要，
// 供顶栏 Log 按钮查看。
//
// 边界：只在请求真正失败时写文件，没有任何后台巡检；日志写入/读取失败
// 绝不影响接口响应；所有文件都固定在 DATA_ROOT 内，不暴露给非本机会话。

const fs = require("node:fs");
const path = require("node:path");
const { DATA_ROOT } = require("./config");
const { LOG_FILE: SERVER_LOG_FILE, logError } = require("./logger");

const ERROR_LOG_FILE = path.join(DATA_ROOT, "errors.log");
const MAX_BYTES = 256 * 1024;
const MAX_ENTRIES = 300;
const MAX_MESSAGE_CHARS = 20000;
const LOG_LINE_START = /^\[\d{4}-\d{2}-\d{2}T/;

function clip(value, max) {
  return String(value == null ? "" : value).slice(0, max);
}

// server.js 的统一 catch 调用。error 上可带 routes.js 附加的
// gitdeckRepository / gitdeckAction，用来标明是哪个仓库的哪个动作失败了。
function recordApiError(error, request) {
  try {
    const pathname = String(request?.url || "").split("?")[0];
    const entry = {
      time: new Date().toISOString(),
      status: Number(error?.statusCode) || 500,
      method: clip(request?.method || "", 12),
      path: clip(pathname, 300),
      repository: clip(error?.gitdeckRepository, 200),
      action: clip(error?.gitdeckAction, 80),
      message: clip(error?.message || error || "请求失败。", MAX_MESSAGE_CHARS)
    };

    fs.mkdirSync(DATA_ROOT, { recursive: true });
    try {
      if (fs.statSync(ERROR_LOG_FILE).size > MAX_BYTES) {
        try {
          fs.rmSync(`${ERROR_LOG_FILE}.1`, { force: true });
        } catch {
          // 旧轮转文件删不掉就跳过轮转，不能因此丢日志。
        }
        fs.renameSync(ERROR_LOG_FILE, `${ERROR_LOG_FILE}.1`);
      }
    } catch {
      // 文件不存在是首次写入，正常。
    }
    fs.appendFileSync(ERROR_LOG_FILE, `${JSON.stringify(entry)}\n`, "utf8");

    // 摘要同步进 server.log，便于直接翻文件排查；全文只在 errors.log 里。
    const heading = [
      `[api-error] HTTP ${entry.status}`,
      entry.method,
      entry.path,
      entry.repository ? `| ${entry.repository}` : "",
      entry.action ? `| ${entry.action}` : ""
    ]
      .filter(Boolean)
      .join(" ");
    logError(`${heading}\n${entry.message.split(/\r?\n/)[0].slice(0, 300)}`);
  } catch {
    // 磁盘满、权限不足等：日志失败不能影响服务。
  }
}

function readJsonLines(files) {
  const entries = [];
  for (const file of files) {
    let content;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }
      try {
        const parsed = JSON.parse(line);
        if (
          parsed &&
          typeof parsed === "object" &&
          typeof parsed.time === "string" &&
          typeof parsed.message === "string"
        ) {
          entries.push({
            time: clip(parsed.time, 40),
            status: Number(parsed.status) || 500,
            method: clip(parsed.method, 12),
            path: clip(parsed.path, 300),
            repository: clip(parsed.repository, 200),
            action: clip(parsed.action, 80),
            message: clip(parsed.message, MAX_MESSAGE_CHARS)
          });
        }
      } catch {
        // 半行、手工编辑过的坏行：跳过，不影响其余记录。
      }
    }
  }
  return entries;
}

// server.log 里 console 输出可能包含换行（例如多行 Git 错误），
// 以时间戳开头的行作为新条目，其余续行并入上一条，避免展示时散成碎片。
function readServerLines(files, limit) {
  const lines = [];
  for (const file of files) {
    let content;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }
      if (LOG_LINE_START.test(line)) {
        lines.push(line);
      } else if (lines.length) {
        lines[lines.length - 1] += `\n${line}`;
      } else {
        lines.push(line);
      }
    }
  }
  return lines.slice(-limit);
}

function readLogs(limit = 100) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), MAX_ENTRIES);
  let errors = [];
  let server = [];
  try {
    // 同一毫秒内可能连着失败多个仓库，时间相同时按写入顺序倒序，
    // 让列表第一条始终是最新发生的错误。
    errors = readJsonLines([`${ERROR_LOG_FILE}.1`, ERROR_LOG_FILE])
      .map((entry, index) => ({ entry, index }))
      .sort(
        (left, right) =>
          right.entry.time.localeCompare(left.entry.time) ||
          right.index - left.index
      )
      .map(({ entry }) => entry)
      .slice(0, safeLimit);
  } catch {
    errors = [];
  }
  try {
    server = readServerLines(
      [`${SERVER_LOG_FILE}.1`, SERVER_LOG_FILE],
      safeLimit
    );
  } catch {
    server = [];
  }
  return {
    errors,
    server,
    files: { errors: ERROR_LOG_FILE, server: SERVER_LOG_FILE }
  };
}

module.exports = {
  recordApiError,
  readLogs,
  readJsonLines,
  readServerLines,
  ERROR_LOG_FILE,
  SERVER_LOG_FILE,
  MAX_ENTRIES
};
