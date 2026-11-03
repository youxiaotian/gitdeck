"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { URL } = require("node:url");

const RepositoryStore = require("./src/repository-store");
const {
  isPathInside,
  normalizeSqlPath,
  parseBranches,
  parseGraphHistory,
  parseLog,
  parseStashes,
  parseStatus
} = require("./src/git-utils");

const APP_ROOT = __dirname;
const PUBLIC_ROOT = path.join(APP_ROOT, "public");
const DATA_ROOT = process.env.GITDECK_DATA_DIR
  ? path.resolve(process.env.GITDECK_DATA_DIR)
  : path.join(APP_ROOT, "data");
const STORE = new RepositoryStore(DATA_ROOT);
const SESSION_TOKEN = crypto.randomBytes(24).toString("hex");
const DEFAULT_PORT = Number(process.env.PORT) || 4321;
const HOST = "127.0.0.1";
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_DIFF_BYTES = 512 * 1024;

const repositoryLocks = new Map();

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

async function main() {
  await fs.mkdir(DATA_ROOT, { recursive: true });

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || HOST}`);
      if (url.pathname.startsWith("/api/")) {
        await handleApi(request, response, url);
        return;
      }
      await serveStatic(response, url.pathname);
    } catch (error) {
      sendError(response, error);
    }
  });

  let port = DEFAULT_PORT;
  let attempts = 0;
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && attempts < 10) {
      attempts += 1;
      port += 1;
      setTimeout(() => server.listen(port, HOST), 20);
      return;
    }
    console.error(error);
    process.exitCode = 1;
  });

  server.listen(port, HOST, () => {
    const address = `http://${HOST}:${port}`;
    console.log(`GitDeck 已启动：${address}`);
    console.log(`仓库数据目录：${DATA_ROOT}`);

    if (process.env.GITDECK_NO_OPEN !== "1" && process.platform === "win32") {
      spawn("cmd.exe", ["/c", "start", "", address], {
        detached: true,
        stdio: "ignore",
        windowsHide: true
      }).unref();
    }
  });
}

async function handleApi(request, response, url) {
  if (!isTrustedRequest(request)) {
    throw httpError(403, "请求来源不受信任。");
  }

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
    const state = await STORE.loadState();
    state.repositories = state.repositories.filter(
      (item) => item.id !== repository.id
    );
    await STORE.saveState(state);
    sendJson(response, 200, { removed: true });
    return;
  }

  throw httpError(405, "不支持此操作。");
}

function isTrustedRequest(request) {
  const token = request.headers["x-gitdeck-token"];
  if (token !== SESSION_TOKEN) {
    return false;
  }

  const origin = request.headers.origin;
  if (!origin) {
    return true;
  }

  try {
    const originUrl = new URL(origin);
    return (
      originUrl.hostname === HOST ||
      originUrl.hostname === "localhost" ||
      originUrl.hostname === "::1"
    );
  } catch {
    return false;
  }
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
    if (existing.workspaceId !== workspace.id) {
      existing.workspaceId = workspace.id;
      await STORE.saveState(state);
    }
    return existing;
  }

  const repository = {
    id: RepositoryStore.repositoryId(repositoryPath),
    name: path.basename(repositoryPath),
    path: repositoryPath,
    workspaceId: workspace.id,
    addedAt: new Date().toISOString()
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
  let movedRepositoryCount = 0;
  for (const repository of state.repositories) {
    if (repository.workspaceId === workspaceId) {
      repository.workspaceId = fallbackWorkspace.id;
      movedRepositoryCount += 1;
    }
  }
  state.workspaces = state.workspaces.filter(
    (item) => item.id !== workspaceId
  );
  await STORE.saveState(state);
  return {
    removed: true,
    workspaceId: fallbackWorkspace.id,
    movedRepositoryCount
  };
}

async function moveRepositoryToWorkspace(repositoryId, workspaceId) {
  const state = await STORE.loadState();
  const repository = state.repositories.find(
    (item) => item.id === repositoryId
  );
  if (!repository) {
    throw httpError(404, "仓库不在当前列表中。");
  }
  const workspace = resolveWorkspace(state, workspaceId);
  if (repository.workspaceId === workspace.id) {
    return repository;
  }
  repository.workspaceId = workspace.id;
  await STORE.saveState(state);
  return repository;
}

async function removeRepositoriesFromWorkspace(workspaceId, inputIds) {
  if (!Array.isArray(inputIds) || !inputIds.length) {
    throw httpError(400, "请选择要移出的仓库。");
  }
  const state = await STORE.loadState();
  resolveWorkspace(state, workspaceId);
  const ids = new Set(inputIds.map(String));
  const removedIds = [];
  state.repositories = state.repositories.filter((repository) => {
    if (
      repository.workspaceId === workspaceId &&
      ids.has(repository.id)
    ) {
      removedIds.push(repository.id);
      return false;
    }
    return true;
  });
  await STORE.saveState(state);
  return { removedIds };
}

