"use strict";

// @module server
// 进程入口：创建 HTTP 服务、分发 API 与静态资源、监听端口。
// 桌面模式（GITDECK_DESKTOP=1）：固定端口、单实例、独立 profile 的 --app 窗口，
//   窗口进程退出即关闭后端（下次运行 .\start.cmd 重新拉起后台）。
// 浏览器模式（默认）：端口自增、自动打开浏览器标签页，服务常驻。
// 修改注意：不要在服务进程里注册任何定时任务去碰用户仓库。抓取与状态刷新
//   一律由用户主动触发，后台 fetch / 前端轮询曾干扰 TortoiseGit Log。

const http = require("node:http");
const { spawn } = require("node:child_process");
const { DATA_ROOT, DEFAULT_PORT, HOST } = require("./src/config");
const { handleApi } = require("./src/routes");
const { sendError } = require("./src/http");
const { recordApiError } = require("./src/action-log");
const { serveStatic } = require("./src/static");
const desktop = require("./src/desktop");
const { killActiveChildren } = require("./src/process");
const { installFileLogging, LOG_FILE } = require("./src/logger");

// start.cmd 以隐藏窗口启动，stdout 无处可看；关键事件同步落盘，
// 这样「服务自己没了」之后仍能查到原因。
installFileLogging();

// 任何漏网的异步异常在 Node 默认行为下都会直接终止进程，表现为页面刷新
// 时 ERR_CONNECTION_REFUSED。请求级已有 try/catch 兜底，这里记录堆栈并让
// 服务继续运行（本地单用户工具，可用性优先于「异常即退出」的通用建议）。
process.on("uncaughtException", (error) => {
  console.error(`[fatal] 未捕获异常，服务继续运行：${error.stack || error}`);
});
process.on("unhandledRejection", (reason) => {
  console.error(`[fatal] 未处理的 Promise 拒绝，服务继续运行：${reason?.stack || reason}`);
});

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
      // 只记录 API 失败；静态资源 404 之类不该淹没错误日志。
      if (String(request.url || "").startsWith("/api/")) {
        recordApiError(error, request);
      }
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
    console.log(`运行日志：${LOG_FILE}`);
    console.log("后台自动抓取已移除；抓取与刷新均由用户主动触发。");

    if (IS_DESKTOP) {
      if (process.env.GITDECK_NO_OPEN !== "1") {
        desktop
          .launchAppWindow(address)
          .then((child) => {
            if (!child) {
              return;
            }
            desktop.attachAppWindow(child, {
              onLog: (message) => console.log(`[window] ${message}`),
              onExit: () => {
                desktop.stopHeartbeatWatchdog();
                killActiveChildren();
                console.log("桌面窗口已关闭，GitDeck 后端退出。");
                process.exit(0);
              }
            });
          })
          .catch((error) => {
            console.error(`启动桌面窗口失败：${error.stack || error}`);
          });
      }
      desktop.startHeartbeatWatchdog();
    } else if (process.env.GITDECK_NO_OPEN !== "1" && process.platform === "win32") {
      spawn("cmd.exe", ["/c", "start", "", address], {
        detached: true,
        stdio: "ignore",
        windowsHide: true
      })
        .on("error", (error) => console.error(`打开浏览器失败：${error.message}`))
        .unref();
    }
  });

  server.on("close", () => {
    console.log("HTTP 服务已关闭。");
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
