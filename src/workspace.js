"use strict";

// @module workspace
// 工作区与仓库元数据 CRUD、跨区加入/移出、排序、Git 顶层解析。
// 数据模型 v4：一个仓库可同时归属多个工作区（workspaceIds），每个工作区
// 有独立顺序（orders[workspaceId]）。
// 修改注意：所有写操作都经过 STORE.saveState 的串行队列；getRepository 是 API 入口校验。

const fs = require("node:fs/promises");
const path = require("node:path");
const RepositoryStore = require("./repository-store");
const { STORE } = require("./config");
const { httpError } = require("./http");
const { runProcess, toGitPath } = require("./process");

function isMember(repository, workspaceId) {
  return Array.isArray(repository.workspaceIds)
    ? repository.workspaceIds.includes(workspaceId)
    : repository.workspaceId === workspaceId;
}

async function addRepository(inputPath, requestedWorkspaceId = "") {
  if (!inputPath || typeof inputPath !== "string") {
    throw httpError(400, "请提供仓库路径。");
  }

  const requestedPath = path.resolve(inputPath.trim());
  const stat = await fs.stat(requestedPath).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw httpError(400, "目录不存在或无法访问。");
  }

  let result = await runProcess("git", [
    "-C",
    requestedPath,
    "rev-parse",
    "--show-toplevel"
  ]);

  if (
    result.code !== 0 &&
    /dubious ownership/i.test(`${result.stderr}\n${result.stdout}`)
  ) {
    const markerRoot = await findGitMarkerRoot(requestedPath);
    if (markerRoot) {
      result = await runProcess("git", [
        "-c",
        `safe.directory=${toGitPath(markerRoot)}`,
        "-C",
        requestedPath,
        "rev-parse",
        "--show-toplevel"
      ]);
    }
  }

  if (result.code !== 0) {
    const detail = result.stderr.trim();
    throw httpError(
      400,
      detail
        ? `无法打开 Git 仓库：${detail}`
        : "该目录不是 Git 仓库。"
    );
  }

  const repositoryPath = path.resolve(result.stdout.trim());
  const state = await STORE.loadState();
  const workspace = resolveWorkspace(state, requestedWorkspaceId);
  const existing = state.repositories.find(
    (repository) =>
      path.resolve(repository.path).toLowerCase() ===
      repositoryPath.toLowerCase()
  );
  if (existing) {
    if (!isMember(existing, workspace.id)) {
      existing.workspaceIds.push(workspace.id);
      existing.orders[workspace.id] = nextOrderInWorkspace(
        state,
        workspace.id
      );
      await STORE.saveState(state);
    }
    return existing;
  }

  const repository = {
    id: RepositoryStore.repositoryId(repositoryPath),
    name: path.basename(repositoryPath),
    path: repositoryPath,
    workspaceIds: [workspace.id],
    addedAt: new Date().toISOString(),
    orders: {
      [workspace.id]: nextOrderInWorkspace(state, workspace.id)
    }
  };

  state.repositories.push(repository);
  await STORE.saveState(state);
  return repository;
}

function resolveWorkspace(state, requestedWorkspaceId = "") {
  if (!requestedWorkspaceId) {
    return state.workspaces[0];
  }
  const workspace = state.workspaces.find(
    (item) => item.id === requestedWorkspaceId
  );
  if (!workspace) {
    throw httpError(404, "工作区不存在。");
  }
  return workspace;
}

async function createWorkspace(inputName) {
  const name = validateWorkspaceName(inputName);
  const state = await STORE.loadState();
  ensureUniqueWorkspaceName(state.workspaces, name);
  const workspace = {
    id: RepositoryStore.workspaceId(),
    name,
    createdAt: new Date().toISOString()
  };
  state.workspaces.push(workspace);
  await STORE.saveState(state);
  return workspace;
}

async function renameWorkspace(workspaceId, inputName) {
  const name = validateWorkspaceName(inputName);
  const state = await STORE.loadState();
  const workspace = state.workspaces.find(
    (item) => item.id === workspaceId
  );
  if (!workspace) {
    throw httpError(404, "工作区不存在。");
  }
  ensureUniqueWorkspaceName(state.workspaces, name, workspaceId);
  workspace.name = name;
  await STORE.saveState(state);
  return workspace;
}

async function deleteWorkspace(workspaceId) {
  const state = await STORE.loadState();
  if (state.workspaces.length <= 1) {
    throw httpError(400, "至少需要保留一个工作区。");
  }
  const workspace = state.workspaces.find(
    (item) => item.id === workspaceId
  );
  if (!workspace) {
    throw httpError(404, "工作区不存在。");
  }
  const fallbackWorkspace = state.workspaces.find(
    (item) => item.id !== workspaceId
  );
  let nextOrder = nextOrderInWorkspace(state, fallbackWorkspace.id);
  let movedRepositoryCount = 0;
  const updated = [];
  for (const repository of state.repositories) {
    if (!isMember(repository, workspaceId)) {
      continue;
    }
    repository.workspaceIds = repository.workspaceIds.filter(
      (id) => id !== workspaceId
    );
    delete repository.orders[workspaceId];
    if (!repository.workspaceIds.length) {
      // 只属于被删工作区的仓库挪到兜底工作区，不删除任何数据。
      repository.workspaceIds.push(fallbackWorkspace.id);
      repository.orders[fallbackWorkspace.id] = nextOrder;
      nextOrder += 1;
      movedRepositoryCount += 1;
    }
    updated.push({
      id: repository.id,
      workspaceIds: repository.workspaceIds,
      orders: repository.orders
    });
  }
  state.workspaces = state.workspaces.filter(
    (item) => item.id !== workspaceId
  );
  await STORE.saveState(state);
  return {
    removed: true,
    workspaceId: fallbackWorkspace.id,
    movedRepositoryCount,
    updated
  };
}