async function reorderRepositories(workspaceId, inputIds) {
  if (!Array.isArray(inputIds) || !inputIds.length) {
    throw httpError(400, "仓库顺序不能为空。");
  }
  const state = await STORE.loadState();
  resolveWorkspace(state, workspaceId);
  const current = state.repositories.filter(
    (repository) => repository.workspaceId === workspaceId
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
  const ordered = ids.map((id) => byId.get(id));
  let index = 0;
  state.repositories = state.repositories.map((repository) =>
    repository.workspaceId === workspaceId ? ordered[index++] : repository
  );
  await STORE.saveState(state);
  return ordered;
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

function toGitPath(directoryPath) {
  return path.resolve(directoryPath).replaceAll("\\", "/");
}

async function getRepository(id) {
  const state = await STORE.loadState();
  const repository = state.repositories.find((item) => item.id === id);
  if (!repository) {
    throw httpError(404, "仓库不在当前列表中。");
  }
  return repository;
}

async function getStatusSummary(repository, includeMetadata = false) {
  await assertRepositoryAvailable(repository);
  const statusResult = await runGit(repository.path, [
    "status",
    "--porcelain=v2",
    "--branch",
    "--untracked-files=all",
    "-z"
  ]);
  const status = parseStatus(statusResult.stdout);

  let latestCommit = null;
  if (status.oid && !status.oid.startsWith("000000")) {
    const logResult = await runGit(repository.path, [
      "log",
      "-1",
      "--pretty=format:%h%x1f%H%x1f%an%x1f%ae%x1f%aI%x1f%s"
    ]).catch(() => null);
    latestCommit = logResult ? parseLog(logResult.stdout)[0] || null : null;
  }

  let remote = "";
  if (includeMetadata) {
    const remotes = await getRemotes(repository.path);
    remote = remotes.find((item) => item.type === "fetch")?.url || "";
  }

  return {
    ...status,
    latestCommit,
    remote,
    checkedAt: new Date().toISOString()
  };
}

async function getRepositoryDetail(repository) {
  await assertRepositoryAvailable(repository);

  const [
    status,
    logResult,
    branchResult,
    stashResult,
    remoteResult,
    remoteBranchResult
  ] =
    await Promise.all([
      getStatusSummary(repository),
      runGit(repository.path, [
        "log",
        "-n",
        "50",
        "--pretty=format:%h%x1f%H%x1f%an%x1f%ae%x1f%aI%x1f%s%x1e"
      ]).catch((error) => ({ stdout: "", stderr: error.message })),
      runGit(repository.path, [
        "branch",
        "--format=%(refname:short)%00%(HEAD)%00%(upstream:short)%00%(committerdate:iso-strict)%00%(authorname)"
      ]).catch(() => ({ stdout: "" })),
      runGit(repository.path, [
        "stash",
        "list",
        "--pretty=format:%gd%x1f%s%x1e"
      ]).catch(() => ({ stdout: "" })),
      getRemotes(repository.path),
      runGit(repository.path, [
        "for-each-ref",
        "--format=%(refname:short)",
        "refs/remotes"
      ]).catch(() => ({ stdout: "" }))
    ]);

  const remoteBranches = remoteBranchResult.stdout
    .split(/\r?\n/)
    .filter((line) => line && !line.endsWith("/HEAD"));
  const branchNames = remoteResult
    .filter((remote) => remote.type === "fetch")
    .map((remote) => remote.name);
  const branches = parseBranches(branchResult.stdout).map((branch) => {
    const upstreamTarget = resolveRemoteTarget(branch.upstream, branchNames);
    const fallbackTarget = branchNames
      .map((remote) =>
        resolveRemoteTarget(`${remote}/${branch.name}`, branchNames)
      )
      .find(
        (target) =>
          target &&
          remoteBranches.includes(`${target.remote}/${target.branch}`)
      );
    const remoteTarget =
      upstreamTarget &&
      remoteBranches.includes(
        `${upstreamTarget.remote}/${upstreamTarget.branch}`
      )
        ? upstreamTarget
        : fallbackTarget || null;
    return {
      ...branch,
      remoteTarget
    };
  });

  return {
    repository,
    summary: status,
    commits: parseLog(logResult.stdout),
    branches,
    stashes: parseStashes(stashResult.stdout),
    remotes: remoteResult
  };
}

async function getCommitHistory(repository, scopeInput, limitInput) {
  await assertRepositoryAvailable(repository);
  const scope = scopeInput === "current" ? "current" : "all";
  const limit = Math.min(
    Math.max(Number(limitInput) || 100, 20),
    200
  );
  const branchResult = await runGit(repository.path, [
    "branch",
    "--show-current"
  ]).catch(() => ({ stdout: "" }));
  const branch = branchResult.stdout.trim();
  const scopeArgs =
    scope === "all" ? ["--all"] : [branch ? branch : "HEAD"];

  let result;
  try {
    result = await runGit(repository.path, [
      "log",
      "--graph",
      "--decorate=short",
      "--date=iso-strict",
      "--topo-order",
      "--pretty=format:%x1e%h%x1f%an%x1f%aI%x1f%D%x1f%s",
      ...scopeArgs,
      "-n",
      String(limit)
    ]);
  } catch (error) {
    if (
      /does not have any commits|unknown revision|bad revision|ambiguous argument/i.test(
        error.message
      )
    ) {
      return {
        scope,
        branch,
        rows: [],
        maxGraphWidth: 0
      };
    }
    throw error;
  }

  return {
    scope,
    branch,
    ...parseGraphHistory(result.stdout)
  };
}

async function getRemotes(repositoryPath) {
  const result = await runGit(repositoryPath, ["remote", "-v"]).catch(() => ({
    stdout: ""
  }));
  return result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.+?)\t(.+?) \((fetch|push)\)$/);
      return match
        ? { name: match[1], url: match[2], type: match[3] }
        : null;
    })
    .filter(Boolean);
}

