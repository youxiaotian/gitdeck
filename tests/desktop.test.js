"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { EventEmitter } = require("node:events");
const {
  createHeartbeatWatchdog,
  createWindowLifecycle,
  attachAppWindow,
  WINDOW_PROFILE_DIR,
  WINDOW_MIN_ALIVE_MS,
  WINDOW_EXIT_GRACE_MS,
  SUSPEND_THRESHOLD_MS
} = require("../src/desktop");

// 可控时钟 + 可控定时器，用来验证「关窗口即退后端」而不真的等待秒表。
function windowHarness({ minAliveMs = 10000, graceMs = 3000 } = {}) {
  let clock = 0;
  let sequence = 0;
  const timers = new Map();
  const logs = [];
  const exits = [];
  const lifecycle = createWindowLifecycle({
    now: () => clock,
    minAliveMs,
    graceMs,
    schedule: (fn, ms) => {
      const id = ++sequence;
      timers.set(id, { fn, at: clock + ms });
      return id;
    },
    cancel: (id) => timers.delete(id),
    onLog: (message) => logs.push(message),
    onExit: () => exits.push(clock)
  });

  function advance(ms) {
    const target = clock + ms;
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) {
        break;
      }
      clock = due[1].at;
      timers.delete(due[0]);
      due[1].fn();
    }
    clock = target;
  }

  return { lifecycle, logs, exits, advance };
}

// 可控时钟：tick() 按检查周期推进，jump() 模拟系统睡眠后的时钟跳变。
function harness({ timeoutMs = 30000, graceMs = 15000, tickMs = 5000 } = {}) {
  let clock = 0;
  const logs = [];
  const exits = [];
  const watchdog = createHeartbeatWatchdog({
    now: () => clock,
    timeoutMs,
    graceMs,
    suspendThresholdMs: SUSPEND_THRESHOLD_MS,
    onLog: (message) => logs.push(message),
    onExit: () => exits.push(clock)
  });
  return {
    watchdog,
    logs,
    exits,
    get clock() {
      return clock;
    },
    tick(steps = 1) {
      for (let i = 0; i < steps; i += 1) {
        clock += tickMs;
        watchdog.tick();
      }
    },
    jump(ms) {
      clock += ms;
      watchdog.tick();
    }
  };
}

test("持续心跳时看门狗永不退出", () => {
  const h = harness();
  for (let i = 0; i < 40; i += 1) {
    h.tick();
    h.watchdog.touch();
  }
  assert.equal(h.exits.length, 0);
  assert.equal(h.watchdog.state.exited, false);
});

test("心跳超时后必须再经过确认窗口才退出", () => {
  const h = harness();
  h.tick(6); // t=30s，刚好还没超时
  assert.equal(h.exits.length, 0);
  h.tick(3); // t=45s，确认窗口未走完
  assert.equal(h.exits.length, 0, "确认窗口未走完不能退出");
  h.tick(1); // t=50s，超时 30s + 确认 15s 后退出
  assert.equal(h.exits.length, 1);
  h.tick(3);
  assert.equal(h.exits.length, 1, "退出后不应重复触发");
});

test("确认窗口内补发心跳会取消退出", () => {
  const h = harness();
  h.tick(7); // t=35s，已进入确认窗口
  assert.notEqual(h.watchdog.state.suspectSince, null);
  h.watchdog.touch();
  h.tick(1);
  assert.equal(h.watchdog.state.suspectSince, null, "心跳应清除疑似失联状态");
  for (let i = 0; i < 10; i += 1) {
    h.tick();
    h.watchdog.touch();
  }
  assert.equal(h.exits.length, 0, "窗口恢复后不应退出");
});

test("系统睡眠/挂起导致的时钟跳变会重置计时，不会误杀服务", () => {
  const h = harness();
  h.jump(8 * 60 * 60 * 1000); // 合盖睡眠 8 小时后唤醒
  assert.equal(h.exits.length, 0, "睡眠唤醒后不能判定为窗口关闭");
  assert.ok(h.logs.some((line) => line.includes("睡眠/挂起")));
  assert.equal(h.watchdog.state.lastTouchAt, 8 * 60 * 60 * 1000);
});

test("挂起恢复后仍有完整超时窗口", () => {
  const h = harness();
  h.jump(60 * 60 * 1000);
  h.tick(6); // 唤醒后 30s 内
  assert.equal(h.exits.length, 0, "唤醒后 30s 内应保持存活");
  h.tick(4); // 一直无心跳，走完超时 + 确认窗口后仍会退出
  assert.equal(h.exits.length, 1, "确认窗口机制不能被挂起重置永久绕过");
});

test("挂起阈值至少覆盖一次系统睡眠的最小间隔", () => {
  assert.ok(SUSPEND_THRESHOLD_MS >= 15000);
});

test("窗口正常退出后才关闭后端，且要经过宽限确认", () => {
  const h = windowHarness();
  h.advance(WINDOW_MIN_ALIVE_MS + 1000);
  h.lifecycle.windowExited(0, null);
  assert.equal(h.exits.length, 0, "宽限期内不能立刻退出");
  h.advance(WINDOW_EXIT_GRACE_MS);
  assert.equal(h.exits.length, 1);
  assert.ok(h.logs.some((line) => line.includes("窗口已关闭")));
});

test("窗口进程启动即退出视为启动失败，服务保持运行", () => {
  const h = windowHarness();
  h.advance(1500);
  h.lifecycle.windowExited(1, null);
  h.advance(WINDOW_EXIT_GRACE_MS * 3);
  assert.equal(h.exits.length, 0, "不能因为 Chrome 启动失败把后端一起带走");
  assert.ok(h.logs.some((line) => line.includes("启动失败")));
});

test("窗口退出事件重复触发不会重复退出", () => {
  const h = windowHarness();
  h.advance(WINDOW_MIN_ALIVE_MS + 1);
  h.lifecycle.windowExited(0, null);
  h.lifecycle.windowExited(0, null);
  h.advance(WINDOW_EXIT_GRACE_MS);
  assert.equal(h.exits.length, 1);
});

test("睡眠/后台冻结不产生窗口退出事件，服务不该被误杀", () => {
  const h = windowHarness();
  h.advance(8 * 60 * 60 * 1000);
  assert.equal(h.exits.length, 0, "仅时间流逝不能判定窗口关闭");
  assert.equal(h.lifecycle.state.windowClosed, false);
});

test("attachAppWindow 把子进程 exit 事件接到生命周期", () => {
  const child = new EventEmitter();
  const h = windowHarness({ minAliveMs: 0 });
  attachAppWindow(child, {
    now: () => 0,
    minAliveMs: 0,
    graceMs: 0,
    schedule: (fn) => fn(),
    onExit: () => h.exits.push(1)
  });
  child.emit("exit", 0, null);
  assert.equal(h.exits.length, 1);
});

test("桌面窗口使用独立 profile，关闭才能被后端感知", () => {
  assert.match(WINDOW_PROFILE_DIR, /chrome-profile$/);
  assert.ok(WINDOW_PROFILE_DIR.includes("data"));
});
