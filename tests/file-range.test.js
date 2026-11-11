"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");

async function loadSources() {
  const [app, css, html] = await Promise.all([
    fs.readFile(path.join(ROOT, "public", "app.js"), "utf8"),
    fs.readFile(path.join(ROOT, "public", "styles.css"), "utf8"),
    fs.readFile(path.join(ROOT, "public", "index.html"), "utf8")
  ]);
  return { app, css, html };
}

// 从真实 app.js 里抽出范围计算的纯函数执行，而不是复制一份逻辑到测试里。
function loadRangeHelpers(appSource) {
  const start = appSource.indexOf("  function computeFileRange(");
  const end = appSource.indexOf("  // getClientRects()");
  assert.ok(start > 0 && end > start, "应能从 app.js 提取 Shift 框选纯函数");
  return new Function(
    `${appSource.slice(start, end)}\nreturn { computeFileRange, resolveFileCheckTargets };`
  )();
}

const PATHS = ["a.cs", "b.cs", "c.cs", "d.cs", "e.cs", "f.cs", "g.cs"];

test("computeFileRange 按可见顺序截取含两端的整段，正逆序都成立", async () => {
  const { computeFileRange } = loadRangeHelpers((await loadSources()).app);

  assert.deepEqual(computeFileRange(PATHS, "b.cs", "f.cs"), [
    "b.cs",
    "c.cs",
    "d.cs",
    "e.cs",
    "f.cs"
  ]);
  assert.deepEqual(
    computeFileRange(PATHS, "f.cs", "b.cs"),
    ["b.cs", "c.cs", "d.cs", "e.cs", "f.cs"],
    "反向框选仍按屏幕顺序返回，不能把列表倒过来"
  );
  assert.deepEqual(computeFileRange(PATHS, "c.cs", "c.cs"), ["c.cs"]);
  assert.deepEqual(computeFileRange(PATHS, "b.cs", "g.cs"), PATHS.slice(1));
});

test("computeFileRange 对失效锚点 / 不可见目标保守处理", async () => {
  const { computeFileRange } = loadRangeHelpers((await loadSources()).app);

  assert.deepEqual(
    computeFileRange(PATHS, "gone.cs", "d.cs"),
    ["d.cs"],
    "锚点已被筛掉时只选当前行，不能误框整页"
  );
  assert.deepEqual(computeFileRange(PATHS, "b.cs", "gone.cs"), []);
  assert.deepEqual(computeFileRange([], "b.cs", "d.cs"), []);
});

test("点范围内任一勾选框时，整段统一成点击行的新状态", async () => {
  const { resolveFileCheckTargets } = loadRangeHelpers((await loadSources()).app);
  const range = ["b.cs", "c.cs", "d.cs", "e.cs"];

  const check = resolveFileCheckTargets({
    visiblePaths: PATHS,
    rangeSelection: range,
    clickedPath: "d.cs",
    isSelected: false,
    anchorPath: "b.cs",
    shiftKey: false
  });
  assert.deepEqual(check.paths, range, "范围内的四行都要被勾选");
  assert.equal(check.checked, true);
  assert.equal(check.keepRange, true, "批量后保留高亮，便于再点一次批量取消");

  const uncheck = resolveFileCheckTargets({
    visiblePaths: PATHS,
    rangeSelection: range,
    clickedPath: "b.cs",
    isSelected: true,
    anchorPath: "b.cs",
    shiftKey: false
  });
  assert.deepEqual(uncheck.paths, range);
  assert.equal(uncheck.checked, false, "范围内已勾选的行再点一次应批量取消");
});

