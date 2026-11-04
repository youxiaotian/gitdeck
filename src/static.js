"use strict";

// @module static
// 静态文件服务；index.html 在返回前注入会话令牌。
// 修改注意：新增前端模块后需要在 fileMap 注册路径。

const fs = require("node:fs/promises");
const path = require("node:path");
const { PUBLIC_ROOT, SESSION_TOKEN, MIME_TYPES } = require("./config");
const { httpError } = require("./http");

async function serveStatic(response, pathname) {
  const fileMap = {
    "/": "index.html",
    "/index.html": "index.html",
    "/app.js": "app.js",
    "/styles.css": "styles.css",
    "/favicon.png": "favicon.png",
    "/favicon.ico": "favicon.png"
  };
  const fileName = fileMap[pathname];
  if (!fileName) {
    throw httpError(404, "页面不存在。");
  }

  const filePath = path.join(PUBLIC_ROOT, fileName);
  let content = await fs.readFile(filePath);
  if (fileName === "index.html") {
    content = Buffer.from(
      content
        .toString("utf8")
        .replaceAll("__GITDECK_TOKEN__", SESSION_TOKEN),
      "utf8"
    );
  }

  response.writeHead(200, {
    "Content-Type": MIME_TYPES[path.extname(fileName)] || "application/octet-stream",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(content);
}

module.exports = { serveStatic };
