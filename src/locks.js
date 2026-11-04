"use strict";

// @module locks
// 单仓库动作串行化锁。同一仓库的修改动作排队执行，不同仓库并行。
// 修改注意：release 必须在 finally 中调用，否则该仓库永久阻塞。

const repositoryLocks = new Map();

function acquireRepositoryLock(repositoryId) {
  const previous = repositoryLocks.get(repositoryId) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  repositoryLocks.set(repositoryId, queued);

  return previous.then(() => {
    return () => {
      release();
      if (repositoryLocks.get(repositoryId) === queued) {
        repositoryLocks.delete(repositoryId);
      }
    };
  });
}

module.exports = { acquireRepositoryLock, repositoryLocks };
