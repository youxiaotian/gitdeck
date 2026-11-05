#!/usr/bin/env node
'use strict';

/**
 * GitDeck AI 工作沙盒工具。
 *
 * 唯一可操作目录：<repo>/.workbuddy/scratch/
 * 该路径由 __dirname 推导，脚本不接受任何路径参数，因此无法被指到别处。
 *
 * 用法：
 *   node tools/clean-scratch.js --new probe       创建并返回唯一临时目录
 *   node tools/clean-scratch.js --dry-run         列出将清理的条目，不删除
 *   node tools/clean-scratch.js                  清理沙盒内的临时产物
 *   node tools/clean-scratch.js --older-than 60   只清理 60 分钟前的条目
 *   node tools/clean-scratch.js --keep report     保留名为 report 的条目
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SCRATCH = path.join(ROOT, '.workbuddy', 'scratch');
const PROTECTED = new Set(['.gitkeep']);

const HELP = `GitDeck AI 工作沙盒工具

  --new <prefix>       创建唯一临时目录并打印绝对路径
  --dry-run            只列出将清理的条目，不删除
  --older-than <min>   只清理修改时间早于 N 分钟的条目
  --keep <name>        保留沙盒第一层中名为 name 的条目（可重复）
  -h, --help           显示本说明

清理范围恒为 ${SCRATCH}，不递归到该目录之外。`;

function parseArgs(argv) {
  const options = { dryRun: false, olderThanMinutes: 0, keep: [], create: null, help: false };
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
    else if (arg === '-h' || arg === '--help') options.help = true;
    else throw new Error(`未知参数: ${arg}`);
  }

  if (!Number.isFinite(options.olderThanMinutes) || options.olderThanMinutes < 0) {
    throw new Error('--older-than 必须是非负分钟数');
  }
  if (options.create !== null && (!options.create || options.create.startsWith('-'))) {
    throw new Error('--new 需要一个名称前缀');
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
  const realWorkbuddy = fs.realpathSync(path.join(ROOT, '.workbuddy'));
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
    process.exitCode = clean(options);
  } catch (error) {
    console.error(`沙盒操作失败: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