function resolveRemoteTarget(remoteRef, remoteNames) {
  const value = String(remoteRef || "");
  const remote = [...remoteNames]
    .sort((left, right) => right.length - left.length)
    .find((name) => value.startsWith(`${name}/`));
  if (!remote) {
    return null;
  }
  return {
    remote,
    branch: value.slice(remote.length + 1)
  };
}

async function assertRepositoryAvailable(repository) {
  const stat = await fs.stat(repository.path).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw httpError(410, "仓库目录已移动或当前不可访问。");
  }
}

async function runRepositoryAction(repository, body) {
  const action = body.action;
  await assertRepositoryAvailable(repository);

  const release = await acquireRepositoryLock(repository.id);
  try {
    let output = "";
    let warnings = [];

    switch (action) {
      case "fetch":
        output = await gitAction(repository.path, [
          "fetch",
          "--all",
          "--prune"
        ]);
        break;
      case "pull":
        output = await gitAction(repository.path, ["pull", "--ff-only"]);
        break;
      case "push":
        output = await gitAction(repository.path, ["push"]);
        break;
      case "stageAll":
        output = await gitAction(repository.path, ["add", "-A"]);
        break;
      case "unstageAll":
        output = await unstageAll(repository.path);
        break;
      case "stageFile":
        output = await gitAction(repository.path, [
          "add",
          "--",
          validateRepositoryPath(repository.path, body.path)
        ]);
        break;
      case "stageFiles":
        output = await stagePaths(repository.path, body.paths);
        break;
      case "unstageFile":
        output = await unstagePath(
          repository.path,
          validateRepositoryPath(repository.path, body.path)
        );
        break;
      case "discardFile":
        output = await discardPath(
          repository.path,
          validateRepositoryPath(repository.path, body.path)
        );
        break;
      case "discardFiles":
        output = await discardPaths(repository.path, body.paths);
        break;
      case "commit":
        output = await commit(repository.path, body);
        break;
      case "commitSelected":
        output = await commitSelected(repository.path, body);
        break;
      case "checkoutBranch":
        output = await checkoutBranch(repository.path, body.name);
        break;
      case "createBranch":
        output = await createBranch(repository.path, body.name);
        break;
      case "deleteBranch":
        {
          const result = await deleteBranches(repository.path, [
            {
              name: body.name,
              deleteRemote: body.deleteRemote === true,
              forceDelete: body.forceDelete === true
            }
          ]);
          output = result.output;
          warnings = result.warnings;
        }
        break;
      case "deleteBranches":
        {
          const result = await deleteBranches(
            repository.path,
            body.branches
          );
          output = result.output;
          warnings = result.warnings;
        }
        break;
      case "mergeBranch":
        output = await mergeBranch(repository.path, body.name);
        break;
      case "stashSave":
        output = await gitAction(repository.path, [
          "stash",
          "push",
          "--include-untracked",
          "-m",
          String(body.message || "").trim() || "GitDeck 自动暂存"
        ]);
        break;
      case "stashPop":
        output = await stashPop(repository.path, body.ref);
        break;
      case "openExplorer":
        await openExplorer(repository.path);
        output = "已打开资源管理器。";
        break;
      case "openTerminal":
        await openTerminal(repository.path);
        output = "已打开终端。";
        break;
      case "openTortoiseGit":
        await openTortoiseGit(repository.path);
        output = "已打开 TortoiseGit。";
        break;
      default:
        throw httpError(400, "不支持的 Git 操作。");
    }

    const detail = await getRepositoryDetail(repository);
    return { ...detail, output: output.trim(), warnings };
  } finally {
    release();
  }
}

async function commit(repositoryPath, body) {
  const message = String(body.message || "").trim();
  const amend = body.amend === true;
  if (!message && !amend) {
    throw httpError(400, "请输入提交说明。");
  }

  const args = ["commit"];
  if (amend) {
    args.push("--amend");
  }
  if (message) {
    args.push("-m", message);
  } else {
    args.push("--no-edit");
  }
  return gitAction(repositoryPath, args);
}

async function stagePaths(repositoryPath, inputPaths) {
  const paths = normalizePaths(repositoryPath, inputPaths);
  await gitAction(
    repositoryPath,
    ["add", "-A", "--pathspec-from-file=-", "--pathspec-file-nul"],
    { input: `${paths.join("\0")}\0` }
  );
  return `已暂存 ${paths.length} 个文件。`;
}

async function commitSelected(repositoryPath, body) {
  const message = String(body.message || "").trim();
  const amend = body.amend === true;
  if (!message && !amend) {
    throw httpError(400, "请输入提交说明。");
  }
  const paths = normalizePaths(repositoryPath, body.paths);
  const pathInput = `${paths.join("\0")}\0`;
  await gitAction(
    repositoryPath,
    ["add", "-A", "--pathspec-from-file=-", "--pathspec-file-nul"],
    { input: pathInput }
  );

  const args = ["commit"];
  if (amend) {
    args.push("--amend");
  }
  if (message) {
    args.push("-m", message);
  } else {
    args.push("--no-edit");
  }
  args.push(
    "--only",
    "--pathspec-from-file=-",
    "--pathspec-file-nul"
  );
  return gitAction(repositoryPath, args, { input: pathInput });
}

