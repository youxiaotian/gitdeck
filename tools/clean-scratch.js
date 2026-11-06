#!/usr/bin/env node
'use strict';

/**
 * GitDeck AI 工作目录内的受控清理工具。
 *
 * 目标：让「当前 git 仓库内删除文件」有唯一、可白名单、带硬边界的入口，
 * 避免 AI 直接使用 shell `rm` / 通配符递归删除而反复触发权限审批。
 *
 * 边界（全部由 __dirname 推导，参数无法指向别处）：
 *   - ROOT = 当前 git 仓库根目录；
 *   - 默认清理范围恒为 <ROOT>/.workbuddy/scratch/；
 *   - --path 只接受 ROOT 内的相对路径，绝对路径、越界、符号链接一律拒绝；
 *   - .git、node_modules、用户数据、工作日志等受保护目标拒绝删除；
 *   - 文件删除走 fs.rmSync（受文件层规则管辖，非 shell 删除命令）。
 *
 * 用法：
 *   node tools/clean-scratch.js --new probe           创建并返回唯一临时目录
 *   node tools/clean-scratch.js --dry-run             列出将清理的沙盒条目
 *   node tools/clean-scratch.js                      清理沙盒内临时产物
 *   node tools/clean-scratch.js --older-than 60       只清理 60 分钟前的条目
 *   node tools/clean-scratch.js --keep report         保留沙盒第一层条目
 *   node tools/clean-scratch.js --path <repo 相对路径> 删除工作目录内指定文件/目录
 *   node tools/clean-scratch.js --path a --path b --dry-run
 *   -h, --help                                       显示本说明
 *
 * 注意：清理命令需单独执行，不要与 `&&` / `;` / `|` 拼成复合命令，
 * 否则命令白名单要求「所有子命令都命中」才放行，会重新触发审批。
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SCRATCH = path.join(ROOT, '.workbuddy', 'scratch');
const PROTECTED = new Set(['.gitkeep']);

// 绝不允许通过本工具删除的目标（统一为 / 分隔的仓库相对路径）。
const PROTECTED_TARGETS = new Set([
  '.git',
  'node_modules',
  '.workbuddy/memory',
  'data/repositories.json',
  'data/server.log',
  'package.json',
  'package-lock.json'
]);

const HELP = `GitDeck 工作目录内受控清理工具

  --new <prefix>        创建唯一临时目录并打印绝对路径
  --dry-run             只列出将清理的条目，不删除
  --older-than <min>    只清理修改时间早于 N 分钟的沙盒条目
  --keep <name>         保留沙盒第一层中名为 name 的条目（可重复）
  --path <相对路径>      删除工作目录内指定文件/目录（可重复，越界/受保护目标拒绝）
  -h, --help            显示本说明

默认清理范围恒为 ${SCRATCH}。
--path 仅接受当前 git 仓库内的相对路径；工作目录之外的删除请走正常审批。`;

function parseArgs(argv) {
  const options = {
    dryRun: false,
    olderThanMinutes: 0,
    keep: [],
    create: null,
    paths: [],
    help: false
  };
  const rest = [...argv];
  const needValue = (flag) => {
    const value = rest.shift();
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${flag} 缺少参数值`);
    }
    return value;
  };

  while (rest.length > 0) {
    const arg = rest.shift();
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--older-than') options.olderThanMinutes = Number(needValue(arg));
    else if (arg === '--keep') options.keep.push(needValue(arg));
    else if (arg === '--new') options.create = needValue(arg);
    else if (arg === '--path') options.paths.push(needValue(arg));
    else if (arg === '-h' || arg === '--help') options.help = true;
    else throw new Error(`未知参数: ${arg}`);
  }

  if (!Number.isFinite(options.olderThanMinutes) || options.olderThanMinutes < 0) {
    throw new Error('--older-than 必须是非负分钟数');
  }
  if (options.create !== null && (!options.create || options.create.startsWith('-'))) {
    throw new Error('--new 需要一个名称前缀');
  }
  if (options.create !== null && options.paths.length > 0) {
    throw new Error('--new 与 --path 不能同时使用');
  }
  if (options.keep.some((name) => !name || name.includes(path.sep) || name.includes('/'))) {
    throw new Error('--keep 只能是沙盒第一层的单个名称');
  }
  return options;
}

function samePath(a, b) {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

function assertBoundary() {
  const realRoot = fs.realpathSync(ROOT);
  const workbuddy = path.join(ROOT, '.workbuddy');
  // .workbuddy/ 被 .gitignore 忽略，全新 clone 里不存在；先建好再校验真实路径。
  fs.mkdirSync(workbuddy, { recursive: true });
  const realWorkbuddy = fs.realpathSync(workbuddy);
  if (!samePath(realWorkbuddy, path.join(realRoot, '.workbuddy'))) {
    throw new Error('.workbuddy 目录解析到了工作区之外，拒绝执行');
  }
  if (!fs.existsSync(SCRATCH)) return;

  const stat = fs.lstatSync(SCRATCH);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error('scratch 必须是真实目录，不能是符号链接或文件');
  }
  if (!samePath(fs.realpathSync(SCRATCH), path.join(realWorkbuddy, 'scratch'))) {
    throw new Error('scratch 目录解析到了预期路径之外，拒绝执行');
  }
}

function createTempDir(prefix) {
  fs.mkdirSync(SCRATCH, { recursive: true });
  const safePrefix = prefix.replace(/[^a-zA-Z0-9._-]/g, '-');
  return fs.mkdtempSync(path.join(SCRATCH, `${safePrefix}-`));
}

function normalizeRel(rel) {
  return rel.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

/** 把 --path 解析为 ROOT 内的绝对路径，拒绝越界、绝对路径与符号链接。 */
function resolveInsideRoot(rel) {
  if (path.isAbsolute(rel) || /^[A-Za-z]:[\\/]/.test(rel)) {
    throw new Error(`${rel}：不接受绝对路径，只支持当前 git 仓库内的相对路径`);
  }
  const relClean = normalizeRel(rel);
  if (!relClean) {
    throw new Error('不能删除工作目录本身');
  }

  const top = relClean.split('/')[0];
  if (top === '..') {
    throw new Error(`${rel}：指向工作目录之外，拒绝执行`);
  }
  if (PROTECTED_TARGETS.has(relClean) || PROTECTED_TARGETS.has(top) ||
      relClean.startsWith('.git/') || relClean.startsWith('.workbuddy/memory/')) {
    throw new Error(`${rel}：受保护目标，拒绝删除`);
  }

  const target = path.resolve(ROOT, rel);
  const relative = path.relative(ROOT, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${rel}：解析后位于工作目录之外，拒绝执行`);
  }

  // realpath 兜底：路径中间或末尾存在指向外部的符号链接时同样拒绝。
  const realRoot = fs.realpathSync(ROOT);
  const realTarget = fs.realpathSync(target);
  const realRelative = path.relative(realRoot, realTarget);
  if (!realRelative || realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    throw new Error(`${rel}：真实路径位于工作目录之外，拒绝执行`);
  }
  return target;
}

/** 删除工作目录内指定的相对路径（--path）。 */
function removeTargets(options) {
  let removed = 0;
  let failed = 0;

  for (const rel of options.paths) {
    let target;
    try {
      target = resolveInsideRoot(rel);
    } catch (error) {
      console.warn(`拒绝   ${rel}: ${error.message}`);
      failed += 1;
      continue;
    }

    if (!fs.existsSync(target)) {
      console.log(`跳过   ${rel}（不存在）`);
      continue;
    }
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) {
      console.warn(`拒绝   ${rel}: 符号链接不跟随，需人工处理`);
      failed += 1;
      continue;
    }

    const label = stat.isDirectory() ? '目录' : '文件';
    if (options.dryRun) {
      console.log(`将删除 ${label} ${rel}`);
      removed += 1;
      continue;
    }
    try {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      console.log(`已删除 ${label} ${rel}`);
      removed += 1;
    } catch (error) {
      console.warn(`失败   ${rel}: ${error.message}`);
      failed += 1;
    }
  }

  const action = options.dryRun ? '将删除' : '已删除';
  console.log(`${action} ${removed} 项，跳过/拒绝 ${failed} 项。范围: ${ROOT}`);
  return failed > 0 ? 1 : 0;
}

function clean(options) {
  if (!fs.existsSync(SCRATCH)) {
    fs.mkdirSync(SCRATCH, { recursive: true });
    console.log(`沙盒已创建: ${SCRATCH}`);
    console.log('沙盒为空，无需清理。');
    return 0;
  }

  const keep = new Set([...PROTECTED, ...options.keep]);
  const cutoff = Date.now() - options.olderThanMinutes * 60 * 1000;
  const entries = fs.readdirSync(SCRATCH).sort();
  let removed = 0;
  let skipped = 0;
  let failed = 0;

  for (const name of entries) {
    const target = path.join(SCRATCH, name);
    if (keep.has(name)) {
      console.log(`保留   ${name}`);
      skipped += 1;
      continue;
    }

    let stat;
    try {
      stat = fs.lstatSync(target);
    } catch (error) {
      console.warn(`跳过   ${name}（无法读取: ${error.code}）`);
      skipped += 1;
      continue;
    }

    // 符号链接可能指向沙盒之外，不跟随、不递归，直接跳过。
    if (stat.isSymbolicLink()) {
      console.warn(`跳过   ${name}（符号链接，需人工处理）`);
      skipped += 1;
      continue;
    }
    if (stat.mtimeMs > cutoff) {
      console.log(`保留   ${name}（未达时间阈值）`);
      skipped += 1;
      continue;
    }

    const label = stat.isDirectory() ? '目录' : '文件';
    if (options.dryRun) {
      console.log(`将删除 ${label} ${name}`);
      removed += 1;
      continue;
    }

    try {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      console.log(`已删除 ${label} ${name}`);
      removed += 1;
    } catch (error) {
      console.warn(`失败   ${name}: ${error.message}`);
      failed += 1;
    }
  }

  const action = options.dryRun ? '将清理' : '已清理';
  console.log(`${action} ${removed} 项，跳过 ${skipped} 项，失败 ${failed} 项。范围: ${SCRATCH}`);
  return failed > 0 ? 1 : 0;
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`参数错误: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(HELP);
    return;
  }

  try {
    assertBoundary();
    if (options.create !== null) {
      console.log(createTempDir(options.create));
      return;
    }
    if (options.paths.length > 0) {
      process.exitCode = removeTargets(options);
      return;
    }
    process.exitCode = clean(options);
  } catch (error) {
    console.error(`清理操作失败: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
