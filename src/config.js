"use strict";

// @module config
// 进程级常量与单例。被所有模块依赖，自身只依赖 repository-store。
// 修改注意：SESSION_TOKEN 在首次 require 时生成一次，整个进程共享。

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

// 定时后台 fetch 间隔；0 或 GITDECK_AUTO_FETCH=0 关闭。
const AUTO_FETCH_INTERVAL_MS =
  process.env.GITDECK_AUTO_FETCH === "0"
    ? 0
    : Number(process.env.GITDECK_AUTO_FETCH_MS) || 5 * 60 * 1000;
// 服务启动后延迟首轮：以前每次启动都立刻对全部仓库 fetch，重启/反复启动会
// 叠加多轮，正好撞上用户正在开的 TortoiseGit Log。GITDECK_AUTO_FETCH_DELAY_MS=0 可恢复立即执行。
const AUTO_FETCH_INITIAL_DELAY_MS =
  process.env.GITDECK_AUTO_FETCH_DELAY_MS === undefined
    ? 60 * 1000
    : Number(process.env.GITDECK_AUTO_FETCH_DELAY_MS);
// 失败仓库（远端不存在 / 无权限）退避，避免每轮都白跑一次网络请求。
const AUTO_FETCH_FAILURE_BACKOFF_MS = 15 * 60 * 1000;
// 只有近期的 .git/*.lock 才算「用户正在操作」；不少仓库常年残留一年前的
// maintenance.lock，那种陈旧锁要忽略，否则这些仓库永远不会被抓取。
const AUTO_FETCH_LOCK_MAX_AGE_MS = 10 * 60 * 1000;
// 并发压到 2：仓库多时别同时碰太多 .git 目录。
const AUTO_FETCH_CONCURRENCY = 2;

// 桌面模式默认让服务常驻：Chrome 会冻结长时间后台的窗口（JS 完全停止，
// 不只是节流），系统睡眠也会让心跳中断，任何固定超时都可能把仍在使用的
// 窗口误判成「已关闭」，导致刷新时 ERR_CONNECTION_REFUSED。
// 只有显式 GITDECK_HEARTBEAT=1 才启用自动退出，且仍带确认窗口与挂起感知。
// GITDECK_HEARTBEAT_INTERVAL_MS / _TIMEOUT_MS / _GRACE_MS 主要用于测试时加速。
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
  AUTO_FETCH_INTERVAL_MS,
  AUTO_FETCH_INITIAL_DELAY_MS,
  AUTO_FETCH_FAILURE_BACKOFF_MS,
  AUTO_FETCH_LOCK_MAX_AGE_MS,
  AUTO_FETCH_CONCURRENCY,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  HEARTBEAT_GRACE_MS,
  MIME_TYPES
};
