"use strict";

// @module server
// 进程入口：创建 HTTP 服务、分发 API 与静态资源、监听端口。
// 桌面模式（GITDECK_DESKTOP=1）：固定端口、单实例、--app 窗口、心跳看门狗。
// 浏览器模式（默认）：端口自增、自动打开浏览器标签页。

const http = require("node:http");
const { spawn } = require("node:child_process");
const { DATA_ROOT, DEFAULT_PORT, HOST } = require("./src/config");
const { handleApi } = require("./src/routes");
const { sendError } = require("./src/http");
const { serveStatic } = require("./src/static");
const desktop = require("./src/desktop");
const { startAutoFetch, stopAutoFetch } = require("./src/auto-fetch");

const IS_DESKTOP = process.env.GITDECK_DESKTOP === "1";

async function main() {
  if (IS_DESKTOP) {
    const existing = await desktop.probeInstance(DEFAULT_PORT);
    if (existing) {
      await desktop.launchAppWindow(`http://${HOST}:${DEFAULT_PORT}`);
      process.exit(0);
      return;
    }
  }

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || HOST}`);
      if (url.pathname.startsWith("/api/")) {
        await handleApi(request, response, url);
        return;
      }
      await serveStatic(response, url.pathname);
    } catch (error) {
      sendError(response, error);
    }
  });

  let port = DEFAULT_PORT;
  let attempts = 0;
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      if (IS_DESKTOP) {
        // 端口被占：若已是 GitDeck 实例则只开窗口并退出，否则报错退出。
        desktop.probeInstance(DEFAULT_PORT).then(async (alive) => {
          if (alive) {
            await desktop.launchAppWindow(`http://${HOST}:${DEFAULT_PORT}`);
            process.exit(0);
          } else {
            console.error(`端口 ${DEFAULT_PORT} 被其他程序占用。`);
            process.exitCode = 1;
          }
        });
        return;
      }
      if (attempts < 10) {
        attempts += 1;
        port += 1;
        setTimeout(() => server.listen(port, HOST), 20);
        return;
      }
    }
    console.error(error);
    process.exitCode = 1;
  });

  server.listen(port, HOST, () => {
    const address = `http://${HOST}:${port}`;
    console.log(`GitDeck 已启动：${address}`);
    console.log(`仓库数据目录：${DATA_ROOT}`);

    if (IS_DESKTOP) {
      if (process.env.GITDECK_NO_OPEN !== "1") {
        desktop.launchAppWindow(address);
      }
      desktop.startHeartbeatWatchdog();
    } else if (process.env.GITDECK_NO_OPEN !== "1" && process.platform === "win32") {
      spawn("cmd.exe", ["/c", "start", "", address], {
        detached: true,
        stdio: "ignore",
        windowsHide: true
      }).unref();
    }

    startAutoFetch();
  });

  server.on("close", stopAutoFetch);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