function normalizePaths(repositoryPath, inputPaths) {
  if (!Array.isArray(inputPaths) || !inputPaths.length) {
    throw httpError(400, "请选择文件。");
  }
  if (inputPaths.length > 500) {
    throw httpError(400, "一次最多处理 500 个文件。");
  }
  return [
    ...new Set(
      inputPaths.map((filePath) =>
        validateRepositoryPath(repositoryPath, filePath)
      )
    )
  ];
}

async function checkoutBranch(repositoryPath, branchName) {
  await validateBranchName(repositoryPath, branchName);
  return gitAction(repositoryPath, ["switch", branchName]);
}

async function createBranch(repositoryPath, branchName) {
  await validateBranchName(repositoryPath, branchName);
  return gitAction(repositoryPath, ["switch", "-c", branchName]);
}

async function deleteBranches(repositoryPath, inputBranches) {
  if (!Array.isArray(inputBranches) || !inputBranches.length) {
    throw httpError(400, "请选择要删除的分支。");
  }
  if (inputBranches.length > 100) {
    throw httpError(400, "一次最多删除 100 个分支。");
  }

  const requested = [];
  const seen = new Set();
  for (const input of inputBranches) {
    const name = String(
      typeof input === "string" ? input : input?.name || ""
    ).trim();
    if (!name || seen.has(name)) {
      continue;
    }
    seen.add(name);
    requested.push({
      name,
      deleteRemote:
        typeof input === "object" && input?.deleteRemote === true,
      forceDelete:
        typeof input === "object" && input?.forceDelete === true
    });
  }
  if (!requested.length) {
    throw httpError(400, "请选择要删除的分支。");
  }

  const [localResult, currentResult, remoteResult, remoteBranchResult] =
    await Promise.all([
      runGit(repositoryPath, [
        "for-each-ref",
        "--format=%(refname:short)%00%(upstream:short)",
        "refs/heads"
      ]),
      runGit(repositoryPath, ["branch", "--show-current"]).catch(() => ({
        stdout: ""
      })),
      getRemotes(repositoryPath),
      runGit(repositoryPath, [
        "for-each-ref",
        "--format=%(refname:short)",
        "refs/remotes"
      ]).catch(() => ({ stdout: "" }))
    ]);

  const localBranches = new Map(
    localResult.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [name, upstream] = line.split("\0");
        return [name, { name, upstream: upstream || "" }];
      })
  );
  const currentBranch = currentResult.stdout.trim();
  const remoteNames = [
    ...new Set(
      remoteResult
        .filter((remote) => remote.type === "fetch")
        .map((remote) => remote.name)
    )
  ];
  const remoteBranches = new Set(
    remoteBranchResult.stdout
      .split(/\r?\n/)
      .filter((line) => line && !line.endsWith("/HEAD"))
  );
  const warnings = [];
  const deletable = [];

  for (const branch of requested) {
    if (branch.name === currentBranch) {
      warnings.push(`无法删除当前分支 ${branch.name}`);
      continue;
    }
    const localBranch = localBranches.get(branch.name);
    if (!localBranch) {
      warnings.push(`本地分支 ${branch.name} 不存在`);
      continue;
    }
    deletable.push({
      ...branch,
      upstream: localBranch.upstream
    });
  }

  if (!deletable.length) {
    throw httpError(422, warnings.join("；") || "没有可删除的本地分支。");
  }

  const localErrors = [];
  const safeBranches = deletable.filter((branch) => !branch.forceDelete);
  const forcedBranches = deletable.filter((branch) => branch.forceDelete);
  if (safeBranches.length) {
    try {
      await gitAction(repositoryPath, [
        "branch",
        "-d",
        "--",
        ...safeBranches.map((branch) => branch.name)
      ]);
    } catch (error) {
      localErrors.push(error.message);
    }
  }
  if (forcedBranches.length) {
    try {
      await gitAction(repositoryPath, [
        "branch",
        "-D",
        "--",
        ...forcedBranches.map((branch) => branch.name)
      ]);
    } catch (error) {
      localErrors.push(error.message);
    }
  }

  const remainingResult = await runGit(repositoryPath, [
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/heads"
  ]);
  const remaining = new Set(
    remainingResult.stdout.split(/\r?\n/).filter(Boolean)
  );
  const deleted = deletable.filter(
    (branch) => !remaining.has(branch.name)
  );
  if (!deleted.length) {
    throw httpError(
      422,
      localErrors.join("；") || "没有本地分支被删除。"
    );
  }
  if (deleted.length < deletable.length) {
    warnings.push(
      `有 ${deletable.length - deleted.length} 个分支因未合并或状态变化未删除`
    );
  }
  if (localErrors.length && deleted.length) {
    warnings.push(...localErrors);
  }

  const remoteGroups = new Map();
  for (const branch of deleted) {
    if (!branch.deleteRemote) {
      continue;
    }
    const upstreamTarget = resolveRemoteTarget(
      branch.upstream,
      remoteNames
    );
    const target =
      upstreamTarget &&
      remoteBranches.has(`${upstreamTarget.remote}/${upstreamTarget.branch}`)
        ? upstreamTarget
        : remoteNames
            .map((remote) => ({
              remote,
              branch: branch.name
            }))
            .find((candidate) =>
              remoteBranches.has(
                `${candidate.remote}/${candidate.branch}`
              )
            ) || null;
    if (!target) {
      warnings.push(`分支 ${branch.name} 没有找到对应的远程分支`);
      continue;
    }
    if (!remoteGroups.has(target.remote)) {
      remoteGroups.set(target.remote, new Set());
    }
    remoteGroups.get(target.remote).add(target.branch);
  }

  let remoteDeleted = 0;
  for (const [remote, branches] of remoteGroups) {
    const branchNames = [...branches];
    try {
      await gitAction(repositoryPath, [
        "push",
        remote,
        "--delete",
        ...branchNames
      ]);
      remoteDeleted += branchNames.length;
    } catch (error) {
      warnings.push(`远程 ${remote} 删除失败：${error.message}`);
    }
  }

  const localSummary =
    deleted.length === 1
      ? `已删除本地分支 ${deleted[0].name}`
      : `已删除 ${deleted.length} 个本地分支`;
  return {
    output:
      remoteDeleted > 0
        ? `${localSummary}，并删除 ${remoteDeleted} 个远程分支。`
        : `${localSummary}。`,
    warnings
  };
}

