"use strict";

const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const SCRATCH_ROOT = path.join(PROJECT_ROOT, ".workbuddy", "scratch");

test("本地 API 能端到端管理真实 Git 仓库", async (context) => {
  const fixtureRoot = path.join(
    SCRATCH_ROOT,
    `api-test-${process.pid}-${Date.now()}`
  );
  const repositoryPath = path.join(fixtureRoot, "demo-repository");
  const orderRepositoryPath = path.join(fixtureRoot, "order-repository");
  const remotePath = path.join(fixtureRoot, "remote.git");
  const dataPath = path.join(fixtureRoot, "data");
  const port = 4600 + Math.floor(Math.random() * 300);
  let server;

  context.after(async () => {
    if (server && !server.killed) {
      server.kill();
    }
    // kill() 是异步的：Windows 上服务进程若仍持有 git 文件句柄，
    // 立刻 fs.rm 会失败并在沙盒里留下 api-test-* 目录。等退出后再带重试删除。
    if (server && server.exitCode === null && server.signalCode === null) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 2000);
        server.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    await fs.rm(fixtureRoot, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200
    });
  });

  await fs.mkdir(SCRATCH_ROOT, { recursive: true });
  await fs.mkdir(repositoryPath, { recursive: true });
  await fs.mkdir(orderRepositoryPath, { recursive: true });
  runGit(repositoryPath, ["init", "-b", "main"]);
  runGit(repositoryPath, ["config", "user.name", "GitDeck Test"]);
  runGit(repositoryPath, ["config", "user.email", "gitdeck@example.test"]);
  await fs.writeFile(
    path.join(repositoryPath, "README.md"),
    "# Demo repository\n\nInitial content.\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(repositoryPath, "windows.txt"),
    "first\r\nsecond\r\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(repositoryPath, "discard.txt"),
    "original\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(repositoryPath, "batch-a.txt"),
    "batch a original\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(repositoryPath, "batch-b.txt"),
    "batch b original\n",
    "utf8"
  );
  runGit(repositoryPath, [
    "add",
    "README.md",
    "windows.txt",
    "discard.txt",
    "batch-a.txt",
    "batch-b.txt"
  ]);
  runGit(repositoryPath, ["commit", "-m", "Initial commit"]);
  runGitBare(["init", "--bare", remotePath]);
  runGit(repositoryPath, ["remote", "add", "origin", remotePath]);
  runGit(repositoryPath, ["push", "-u", "origin", "main"]);
  runGit(orderRepositoryPath, ["init", "-b", "main"]);
  runGit(orderRepositoryPath, ["config", "user.name", "Order Test"]);
  runGit(orderRepositoryPath, ["config", "user.email", "order@example.test"]);
  await fs.writeFile(
    path.join(orderRepositoryPath, "README.md"),
    "# Order test\n",
    "utf8"
  );
  runGit(orderRepositoryPath, ["add", "README.md"]);
  runGit(orderRepositoryPath, ["commit", "-m", "Order repository"]);

  server = spawn(process.execPath, ["server.js"], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      GITDECK_DATA_DIR: dataPath,
      GITDECK_NO_OPEN: "1"
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  let serverOutput = "";
  server.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });

  await waitForServer(server, () => serverOutput.includes("GitDeck 已启动"));

  const baseUrl = `http://127.0.0.1:${port}`;
  const html = await fetch(`${baseUrl}/`).then((response) => response.text());
  const token = html.match(
    /<meta name="gitdeck-token" content="([a-f0-9]+)"/
  )?.[1];
  assert.ok(token, "session token should be injected into index.html");

  const listing = await callApi(baseUrl, token, "/api/directories/list", {
    method: "POST",
    body: { path: fixtureRoot }
  });
  assert.equal(path.resolve(listing.currentPath), path.resolve(fixtureRoot));
  const repositoryEntry = listing.directories.find(
    (entry) => entry.name === "demo-repository"
  );
  assert.equal(repositoryEntry?.isRepository, true);

  const addResponse = await callApi(baseUrl, token, "/api/repositories", {
    method: "POST",
    body: { path: repositoryPath }
  });
  const repository = addResponse.repository;
  assert.equal(repository.name, "demo-repository");
  assert.match(repository.id, /^[a-f0-9]{12}$/);

  const orderRepositoryResponse = await callApi(
    baseUrl,
    token,
    "/api/repositories",
    {
      method: "POST",
      body: {
        path: orderRepositoryPath,
        workspaceId: repository.workspaceIds[0]
      }
    }
  );
  const orderRepository = orderRepositoryResponse.repository;
  const sharedWorkspaceId = repository.workspaceIds[0];
  assert.equal(
    orderRepository.orders[sharedWorkspaceId],
    1,
    "新建仓库应排在该工作区已有仓库之后"
  );
  await callApi(baseUrl, token, "/api/repositories/reorder", {
    method: "POST",
    body: {
      workspaceId: sharedWorkspaceId,
      ids: [orderRepository.id, repository.id]
    }
  });
  const orderBootstrap = await callApi(
    baseUrl,
    token,
    "/api/bootstrap"
  );
  const orderedEntries = orderBootstrap.repositories.filter((item) =>
    item.workspaceIds.includes(sharedWorkspaceId)
  );
  const ordersById = new Map(
    orderedEntries.map((item) => [item.id, item.orders[sharedWorkspaceId]])
  );
  assert.deepEqual(
    [...ordersById.values()].sort((a, b) => a - b),
    [0, 1]
  );
  assert.ok(ordersById.get(orderRepository.id) < ordersById.get(repository.id));
  await callApi(
    baseUrl,
    token,
    `/api/repositories/${orderRepository.id}`,
    { method: "DELETE" }
  );

  const initialDetail = await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/detail`
  );
  assert.equal(initialDetail.summary.branch, "main");
  assert.equal(initialDetail.summary.counts.total, 0);
  assert.equal(initialDetail.commits[0].subject, "Initial commit");

  await fs.writeFile(
    path.join(repositoryPath, "discard.txt"),
    "temporary change\n",
    "utf8"
  );
  const discarded = await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/action`,
    {
      method: "POST",
      body: { action: "discardFile", path: "discard.txt" }
    }
  );
  assert.equal(discarded.summary.counts.total, 0);
  const discardedContent = await fs.readFile(
    path.join(repositoryPath, "discard.txt"),
    "utf8"
  );
  assert.equal(discardedContent.replaceAll("\r\n", "\n"), "original\n");

  await fs.writeFile(
    path.join(repositoryPath, "batch-a.txt"),
    "batch a changed\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(repositoryPath, "batch-b.txt"),
    "batch b changed\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(repositoryPath, "batch-untracked.txt"),
    "temporary\n",
    "utf8"
  );
  const batchDiscarded = await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/action`,
    {
      method: "POST",
      body: {
        action: "discardFiles",
        paths: ["batch-a.txt", "batch-b.txt", "batch-untracked.txt"]
      }
    }
  );
  assert.equal(batchDiscarded.summary.counts.total, 0);
  assert.match(batchDiscarded.output, /已跟踪 2，未跟踪 1/);
  assert.equal(
    (
      await fs.readFile(path.join(repositoryPath, "batch-a.txt"), "utf8")
    ).replaceAll("\r\n", "\n"),
    "batch a original\n"
  );
  assert.equal(
    (
      await fs.readFile(path.join(repositoryPath, "batch-b.txt"), "utf8")
    ).replaceAll("\r\n", "\n"),
    "batch b original\n"
  );
  assert.equal(
    await fs
      .stat(path.join(repositoryPath, "batch-untracked.txt"))
      .then(() => true)
      .catch(() => false),
    false
  );

  await fs.writeFile(
    path.join(repositoryPath, "README.md"),
    "# Demo repository\n\nChanged content.\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(repositoryPath, "new-file.txt"),
    "untracked\n",
    "utf8"
  );

  const dirtyDetail = await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/detail`
  );
  assert.equal(dirtyDetail.summary.counts.unstaged, 1);
  assert.equal(dirtyDetail.summary.counts.untracked, 1);

  await fs.writeFile(
    path.join(repositoryPath, "throwaway.txt"),
    "remove me\n",
    "utf8"
  );
  await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/action`,
    {
      method: "POST",
      body: { action: "discardFile", path: "throwaway.txt" }
    }
  );
  assert.equal(
    await fs
      .stat(path.join(repositoryPath, "throwaway.txt"))
      .then(() => true)
      .catch(() => false),
    false
  );

  const diff = await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/diff?path=README.md&staged=0`
  );
  assert.match(diff.diff, /Changed content/);

  const untrackedDiff = await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/diff?path=new-file.txt&staged=0`
  );
  assert.match(untrackedDiff.diff, /new file mode/);

  const editFile = await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/file?path=README.md`
  );
  assert.match(editFile.content, /Changed content/);
  assert.match(editFile.hash, /^[a-f0-9]{64}$/);

  const savedFile = await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/file`,
    {
      method: "POST",
      body: {
        path: "README.md",
        content: "# Demo repository\n\nEdited content.\n",
        expectedHash: editFile.hash,
        lineEnding: editFile.lineEnding
      }
    }
  );
  assert.equal(savedFile.saved, true);
  assert.equal(savedFile.summary.counts.unstaged, 1);

  await assert.rejects(
    () =>
      callApi(baseUrl, token, `/api/repositories/${repository.id}/file`, {
        method: "POST",
        body: {
          path: "README.md",
          content: "stale overwrite\n",
          expectedHash: editFile.hash
        }
      }),
    /已被其他程序修改/
  );

  const savedFileAgain = await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/file?path=README.md`
  );
  assert.match(savedFileAgain.content, /Edited content/);

  const windowsFile = await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/file?path=windows.txt`
  );
  assert.equal(windowsFile.lineEnding, "\r\n");
  await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/file`,
    {
      method: "POST",
      body: {
        path: "windows.txt",
        content: "first\nsecond edited\n",
        expectedHash: windowsFile.hash,
        lineEnding: windowsFile.lineEnding
      }
    }
  );
  const windowsContent = await fs.readFile(
    path.join(repositoryPath, "windows.txt"),
    "utf8"
  );
  assert.match(windowsContent, /second edited\r\n/);

  const staged = await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/action`,
    {
      method: "POST",
      body: { action: "stageAll" }
    }
  );
  assert.equal(staged.summary.counts.staged, 3);

  const committed = await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/action`,
    {
      method: "POST",
      body: { action: "commit", message: "Add second change" }
    }
  );
  assert.equal(committed.summary.counts.total, 0);
  assert.equal(committed.commits[0].subject, "Add second change");

  const commitHistory = await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/history?scope=current&limit=20`
  );
  assert.equal(commitHistory.scope, "current");
  assert.ok(commitHistory.rows.length > 0);
  assert.ok(commitHistory.rows.every((row) => row.hash && row.shortHash));
  assert.ok(commitHistory.rows[0].parents !== undefined);

  await fs.writeFile(
    path.join(repositoryPath, "batch-a.txt"),
    "batch a selected\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(repositoryPath, "batch-b.txt"),
    "batch b selected\n",
    "utf8"
  );
  const selectedStaged = await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/action`,
    {
      method: "POST",
      body: {
        action: "stageFiles",
        paths: ["batch-a.txt"]
      }
    }
  );
  assert.equal(selectedStaged.summary.counts.staged, 1);
  await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/action`,
    {
      method: "POST",
      body: { action: "unstageAll" }
    }
  );

  await fs.writeFile(
    path.join(repositoryPath, "batch-a.txt"),
    "batch a commit only\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(repositoryPath, "batch-b.txt"),
    "batch b left staged\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(repositoryPath, "windows.txt"),
    "windows left unstaged\r\n",
    "utf8"
  );
  await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/action`,
    {
      method: "POST",
      body: { action: "stageFile", path: "batch-b.txt" }
    }
  );
  const selectedCommit = await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/action`,
    {
      method: "POST",
      body: {
        action: "commitSelected",
        message: "Commit selected file only",
        paths: ["batch-a.txt"]
      }
    }
  );
  assert.equal(
    selectedCommit.commits[0].subject,
    "Commit selected file only"
  );
  assert.equal(
    runGit(repositoryPath, ["diff", "--cached", "--name-only"]).trim(),
    "batch-b.txt"
  );
  await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/action`,
    {
      method: "POST",
      body: { action: "unstageAll" }
    }
  );
  const selectedCleaned = await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/action`,
    {
      method: "POST",
      body: {
        action: "discardFiles",
        paths: ["batch-b.txt", "windows.txt"]
      }
    }
  );
  assert.equal(selectedCleaned.summary.counts.total, 0);

  const branched = await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/action`,
    {
      method: "POST",
      body: { action: "createBranch", name: "feature/multi-repo" }
    }
  );
  assert.equal(branched.summary.branch, "feature/multi-repo");
  const featureBranch = branched.branches.find(
    (branch) => branch.name === "feature/multi-repo"
  );
  assert.ok(featureBranch);
  assert.equal(featureBranch.author, "GitDeck Test");
  assert.ok(featureBranch.date);

  runGit(repositoryPath, [
    "push",
    "-u",
    "origin",
    "feature/multi-repo"
  ]);
  const branchedDetail = await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/detail`
  );
  assert.deepEqual(
    branchedDetail.branches.find(
      (branch) => branch.name === "feature/multi-repo"
    ).remoteTarget,
    { remote: "origin", branch: "feature/multi-repo" }
  );

  await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/action`,
    {
      method: "POST",
      body: { action: "checkoutBranch", name: "main" }
    }
  );
  const deletedFeature = await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/action`,
    {
      method: "POST",
      body: {
        action: "deleteBranch",
        name: "feature/multi-repo",
        deleteRemote: true
      }
    }
  );
  assert.equal(deletedFeature.warnings.length, 0);
  assert.equal(
    deletedFeature.branches.some(
      (branch) => branch.name === "feature/multi-repo"
    ),
    false
  );
  assert.doesNotMatch(
    runGitBare([
      "--git-dir",
      remotePath,
      "for-each-ref",
      "--format=%(refname:short)",
      "refs/heads"
    ]),
    /feature\/multi-repo/
  );

  runGit(repositoryPath, ["switch", "-c", "unmerged-test"]);
  await fs.writeFile(
    path.join(repositoryPath, "unmerged.txt"),
    "unmerged commit\n",
    "utf8"
  );
  runGit(repositoryPath, ["add", "unmerged.txt"]);
  runGit(repositoryPath, ["commit", "-m", "Unmerged branch commit"]);
  runGit(repositoryPath, ["switch", "main"]);
  await assert.rejects(
    () =>
      callApi(
        baseUrl,
        token,
        `/api/repositories/${repository.id}/action`,
        {
          method: "POST",
          body: { action: "deleteBranch", name: "unmerged-test" }
        }
      ),
    /not fully merged/
  );
  assert.match(
    runGit(repositoryPath, [
      "show-ref",
      "--verify",
      "refs/heads/unmerged-test"
    ]),
    /unmerged-test/
  );
  const forcedDelete = await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/action`,
    {
      method: "POST",
      body: {
        action: "deleteBranch",
        name: "unmerged-test",
        forceDelete: true
      }
    }
  );
  assert.equal(
    forcedDelete.branches.some((branch) => branch.name === "unmerged-test"),
    false
  );

  // 提交历史徽标右键「删除引用」：不勾 -D 会被 Git 拒绝，带 force 才能删掉未合并分支。
  runGit(repositoryPath, ["switch", "-c", "unmerged-ref"]);
  await fs.writeFile(
    path.join(repositoryPath, "unmerged-ref.txt"),
    "unmerged ref commit\n",
    "utf8"
  );
  runGit(repositoryPath, ["add", "unmerged-ref.txt"]);
  runGit(repositoryPath, ["commit", "-m", "Unmerged ref commit"]);
  runGit(repositoryPath, ["switch", "main"]);
  await assert.rejects(
    () =>
      callApi(baseUrl, token, `/api/repositories/${repository.id}/action`, {
        method: "POST",
        body: { action: "deleteRef", ref: "unmerged-ref" }
      }),
    /not fully merged/
  );
  assert.match(
    runGit(repositoryPath, ["branch", "--list", "unmerged-ref"]),
    /unmerged-ref/,
    "未勾选 -D 时未合并分支应仍然存在"
  );
  await callApi(baseUrl, token, `/api/repositories/${repository.id}/action`, {
    method: "POST",
    body: { action: "deleteRef", ref: "unmerged-ref", force: true }
  });
  assert.doesNotMatch(
    runGit(repositoryPath, ["branch", "--list", "unmerged-ref"]),
    /unmerged-ref/,
    "force=true 后未合并分支应被真正删除"
  );

  // 失败的 Git 动作要进错误日志：批量抓取的 toast 只显示第一条错误，
  // 其余失败全文必须能在顶栏 Log 弹窗里逐条查到。
  const errorLogs = await callApi(baseUrl, token, "/api/logs?limit=50");
  assert.ok(Array.isArray(errorLogs.errors));
  const refFailure = errorLogs.errors.find(
    (entry) => entry.action === "deleteRef" && entry.path.endsWith("/action")
  );
  assert.ok(refFailure, "失败的 deleteRef 动作必须被记录到错误日志");
  assert.equal(refFailure.status, 422);
  assert.ok(refFailure.repository, "错误日志要标明是哪个仓库");
  assert.match(refFailure.message, /not fully merged/, "错误全文不得被截断");
  assert.ok(Array.isArray(errorLogs.server));
  assert.ok(errorLogs.server.length > 0, "服务运行日志尾部也应返回");
  const untrustedLog = await fetch(`${baseUrl}/api/logs`);
  assert.equal(untrustedLog.status, 403, "日志接口同样需要会话令牌");

  runGit(repositoryPath, ["branch", "batch-a"]);
  runGit(repositoryPath, ["branch", "batch-b"]);
  runGit(repositoryPath, ["push", "-u", "origin", "batch-a", "batch-b"]);
  const deletedBatch = await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/action`,
    {
      method: "POST",
      body: {
        action: "deleteBranches",
        branches: [
          { name: "batch-a", deleteRemote: true },
          { name: "batch-b", deleteRemote: true }
        ]
      }
    }
  );
  assert.equal(deletedBatch.warnings.length, 0);
  assert.equal(
    deletedBatch.branches.filter((branch) =>
      ["batch-a", "batch-b"].includes(branch.name)
    ).length,
    0
  );
  const remainingRemoteBranches = runGitBare([
    "--git-dir",
    remotePath,
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/heads"
  ]);
  assert.doesNotMatch(remainingRemoteBranches, /batch-a/);
  assert.doesNotMatch(remainingRemoteBranches, /batch-b/);

  const workspaceCreated = await callApi(
    baseUrl,
    token,
    "/api/workspaces",
    {
      method: "POST",
      body: { name: "测试工作区" }
    }
  );
  const testWorkspace = workspaceCreated.workspace;
  assert.equal(testWorkspace.name, "测试工作区");

  const renamedWorkspace = await callApi(
    baseUrl,
    token,
    `/api/workspaces/${testWorkspace.id}`,
    {
      method: "PATCH",
      body: { name: "测试工作区-改名" }
    }
  );
  assert.equal(renamedWorkspace.workspace.name, "测试工作区-改名");

  const movedRepository = await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/workspace`,
    {
      method: "POST",
      body: { workspaceId: testWorkspace.id }
    }
  );
  assert.ok(movedRepository.repository.workspaceIds.includes(testWorkspace.id));
  assert.ok(
    movedRepository.repository.workspaceIds.length >= 2,
    "加入新工作区后应保留原有归属"
  );

  const workspaceBootstrap = await callApi(
    baseUrl,
    token,
    "/api/bootstrap"
  );
  const multiMember = workspaceBootstrap.repositories.find(
    (item) => item.id === repository.id
  );
  assert.ok(multiMember.workspaceIds.includes(testWorkspace.id));

  const workspaceDeleted = await callApi(
    baseUrl,
    token,
    `/api/workspaces/${testWorkspace.id}`,
    { method: "DELETE" }
  );
  const movedBackBootstrap = await callApi(
    baseUrl,
    token,
    "/api/bootstrap"
  );
  const afterDelete = movedBackBootstrap.repositories.find(
    (item) => item.id === repository.id
  );
  assert.ok(
    !afterDelete.workspaceIds.includes(testWorkspace.id),
    "删除工作区后归属被摘除"
  );
  assert.ok(afterDelete.workspaceIds.length >= 1);
  assert.equal(
    workspaceDeleted.movedRepositoryCount,
    0,
    "仓库仍有其他归属时不应触发兜底搬迁"
  );
  const deletedUpdated = (workspaceDeleted.updated || []).find(
    (item) => item.id === repository.id
  );
  assert.ok(deletedUpdated, "删除工作区应返回受影响仓库的归属与排序");
  assert.deepEqual(deletedUpdated.workspaceIds, afterDelete.workspaceIds);
  assert.deepEqual(deletedUpdated.orders, afterDelete.orders);
  assert.ok(
    Number.isFinite(deletedUpdated.orders[afterDelete.workspaceIds[0]]),
    "摘除归属后剩余工作区的排序值必须有效"
  );

  // 解决方案接口与 git 状态无关：未提交、未跟踪的 .sln 也必须列出来；
  // 但只扫描仓库根目录第一层，子目录不再递归（避免大仓库刷新卡顿）。
  await fs.mkdir(path.join(repositoryPath, "nested"), { recursive: true });
  await fs.writeFile(path.join(repositoryPath, "App.sln"), "");
  await fs.writeFile(path.join(repositoryPath, "nested", "Lib.sln"), "");
  const solutionListing = await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/solutions`
  );
  assert.deepEqual(
    solutionListing.solutions.sort(),
    ["App.sln"],
    "solutions 接口只返回仓库根目录第一层的 .sln，不递归子目录"
  );

  // 提交历史分支标签右键菜单：差异接口 + 引用级动作。
  const headHash = runGit(repositoryPath, ["rev-parse", "HEAD"]).trim();
  const rootHash = runGit(repositoryPath, [
    "rev-list",
    "--max-parents=0",
    "HEAD"
  ]).trim();
  const commitPatch = await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/commit?hash=${headHash}&compare=patch`
  );
  assert.equal(commitPatch.hash, headHash);
  assert.equal(commitPatch.compare, "patch");
  assert.match(commitPatch.text, /commit |diff --git|Initial commit/);
  const previousDiff = await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/commit?hash=${rootHash}&compare=previous`
  );
  assert.equal(previousDiff.compare, "previous");
  assert.ok(
    previousDiff.text.length > 0,
    "根提交没有父提交时应退回 git show，而不是报错"
  );
  const worktreeDiff = await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/commit?hash=${headHash}&compare=worktree`
  );
  assert.equal(worktreeDiff.compare, "worktree");

  const branchAtCommit = await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/action`,
    {
      method: "POST",
      body: {
        action: "createBranchAt",
        name: "history-probe",
        base: rootHash,
        switchTo: false
      }
    }
  );
  assert.equal(
    branchAtCommit.summary.branch,
    "main",
    "不勾选切换时只创建分支，当前分支保持不变"
  );
  assert.match(
    runGit(repositoryPath, ["branch", "--list", "history-probe"]),
    /history-probe/
  );

  await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/action`,
    {
      method: "POST",
      body: {
        action: "createTagAt",
        name: "v-history-probe",
        base: rootHash,
        message: "probe"
      }
    }
  );
  assert.match(
    runGit(repositoryPath, ["tag", "--list"]),
    /v-history-probe/
  );
  await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/action`,
    { method: "POST", body: { action: "deleteRef", ref: "v-history-probe" } }
  );
  assert.doesNotMatch(
    runGit(repositoryPath, ["tag", "--list"]),
    /v-history-probe/
  );

  runGit(repositoryPath, [
    "update-ref",
    "refs/remotes/origin/remote-topic",
    headHash
  ]);
  const switchedRemote = await callApi(
    baseUrl,
    token,
    `/api/repositories/${repository.id}/action`,
    { method: "POST", body: { action: "checkoutRef", ref: "origin/remote-topic" } }
  );
  assert.equal(switchedRemote.summary.branch, "remote-topic");
  assert.match(
    runGit(repositoryPath, ["config", "--get", "branch.remote-topic.remote"]),
    /origin/,
    "从远端引用切换应建立跟踪关系"
  );
  await assert.rejects(
    () =>
      callApi(baseUrl, token, `/api/repositories/${repository.id}/action`, {
        method: "POST",
        body: { action: "checkoutRef", ref: "-bad" }
      }),
    /引用名称无效/
  );
  await assert.rejects(
    () =>
      callApi(baseUrl, token, `/api/repositories/${repository.id}/action`, {
        method: "POST",
        body: { action: "checkoutCommit", hash: "not-a-hash" }
      }),
    /提交哈希无效/
  );

  const removed = await callApi(
    baseUrl,
    token,
    "/api/repositories/remove",
    {
      method: "POST",
      body: {
        workspaceId: afterDelete.workspaceIds[0],
        ids: [repository.id]
      }
    }
  );
  assert.deepEqual(removed.removedIds, [repository.id]);
  const finalBootstrap = await callApi(baseUrl, token, "/api/bootstrap");
  assert.equal(
    finalBootstrap.repositories.some((item) => item.id === repository.id),
    false
  );
});

test("RepositoryStore 会清洗脏 orders 并写回磁盘", async () => {
  const RepositoryStore = require("../src/repository-store");
  await fs.mkdir(SCRATCH_ROOT, { recursive: true });
  const directory = await fs.mkdtemp(path.join(SCRATCH_ROOT, "store-"));
  try {
    const store = new RepositoryStore(directory);
    await store.saveState({
      workspaces: [
        { id: "ws-a", name: "A" },
        { id: "ws-b", name: "B" }
      ],
      repositories: [
        {
          id: "aaa",
          name: "a",
          path: "C:/a",
          workspaceIds: ["ws-a", "ws-b", "ws-ghost"],
          orders: { "ws-a": 0, "ws-b": 0, "ws-ghost": 7 }
        }
      ]
    });
    const state = await store.loadState();
    assert.deepEqual(state.repositories[0].workspaceIds, ["ws-a", "ws-b"]);
    assert.deepEqual(state.repositories[0].orders, {
      "ws-a": 0,
      "ws-b": 0
    });
    const onDisk = JSON.parse(
      await fs.readFile(path.join(directory, "repositories.json"), "utf8")
    );
    assert.deepEqual(
      onDisk.repositories[0].orders,
      { "ws-a": 0, "ws-b": 0 },
      "清洗结果要落盘，不能只留在内存"
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

function runGit(cwd, args) {
  const result = spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }
  return result.stdout;
}

function runGitBare(args) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }
  return result.stdout;
}

function waitForServer(server, predicate, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
      } else if (server.exitCode !== null) {
        clearInterval(timer);
        reject(new Error("server exited before becoming ready"));
      } else if (Date.now() - startedAt > timeout) {
        clearInterval(timer);
        reject(new Error("server did not become ready"));
      }
    }, 40);
  });
}

async function callApi(baseUrl, token, pathname, options = {}) {
  const headers = {
    "X-GitDeck-Token": token,
    ...(options.headers || {})
  };
  let body = options.body;
  if (body && typeof body !== "string") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers,
    body
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}
