"use strict";

// @module config
// 进程级常量与单例。被所有模块依赖，自身只依赖 repository-store。
// 修改注意：SESSION_TOKEN 在首次 require 时生成一次，整个进程共享。
// 不提供任何后台抓取/自动刷新的定时配置：这些动作会与用户正在进行的
// TortoiseGit / IDE 操作抢同一个 .git 目录，一律由用户主动触发。

const crypto = require("node:crypto");
const path = require("node:path");
const RepositoryStore = require("./repository-store");

const APP_ROOT = path.resolve(__dirname, "..");
const PUBLIC_ROOT = path.join(APP_ROOT, "public");
const DATA_ROOT = process.env.GITDECK_DATA_DIR
  ? path.resolve(process.env.GITDECK_DATA_DIR)
  : path.join(APP_ROOT, "data");
const STORE = new RepositoryStore(DATA_ROOT);
const SESSION_TOKEN = crypto.randomBytes(24).toString("hex");
const DEFAULT_PORT = Number(process.env.PORT) || 4321;
const HOST = "127.0.0.1";
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_DIFF_BYTES = 512 * 1024;

// 心跳看门狗默认关闭：Chrome 后台冻结、系统睡眠都会让心跳中断，固定超时
// 曾把仍在使用的窗口误判成「已关闭」导致 ERR_CONNECTION_REFUSED。桌面模式
// 改由 --app 窗口进程的 exit 事件决定退出；只有显式 GITDECK_HEARTBEAT=1
// 才额外启用自动退出。以下常量主要用于测试时加速。
const HEARTBEAT_INTERVAL_MS =
  Number(process.env.GITDECK_HEARTBEAT_INTERVAL_MS) || 5000;
const HEARTBEAT_TIMEOUT_MS =
  process.env.GITDECK_HEARTBEAT === "1"
    ? Number(process.env.GITDECK_HEARTBEAT_TIMEOUT_MS) || 120000
    : 0;
const HEARTBEAT_GRACE_MS =
  Number(process.env.GITDECK_HEARTBEAT_GRACE_MS) || 15000;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml; charset=utf-8"
};

module.exports = {
  APP_ROOT,
  PUBLIC_ROOT,
  DATA_ROOT,
  STORE,
  SESSION_TOKEN,
  DEFAULT_PORT,
  HOST,
  MAX_BODY_BYTES,
  MAX_DIFF_BYTES,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  HEARTBEAT_GRACE_MS,
  MIME_TYPES
};