// 把仓库加入目标工作区（多归属：保留其在其他工作区的归属，幂等）。
async function moveRepositoryToWorkspace(repositoryId, workspaceId) {
  const state = await STORE.loadState();
  const repository = state.repositories.find(
    (item) => item.id === repositoryId
  );
  if (!repository) {
    throw httpError(404, "仓库不在当前列表中。");
  }
  const workspace = resolveWorkspace(state, workspaceId);
  if (isMember(repository, workspace.id)) {
    return repository;
  }
  repository.workspaceIds.push(workspace.id);
  repository.orders[workspace.id] = nextOrderInWorkspace(
    state,
    workspace.id
  );
  await STORE.saveState(state);
  return repository;
}

// 从指定工作区移出仓库：只摘除该工作区归属；若这是最后一个归属，
// 则整个条目从 GitDeck 列表删除（磁盘目录不动）。
async function removeRepositoriesFromWorkspace(workspaceId, inputIds) {
  if (!Array.isArray(inputIds) || !inputIds.length) {
    throw httpError(400, "请选择要移出的仓库。");
  }
  const state = await STORE.loadState();
  resolveWorkspace(state, workspaceId);
  const ids = new Set(inputIds.map(String));
  const removedIds = [];
  const updated = [];

  state.repositories = state.repositories.filter((repository) => {
    if (!isMember(repository, workspaceId) || !ids.has(repository.id)) {
      return true;
    }
    repository.workspaceIds = repository.workspaceIds.filter(
      (id) => id !== workspaceId
    );
    delete repository.orders[workspaceId];
    if (!repository.workspaceIds.length) {
      removedIds.push(repository.id);
      return false;
    }
    updated.push({
      id: repository.id,
      workspaceIds: repository.workspaceIds,
      orders: repository.orders
    });
    return true;
  });
  await STORE.saveState(state);
  return { removedIds, updated };
}

async function removeRepository(repositoryId) {
  const state = await STORE.loadState();
  state.repositories = state.repositories.filter(
    (item) => item.id !== repositoryId
  );
  await STORE.saveState(state);
}

async function reorderRepositories(workspaceId, inputIds) {
  if (!Array.isArray(inputIds) || !inputIds.length) {
    throw httpError(400, "仓库顺序不能为空。");
  }
  const state = await STORE.loadState();
  resolveWorkspace(state, workspaceId);
  const current = state.repositories.filter(
    (repository) => isMember(repository, workspaceId)
  );
  const currentIds = new Set(current.map((repository) => repository.id));
  const ids = inputIds.map(String);
  if (
    ids.length !== current.length ||
    new Set(ids).size !== current.length ||
    ids.some((id) => !currentIds.has(id))
  ) {
    throw httpError(400, "仓库顺序与当前工作区不匹配。");
  }

  const byId = new Map(
    current.map((repository) => [repository.id, repository])
  );
  ids.forEach((id, index) => {
    const repository = byId.get(id);
    if (repository) {
      repository.orders[workspaceId] = index;
    }
  });
  await STORE.saveState(state);
  return ids.map((id) => byId.get(id));
}

function nextOrderInWorkspace(state, workspaceId) {
  const orders = state.repositories
    .filter((repository) => isMember(repository, workspaceId))
    .map(
      (repository) =>
        Number(repository.orders?.[workspaceId]) || 0
    );
  return orders.length ? Math.max(...orders) + 1 : 0;
}

function validateWorkspaceName(inputName) {
  const name = String(inputName || "").trim();
  if (!name) {
    throw httpError(400, "请输入工作区名称。");
  }
  if (name.length > 60) {
    throw httpError(400, "工作区名称最多 60 个字符。");
  }
  return name;
}

function ensureUniqueWorkspaceName(workspaces, name, ignoredId = "") {
  const normalized = name.toLocaleLowerCase("zh-CN");
  if (
    workspaces.some(
      (workspace) =>
        workspace.id !== ignoredId &&
        workspace.name.toLocaleLowerCase("zh-CN") === normalized
    )
  ) {
    throw httpError(409, "已存在同名工作区。");
  }
}

async function findGitMarkerRoot(startPath) {
  let currentPath = path.resolve(startPath);
  while (true) {
    const marker = await fs
      .stat(path.join(currentPath, ".git"))
      .catch(() => null);
    if (marker) {
      return currentPath;
    }
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return "";
    }
    currentPath = parentPath;
  }
}

async function getRepository(id) {
  const state = await STORE.loadState();
  const repository = state.repositories.find((item) => item.id === id);
  if (!repository) {
    throw httpError(404, "仓库不在当前列表中。");
  }
  return repository;
}

module.exports = {
  addRepository,
  isMember,
  resolveWorkspace,
  createWorkspace,
  renameWorkspace,
  deleteWorkspace,
  moveRepositoryToWorkspace,
  removeRepositoriesFromWorkspace,
  removeRepository,
  reorderRepositories,
  validateWorkspaceName,
  ensureUniqueWorkspaceName,
  findGitMarkerRoot,
  getRepository
};
