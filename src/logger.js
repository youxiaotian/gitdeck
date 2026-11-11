"use strict";

// @module logger
// 轻量文件日志。start.cmd 用隐藏窗口启动 Node，stdout 不可见，
// 服务「自己没了」时无从排查；这里把 console 输出同步落到 data/server.log。
// 修改注意：日志写入失败绝不能影响主流程，也不能写到 DATA_ROOT 之外。

const fs = require("node:fs");
const path = require("node:path");
const { DATA_ROOT } = require("./config");

const LOG_FILE = path.join(DATA_ROOT, "server.log");
const MAX_BYTES = 256 * 1024;
let installed = false;

function format(value) {
  if (value instanceof Error) {
    return value.stack || String(value);
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function writeLine(text) {
  const line = `[${new Date().toISOString()}] ${text}\n`;
  try {
    fs.mkdirSync(DATA_ROOT, { recursive: true });
    try {
      if (fs.statSync(LOG_FILE).size > MAX_BYTES) {
        try {
          fs.rmSync(`${LOG_FILE}.1`, { force: true });
        } catch {
          // 旧轮转文件删不掉就跳过轮转，不能因此丢日志。
        }
        fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
      }
    } catch {
      // 文件不存在是首次写入，正常。
    }
    fs.appendFileSync(LOG_FILE, line, "utf8");
  } catch {
    // 磁盘满、权限不足等情况：日志失败不影响服务。
  }
}

// 给 action-log 用：直接写一行日志，不经过 console（测试环境也不会吵）。
// 仍然复用同一套轮转与「写失败不影响主流程」策略。
function logError(text) {
  writeLine(`[ERROR] ${text}`);
}

function installFileLogging() {
  if (installed) {
    return LOG_FILE;
  }
  installed = true;
  for (const level of ["log", "error", "warn"]) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      const text = args.map(format).join(" ");
      try {
        original(text);
      } catch {
        // 隐藏窗口下 stdout 可能不可写。
      }
      writeLine(`[${level.toUpperCase()}] ${text}`);
    };
  }
  return LOG_FILE;
}

module.exports = { installFileLogging, logError, LOG_FILE };
