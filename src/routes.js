"use strict";

// @module routes
// /api/* 路由分发。调用 workspace / git-summary / git-actions / directories / paths。
// 修改注意：新增顶级路由在此登记；仓库级路由的正则限定 12 位十六进制 id。

const { STORE } = require("./config");
const {
  httpError,
  isTrustedRequest,
  readJson,
  sendJson
} = require("./http");
const {
  addRepository,
  createWorkspace,
  deleteWorkspace,
  getRepository,
  moveRepositoryToWorkspace,
  removeRepositoriesFromWorkspace,
  removeRepository,
  renameWorkspace,
  reorderRepositories
} = require("./workspace");
const {
  discoverRepositories,
  listDirectories
} = require("./directories");
const {
  getCommitHistory,
  getRepositoryDetail,
  getStatusSummary
} = require("./git-summary");
const {
  runRepositoryAction,
  getDiff,
  getFileContent,
  saveFileContent
} = require("./git-actions");
const {
  loadWindowSize,
  saveWindowSize,
  touchHeartbeat
} = require("./desktop");

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/ping") {
    sendJson(response, 200, { ok: true, app: "gitdeck" });
    return;
  }

  if (!isTrustedRequest(request)) {
    throw httpError(403, "请求来源不受信任。");
  }

  // 任何已鉴权的 API 活动都算窗口存活：用户在界面上操作时，
  // 即使心跳定时器被浏览器节流，服务也不该被看门狗误杀。
  touchHeartbeat();

  if (request.method === "GET" && url.pathname === "/api/bootstrap") {
    const state = await STORE.loadState();
    sendJson(response, 200, {
      repositories: state.repositories,
      workspaces: state.workspaces,
      platform: process.platform,
      version: "1.0.0"
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/heartbeat") {
    touchHeartbeat();
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/window") {
    const size = await loadWindowSize();
    sendJson(response, 200, size);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/window") {
    const body = await readJson(request);
    const width = Math.min(Math.max(Number(body.width) || 1440, 640), 4096);
    const height = Math.min(Math.max(Number(body.height) || 900, 480), 2160);
    await saveWindowSize(width, height);
    sendJson(response, 200, { ok: true, width, height });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/workspaces") {
    const body = await readJson(request);
    const workspace = await createWorkspace(body.name);
    sendJson(response, 201, { workspace });
    return;
  }

  const workspaceMatch = url.pathname.match(
    /^\/api\/workspaces\/([A-Za-z0-9_-]+)$/
  );
  if (workspaceMatch && request.method === "PATCH") {
    const body = await readJson(request);
    const workspace = await renameWorkspace(
      workspaceMatch[1],
      body.name
    );
    sendJson(response, 200, { workspace });
    return;
  }
  if (workspaceMatch && request.method === "DELETE") {
    const result = await deleteWorkspace(workspaceMatch[1]);
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/repositories") {
    const body = await readJson(request);
    const repository = await addRepository(body.path, body.workspaceId);
    sendJson(response, 201, { repository });
    return;
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/repositories/remove"
  ) {
    const body = await readJson(request);
    const result = await removeRepositoriesFromWorkspace(
      body.workspaceId,
      body.ids
    );
    sendJson(response, 200, result);
    return;
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/repositories/reorder"
  ) {
    const body = await readJson(request);
    const repositories = await reorderRepositories(
      body.workspaceId,
      body.ids
    );
    sendJson(response, 200, { repositories });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/discover") {
    const body = await readJson(request);
    const repositories = await discoverRepositories(
      body.root,
      Math.min(Math.max(Number(body.depth) || 3, 1), 6)
    );
    sendJson(response, 200, { repositories });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/directories/list") {
    const body = await readJson(request);
    const listing = await listDirectories(body.path);
    sendJson(response, 200, listing);
    return;
  }

  const moveRepositoryMatch = url.pathname.match(
    /^\/api\/repositories\/([a-f0-9]{12})\/workspace$/
  );
  if (moveRepositoryMatch && request.method === "POST") {
    const body = await readJson(request);
    const repository = await moveRepositoryToWorkspace(
      moveRepositoryMatch[1],
      body.workspaceId
    );
    sendJson(response, 200, { repository });
    return;
  }

  const repositoryMatch = url.pathname.match(
    /^\/api\/repositories\/([a-f0-9]{12})(?:\/(status|detail|diff|file|history|action))?$/
  );
  if (!repositoryMatch) {
    throw httpError(404, "接口不存在。");
  }

  const repository = await getRepository(repositoryMatch[1]);
  const route = repositoryMatch[2] || "";

  if (request.method === "GET" && route === "status") {
    const summary = await getStatusSummary(repository);
    sendJson(response, 200, { repository, summary });
    return;
  }

  if (request.method === "GET" && route === "detail") {
    const detail = await getRepositoryDetail(repository);
    sendJson(response, 200, detail);
    return;
  }

  if (request.method === "GET" && route === "history") {
    const history = await getCommitHistory(
      repository,
      url.searchParams.get("scope"),
      url.searchParams.get("limit")
    );
    sendJson(response, 200, history);
    return;
  }

  if (request.method === "GET" && route === "diff") {
    const diff = await getDiff(
      repository,
      url.searchParams.get("path") || "",
      url.searchParams.get("staged") === "1"
    );
    sendJson(response, 200, { diff });
    return;
  }

  if (request.method === "GET" && route === "file") {
    const file = await getFileContent(
      repository,
      url.searchParams.get("path") || ""
    );
    sendJson(response, 200, file);
    return;
  }

  if (request.method === "POST" && route === "file") {
    const body = await readJson(request);
    const result = await saveFileContent(repository, body);
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "POST" && route === "action") {
    const body = await readJson(request);
    const result = await runRepositoryAction(repository, body);
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "DELETE" && !route) {
    await removeRepository(repository.id);
    sendJson(response, 200, { removed: true });
    return;
  }

  throw httpError(405, "不支持此操作。");
}

module.exports = { handleApi };