async function mergeBranch(repositoryPath, branchName) {
  await validateBranchName(repositoryPath, branchName);
  return gitAction(repositoryPath, ["merge", "--no-edit", branchName]);
}

async function validateBranchName(repositoryPath, branchName) {
  const name = String(branchName || "").trim();
  if (!name) {
    throw httpError(400, "请输入分支名。");
  }
  if (name.startsWith("-")) {
    throw httpError(400, "分支名不能以连字符开头。");
  }
  const result = await runGit(repositoryPath, [
    "check-ref-format",
    "--branch",
    name
  ]);
  if (result.code !== 0) {
    throw httpError(400, "分支名不符合 Git 命名规则。");
  }
}

async function stashPop(repositoryPath, stashRef) {
  const ref = String(stashRef || "stash@{0}");
  if (!/^stash@\{\d+\}$/.test(ref)) {
    throw httpError(400, "Stash 引用无效。");
  }
  return gitAction(repositoryPath, ["stash", "pop", "--index", ref]);
}

async function unstageAll(repositoryPath) {
  const result = await runGit(repositoryPath, ["reset", "--quiet", "HEAD", "--"]);
  if (result.code === 0) {
    return result.stdout || "已取消暂存。";
  }
  return gitAction(repositoryPath, ["rm", "--cached", "-r", "--", "."]);
}

async function unstagePath(repositoryPath, filePath) {
  const result = await runGit(repositoryPath, [
    "reset",
    "--quiet",
    "HEAD",
    "--",
    filePath
  ]);
  if (result.code === 0) {
    return result.stdout || `已取消暂存 ${filePath}`;
  }
  return gitAction(repositoryPath, ["rm", "--cached", "--", filePath]);
}

async function discardPath(repositoryPath, filePath) {
  return discardPaths(repositoryPath, [filePath]);
}

async function discardPaths(repositoryPath, inputPaths) {
  if (!Array.isArray(inputPaths) || !inputPaths.length) {
    throw httpError(400, "请选择要还原的文件。");
  }
  if (inputPaths.length > 500) {
    throw httpError(400, "一次最多还原 500 个文件。");
  }

  const paths = [
    ...new Set(
      inputPaths.map((filePath) =>
        validateRepositoryPath(repositoryPath, filePath)
      )
    )
  ];
  const listed = await runGit(repositoryPath, [
    "ls-files",
    "-z",
    "--",
    ...paths
  ]);
  const trackedPaths = new Set(
    listed.stdout.split("\0").filter(Boolean)
  );
  const tracked = paths.filter((filePath) => trackedPaths.has(filePath));
  const untracked = paths.filter((filePath) => !trackedPaths.has(filePath));

  if (tracked.length) {
    await gitAction(
      repositoryPath,
      [
        "restore",
        "--worktree",
        "--pathspec-from-file=-",
        "--pathspec-file-nul"
      ],
      {
        env: { GIT_OPTIONAL_LOCKS: "0" },
        input: `${tracked.join("\0")}\0`
      }
    );
  }
  await Promise.all(
    untracked.map((filePath) =>
      fs.rm(path.resolve(repositoryPath, filePath), {
        recursive: true,
        force: true
      })
    )
  );

  if (paths.length === 1) {
    return untracked.length
      ? `已删除未跟踪文件 ${paths[0]}`
      : `已还原文件 ${paths[0]}`;
  }
  return `已还原 ${paths.length} 个文件（已跟踪 ${tracked.length}，未跟踪 ${untracked.length}）。`;
}

async function getDiff(repository, filePath, staged) {
  await assertRepositoryAvailable(repository);
  if (!filePath) {
    const args = ["diff", "--no-ext-diff", "--no-color", "--stat"];
    if (staged) {
      args.splice(1, 0, "--cached");
    }
    const result = await runGit(repository.path, args);
    return result.stdout || "没有文本差异。";
  }

  const safePath = validateRepositoryPath(repository.path, filePath);
  const args = ["diff", "--no-ext-diff", "--no-color"];
  if (staged) {
    args.push("--cached");
  }
  args.push("--", safePath);
  const result = await runGit(repository.path, args);
  if (result.stdout.trim()) {
    return result.stdout;
  }

  const status = await getStatusSummary(repository);
  const isUntracked = status.untracked.some((file) => file.path === safePath);
  if (isUntracked) {
    return createUntrackedPatch(repository.path, safePath);
  }

  return "没有可显示的文本差异。";
}

