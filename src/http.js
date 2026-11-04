"use strict";

// @module http
// HTTP 响应、请求体解析与会话令牌校验。纯函数 + 进程级令牌。
// 修改注意：isTrustedRequest 依赖 config 里的 SESSION_TOKEN 与 HOST。

const { URL } = require("node:url");
const { HOST, MAX_BODY_BYTES, MIME_TYPES, SESSION_TOKEN } = require("./config");

function isTrustedRequest(request) {
  const token = request.headers["x-gitdeck-token"];
  if (token !== SESSION_TOKEN) {
    return false;
  }

  const origin = request.headers.origin;
  if (!origin) {
    return true;
  }

  try {
    const originUrl = new URL(origin);
    return (
      originUrl.hostname === HOST ||
      originUrl.hostname === "localhost" ||
      originUrl.hostname === "::1"
    );
  } catch {
    return false;
  }
}

function sendJson(response, statusCode, payload) {
  if (response.headersSent) {
    return;
  }
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, error) {
  if (response.headersSent) {
    response.end();
    return;
  }
  const statusCode = error.statusCode || 500;
  const message =
    statusCode === 500 && process.env.NODE_ENV === "production"
      ? "服务内部错误。"
      : error.message || "请求失败。";
  sendJson(response, statusCode, { error: message });
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function readJson(request) {
  let size = 0;
  const chunks = [];

  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw httpError(413, "请求内容过大。");
    }
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw httpError(400, "请求内容不是有效 JSON。");
  }
}

module.exports = {
  isTrustedRequest,
  sendJson,
  sendError,
  httpError,
  readJson,
  MIME_TYPES
};
