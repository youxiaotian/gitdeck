"use strict";

// @module desktop
// 桌面壳 A：浏览器探测、--app 独立窗口、单实例探测、窗口尺寸持久化、心跳看门狗。
// 修改注意：仅在 GITDECK_DESKTOP=1 时启用看门狗与 app 窗口；否则 server.js 走原浏览器模式。

const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { DATA_ROOT } = require("./config");

const WINDOW_STATE_FILE = path.join(DATA_ROOT, "window.json");
const DEFAULT_WIDTH = 1680;
const DEFAULT_HEIGHT = 1000;
// 下限收紧：避免历史存档的小尺寸（或 Chrome 忽略 --window-size 时上报的小窗口）
// 让窗口每次都开得太窄。
const MIN_WIDTH = 1200;
const MIN_HEIGHT = 800;
const HEARTBEAT_INTERVAL_MS = 5000;
const HEARTBEAT_TIMEOUT_MS = 30000;

let lastHeartbeat = Date.now();
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
    }).unref();
    return false;
  }
  const { width, height } = await loadWindowSize();
  spawn(
    browser.path,
    [
      `--app=${url}`,
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
  ).unref();
  return true;
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

function touchHeartbeat() {
  lastHeartbeat = Date.now();
}

function startHeartbeatWatchdog() {
  lastHeartbeat = Date.now();
  if (watchdogTimer) {
    return;
  }
  watchdogTimer = setInterval(() => {
    if (Date.now() - lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
      console.log("桌面窗口已关闭，GitDeck 退出。");
      process.exit(0);
    }
  }, HEARTBEAT_INTERVAL_MS);
  watchdogTimer.unref();
}

module.exports = {
  findBrowser,
  loadWindowSize,
  saveWindowSize,
  launchAppWindow,
  probeInstance,
  touchHeartbeat,
  startHeartbeatWatchdog
};