async function getFileContent(repository, filePath) {
  await assertRepositoryAvailable(repository);
  const safePath = validateRepositoryPath(repository.path, filePath);
  const file = await resolveEditableFile(repository.path, safePath);
  if (!file) {
    throw httpError(404, "文件不存在，可能已被删除或移动。");
  }
  if (file.stat.size > MAX_DIFF_BYTES) {
    throw httpError(413, "文件超过 512 KB，暂不支持在内置编辑器中打开。");
  }

  const buffer = await fs.readFile(file.absolutePath);
  if (isProbablyBinary(buffer)) {
    throw httpError(415, "二进制文件不能在文本编辑器中打开。");
  }

  const rawContent = buffer.toString("utf8");
  const crlfCount = (rawContent.match(/\r\n/g) || []).length;
  const lfCount = (rawContent.match(/(?<!\r)\n/g) || []).length;
  const lineEnding = crlfCount > lfCount ? "\r\n" : "\n";
  return {
    path: safePath,
    content: rawContent.replaceAll("\r\n", "\n"),
    lineEnding,
    hash: hashContent(buffer),
    size: file.stat.size,
    editable: true
  };
}

async function saveFileContent(repository, body) {
  await assertRepositoryAvailable(repository);
  const safePath = validateRepositoryPath(repository.path, body.path);
  if (typeof body.content !== "string") {
    throw httpError(400, "文件内容无效。");
  }

  const file = await resolveEditableFile(repository.path, safePath);
  if (!file) {
    throw httpError(404, "文件不存在，无法保存。");
  }

  const currentBuffer = await fs.readFile(file.absolutePath);
  if (isProbablyBinary(currentBuffer)) {
    throw httpError(415, "二进制文件不能在文本编辑器中保存。");
  }
  if (body.expectedHash && hashContent(currentBuffer) !== body.expectedHash) {
    throw httpError(409, "文件已被其他程序修改，请重新打开后再编辑。");
  }

  const lineEnding = body.lineEnding === "\r\n" ? "\r\n" : "\n";
  const normalized = body.content.replaceAll("\r\n", "\n");
  const output =
    lineEnding === "\r\n" ? normalized.replaceAll("\n", "\r\n") : normalized;
  const outputBuffer = Buffer.from(output, "utf8");
  if (outputBuffer.length > MAX_DIFF_BYTES) {
    throw httpError(413, "保存后的文件超过 512 KB。");
  }

  await fs.writeFile(file.absolutePath, outputBuffer);
  return {
    saved: true,
    path: safePath,
    hash: hashContent(outputBuffer),
    size: outputBuffer.length,
    summary: await getStatusSummary(repository)
  };
}

async function resolveEditableFile(repositoryPath, safePath) {
  const absolutePath = path.resolve(repositoryPath, safePath);
  const stat = await fs.lstat(absolutePath).catch(() => null);
  if (!stat) {
    return null;
  }
  if (stat.isSymbolicLink()) {
    throw httpError(400, "不能通过符号链接编辑仓库外部文件。");
  }
  if (!stat.isFile()) {
    return null;
  }

  const [realRepository, realFile] = await Promise.all([
    fs.realpath(repositoryPath),
    fs.realpath(absolutePath)
  ]);
  if (!isPathInside(realRepository, realFile)) {
    throw httpError(400, "文件路径不能离开仓库目录。");
  }
  return { absolutePath, stat };
}

