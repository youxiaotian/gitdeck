"use strict";

// @module desktop
// 桌面壳：浏览器探测、--app 独立窗口、单实例探测、窗口尺寸持久化、窗口生命周期。
// 修改注意：仅在 GITDECK_DESKTOP=1 时启用 app 窗口与窗口生命周期；否则走浏览器模式。
// 「关窗口即退后端」只以窗口进程是否退出为依据，不用心跳超时：Chrome 后台冻结、
// 系统睡眠、页面卡顿都不会让进程消失，因此不会重现 ERR_CONNECTION_REFUSED。
// 必须用独立 --user-data-dir，否则 --app 会被转发给用户日常 Chrome 实例，
// 启动器进程秒退而主进程永不退出，后端就再也感知不到窗口关闭。

const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const {
  DATA_ROOT,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  HEARTBEAT_GRACE_MS
} = require("./config");

const WINDOW_STATE_FILE = path.join(DATA_ROOT, "window.json");
const WINDOW_PROFILE_DIR = path.join(DATA_ROOT, "chrome-profile");
// 窗口进程在这么短时间内退出视为启动失败（浏览器缺失、profile 被占用等），
// 此时不能把服务一起带走，否则会出现「点开软件后端立刻没了」。
const WINDOW_MIN_ALIVE_MS = 10000;
// 窗口退出后给一点缓冲，避免 Chrome 升级/重启主进程时误退出。
const WINDOW_EXIT_GRACE_MS = 3000;
const DEFAULT_WIDTH = 1680;
const DEFAULT_HEIGHT = 1000;
// 下限收紧：避免历史存档的小尺寸（或 Chrome 忽略 --window-size 时上报的小窗口）
// 让窗口每次都开得太窄。
const MIN_WIDTH = 1200;
const MIN_HEIGHT = 800;
// 相邻两次看门狗检查的间隔远大于检查周期，说明系统睡眠/休眠或事件循环被长时间阻塞。
// 此时 Date.now() 已经跳变，不能据此判定窗口关闭。
const SUSPEND_THRESHOLD_MS = HEARTBEAT_INTERVAL_MS * 3;

let watchdog = null;
let watchdogTimer = null;

const BROWSER_CANDIDATES = [
  {
    name: "chrome",
    paths: [
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe"),
      process.env["ProgramFiles(x86)"] && path.join(process.env["ProgramFiles(x86)"], "Google", "Chrome", "Application", "chrome.exe"),
      process.env.LocalAppData && path.join(process.env.LocalAppData, "Google", "Chrome", "Application", "chrome.exe")
    ]
  },
  {
    name: "edge",
    paths: [
      process.env["ProgramFiles(x86)"] && path.join(process.env["ProgramFiles(x86)"], "Microsoft", "Edge", "Application", "msedge.exe"),
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, "Microsoft", "Edge", "Application", "msedge.exe")
    ]
  }
];

async function findBrowser() {
  for (const candidate of BROWSER_CANDIDATES) {
    for (const candidatePath of candidate.paths) {
      if (!candidatePath) {
        continue;
      }
      const stat = await fs.stat(candidatePath).catch(() => null);
      if (stat?.isFile()) {
        return { name: candidate.name, path: candidatePath };
      }
    }
  }
  for (const command of ["chrome.exe", "msedge.exe"]) {
    const located = await locateExecutable(command);
    if (located) {
      return { name: command.replace(/\.exe$/, ""), path: located };
    }
  }
  return null;
}

function locateExecutable(name) {
  return new Promise((resolve) => {
    const child = spawn("where.exe", [name], { windowsHide: true, shell: false });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.split(/\r?\n/).find(Boolean) || "");
        return;
      }
      resolve("");
    });
    child.on("error", () => resolve(""));
  });
}

async function loadWindowSize() {
  try {
    const raw = await fs.readFile(WINDOW_STATE_FILE, "utf8");
    const data = JSON.parse(raw);
    const width = Math.min(Math.max(Number(data.width) || DEFAULT_WIDTH, MIN_WIDTH), 4096);
    const height = Math.min(Math.max(Number(data.height) || DEFAULT_HEIGHT, MIN_HEIGHT), 2160);
    return { width, height };
  } catch {
    return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  }
}

async function saveWindowSize(width, height) {
  try {
    await fs.mkdir(DATA_ROOT, { recursive: true });
    await fs.writeFile(
      WINDOW_STATE_FILE,
      JSON.stringify({ width, height }, null, 2),
      "utf8"
    );
  } catch {
    // 尺寸持久化失败不应影响主流程。
  }
}

async function launchAppWindow(url) {
  const browser = await findBrowser();
  if (!browser) {
    console.error("未找到 Chrome 或 Edge，无法以桌面窗口模式启动。已回退到浏览器模式：", url);
    spawn("cmd.exe", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    })
      .on("error", (error) => console.error(`打开浏览器失败：${error.message}`))
      .unref();
    return null;
  }
  const { width, height } = await loadWindowSize();
  await fs.mkdir(WINDOW_PROFILE_DIR, { recursive: true }).catch(() => {});
  const child = spawn(
    browser.path,
    [
      `--app=${url}`,
      `--user-data-dir=${WINDOW_PROFILE_DIR}`,
      `--window-size=${width},${height}`,
      "--window-position=80,60",
      "--disable-extensions",
      "--no-first-run",
      "--no-default-browser-check"
    ],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: false
    }
  );
  child.on("error", (error) =>
    console.error(`启动浏览器窗口失败：${error.message}`)
  );
  child.unref();
  return child;
}

/**
 * 纯逻辑窗口生命周期：窗口进程退出 -> 后端退出。
 * 不依赖心跳，所以睡眠/冻结/后台节流都不会误杀；启动极早期退出视为启动失败。
 * 定时器可注入，便于单测。
 */