test("Shift + 点勾选框可直接现算范围；范围外点击只切自己", async () => {
  const { resolveFileCheckTargets } = loadRangeHelpers((await loadSources()).app);

  const shifted = resolveFileCheckTargets({
    visiblePaths: PATHS,
    rangeSelection: [],
    clickedPath: "e.cs",
    isSelected: false,
    anchorPath: "b.cs",
    shiftKey: true
  });
  assert.deepEqual(shifted.paths, ["b.cs", "c.cs", "d.cs", "e.cs"]);
  assert.equal(shifted.checked, true);

  const outside = resolveFileCheckTargets({
    visiblePaths: PATHS,
    rangeSelection: ["b.cs", "c.cs"],
    clickedPath: "g.cs",
    isSelected: false,
    anchorPath: "b.cs",
    shiftKey: false
  });
  assert.deepEqual(outside.paths, ["g.cs"]);
  assert.equal(outside.checked, true);
  assert.equal(outside.keepRange, false, "点范围外要结束上一次框选");
});

test("折叠/筛选隐藏的文件绝不会被批量勾上", async () => {
  const { resolveFileCheckTargets } = loadRangeHelpers((await loadSources()).app);

  const result = resolveFileCheckTargets({
    visiblePaths: ["a.cs", "b.cs", "f.cs", "g.cs"],
    rangeSelection: ["b.cs", "c.cs", "d.cs", "e.cs", "f.cs"],
    clickedPath: "f.cs",
    isSelected: false,
    anchorPath: "b.cs",
    shiftKey: false
  });
  assert.deepEqual(result.paths, ["b.cs", "f.cs"]);
  assert.ok(!result.paths.includes("c.cs"));
  assert.ok(!result.paths.includes("d.cs"));
});

test("范围选择只做增量 DOM 更新，并在视图切换时清理", async () => {
  const { app, css, html } = await loadSources();

  assert.match(app, /function handleFileRangeClick\(filePath\)/);
  assert.match(app, /function syncFileCheckButtons\(\)/);
  assert.match(app, /function resetFileRange\(anchorPath = null\)/);
  assert.match(app, /function applyFileRangeHighlight\(\)/);
  assert.match(app, /getClientRects\(\)\.length > 0/, "折叠目录里的行不能参与框选");
  assert.match(app, /if \(!state\.solutionFilter && event\.shiftKey\)/);
  assert.match(app, /handleFileRangeClick\(filePath\)/);
  assert.match(app, /event\.shiftKey && event\.target\.closest\("\[data-preview-file\]"\)/);
  assert.match(app, /event\.preventDefault\(\)/, "Shift 点击要阻止文本选区");

  // 勾选分支不能重建列表 DOM：否则在途双击、焦点、滚动位置都会丢。
  const start = app.indexOf(
    '    const fileSelect = event.target.closest("[data-file-select]");'
  );
  const end = app.indexOf(
    '    const selectAllFiles = event.target.closest("[data-file-select-all]");'
  );
  assert.ok(start > 0 && end > start, "应能定位勾选分支");
  const checkBranch = app.slice(start, end);
  assert.match(checkBranch, /resolveFileCheckTargets\(/);
  assert.match(checkBranch, /syncFileCheckButtons\(\)/);
  assert.doesNotMatch(
    checkBranch,
    /elements\.fileGroups\.innerHTML|renderChanges\(/,
    "批量勾选只应增量更新复选框，不能重建文件列表"
  );

  // 可见顺序发生变化的地方都要清掉旧范围。
  const resets = app.match(/resetFileRange\(/g) || [];
  assert.ok(resets.length >= 7, "筛选/视图/仓库/折叠/全选/普通点击都要能结束框选");
  assert.match(app, /hideContextMenu\(\);\s*\n\s*resetFileRange\(\);/, "Esc 可清除框选");
  assert.doesNotMatch(
    app.slice(app.indexOf("  function computeFileRange("), app.indexOf("  function getVisibleFilePaths()")),
    /setInterval|setTimeout|watchFile/,
    "框选不得引入任何后台任务"
  );

  assert.match(css, /\.tree-file-row\.range-selected/);
  assert.match(css, /user-select: none/, "文件行禁止文本选区干扰 Shift");
  assert.match(html, /按住 Shift 点另一行可框选一段/);
});