function hashContent(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function isProbablyBinary(buffer) {
  const sampleLength = Math.min(buffer.length, 8192);
  for (let index = 0; index < sampleLength; index += 1) {
    if (buffer[index] === 0) {
      return true;
    }
  }
  return false;
}

async function createUntrackedPatch(repositoryPath, filePath) {
  const absolutePath = path.resolve(repositoryPath, filePath);
  const stat = await fs.stat(absolutePath).catch(() => null);
  if (!stat || !stat.isFile()) {
    return "这是未跟踪的目录，无法显示文件补丁。";
  }
  if (stat.size > MAX_DIFF_BYTES) {
    return "文件过大，未加载内容。";
  }

  const content = await fs.readFile(absolutePath);
  if (content.includes(0)) {
    return "二进制文件，无法显示文本差异。";
  }

  const lines = content.toString("utf8").replace(/\r\n/g, "\n").split("\n");
  if (lines[lines.length - 1] === "") {
    lines.pop();
  }
  const patch = [
    `diff --git a/${filePath} b/${filePath}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${filePath}`,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map((line) => `+${line}`)
  ];
  return patch.join("\n");
}

function validateRepositoryPath(repositoryPath, inputPath) {
  const relativePath = normalizeSqlPath(inputPath);
  if (!relativePath || relativePath.includes("\0")) {
    throw httpError(400, "文件路径无效。");
  }
  if (path.isAbsolute(relativePath)) {
    throw httpError(400, "文件路径必须相对于仓库。");
  }
  const absolutePath = path.resolve(repositoryPath, relativePath);
  if (!isPathInside(repositoryPath, absolutePath)) {
    throw httpError(400, "文件路径不能离开仓库目录。");
  }
  if (
    absolutePath === path.join(repositoryPath, ".git") ||
    absolutePath.startsWith(path.join(repositoryPath, ".git") + path.sep)
  ) {
    throw httpError(400, "不能直接操作 .git 目录。");
  }
  return relativePath;
}

async function discoverRepositories(rootInput, maxDepth) {
  if (!rootInput || typeof rootInput !== "string") {
    throw httpError(400, "请提供要扫描的目录。");
  }

  const root = path.resolve(rootInput.trim());
  const stat = await fs.stat(root).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw httpError(400, "扫描目录不存在或无法访问。");
  }

  const repositories = [];
  const queue = [{ directory: root, depth: 0 }];
  const ignoredNames = new Set([
    ".git",
    ".svn",
    ".hg",
    "node_modules",
    "vendor",
    "dist",
    "build",
    "target",
    ".venv",
    "venv",
    "__pycache__"
  ]);

  while (queue.length && repositories.length < 250) {
    const current = queue.shift();
    const entries = await fs
      .readdir(current.directory, { withFileTypes: true })
      .catch(() => []);

    if (entries.some((entry) => entry.name === ".git")) {
      repositories.push({
        name: path.basename(current.directory),
        path: current.directory
      });
      continue;
    }

    if (current.depth >= maxDepth) {
      continue;
    }

    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        !ignoredNames.has(entry.name) &&
        !entry.name.startsWith(".")
      ) {
        queue.push({
          directory: path.join(current.directory, entry.name),
          depth: current.depth + 1
        });
      }
    }
  }

  return repositories.sort((left, right) =>
    left.path.localeCompare(right.path, "zh-CN")
  );
}

async function listDirectories(inputPath) {
  const currentPath = await findExistingDirectory(inputPath);
  let entries;
  try {
    entries = await fs.readdir(currentPath, { withFileTypes: true });
  } catch (error) {
    if (error.code === "EACCES" || error.code === "EPERM") {
      throw httpError(403, "无法读取这个目录，请检查访问权限后重试。");
    }
    throw error;
  }

  const directories = entries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name !== ".git" &&
        entry.name !== "node_modules"
    )
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"))
    .slice(0, 500);

  const directoryItems = await Promise.all(
    directories.map(async (entry) => {
      const directoryPath = path.join(currentPath, entry.name);
      return {
        name: entry.name,
        path: directoryPath,
        isRepository: await isRepositoryRoot(directoryPath)
      };
    })
  );

  const parentCandidate = path.dirname(currentPath);
  const parentPath =
    parentCandidate === currentPath ? null : parentCandidate;
  const [roots, quickPaths] = await Promise.all([
    listSystemRoots(),
    listQuickPaths(currentPath)
  ]);

  return {
    currentPath,
    parentPath,
    isRepository: await isRepositoryRoot(currentPath),
    directories: directoryItems,
    roots,
    quickPaths
  };
}

async function findExistingDirectory(inputPath) {
  let candidate;
  if (typeof inputPath === "string" && inputPath.trim()) {
    const trimmed = inputPath.trim();
    candidate =
      trimmed === "~"
        ? os.homedir()
        : trimmed.startsWith(`~${path.sep}`) ||
            trimmed.startsWith("~/") ||
            trimmed.startsWith("~\\")
          ? path.join(os.homedir(), trimmed.slice(2))
          : path.resolve(trimmed);
  } else {
    candidate = os.homedir() || APP_ROOT;
  }

  while (true) {
    const stat = await fs.stat(candidate).catch(() => null);
    if (stat?.isDirectory()) {
      return candidate;
    }
    if (stat?.isFile()) {
      candidate = path.dirname(candidate);
      continue;
    }
    const parent = path.dirname(candidate);
    if (parent === candidate) {
      break;
    }
    candidate = parent;
  }

  const fallback = (await fs.stat(APP_ROOT).catch(() => null))?.isDirectory()
    ? APP_ROOT
    : path.parse(process.cwd()).root;
  return fallback;
}

async function isRepositoryRoot(directoryPath) {
  const stat = await fs.stat(path.join(directoryPath, ".git")).catch(() => null);
  return Boolean(stat);
}

async function listSystemRoots() {
  if (process.platform !== "win32") {
    return [{ label: "/", path: "/" }];
  }

  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const accessible = await Promise.all(
    letters.map(async (letter) => {
      const root = `${letter}:\\`;
      const stat = await fs.stat(root).catch(() => null);
      return stat?.isDirectory()
        ? { label: `${letter}:`, path: root }
        : null;
    })
  );
  return accessible.filter(Boolean);
}

async function listQuickPaths(currentPath) {
  const candidates = [
    { label: "用户目录", path: os.homedir() },
    { label: "GitDeck 项目", path: APP_ROOT },
    { label: "当前目录", path: currentPath }
  ];
  const seen = new Set();
  const result = [];
  for (const candidate of candidates) {
    if (
      !candidate.path ||
      seen.has(candidate.path.toLowerCase()) ||
      !(await fs.stat(candidate.path).catch(() => null))?.isDirectory()
    ) {
      continue;
    }
    seen.add(candidate.path.toLowerCase());
    result.push(candidate);
  }
  return result;
}

