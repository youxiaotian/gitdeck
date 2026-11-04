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
const AUTO_FETCH_CONCURRENCY = 3;

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
  AUTO_FETCH_CONCURRENCY,
  MIME_TYPES
};