function createWindowLifecycle({
  now = Date.now,
  minAliveMs = WINDOW_MIN_ALIVE_MS,
  graceMs = WINDOW_EXIT_GRACE_MS,
  schedule = setTimeout,
  cancel = clearTimeout,
  onExit = () => {},
  onLog = () => {}
} = {}) {
  const startedAt = now();
  let windowClosed = false;
  let pending = null;
  let exited = false;

  return {
    windowExited(code, signal) {
      if (windowClosed || exited) {
        return;
      }
      windowClosed = true;
      const aliveMs = now() - startedAt;
      if (aliveMs < minAliveMs) {
        onLog(
          `窗口进程启动 ${Math.round(aliveMs / 1000)}s 内退出（code=${code}, signal=${signal || "none"}），视为启动失败，服务保持运行`
        );
        return;
      }
      onLog("桌面窗口已关闭，GitDeck 服务准备退出");
      pending = schedule(() => {
        pending = null;
        exited = true;
        onExit();
      }, graceMs);
    },
    dispose() {
      if (pending) {
        cancel(pending);
        pending = null;
      }
    },
    get state() {
      return { windowClosed, exited, aliveMs: now() - startedAt };
    }
  };
}

function attachAppWindow(child, options = {}) {
  const lifecycle = createWindowLifecycle(options);
  if (!child) {
    return lifecycle;
  }
  child.on("exit", (code, signal) => {
    try {
      lifecycle.windowExited(code, signal);
    } catch (error) {
      console.error(`[window] 窗口生命周期处理异常：${error.stack || error}`);
    }
  });
  return lifecycle;
}

function probeInstance(port) {
  return new Promise((resolve) => {
    const request = http.get(
      `http://127.0.0.1:${port}/api/ping`,
      { timeout: 800 },
      (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk.toString();
        });
        response.on("end", () => {
          try {
            resolve(Boolean(JSON.parse(body).ok));
          } catch {
            resolve(false);
          }
        });
      }
    );
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

/**
 * 纯逻辑看门狗，时间源和退出动作可注入，便于测试各种时钟跳变。
 * 只有「连续超时 + 确认窗口内仍无心跳 + 期间无系统挂起」才判定窗口已关闭。
 */
function createHeartbeatWatchdog({
  now = Date.now,
  timeoutMs = HEARTBEAT_TIMEOUT_MS,
  graceMs = HEARTBEAT_GRACE_MS,
  suspendThresholdMs = SUSPEND_THRESHOLD_MS,
  onExit = () => {},
  onLog = () => {}
} = {}) {
  let lastTouchAt = now();
  let lastTickAt = lastTouchAt;
  let suspectSince = null;
  let exited = false;

  return {
    touch() {
      lastTouchAt = now();
      suspectSince = null;
    },
    tick() {
      if (exited) {
        return;
      }
      const current = now();
      const gap = current - lastTickAt;
      lastTickAt = current;

      // 系统睡眠/休眠、进程被挂起或主线程长时间阻塞：墙钟跳变，重置计时。
      if (gap > suspendThresholdMs) {
        lastTouchAt = current;
        suspectSince = null;
        onLog(`检测到时钟跳变 ${Math.round(gap / 1000)}s（睡眠/挂起），已重置心跳计时`);
        return;
      }
      if (current - lastTouchAt <= timeoutMs) {
        suspectSince = null;
        return;
      }
      if (suspectSince === null) {
        suspectSince = current;
        onLog(`心跳超时，进入 ${Math.round(graceMs / 1000)}s 确认窗口`);
        return;
      }
      if (current - suspectSince < graceMs) {
        return;
      }
      exited = true;
      onLog("确认窗口内仍无心跳，判定桌面窗口已关闭");
      onExit();
    },
    get state() {
      return { lastTouchAt, lastTickAt, suspectSince, exited };
    }
  };
}

function touchHeartbeat() {
  if (watchdog) {
    watchdog.touch();
  }
}

function startHeartbeatWatchdog() {
  if (watchdogTimer) {
    return;
  }
  if (HEARTBEAT_TIMEOUT_MS === 0) {
    console.log(
      "[heartbeat] 由窗口进程生命周期决定退出（关窗口即退），未启用心跳自动退出；GITDECK_HEARTBEAT=1 可额外开启。"
    );
    return;
  }
  watchdog = createHeartbeatWatchdog({
    onExit: () => {
      console.log("桌面窗口已关闭，GitDeck 退出。");
      process.exit(0);
    },
    onLog: (message) => console.log(`[heartbeat] ${message}`)
  });
  watchdog.touch();
  watchdogTimer = setInterval(() => {
    try {
      watchdog.tick();
    } catch (error) {
      console.error(`[heartbeat] 看门狗异常：${error.stack || error}`);
    }
  }, HEARTBEAT_INTERVAL_MS);
  watchdogTimer.unref();
  console.log(
    `[heartbeat] 看门狗已启动：${HEARTBEAT_TIMEOUT_MS / 1000}s 超时 + ${HEARTBEAT_GRACE_MS / 1000}s 确认窗口`
  );
}

function stopHeartbeatWatchdog() {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
  watchdog = null;
}

module.exports = {
  findBrowser,
  loadWindowSize,
  saveWindowSize,
  launchAppWindow,
  attachAppWindow,
  createWindowLifecycle,
  probeInstance,
  touchHeartbeat,
  createHeartbeatWatchdog,
  startHeartbeatWatchdog,
  stopHeartbeatWatchdog,
  WINDOW_PROFILE_DIR,
  WINDOW_MIN_ALIVE_MS,
  WINDOW_EXIT_GRACE_MS,
  SUSPEND_THRESHOLD_MS
};