async function openExplorer(repositoryPath) {
  if (process.platform !== "win32") {
    throw httpError(501, "当前系统不支持从 GitDeck 打开资源管理器。");
  }
  spawn("explorer.exe", [repositoryPath], {
    detached: true,
    stdio: "ignore"
  }).unref();
}

async function openTerminal(repositoryPath) {
  if (process.platform !== "win32") {
    throw httpError(501, "当前系统不支持从 GitDeck 打开终端。");
  }

  const windowsTerminal = await runProcess("where.exe", ["wt.exe"]).catch(
    () => null
  );
  if (windowsTerminal && windowsTerminal.code === 0) {
    spawn("wt.exe", ["-d", repositoryPath], {
      detached: true,
      stdio: "ignore"
    }).unref();
    return;
  }

  spawn(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoExit",
      "-Command",
      "Set-Location -LiteralPath $env:GITDECK_REPOSITORY"
    ],
    {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        GITDECK_REPOSITORY: repositoryPath
      }
    }
  ).unref();
}

async function openTortoiseGit(repositoryPath) {
  if (process.platform !== "win32") {
    throw httpError(501, "TortoiseGit 仅支持 Windows。");
  }

  const candidates = [
    process.env.ProgramW6432 &&
      path.join(
        process.env.ProgramW6432,
        "TortoiseGit",
        "bin",
        "TortoiseGitProc.exe"
      ),
    process.env.ProgramFiles &&
      path.join(
        process.env.ProgramFiles,
        "TortoiseGit",
        "bin",
        "TortoiseGitProc.exe"
      ),
    process.env["ProgramFiles(x86)"] &&
      path.join(
        process.env["ProgramFiles(x86)"],
        "TortoiseGit",
        "bin",
        "TortoiseGitProc.exe"
      ),
    process.env.LocalAppData &&
      path.join(
        process.env.LocalAppData,
        "Programs",
        "TortoiseGit",
        "bin",
        "TortoiseGitProc.exe"
      )
  ].filter(Boolean);

  let executablePath = "";
  for (const candidate of candidates) {
    const stat = await fs.stat(candidate).catch(() => null);
    if (stat?.isFile()) {
      executablePath = candidate;
      break;
    }
  }

  if (!executablePath) {
    const located = await runProcess("where.exe", [
      "TortoiseGitProc.exe"
    ]).catch(() => null);
    if (located?.code === 0) {
      executablePath = located.stdout.split(/\r?\n/).find(Boolean) || "";
    }
  }

  if (!executablePath) {
    throw httpError(
      501,
      "未找到 TortoiseGitProc.exe，请先安装 TortoiseGit。"
    );
  }

  spawn(
    executablePath,
    ["/command:log", `/path:${repositoryPath}`],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: false
    }
  ).unref();
}

async function gitAction(repositoryPath, args, options = {}) {
  const result = await runGit(repositoryPath, args, {
    timeout: 180000,
    ...options
  });
  return (
    [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n") ||
    "操作已完成。"
  );
}

async function runGit(repositoryPath, args, options = {}) {
  const result = await runProcess(
    "git",
    [
      "-c",
      "color.ui=false",
      "-c",
      `safe.directory=${toGitPath(repositoryPath)}`,
      "-C",
      repositoryPath,
      ...args
    ],
    options
  );
  if (result.code !== 0) {
    const message =
      result.stderr.trim() ||
      result.stdout.trim() ||
      `Git 命令失败，退出码 ${result.code}`;
    throw httpError(422, message);
  }
  return result;
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GIT_OPTIONAL_LOCKS: "0",
        LC_ALL: "C",
        ...options.env
      },
      windowsHide: true,
      shell: false
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    child.stdin.end(options.input || "");

    const timeout = setTimeout(() => {
      if (!settled) {
        child.kill();
      }
    }, options.timeout || 45000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve({ code: 127, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

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

async function serveStatic(response, pathname) {
  const fileMap = {
    "/": "index.html",
    "/index.html": "index.html",
    "/app.js": "app.js",
    "/styles.css": "styles.css"
  };
  const fileName = fileMap[pathname];
  if (!fileName) {
    throw httpError(404, "页面不存在。");
  }

  const filePath = path.join(PUBLIC_ROOT, fileName);
  let content = await fs.readFile(filePath);
  if (fileName === "index.html") {
    content = Buffer.from(
      content
        .toString("utf8")
        .replaceAll("__GITDECK_TOKEN__", SESSION_TOKEN),
      "utf8"
    );
  }

  response.writeHead(200, {
    "Content-Type": MIME_TYPES[path.extname(fileName)] || "application/octet-stream",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(content);
}

function sendJson(response, statusCode, payload) {
  if (response.headersSent) {
    return;
  }
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, error) {
  if (response.headersSent) {
    response.end();
    return;
  }
  const statusCode = error.statusCode || 500;
  const message =
    statusCode === 500 && process.env.NODE_ENV === "production"
      ? "服务内部错误。"
      : error.message || "请求失败。";
  sendJson(response, statusCode, { error: message });
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function readJson(request) {
  let size = 0;
  const chunks = [];

  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw httpError(413, "请求内容过大。");
    }
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw httpError(400, "请求内容不是有效 JSON。");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
