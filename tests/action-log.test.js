"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(
  ROOT,
  ".workbuddy",
  "scratch",
  `action-log-${process.pid}-${Date.now()}`
);
// config.js 在首次 require 时确定 DATA_ROOT，必须在加载 action-log 之前设置。
process.env.GITDECK_DATA_DIR = DATA_DIR;

const {
  recordApiError,
  readLogs,
  readJsonLines,
  readServerLines,
  ERROR_LOG_FILE,
  SERVER_LOG_FILE,
  MAX_ENTRIES
} = require("../src/action-log");

function resetLogs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const file of [
    ERROR_LOG_FILE,
    `${ERROR_LOG_FILE}.1`,
    SERVER_LOG_FILE,
    `${SERVER_LOG_FILE}.1`
  ]) {
    fs.rmSync(file, { force: true });
  }
}

function makeError(message, extra = {}) {
  const error = new Error(message);
  error.statusCode = 422;
  Object.assign(error, extra);
  return error;
}

test.after(() => {
  fs.rmSync(DATA_DIR, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100
  });
});

test("日志文件不存在时返回空结果，且所有路径固定在数据目录内", () => {
  resetLogs();
  const result = readLogs(50);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.server, []);
  assert.equal(path.dirname(ERROR_LOG_FILE), DATA_DIR);
  assert.equal(path.dirname(SERVER_LOG_FILE), DATA_DIR);
  assert.ok(!result.files.errors.includes(".."));
});

test("记录 API 失败：仓库名/动作/多行错误全文都可读回，并写入 server.log 摘要", () => {
  resetLogs();
  const message = [
    "error: could not delete references: cannot lock ref 'refs/remotes/origin/yg_keyhelper'",
    "Another git process seems to be running in this repository.",
    "- [deleted] (none) -> origin/add-acos-sdk"
  ].join("\n");

  recordApiError(
    makeError(message, {
      gitdeckRepository: "AgisoBase",
      gitdeckAction: "fetch"
    }),
    { method: "POST", url: "/api/repositories/abcdef123456/action" }
  );

  const raw = fs.readFileSync(ERROR_LOG_FILE, "utf8");
  assert.equal(raw.trim().split(/\r?\n/).length, 1, "一条记录只占一行，便于解析");

  const result = readLogs(50);
  assert.equal(result.errors.length, 1);
  const entry = result.errors[0];
  assert.equal(entry.status, 422);
  assert.equal(entry.method, "POST");
  assert.equal(entry.path, "/api/repositories/abcdef123456/action");
  assert.equal(entry.repository, "AgisoBase");
  assert.equal(entry.action, "fetch");
  assert.equal(entry.message, message, "错误全文（含换行）不得被截断成首行");
  assert.ok(!Number.isNaN(new Date(entry.time).getTime()));

  const serverText = fs.readFileSync(SERVER_LOG_FILE, "utf8");
  assert.match(serverText, /\[ERROR\] \[api-error\] HTTP 422/);
  assert.match(serverText, /AgisoBase \| fetch/);
  assert.match(serverText, /could not delete references/);
  assert.doesNotMatch(serverText, /- \[deleted\]/, "server.log 只放首行摘要");
  assert.ok(result.server.some((line) => line.includes("[api-error]")));
});

test("多条记录按时间倒序返回，limit 有上限", () => {
  resetLogs();
  for (let index = 0; index < 5; index += 1) {
    recordApiError(makeError(`错误 ${index}`), {
      method: "POST",
      url: `/api/thing/${index}`
    });
  }
  const all = readLogs(50);
  assert.equal(all.errors.length, 5);
  assert.equal(all.errors[0].path, "/api/thing/4");
  assert.equal(all.errors[4].path, "/api/thing/0");
  assert.equal(readLogs(2).errors.length, 2);
  assert.equal(readLogs(99999).errors.length, 5);
  assert.equal(MAX_ENTRIES, 300);
});

test("坏行与缺字段记录会被跳过，不影响其余日志", () => {
  resetLogs();
  fs.appendFileSync(ERROR_LOG_FILE, "not json at all\n", "utf8");
  fs.appendFileSync(ERROR_LOG_FILE, '{"time":"2026-11-09T00:00:00.000Z"}\n', "utf8");
  fs.appendFileSync(
    ERROR_LOG_FILE,
    `${JSON.stringify({
      time: "2026-11-09T01:00:00.000Z",
      message: "正常记录"
    })}\n`,
    "utf8"
  );
  const result = readLogs(50);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].message, "正常记录");
  assert.deepEqual(readJsonLines([path.join(DATA_DIR, "missing.log")]), []);
});

test("errors.log 超过上限会轮转，旧记录仍可从 .1 读回", () => {
  resetLogs();
  recordApiError(makeError("轮转前的记录"), {
    method: "POST",
    url: "/api/old"
  });
  // 单条错误有 20000 字符上限，靠多条长错误累计超过 256KB 触发轮转。
  for (let index = 0; index < 20; index += 1) {
    recordApiError(
      makeError("x".repeat(19000), {
        gitdeckRepository: `BigRepo${index}`
      }),
      { method: "POST", url: `/api/big/${index}` }
    );
  }
  assert.equal(
    fs.existsSync(`${ERROR_LOG_FILE}.1`),
    true,
    "超限后应生成 .1 保留旧日志"
  );
  const result = readLogs(50);
  assert.ok(
    result.errors.some((entry) => entry.path === "/api/old"),
    "轮转文件里的旧记录也必须能查到"
  );
  assert.ok(result.errors.some((entry) => /^BigRepo\d+$/.test(entry.repository)));
});

test("server.log 多行输出会并入同一条日志，取最近 limit 条", () => {
  resetLogs();
  fs.writeFileSync(
    SERVER_LOG_FILE,
    [
      "[2026-11-09T01:00:00.000Z] [LOG] 第一条",
      "[2026-11-09T01:00:01.000Z] [WARN] 第二条",
      "  这一行是 Git 错误续行",
      "  再来一行",
      "[2026-11-09T01:00:02.000Z] [LOG] 第三条"
    ].join("\n"),
    "utf8"
  );
  const lines = readServerLines([SERVER_LOG_FILE], 50);
  assert.equal(lines.length, 3);
  assert.equal(lines[1].split("\n").length, 3, "续行必须并入上一条");
  assert.match(lines[1], /Git 错误续行/);
  assert.deepEqual(
    readServerLines([SERVER_LOG_FILE], 2).map((line) => line.split("\n")[0]),
    [
      "[2026-11-09T01:00:01.000Z] [WARN] 第二条",
      "[2026-11-09T01:00:02.000Z] [LOG] 第三条"
    ]
  );
});

test("异常输入不会抛错，日志写入失败绝不影响接口响应", () => {
  resetLogs();
  assert.doesNotThrow(() => recordApiError(null, null));
  assert.doesNotThrow(() => recordApiError("plain text", { url: "/api/x" }));
  assert.doesNotThrow(() => readLogs("not-a-number"));
  const result = readLogs(50);
  assert.equal(result.errors.length, 2);
  assert.ok(result.errors.every((entry) => typeof entry.message === "string"));
});
