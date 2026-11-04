"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createHeartbeatWatchdog,
  SUSPEND_THRESHOLD_MS
} = require("../src/desktop");

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
