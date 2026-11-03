(() => {
  "use strict";

  const token = document
    .querySelector('meta[name="gitdeck-token"]')
    .getAttribute("content");

  const state = {
    repositories: [],
    workspaces: [],
    activeWorkspaceId: null,
    workspaceSelectSignature: "",
    summaries: new Map(),
    errors: new Map(),
    busyRepositories: new Set(),
    selectedIds: new Set(),
    selectedId: null,
    detail: null,
    detailLoading: false,
    refreshing: false,
    bulkBusy: false,
    activeTab: "changes",
    contextView: "history",
    contextHistoryScope: "all",
    contextHistory: null,
    contextHistoryLoading: false,
    contextHistoryKey: "",
    contextHistoryRequest: 0,
    fileFilter: "all",
    fileTreeMode: "tree",
    selectedFile: null,
    selectedFiles: new Set(),
    batchBusy: false,
    branchSelection: new Set(),
    branchSearch: "",
    draggingRepoId: "",
    dragOverRepoId: "",
    dragOverPosition: "",
    suppressRepoClickUntil: 0,
    authReloading: false,
    pendingBranchDeletion: [],
    workspaceNameMode: "",
    workspaceRenameId: "",
    moveRepositoryId: "",
    previewMode: "diff",
    previewKey: "",
    previewRequest: 0,
    previewLoading: false,
    collapsedFolders: new Set(),
    editor: {
      content: "",
      originalContent: "",
      hash: "",
      lineEnding: "\n",
      dirty: false
    },
    search: "",
    drafts: new Map(),
    modalAction: null,
    modalType: "",
    scanResults: [],
    scanRoot: "",
    directoryTargetInputId: "",
    directoryCurrentPath: "",
    directoryListing: null,
    directoryRequest: 0,
    directoryLoading: false,
    menuRepositoryId: null,
    detailRequest: 0,
    previousFocus: null,
    autoRefreshTimer: null,
    version: "1.0.0"
  };

  const elements = {
    mainPanel: document.getElementById("mainPanel"),
    workspace: document.querySelector(".workspace"),
    emptyState: document.getElementById("emptyState"),
    emptyTitle: document.getElementById("emptyTitle"),
    emptyDescription: document.getElementById("emptyDescription"),
    loadingState: document.getElementById("loadingState"),
    repoErrorState: document.getElementById("repoErrorState"),
    repoErrorMessage: document.getElementById("repoErrorMessage"),
    repoView: document.getElementById("repoView"),
    repoCount: document.getElementById("repoCount"),
    repoList: document.getElementById("repoList"),
    repoSearch: document.getElementById("repoSearch"),
    workspacePicker: document.getElementById("workspacePicker"),
    workspaceSwitcher: document.getElementById("workspaceSwitcher"),
    workspaceDropdown: document.getElementById("workspaceDropdown"),
    workspaceDropdownList: document.getElementById("workspaceDropdownList"),
    activeWorkspaceName: document.getElementById("activeWorkspaceName"),
    activeWorkspaceRepoCount: document.getElementById(
      "activeWorkspaceRepoCount"
    ),
    selectionBar: document.getElementById("selectionBar"),
    selectionCount: document.getElementById("selectionCount"),
    globalSummary: document.getElementById("globalSummary"),
    refreshAllButton: document.getElementById("refreshAllButton"),
    contextPanel: document.getElementById("contextPanel"),
    contextHistorySection: document.getElementById("contextHistorySection"),
    branchContextSection: document.getElementById("branchContextSection"),
    contextHistoryBranch: document.getElementById("contextHistoryBranch"),
    contextCommitHistory: document.getElementById("contextCommitHistory"),
    contextCommitCount: document.getElementById("contextCommitCount"),
    branchList: document.getElementById("branchList"),
    branchSearch: document.getElementById("branchSearch"),
    branchSelectionCount: document.getElementById("branchSelectionCount"),
    branchBatchDeleteButton: document.getElementById(
      "branchBatchDeleteButton"
    ),
    stashList: document.getElementById("stashList"),
    remoteList: document.getElementById("remoteList"),
    fileGroups: document.getElementById("fileGroups"),
    commitMessage: document.getElementById("commitMessage"),
    amendCheckbox: document.getElementById("amendCheckbox"),
    stagedBadge: document.getElementById("stagedBadge"),
    composerNote: document.getElementById("composerNote"),
    explorerCount: document.getElementById("explorerCount"),
    fileTreeTitle: document.getElementById("fileTreeTitle"),
    fileViewToggle: document.getElementById("fileViewToggle"),
    fileFilterBar: document.getElementById("fileFilterBar"),
    batchSelectionCount: document.getElementById("batchSelectionCount"),
    batchStageButton: document.getElementById("batchStageButton"),
    batchDiscardButton: document.getElementById("batchDiscardButton"),
    previewPath: document.getElementById("previewPath"),
    previewActions: document.getElementById("previewActions"),
    filePreview: document.getElementById("filePreview"),
    changesView: document.getElementById("changesView"),
    historyView: document.getElementById("historyView"),
    changesTabCount: document.getElementById("changesTabCount"),
    commitTimeline: document.getElementById("commitTimeline"),
    historyCount: document.getElementById("historyCount"),
    branchSelect: document.getElementById("branchSelect"),
    repoName: document.getElementById("repoName"),
    repoPath: document.getElementById("repoPath"),
    repoPathButton: document.getElementById("repoPathButton"),
    repoStateChip: document.getElementById("repoStateChip"),
    syncBlock: document.getElementById("syncBlock"),
    statusMetrics: document.getElementById("statusMetrics"),
    modalBackdrop: document.getElementById("modalBackdrop"),
    modalPanel: document.getElementById("modalPanel"),
    modalEyebrow: document.getElementById("modalEyebrow"),
    modalTitle: document.getElementById("modalTitle"),
    modalBody: document.getElementById("modalBody"),
    modalFooter: document.getElementById("modalFooter"),
    directoryPickerBackdrop: document.getElementById("directoryPickerBackdrop"),
    directoryPickerTitle: document.getElementById("directoryPickerTitle"),
    directoryPickerBody: document.getElementById("directoryPickerBody"),
    directoryPickerFooter: document.getElementById("directoryPickerFooter"),
    contextMenu: document.getElementById("contextMenu"),
    toastRegion: document.getElementById("toastRegion"),
    screenReaderStatus: document.getElementById("screenReaderStatus"),
    versionLabel: document.getElementById("versionLabel")
  };

  const actionLabels = {
    fetch: "抓取完成",
    pull: "拉取完成",
    push: "推送完成",
    stageAll: "已暂存全部改动",
    unstageAll: "已取消全部暂存",
    stageFile: "文件已暂存",
    stageFiles: "选中文件已暂存",
    unstageFile: "文件已取消暂存",
    discardFile: "文件改动已还原",
    discardFiles: "选中文件已还原",
    commit: "提交成功",
    commitSelected: "选中文件已提交",
    checkoutBranch: "分支切换完成",
    createBranch: "分支创建完成",
    deleteBranch: "分支已删除",
    deleteBranches: "分支已删除",
    mergeBranch: "分支合并完成",
    stashSave: "改动已保存到 Stash",
    stashPop: "Stash 已恢复",
    openExplorer: "已打开目录",
    openTerminal: "已打开终端",
    openTortoiseGit: "已打开 TortoiseGit"
  };

  const actionFailureLabels = {
    deleteBranch: "分支删除失败",
    deleteBranches: "分支删除失败",
    discardFile: "文件还原失败",
    discardFiles: "文件还原失败",
    commit: "提交失败",
    commitSelected: "提交失败",
    checkoutBranch: "分支切换失败",
    mergeBranch: "分支合并失败",
    stashSave: "Stash 保存失败",
    stashPop: "Stash 恢复失败"
  };

  bindStaticEvents();
  init().catch((error) => {
    elements.loadingState.hidden = true;
    elements.repoErrorState.hidden = false;
    elements.repoErrorMessage.textContent = error.message;
    showToast("无法启动 GitDeck", error.message, "error");
  });

  async function init() {
    const bootstrap = await api("/api/bootstrap");
    state.repositories = bootstrap.repositories || [];
    state.workspaces = bootstrap.workspaces || [];
    state.version = bootstrap.version || "1.0.0";
    state.fileTreeMode = resolveInitialFileTreeMode();
    elements.versionLabel.textContent = `v${state.version}`;
    state.activeWorkspaceId = resolveInitialWorkspaceId();
    const activeRepositories = getActiveRepositories();
    if (activeRepositories.length) {
      state.selectedId = activeRepositories[0].id;
      state.detailLoading = true;
    }
    render();

    if (activeRepositories.length) {
      await refreshAllSummaries({ quiet: true });
      await selectRepository(activeRepositories[0].id);
    }

    state.autoRefreshTimer = window.setInterval(() => {
      if (!document.hidden) {
        refreshAllSummaries({ quiet: true });
      }
    }, 20000);
  }

  function resolveInitialWorkspaceId() {
    let storedId = "";
    try {
      storedId = window.localStorage.getItem("gitdeck.activeWorkspace") || "";
    } catch {
      storedId = "";
    }
    if (state.workspaces.some((workspace) => workspace.id === storedId)) {
      return storedId;
    }
    return (
      state.workspaces.find((workspace) =>
        state.repositories.some(
          (repository) => repository.workspaceId === workspace.id
        )
      )?.id ||
      state.workspaces[0]?.id ||
      null
    );
  }

  function getActiveRepositories() {
    return state.repositories.filter(
      (repository) => repository.workspaceId === state.activeWorkspaceId
    );
  }

  function getActiveWorkspace() {
    return (
      state.workspaces.find(
        (workspace) => workspace.id === state.activeWorkspaceId
      ) || state.workspaces[0] || null
    );
  }

  function setActiveWorkspace(workspaceId, options = {}) {
    const workspace = state.workspaces.find(
      (item) => item.id === workspaceId
    );
    if (!workspace) {
      return;
    }
    closeWorkspaceDropdown();
    if (options.loadRepository === false) {
      state.activeWorkspaceId = workspaceId;
      persistActiveWorkspace(workspaceId);
      return;
    }
    if (workspaceId === state.activeWorkspaceId) {
      return;
    }

    state.activeWorkspaceId = workspaceId;
    persistActiveWorkspace(workspaceId);
    state.selectedId = null;
    state.detail = null;
    state.detailLoading = false;
    state.selectedIds.clear();
    state.selectedFiles.clear();
    state.branchSelection.clear();
    state.errors.clear();
    render();

    const repositories = getActiveRepositories();
    if (repositories.length) {
      refreshAllSummaries({ quiet: true }).then(() =>
        selectRepository(repositories[0].id)
      );
    }
  }

  function persistActiveWorkspace(workspaceId) {
    try {
      window.localStorage.setItem("gitdeck.activeWorkspace", workspaceId);
    } catch {
      // 当前工作区记忆属于可选能力。
    }
  }

  function resolveInitialFileTreeMode() {
    try {
      const stored = window.localStorage.getItem("gitdeck.fileTreeMode");
      return stored === "flat" ? "flat" : "tree";
    } catch {
      return "tree";
    }
  }

  function persistFileTreeMode() {
    try {
      window.localStorage.setItem("gitdeck.fileTreeMode", state.fileTreeMode);
    } catch {
      // 文件视图偏好持久化属于可选能力。
    }
  }

  function bindStaticEvents() {
    document.getElementById("addButton").addEventListener("click", () =>
      openAddRepositoryModal()
    );
    document.getElementById("emptyAddButton").addEventListener("click", () =>
      openAddRepositoryModal()
    );
    document.getElementById("scanButton").addEventListener("click", () =>
      openScanModal()
    );
    document.getElementById("emptyScanButton").addEventListener("click", () =>
      openScanModal()
    );
    elements.refreshAllButton.addEventListener("click", () =>
      refreshAllSummaries({ force: true })
    );
    elements.repoSearch.addEventListener("input", (event) => {
      state.search = event.target.value.trim().toLowerCase();
      renderRepoList();
    });
    elements.repoList.addEventListener("dragstart", handleRepoDragStart);
    elements.repoList.addEventListener("dragover", handleRepoDragOver);
    elements.repoList.addEventListener("drop", handleRepoDrop);
    elements.repoList.addEventListener("dragend", clearRepoDragState);
    elements.workspaceSwitcher.addEventListener("click", () => {
      if (elements.workspaceDropdown.hidden) {
        openWorkspaceDropdown();
      } else {
        closeWorkspaceDropdown();
      }
    });
    elements.branchSearch.addEventListener("input", (event) => {
      state.branchSearch = event.target.value.trim().toLowerCase();
      state.branchSelection.clear();
      if (state.detail) {
        renderBranchList(state.detail.branches);
      }
    });
    elements.repoPathButton.addEventListener("click", () =>
      performRepoAction(state.selectedId, "openExplorer")
    );
    elements.branchSelect.addEventListener("change", (event) => {
      const branchName = event.target.value;
      const current = state.detail?.summary?.branch;
      if (!branchName || branchName === current) {
        return;
      }
      showConfirm({
        eyebrow: "切换引用",
        title: "切换到其他分支？",
        message: `即将切换到 <strong>${escapeHtml(branchName)}</strong>。未提交改动可能阻止切换，Git 会在必要时保留它们。`,
        confirmLabel: "切换分支",
        onConfirm: () =>
          performRepoAction(state.selectedId, "checkoutBranch", {
            name: branchName
          })
      });
      event.target.value = current || branchName;
    });
    elements.commitMessage.addEventListener("input", (event) => {
      saveCurrentDraft({ message: event.target.value });
      updateComposerState();
    });
    elements.amendCheckbox.addEventListener("change", (event) => {
      saveCurrentDraft({ amend: event.target.checked });
    });
    elements.filePreview.addEventListener("input", handleEditorInput);
    document.getElementById("removeUnavailableButton").addEventListener(
      "click",
      () => requestRemoveRepository(state.selectedId)
    );
    elements.modalBackdrop.addEventListener("click", (event) => {
      if (event.target === elements.modalBackdrop) {
        closeModal();
      }
    });
    elements.directoryPickerBackdrop.addEventListener("click", (event) => {
      if (event.target === elements.directoryPickerBackdrop) {
        closeDirectoryPicker();
      }
    });
    elements.contextMenu.addEventListener("click", handleContextMenuClick);
    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeydown);
    window.addEventListener("resize", hideContextMenu);
    window.addEventListener("scroll", hideContextMenu, true);
    initializeResizers();
  }

  function initializeResizers() {
    const appShell = document.querySelector(".app-shell");
    const resizers = [...document.querySelectorAll("[data-resizer]")];

    const definitions = {
      sidebar: {
        property: "--sidebar-width",
        storageKey: "gitdeck.layout.sidebar",
        min: 200,
        defaultWidth: () => (window.innerWidth <= 1280 ? 242 : 268),
        maxWidth: () => Math.min(420, Math.max(220, window.innerWidth * 0.36)),
        direction: 1
      },
      filetree: {
        property: "--file-tree-width",
        storageKey: "gitdeck.layout.filetree",
        min: 180,
        defaultWidth: () => (window.innerWidth <= 1280 ? 220 : 250),
        maxWidth: () => {
          const layout = document.querySelector(".changes-layout");
          return Math.min(
            520,
            Math.max(180, (layout?.clientWidth || appShell.clientWidth) - 287)
          );
        },
        direction: 1
      },
      context: {
        property: "--context-width",
        storageKey: "gitdeck.layout.context",
        min: 250,
        defaultWidth: () => (window.innerWidth <= 1280 ? 298 : 330),
        maxWidth: () => Math.min(520, Math.max(250, window.innerWidth * 0.4)),
        direction: -1
      }
    };

    for (const resizer of resizers) {
      const name = resizer.dataset.resizer;
      const definition = definitions[name];
      if (!definition) {
        continue;
      }
      const saved = readStoredWidth(definition.storageKey);
      if (saved !== null) {
        setResizerWidth(
          appShell,
          definition,
          clamp(
            saved,
            definition.min,
            definition.maxWidth()
          )
        );
      }
      updateResizerAria(resizer, definition, appShell);
      resizer.addEventListener("pointerdown", (event) => {
        if (
          event.button !== 0 ||
          getComputedStyle(resizer).display === "none" ||
          resizer.getClientRects().length === 0
        ) {
          return;
        }
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = getResizerWidth(appShell, definition);
        resizer.classList.add("dragging");
        document.body.classList.add("is-resizing");
        resizer.setPointerCapture(event.pointerId);

        const onMove = (moveEvent) => {
          const delta = moveEvent.clientX - startX;
          const width =
            startWidth + delta * definition.direction;
          setResizerWidth(
            appShell,
            definition,
            clamp(width, definition.min, definition.maxWidth())
          );
          updateResizerAria(resizer, definition, appShell);
        };
        const onEnd = () => {
          resizer.classList.remove("dragging");
          document.body.classList.remove("is-resizing");
          resizer.removeEventListener("pointermove", onMove);
          resizer.removeEventListener("pointerup", onEnd);
          resizer.removeEventListener("pointercancel", onEnd);
          persistResizerWidth(
            definition.storageKey,
            getResizerWidth(appShell, definition)
          );
        };
        resizer.addEventListener("pointermove", onMove);
        resizer.addEventListener("pointerup", onEnd);
        resizer.addEventListener("pointercancel", onEnd);
      });
      resizer.addEventListener("dblclick", () => {
        appShell.style.removeProperty(definition.property);
        removeStoredWidth(definition.storageKey);
        window.requestAnimationFrame(() => {
          updateResizerAria(resizer, definition, appShell);
        });
      });
      resizer.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
          return;
        }
        event.preventDefault();
        const current = getResizerWidth(appShell, definition);
        const max = definition.maxWidth();
        let next = current;
        if (event.key === "Home") {
          next = definition.min;
        } else if (event.key === "End") {
          next = max;
        } else {
          const step =
            event.key === "ArrowRight" ? 16 : -16;
          next = current + step * definition.direction;
        }
        setResizerWidth(
          appShell,
          definition,
          clamp(next, definition.min, max)
        );
        updateResizerAria(resizer, definition, appShell);
        persistResizerWidth(
          definition.storageKey,
          getResizerWidth(appShell, definition)
        );
      });
    }

    window.addEventListener("resize", () => {
      for (const resizer of resizers) {
        const definition = definitions[resizer.dataset.resizer];
        if (!definition) {
          continue;
        }
        setResizerWidth(
          appShell,
          definition,
          clamp(
            getResizerWidth(appShell, definition),
            definition.min,
            definition.maxWidth()
          )
        );
        updateResizerAria(resizer, definition, appShell);
      }
    });
  }

  function getResizerWidth(appShell, definition) {
    return (
      Number.parseFloat(
        getComputedStyle(appShell).getPropertyValue(definition.property)
      ) || definition.defaultWidth()
    );
  }

  function setResizerWidth(appShell, definition, width) {
    appShell.style.setProperty(
      definition.property,
      `${Math.round(width)}px`
    );
  }

  function updateResizerAria(resizer, definition, appShell) {
    const max = Math.round(definition.maxWidth());
    resizer.setAttribute("aria-valuemin", String(definition.min));
    resizer.setAttribute("aria-valuemax", String(max));
    resizer.setAttribute(
      "aria-valuenow",
      String(Math.round(getResizerWidth(appShell, definition)))
    );
  }

  function readStoredWidth(key) {
    try {
      const value = Number.parseFloat(window.localStorage.getItem(key) || "");
      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  }

  function persistResizerWidth(key, width) {
    try {
      window.localStorage.setItem(key, String(Math.round(width)));
    } catch {
      // 分栏宽度持久化属于可选能力。
    }
  }

  function removeStoredWidth(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // 分栏宽度持久化属于可选能力。
    }
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  async function api(url, options = {}) {
    const headers = {
      "X-GitDeck-Token": token,
      ...(options.headers || {})
    };
    let body = options.body;
    if (body && typeof body !== "string") {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    }

    const response = await fetch(url, {
      ...options,
      headers,
      body
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 403 && !state.authReloading) {
        const now = Date.now();
        let lastReload = 0;
        try {
          lastReload = Number(
            sessionStorage.getItem("gitdeck.authReloadAt") || 0
          );
        } catch {
          lastReload = 0;
        }
        if (now - lastReload > 5000) {
          state.authReloading = true;
          try {
            sessionStorage.setItem("gitdeck.authReloadAt", String(now));
          } catch {
            // 会话存储不可用时仍然执行一次自动刷新。
          }
          window.setTimeout(() => window.location.reload(), 50);
          throw new Error("会话令牌已更新，页面正在重新加载。");
        }
      }
      throw new Error(data.error || `请求失败 (${response.status})`);
    }
    return data;
  }

  function render() {
    renderGlobalSummary();
    renderRepoList();
    renderMain();
    renderContextPanel();
  }

  function renderGlobalSummary() {
    const activeRepositories = getActiveRepositories();
    const activeWorkspace = getActiveWorkspace();
    if (!activeRepositories.length) {
      elements.globalSummary.innerHTML = "";
      return;
    }

    const summaries = activeRepositories
      .map((repository) => state.summaries.get(repository.id))
      .filter(Boolean);
    const changes = summaries.reduce(
      (total, summary) => total + (summary?.counts?.total || 0),
      0
    );
    const dirty = summaries.filter(
      (summary) => (summary?.counts?.total || 0) > 0
    ).length;
    const errors = activeRepositories.filter((repository) =>
      state.errors.has(repository.id)
    ).length;

    elements.globalSummary.innerHTML = `
      <span class="summary-fragment">
        ${icon("layers")}
        <strong>${escapeHtml(activeWorkspace?.name || "工作区")}</strong>
      </span>
      <span class="summary-fragment">
        ${icon("folder")}
        <strong>${activeRepositories.length}</strong> 个仓库
      </span>
      <span class="summary-fragment">
        ${icon("commit")}
        <strong>${changes}</strong> 项改动
      </span>
      ${
        dirty
          ? `<span class="summary-fragment">${icon("alert")}<strong>${dirty}</strong> 个待处理</span>`
          : ""
      }
      ${
        errors
          ? `<span class="summary-fragment">${icon("alert")}<strong>${errors}</strong> 个不可用</span>`
          : ""
      }
    `;
  }

  function renderRepoList() {
    const activeRepositories = getActiveRepositories();
    renderWorkspacePicker(activeRepositories);
    elements.repoCount.textContent = String(activeRepositories.length);
    elements.selectionBar.hidden = state.selectedIds.size === 0;
    elements.selectionCount.textContent = `已选 ${state.selectedIds.size} 个`;

    const filtered = activeRepositories.filter((repository) => {
      if (!state.search) {
        return true;
      }
      return `${repository.name} ${repository.path}`
        .toLowerCase()
        .includes(state.search);
    });

    if (!activeRepositories.length) {
      elements.repoList.innerHTML = `
        <div class="sidebar-empty">
          ${icon("layers")}
          <span>当前工作区还没有仓库</span>
          <button type="button" data-open-add>添加仓库</button>
        </div>
      `;
      return;
    }

    if (!filtered.length) {
      elements.repoList.innerHTML = `
        <div class="sidebar-empty">
          ${icon("search")}
          <span>没有匹配的仓库</span>
        </div>
      `;
      return;
    }

    elements.repoList.innerHTML = filtered
      .map((repository) => {
        const summary = state.summaries.get(repository.id);
        const error = state.errors.get(repository.id);
        const busy = state.busyRepositories.has(repository.id);
        const changes = summary?.counts?.total || 0;
        const branch = summary?.branch || (error ? "不可用" : "读取中");
        const statusClass = error
          ? "error"
          : busy || !summary
            ? "loading"
            : changes
              ? "dirty"
              : "clean";
        const selected = state.selectedId === repository.id;
        const bulkSelected = state.selectedIds.has(repository.id);

        return `
          <div
            class="repo-item ${selected ? "selected" : ""} ${busy ? "busy" : ""}"
            data-open-repo="${repository.id}"
            data-reorder-repo="${repository.id}"
            draggable="true"
            role="button"
            tabindex="0"
            aria-label="打开 ${escapeHtml(repository.name)}"
          >
            <span class="repo-drag-handle" title="拖拽调整仓库顺序">
              ${icon("grip-vertical")}
            </span>
            <button
              class="repo-checkbox ${bulkSelected ? "checked" : ""}"
              type="button"
              data-toggle-repo="${repository.id}"
              aria-label="${bulkSelected ? "取消选择" : "选择"} ${escapeHtml(repository.name)}"
              aria-pressed="${bulkSelected}"
            >
              ${bulkSelected ? icon("check") : ""}
            </button>
            <div class="repo-item-main">
              <div class="repo-item-title">
                <span class="status-dot ${statusClass}"></span>
                <span class="repo-item-name">${escapeHtml(repository.name)}</span>
              </div>
              <div class="repo-item-branch">
                ${icon("git-branch")}
                <span>${escapeHtml(branch)}</span>
              </div>
              <div class="repo-item-path" title="${escapeHtml(repository.path)}">
                ${escapeHtml(repository.path)}
              </div>
            </div>
            <div class="repo-item-side">
              <button
                class="repo-item-menu"
                type="button"
                data-repo-menu="${repository.id}"
                aria-label="${escapeHtml(repository.name)} 的仓库操作"
              >
                ${icon("more")}
              </button>
              <span class="change-count ${changes ? "" : "zero"}">
                ${error ? "!" : summary ? changes : "…"}
              </span>
              ${
                summary && (summary.ahead || summary.behind)
                  ? `<span class="sync-mini">↑${summary.ahead} ↓${summary.behind}</span>`
                  : ""
              }
            </div>
          </div>
        `;
      })
      .join("");
  }

  function handleRepoDragStart(event) {
    const row = event.target.closest("[data-reorder-repo]");
    if (!row || event.target.closest("button")) {
      event.preventDefault();
      return;
    }
    state.draggingRepoId = row.dataset.reorderRepo;
    row.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", state.draggingRepoId);
  }

  function handleRepoDragOver(event) {
    if (!state.draggingRepoId) {
      return;
    }
    const row = event.target.closest("[data-reorder-repo]");
    elements.repoList
      .querySelectorAll(".drag-over-before, .drag-over-after")
      .forEach((item) =>
        item.classList.remove("drag-over-before", "drag-over-after")
      );
    if (!row || row.dataset.reorderRepo === state.draggingRepoId) {
      state.dragOverRepoId = "";
      state.dragOverPosition = "";
      return;
    }

    event.preventDefault();
    const rect = row.getBoundingClientRect();
    const position =
      event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    row.classList.add(`drag-over-${position}`);
    state.dragOverRepoId = row.dataset.reorderRepo;
    state.dragOverPosition = position;
    event.dataTransfer.dropEffect = "move";
  }

  function handleRepoDrop(event) {
    if (!state.draggingRepoId) {
      return;
    }
    event.preventDefault();
    const sourceId = state.draggingRepoId;
    const targetId =
      state.dragOverRepoId ||
      event.target.closest("[data-reorder-repo]")?.dataset.reorderRepo ||
      "";
    const position = state.dragOverPosition || "after";
    state.suppressRepoClickUntil = Date.now() + 300;
    clearRepoDragState();
    moveRepositoryOrder(sourceId, targetId, position);
  }

  function clearRepoDragState() {
    state.draggingRepoId = "";
    state.dragOverRepoId = "";
    state.dragOverPosition = "";
    elements.repoList
      .querySelectorAll(
        ".dragging, .drag-over-before, .drag-over-after"
      )
      .forEach((item) =>
        item.classList.remove(
          "dragging",
          "drag-over-before",
          "drag-over-after"
        )
      );
  }

  async function moveRepositoryOrder(sourceId, targetId, position) {
    const originalRepositories = state.repositories.slice();
    const activeRepositories = getActiveRepositories();
    const sourceIndex = activeRepositories.findIndex(
      (repository) => repository.id === sourceId
    );
    if (sourceIndex < 0) {
      return;
    }
    const [moved] = activeRepositories.splice(sourceIndex, 1);
    let insertIndex = activeRepositories.length;
    if (targetId) {
      const targetIndex = activeRepositories.findIndex(
        (repository) => repository.id === targetId
      );
      if (targetIndex >= 0) {
        insertIndex = position === "after" ? targetIndex + 1 : targetIndex;
      }
    }
    activeRepositories.splice(insertIndex, 0, moved);

    const slots = [];
    state.repositories.forEach((repository, index) => {
      if (repository.workspaceId === state.activeWorkspaceId) {
        slots.push(index);
      }
    });
    slots.forEach((slot, index) => {
      state.repositories[slot] = activeRepositories[index];
    });
    renderRepoList();

    try {
      await api("/api/repositories/reorder", {
        method: "POST",
        body: {
          workspaceId: state.activeWorkspaceId,
          ids: activeRepositories.map((repository) => repository.id)
        }
      });
    } catch (error) {
      state.repositories = originalRepositories;
      renderRepoList();
      showToast("仓库排序保存失败", error.message, "error");
    }
  }

  function renderWorkspacePicker(activeRepositories) {
    const optionData = state.workspaces.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      count: state.repositories.filter(
        (repository) => repository.workspaceId === workspace.id
      ).length
    }));
    const activeWorkspace = getActiveWorkspace();
    elements.activeWorkspaceName.textContent =
      activeWorkspace?.name || "未选择工作区";
    elements.activeWorkspaceRepoCount.textContent = String(
      activeRepositories.length
    );
    const signature = JSON.stringify({
      activeWorkspaceId: state.activeWorkspaceId,
      optionData
    });
    if (signature !== state.workspaceSelectSignature) {
      elements.workspaceDropdownList.innerHTML = `
        ${optionData
          .map(
            (workspace) => `
              <button
                class="workspace-dropdown-item ${
                  workspace.id === state.activeWorkspaceId ? "active" : ""
                }"
                type="button"
                role="menuitem"
                data-workspace-switch="${workspace.id}"
              >
                ${
                  workspace.id === state.activeWorkspaceId
                    ? icon("check")
                    : icon("layers")
                }
                <span class="workspace-dropdown-item-name">${escapeHtml(workspace.name)}</span>
                <span class="workspace-dropdown-item-count">${workspace.count}</span>
              </button>
            `
          )
          .join("")}
      `;
      state.workspaceSelectSignature = signature;
    }
  }

  function openWorkspaceDropdown() {
    elements.workspaceDropdown.hidden = false;
    elements.workspaceSwitcher.setAttribute("aria-expanded", "true");
  }

  function closeWorkspaceDropdown() {
    elements.workspaceDropdown.hidden = true;
    elements.workspaceSwitcher.setAttribute("aria-expanded", "false");
  }

  function renderMain() {
    const repository = getSelectedRepository();
    const noRepository = !repository;
    elements.workspace.classList.toggle("no-context", noRepository);
    elements.contextPanel.hidden = noRepository;
    elements.emptyState.hidden = !noRepository;
    elements.loadingState.hidden =
      noRepository || !state.detailLoading || Boolean(state.errors.get(repository.id));
    elements.repoErrorState.hidden =
      noRepository || !state.errors.has(repository.id);
    elements.repoView.hidden =
      noRepository ||
      state.detailLoading ||
      Boolean(state.errors.get(repository.id)) ||
      !state.detail;

    if (noRepository) {
      const workspace = getActiveWorkspace();
      const activeRepositories = getActiveRepositories();
      if (workspace && !activeRepositories.length) {
        elements.emptyTitle.textContent = `${workspace.name} 还没有仓库`;
        elements.emptyDescription.textContent =
          "添加 Git 仓库或扫描目录，把多个仓库放进当前工作区统一管理。";
      } else {
        elements.emptyTitle.textContent = "把常用仓库放进同一个视图";
        elements.emptyDescription.textContent =
          "添加一个仓库，或扫描上级目录。GitDeck 会汇总分支、未提交改动和领先/落后状态。";
      }
      return;
    }

    if (state.errors.has(repository.id)) {
      elements.repoErrorMessage.textContent = state.errors.get(repository.id);
      return;
    }

    if (!state.detail || state.detailLoading) {
      return;
    }

    renderRepositoryView();
  }

  function renderRepositoryView() {
    const { repository, summary, commits, branches, stashes, remotes } =
      state.detail;
    elements.repoName.textContent = repository.name;
    elements.repoPath.textContent = repository.path;
    elements.repoPath.title = repository.path;
    elements.repoStateChip.textContent = summary.counts.total
      ? `${summary.counts.total} 项未提交`
      : "工作区干净";
    elements.repoStateChip.className = `state-chip ${
      summary.counts.total ? "dirty" : ""
    }`;

    const currentBranchName = summary.branch || "detached";
    const branchOptions = branches.length
      ? branches
      : summary.branch
        ? [{ name: summary.branch, current: true }]
        : [];
    elements.branchSelect.innerHTML = branchOptions
      .map(
        (branch) =>
          `<option value="${escapeHtml(branch.name)}" ${
            branch.name === currentBranchName ? "selected" : ""
          }>${escapeHtml(branch.name)}</option>`
      )
      .join("");

    elements.syncBlock.innerHTML = `
      <span class="sync-item">
        ${icon("arrow-up")}
        <strong>${summary.ahead}</strong>
      </span>
      <span class="sync-item">
        ${icon("arrow-down")}
        <strong>${summary.behind}</strong>
      </span>
      <span class="sync-upstream" title="${escapeHtml(summary.upstream)}">
        ${escapeHtml(summary.upstream || "未设置上游")}
      </span>
    `;

    elements.statusMetrics.innerHTML = `
      <span class="metric"><strong>${summary.counts.staged}</strong><span>暂存</span></span>
      <span class="metric"><strong>${summary.counts.unstaged}</strong><span>未暂存</span></span>
      <span class="metric"><strong>${summary.counts.untracked}</strong><span>未跟踪</span></span>
      ${
        summary.counts.unmerged
          ? `<span class="metric"><strong>${summary.counts.unmerged}</strong><span>冲突</span></span>`
          : ""
      }
    `;
    elements.changesTabCount.textContent = String(summary.counts.total);

    document.querySelectorAll("[data-repo-tab]").forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.repoTab === state.activeTab
      );
    });
    elements.changesView.hidden = state.activeTab !== "changes";
    elements.historyView.hidden = state.activeTab !== "history";

    if (state.activeTab === "changes") {
      renderChanges(summary);
    } else {
      renderHistory(commits);
    }
    renderContextView();
    ensureContextHistory();
    renderBranchList(branches);
    renderStashList(stashes);
    renderRemoteList(remotes);
  }

  function renderChanges(summary) {
    const entries = collectChangedEntries(summary);
    const availablePaths = new Set(entries.map((entry) => entry.path));
    for (const selectedPath of state.selectedFiles) {
      if (!availablePaths.has(selectedPath)) {
        state.selectedFiles.delete(selectedPath);
      }
    }
    const visibleEntries = entries.filter(
      (entry) =>
        state.fileFilter === "all" ||
        entry.groups.has(state.fileFilter)
    );
    elements.explorerCount.textContent = String(visibleEntries.length);
    elements.fileFilterBar.querySelectorAll("[data-file-filter]").forEach(
      (button) => {
        button.classList.toggle(
          "active",
          button.dataset.fileFilter === state.fileFilter
        );
      }
    );

    const activeEntry = state.selectedFile
      ? entries.find((entry) => entry.path === state.selectedFile.path)
      : null;
    if (activeEntry) {
      const previousSource = state.selectedFile.staged;
      Object.assign(state.selectedFile, activeEntry);
      if (previousSource !== activeEntry.staged && state.previewMode === "diff") {
        state.previewKey = "";
      }
    } else if (entries.length) {
      state.selectedFile = entries[0];
      state.previewKey = "";
      resetEditor();
    } else {
      state.selectedFile = null;
      state.previewKey = "";
      resetEditor();
    }

    renderFileTree(visibleEntries);
    renderPreviewHeader();
    if (state.selectedFile) {
      const previewKey = getPreviewKey();
      if (previewKey !== state.previewKey) {
        loadFilePreview();
      }
    } else {
      state.previewRequest += 1;
      elements.previewPath.textContent = "选择一个文件";
      elements.previewActions.innerHTML = "";
      elements.filePreview.innerHTML = `
        <div class="preview-placeholder">
          ${icon("eye")}
          <strong>${entries.length ? "没有符合筛选条件的文件" : "工作区是干净的"}</strong>
          <span>${entries.length ? "切换上方筛选条件查看其他改动。" : "当前分支没有未提交文件。"}</span>
        </div>
      `;
    }

    const draft = getDraft();
    if (elements.commitMessage.value !== draft.message) {
      elements.commitMessage.value = draft.message;
    }
    elements.amendCheckbox.checked = draft.amend;
    elements.stagedBadge.textContent = `${summary.counts.staged} 个已暂存`;
    elements.stagedBadge.classList.toggle("empty", summary.counts.staged === 0);
    updateComposerState();
  }

  function collectChangedEntries(summary) {
    const entries = new Map();
    const add = (file, group) => {
      let entry = entries.get(file.path);
      if (!entry) {
        entry = {
          path: file.path,
          originalPath: file.originalPath || "",
          groups: new Set(),
          files: {}
        };
        entries.set(file.path, entry);
      }
      entry.groups.add(group);
      entry.files[group] = file;
    };

    summary.staged.forEach((file) => add(file, "staged"));
    summary.unstaged.forEach((file) => add(file, "unstaged"));
    summary.untracked.forEach((file) => add(file, "untracked"));
    summary.unmerged.forEach((file) => add(file, "unmerged"));

    return [...entries.values()]
      .map((entry) => {
        const primaryGroup = entry.groups.has("unmerged")
          ? "unmerged"
          : entry.groups.has("untracked")
            ? "untracked"
            : entry.groups.has("unstaged")
              ? "unstaged"
              : "staged";
        return {
          ...entry,
          primaryGroup,
          file: entry.files[primaryGroup],
          staged:
            entry.groups.has("staged") &&
            !entry.groups.has("unstaged") &&
            !entry.groups.has("untracked")
        };
      })
      .sort((left, right) =>
        left.path.localeCompare(right.path, "zh-CN")
      );
  }

  function renderFileTree(entries) {
    updateFileViewToggle();
    updateBatchSelectionUi(entries);
    if (!entries.length) {
      elements.fileGroups.innerHTML = `
        <div class="group-empty">
          ${icon("search")}
          <span>没有符合当前筛选条件的文件</span>
        </div>
      `;
      return;
    }

    if (state.fileTreeMode === "flat") {
      elements.fileGroups.innerHTML = renderFlatFileList(entries);
      return;
    }

    const root = { directories: new Map(), files: [] };
    for (const entry of entries) {
      const segments = entry.path.split("/");
      let node = root;
      let folderPath = "";
      for (let index = 0; index < segments.length - 1; index += 1) {
        const segment = segments[index];
        folderPath = folderPath ? `${folderPath}/${segment}` : segment;
        if (!node.directories.has(segment)) {
          node.directories.set(segment, {
            directories: new Map(),
            files: []
          });
        }
        node = node.directories.get(segment);
      }
      node.files.push(entry);
    }
    elements.fileGroups.innerHTML = renderTreeNode(root, 0, "");
  }

  function updateFileViewToggle() {
    const flat = state.fileTreeMode === "flat";
    const nextMode = flat ? "文件夹视图" : "平铺视图";
    elements.fileTreeTitle.textContent = flat ? "文件列表" : "目录树";
    elements.fileViewToggle.innerHTML = `
      ${icon(flat ? "list" : "folder")}
      <span>${flat ? "平铺" : "文件夹"}</span>
    `;
    elements.fileViewToggle.title = `切换为${nextMode}`;
    elements.fileViewToggle.setAttribute(
      "aria-label",
      `切换为${nextMode}`
    );
  }

  function renderFlatFileList(entries) {
    return [...entries]
      .sort((left, right) =>
        left.path.localeCompare(right.path, "zh-CN")
      )
      .map((entry) => {
        const status = fileStatus(entry.file, entry.primaryGroup);
        const batchSelected = state.selectedFiles.has(entry.path);
        const note =
          entry.groups.size > 1
            ? "暂存 + 工作区"
            : entry.groups.has("staged")
              ? "已暂存"
              : entry.groups.has("untracked")
                ? "未跟踪"
                : "工作区";
        return `
          <div
            class="tree-file-row flat-file-row ${
              state.selectedFile?.path === entry.path ? "selected" : ""
            }"
            title="${escapeHtml(entry.path)}"
          >
            <button
              class="tree-file-check ${batchSelected ? "checked" : ""}"
              type="button"
              data-file-select="${escapeHtml(entry.path)}"
              aria-label="${batchSelected ? "取消选择" : "选择"} ${escapeHtml(entry.path)}"
              aria-pressed="${batchSelected}"
            >${batchSelected ? icon("check") : ""}</button>
            <button
              class="tree-file-open"
              type="button"
              data-preview-file="${escapeHtml(entry.path)}"
            >
              <span
                class="file-status ${status.className}"
                title="${escapeHtml(status.label)}"
                aria-label="${escapeHtml(status.label)}"
              >${escapeHtml(status.letter)}</span>
              <span class="flat-file-path">${escapeHtml(entry.path)}</span>
              <span class="tree-file-note">${escapeHtml(note)}</span>
            </button>
          </div>
        `;
      })
      .join("");
  }

  function updateBatchSelectionUi(visibleEntries) {
    const selectedCount = state.selectedFiles.size;
    const allVisibleSelected =
      visibleEntries.length > 0 &&
      visibleEntries.every((entry) => state.selectedFiles.has(entry.path));
    elements.batchSelectionCount.textContent = `已选 ${selectedCount}`;
    elements.batchStageButton.disabled =
      selectedCount === 0 || state.batchBusy;
    elements.batchDiscardButton.disabled =
      selectedCount === 0 || state.batchBusy;
    const selectAllButton = document.querySelector("[data-file-select-all]");
    if (selectAllButton) {
      selectAllButton.textContent = allVisibleSelected
        ? "取消全选"
        : "全选当前";
      selectAllButton.disabled = visibleEntries.length === 0 || state.batchBusy;
    }
  }

  function renderTreeNode(node, depth, parentPath) {
    const folders = [...node.directories.entries()].sort((left, right) =>
      left[0].localeCompare(right[0], "zh-CN")
    );
    const files = node.files.sort((left, right) =>
      left.path.localeCompare(right.path, "zh-CN")
    );
    const folderHtml = folders
      .map(([name, child]) => {
        const folderPath = parentPath ? `${parentPath}/${name}` : name;
        const collapsed = state.collapsedFolders.has(folderPath);
        return `
          <button
            class="tree-folder-row ${collapsed ? "collapsed" : ""}"
            type="button"
            data-tree-folder="${escapeHtml(folderPath)}"
            style="--tree-depth:${depth}"
            title="${escapeHtml(folderPath)}"
          >
            ${icon("chevron-down", "tree-chevron")}
            ${icon("folder", "tree-folder-icon")}
            <span class="tree-folder-name">${escapeHtml(name)}</span>
            <span class="tree-folder-count">${countTreeFiles(child)}</span>
          </button>
          <div class="tree-folder-children" ${collapsed ? "hidden" : ""}>
            ${renderTreeNode(child, depth + 1, folderPath)}
          </div>
        `;
      })
      .join("");
    const fileHtml = files
      .map((entry) => {
        const status = fileStatus(entry.file, entry.primaryGroup);
        const name = entry.path.split("/").pop();
        const note =
          entry.groups.size > 1
            ? "暂存 + 工作区"
            : entry.groups.has("staged")
              ? "已暂存"
              : entry.groups.has("untracked")
                ? "未跟踪"
                : "工作区";
        const batchSelected = state.selectedFiles.has(entry.path);
        return `
          <div
            class="tree-file-row ${
              state.selectedFile?.path === entry.path ? "selected" : ""
            }"
            style="--tree-depth:${depth}"
            title="${escapeHtml(entry.path)}"
          >
            <button
              class="tree-file-check ${batchSelected ? "checked" : ""}"
              type="button"
              data-file-select="${escapeHtml(entry.path)}"
              aria-label="${batchSelected ? "取消选择" : "选择"} ${escapeHtml(entry.path)}"
              aria-pressed="${batchSelected}"
            >${batchSelected ? icon("check") : ""}</button>
            <button
              class="tree-file-open"
              type="button"
              data-preview-file="${escapeHtml(entry.path)}"
            >
              <span
                class="file-status ${status.className}"
                title="${escapeHtml(status.label)}"
                aria-label="${escapeHtml(status.label)}"
              >${escapeHtml(status.letter)}</span>
              <span class="tree-file-name">${escapeHtml(name)}</span>
              <span class="tree-file-note">${escapeHtml(note)}</span>
            </button>
          </div>
        `;
      })
      .join("");
    return folderHtml + fileHtml;
  }

  function countTreeFiles(node) {
    let count = node.files.length;
    for (const child of node.directories.values()) {
      count += countTreeFiles(child);
    }
    return count;
  }

  function renderPreviewHeader() {
    const selected = state.selectedFile;
    elements.previewPath.textContent = selected?.path || "选择一个文件";
    document.querySelectorAll("[data-preview-mode]").forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.previewMode === state.previewMode
      );
      button.disabled = !selected;
    });

    if (!selected) {
      elements.previewActions.innerHTML = "";
      return;
    }

    const status = fileStatus(selected.file, selected.primaryGroup);
    const stageButton = selected.groups.has("staged")
      ? `
        <button class="button button-quiet" type="button" data-preview-action="unstageFile">
          ${icon("minus")}取消暂存
        </button>
      `
      : `
        <button class="button button-quiet" type="button" data-preview-action="stageFile">
          ${icon("plus")}暂存文件
        </button>
      `;
    const discardButton =
      selected.groups.has("unstaged") || selected.groups.has("untracked")
        ? `
          <button class="button button-quiet" type="button" data-preview-action="discardFile">
            ${icon("undo")}还原
          </button>
        `
        : "";
    const editActions =
      state.previewMode === "edit"
        ? `
          <button class="button button-secondary" type="button" data-preview-action="revertEditor">
            放弃修改
          </button>
          <button class="button button-primary" type="button" data-preview-action="saveEditor">
            ${icon("save")}保存 Ctrl+S
          </button>
        `
        : `
          <button class="button button-primary" type="button" data-preview-action="edit">
            ${icon("pencil")}编辑文件
          </button>
        `;
    elements.previewActions.innerHTML = `
      <span
        class="file-status ${status.className}"
        title="${escapeHtml(status.label)}"
        aria-label="${escapeHtml(status.label)}"
      >${escapeHtml(status.letter)}</span>
      ${stageButton}
      ${discardButton}
      <span class="preview-status ${
        state.editor.dirty ? "dirty" : ""
      }" data-preview-status>
        ${
          state.previewLoading
            ? "读取中"
            : state.editor.dirty
              ? "有未保存修改"
              : selected.groups.has("untracked")
                ? "未跟踪文件"
                : selected.groups.has("staged") && !selected.groups.has("unstaged")
                  ? "已暂存差异"
                  : "工作区差异"
        }
      </span>
      ${editActions}
    `;
  }

  function getPreviewKey() {
    const selected = state.selectedFile;
    if (!selected) {
      return "";
    }
    return `${state.selectedId}|${selected.path}|${selected.staged ? "staged" : "worktree"}|${state.previewMode}`;
  }

  async function loadFilePreview(force = false) {
    const selected = state.selectedFile;
    if (!selected) {
      return;
    }
    const key = getPreviewKey();
    if (!force && key === state.previewKey && !state.previewLoading) {
      return;
    }
    state.previewKey = key;
    state.previewLoading = true;
    const requestId = ++state.previewRequest;
    elements.filePreview.innerHTML = `
      <div class="preview-loading">
        <div class="spinner"></div>
        <span>正在读取文件</span>
      </div>
    `;
    renderPreviewHeader();

    try {
      if (state.previewMode === "edit") {
        const file = await api(
          `/api/repositories/${state.selectedId}/file?path=${encodeURIComponent(
            selected.path
          )}`
        );
        if (requestId !== state.previewRequest) {
          return;
        }
        state.editor.content = file.content;
        state.editor.originalContent = file.content;
        state.editor.hash = file.hash;
        state.editor.lineEnding = file.lineEnding;
        state.editor.dirty = false;
        renderEditor();
      } else {
        const result = await api(
          `/api/repositories/${state.selectedId}/diff?path=${encodeURIComponent(
            selected.path
          )}&staged=${selected.staged ? "1" : "0"}`
        );
        if (requestId !== state.previewRequest) {
          return;
        }
        elements.filePreview.innerHTML = `<pre class="diff-view">${renderDiff(
          result.diff
        )}</pre>`;
      }
    } catch (error) {
      if (requestId === state.previewRequest) {
        elements.filePreview.innerHTML = `
          <div class="preview-error">
            ${icon("alert")}
            <strong>无法读取文件</strong>
            <span>${escapeHtml(error.message)}</span>
          </div>
        `;
      }
    } finally {
      if (requestId === state.previewRequest) {
        state.previewLoading = false;
        renderPreviewHeader();
      }
    }
  }

  function renderEditor() {
    elements.filePreview.innerHTML = `
      <div class="editor-shell">
        <div class="editor-toolbar">
          <span>UTF-8</span>
          <span>${state.editor.lineEnding === "\r\n" ? "CRLF" : "LF"}</span>
          <span data-editor-lines>${countEditorLines(state.editor.content)} 行</span>
          <span class="editor-dirty" data-editor-dirty>
            ${state.editor.dirty ? "未保存" : "已保存"}
          </span>
        </div>
        <textarea
          class="code-editor"
          id="codeEditor"
          spellcheck="false"
          aria-label="编辑 ${escapeHtml(state.selectedFile?.path || "文件")}"
        ></textarea>
      </div>
    `;
    const editor = document.getElementById("codeEditor");
    editor.value = state.editor.content;
    editor.focus();
    editor.setSelectionRange(0, 0);
    renderPreviewHeader();
  }

  function handleEditorInput(event) {
    if (event.target.id !== "codeEditor") {
      return;
    }
    state.editor.content = event.target.value;
    state.editor.dirty =
      state.editor.content !== state.editor.originalContent;
    const dirtyLabel = elements.filePreview.querySelector("[data-editor-dirty]");
    const lineLabel = elements.filePreview.querySelector("[data-editor-lines]");
    if (dirtyLabel) {
      dirtyLabel.textContent = state.editor.dirty ? "未保存" : "已保存";
    }
    if (lineLabel) {
      lineLabel.textContent = `${countEditorLines(state.editor.content)} 行`;
    }
    updatePreviewStatus();
  }

  function updatePreviewStatus() {
    const status = elements.previewActions.querySelector("[data-preview-status]");
    if (status) {
      status.textContent = state.editor.dirty ? "有未保存修改" : "文件已保存";
      status.classList.toggle("dirty", state.editor.dirty);
    }
  }

  function countEditorLines(content) {
    return content ? content.split("\n").length : 1;
  }

  async function saveEditor() {
    if (!state.selectedFile || state.previewMode !== "edit") {
      return;
    }
    if (!state.editor.dirty) {
      showToast("没有需要保存的修改", "编辑器内容与磁盘文件一致。", "warning");
      return;
    }
    const saveButton = elements.previewActions.querySelector(
      '[data-preview-action="saveEditor"]'
    );
    if (saveButton) {
      saveButton.disabled = true;
    }
    try {
      const result = await api(
        `/api/repositories/${state.selectedId}/file`,
        {
          method: "POST",
          body: {
            path: state.selectedFile.path,
            content: state.editor.content,
            expectedHash: state.editor.hash,
            lineEnding: state.editor.lineEnding
          }
        }
      );
      state.editor.hash = result.hash;
      state.editor.originalContent = state.editor.content;
      state.editor.dirty = false;
      state.previewKey = getPreviewKey();
      if (state.detail) {
        state.detail.summary = result.summary;
      }
      state.summaries.set(state.selectedId, result.summary);
      renderFileTree(
        collectChangedEntries(result.summary).filter(
          (entry) =>
            state.fileFilter === "all" ||
            entry.groups.has(state.fileFilter)
        )
      );
      renderPreviewHeader();
      updatePreviewStatus();
      renderGlobalSummary();
      renderRepoList();
      showToast("文件已保存", state.selectedFile.path, "success");
    } catch (error) {
      showToast("保存失败", error.message, "error");
    } finally {
      renderPreviewHeader();
    }
  }

  function revertEditorChanges() {
    state.editor.content = state.editor.originalContent;
    state.editor.dirty = false;
    renderEditor();
    showToast("已恢复", "未保存的编辑已撤销。", "success");
  }

  function resetEditor() {
    state.editor.content = "";
    state.editor.originalContent = "";
    state.editor.hash = "";
    state.editor.lineEnding = "\n";
    state.editor.dirty = false;
  }

  function requestPreviewFile(filePath) {
    if (state.editor.dirty && state.selectedFile?.path !== filePath) {
      showConfirm({
        eyebrow: "未保存修改",
        title: "切换文件并放弃编辑？",
        message: `当前文件 <strong>${escapeHtml(
          state.selectedFile?.path || ""
        )}</strong> 有未保存修改。继续切换会丢弃这些修改。`,
        confirmLabel: "放弃并切换",
        danger: true,
        onConfirm: () => {
          state.editor.dirty = false;
          state.previewMode = "diff";
          state.selectedFile = { path: filePath, staged: false };
          state.previewKey = "";
          renderChanges(state.detail.summary);
        }
      });
      return;
    }
    const entry = collectChangedEntries(state.detail.summary).find(
      (item) => item.path === filePath
    );
    if (!entry) {
      return;
    }
    state.selectedFile = entry;
    state.previewMode = "diff";
    state.previewKey = "";
    resetEditor();
    renderChanges(state.detail.summary);
  }

  function requestPreviewMode(mode) {
    if (!state.selectedFile || state.previewMode === mode) {
      return;
    }
    if (mode === "diff" && state.editor.dirty) {
      showConfirm({
        eyebrow: "未保存修改",
        title: "查看差异并放弃编辑？",
        message: `当前文件 <strong>${escapeHtml(
          state.selectedFile.path
        )}</strong> 有未保存修改。继续会丢弃这些修改。`,
        confirmLabel: "放弃并查看差异",
        danger: true,
        onConfirm: () => {
          state.editor.dirty = false;
          state.previewMode = "diff";
          state.previewKey = "";
          renderChanges(state.detail.summary);
        }
      });
      return;
    }
    state.previewMode = mode;
    state.previewKey = "";
    state.previewRequest += 1;
    renderPreviewHeader();
    renderChanges(state.detail.summary);
  }

  function handlePreviewAction(action) {
    if (!state.selectedFile) {
      return;
    }
    if (action === "edit") {
      requestPreviewMode("edit");
      return;
    }
    if (action === "saveEditor") {
      saveEditor();
      return;
    }
    if (action === "revertEditor") {
      if (state.editor.dirty) {
        revertEditorChanges();
      }
      return;
    }
    if (action === "discardFile") {
      requestFileAction(action, { path: state.selectedFile.path });
      return;
    }
    if (action === "stageFile" || action === "unstageFile") {
      if (state.editor.dirty) {
        showToast("请先保存文件", "暂存会读取磁盘内容，请先保存编辑器修改。", "warning");
        return;
      }
      performRepoAction(state.selectedId, action, {
        path: state.selectedFile.path
      }).catch(() => {});
    }
  }

  async function requestBatchStage() {
    const availablePaths = new Set(
      collectChangedEntries(state.detail.summary).map((entry) => entry.path)
    );
    const paths = [...state.selectedFiles].filter((filePath) =>
      availablePaths.has(filePath)
    );
    if (!paths.length) {
      showToast("没有选择文件", "勾选至少一个需要暂存的文件。", "warning");
      return;
    }
    if (
      state.editor.dirty &&
      paths.includes(state.selectedFile?.path)
    ) {
      showToast("请先保存文件", "暂存会读取磁盘内容，请先保存当前编辑。", "warning");
      return;
    }
    await performRepoAction(state.selectedId, "stageFiles", { paths });
  }

  function requestBatchDiscard() {
    const availablePaths = new Set(
      collectChangedEntries(state.detail.summary).map((entry) => entry.path)
    );
    const paths = [...state.selectedFiles].filter((filePath) =>
      availablePaths.has(filePath)
    );
    if (!paths.length) {
      showToast("没有选择文件", "勾选至少一个需要还原的文件。", "warning");
      return;
    }
    const previewPaths = paths.slice(0, 12);
    showConfirm({
      eyebrow: "批量还原",
      title: `还原选中的 ${paths.length} 个文件？`,
      message:
        "已跟踪文件会恢复为暂存区版本，未跟踪文件会被删除。此操作无法通过 GitDeck 撤销。",
      confirmLabel: `还原 ${paths.length} 个文件`,
      danger: true,
      bodyExtra: `
        <div class="batch-confirm-list">
          ${previewPaths
            .map((filePath) => `<span>${escapeHtml(filePath)}</span>`)
            .join("")}
          ${
            paths.length > previewPaths.length
              ? `<span>…另有 ${paths.length - previewPaths.length} 个文件</span>`
              : ""
          }
        </div>
      `,
      onConfirm: () => performBatchDiscard(paths)
    });
  }

  async function performBatchDiscard(paths) {
    if (state.batchBusy) {
      return;
    }
    state.batchBusy = true;
    updateBatchSelectionUi(
      collectChangedEntries(state.detail.summary).filter(
        (entry) =>
          state.fileFilter === "all" ||
          entry.groups.has(state.fileFilter)
      )
    );
    try {
      const result = await performRepoAction(
        state.selectedId,
        "discardFiles",
        { paths }
      );
      state.selectedFiles.clear();
      if (result && state.detail) {
        renderChanges(state.detail.summary);
      }
    } finally {
      state.batchBusy = false;
      if (state.detail) {
        renderChanges(state.detail.summary);
      }
    }
  }

  function fileStatus(file, group) {
    let letter =
      group === "untracked"
        ? "U"
        : group === "unmerged"
          ? "!"
          : group === "staged"
            ? file.indexStatus
            : file.worktreeStatus;
    if (letter === "." || letter === " " || !letter) {
      letter = "M";
    }
    const classMap = {
      A: "added",
      U: "added",
      D: "deleted",
      M: "modified",
      R: "modified",
      C: "modified",
      "!": "conflict"
    };
    const labelMap = {
      A: "新增",
      U: "未跟踪",
      D: "删除",
      M: "修改",
      R: "重命名",
      C: "复制",
      "!": "冲突"
    };
    return {
      letter,
      className: classMap[letter] || "",
      label: labelMap[letter] || "变更"
    };
  }

  function updateComposerState() {
    if (!state.detail) {
      return;
    }
    const count = state.detail.summary.counts.staged;
    const selectedCount = state.selectedFiles.size;
    const draft = getDraft();
    const canCommit =
      (selectedCount > 0 || count > 0) &&
      Boolean(draft.message.trim() || draft.amend) &&
      !state.editor.dirty;
    const button = document.querySelector('[data-action="commit"]');
    if (button) {
      button.disabled =
        !canCommit || state.busyRepositories.has(state.selectedId);
      const label = button.querySelector("span");
      if (label) {
        label.textContent =
          selectedCount > 0
            ? `提交 ${selectedCount} 个选中文件`
            : "提交到本地";
      }
    }
    elements.composerNote.classList.toggle(
      "warning",
      selectedCount === 0 && count === 0
    );
    if (state.editor.dirty) {
      elements.composerNote.textContent =
        "当前文件有未保存修改，请先保存后再提交。";
    } else if (selectedCount > 0) {
      elements.composerNote.textContent = draft.message.trim() || draft.amend
        ? `提交时会暂存并只提交这 ${selectedCount} 个选中文件。`
        : `已选择 ${selectedCount} 个文件，填写说明后可直接提交。`;
    } else if (count === 0) {
      elements.composerNote.textContent =
        "先暂存文件，或使用上方“全部暂存”，再创建提交。";
    } else if (!draft.message.trim() && !draft.amend) {
      elements.composerNote.textContent = "填写提交说明后即可提交。";
    } else {
      elements.composerNote.textContent = "提交发生在本地，推送由你单独确认。";
    }
  }

  function renderHistory(commits) {
    elements.historyCount.textContent = `${commits.length} 条最近记录`;
    if (!commits.length) {
      elements.commitTimeline.innerHTML = `
        <div class="workspace-clean">
          <span class="clean-icon">${icon("history")}</span>
          <strong>还没有提交历史</strong>
          <span>完成第一次提交后会显示在这里</span>
        </div>
      `;
      return;
    }

    elements.commitTimeline.innerHTML = commits
      .map(
        (commit) => `
          <article class="commit-row">
            <div class="commit-graph"><span class="commit-dot"></span></div>
            <div class="commit-main">
              <div class="commit-subject" title="${escapeHtml(commit.subject)}">
                ${escapeHtml(commit.subject)}
              </div>
              <div class="commit-meta">
                <span class="commit-hash">${escapeHtml(commit.shortHash)}</span>
                <span>${escapeHtml(commit.author)}</span>
                <span class="commit-date" title="${escapeHtml(formatDateTime(commit.date))}">
                  ${escapeHtml(formatRelative(commit.date))}
                </span>
              </div>
            </div>
          </article>
        `
      )
      .join("");
  }

  function renderContextPanel() {
    if (!state.detail) {
      elements.contextCommitHistory.innerHTML =
        contextPlaceholder("正在读取提交历史");
      elements.branchList.innerHTML = contextPlaceholder("正在读取仓库信息");
      elements.stashList.innerHTML = contextPlaceholder("正在读取 Stash");
      elements.remoteList.innerHTML = contextPlaceholder("正在读取远端");
    }
  }

  async function ensureContextHistory(force = false) {
    if (!state.selectedId || !state.detail) {
      return;
    }
    const key = `${state.selectedId}:${state.contextHistoryScope}`;
    if (!force && key === state.contextHistoryKey) {
      if (state.contextHistory) {
        renderContextHistory();
      }
      return;
    }

    state.contextHistoryKey = key;
    state.contextHistory = null;
    state.contextHistoryLoading = true;
    const requestId = ++state.contextHistoryRequest;
    renderContextHistory();

    try {
      const result = await api(
        `/api/repositories/${state.selectedId}/history?scope=${
          state.contextHistoryScope
        }&limit=100`
      );
      if (
        requestId !== state.contextHistoryRequest ||
        key !== state.contextHistoryKey
      ) {
        return;
      }
      state.contextHistory = result;
    } catch (error) {
      if (
        requestId !== state.contextHistoryRequest ||
        key !== state.contextHistoryKey
      ) {
        return;
      }
      state.contextHistory = { error: error.message, rows: [] };
    } finally {
      if (
        requestId === state.contextHistoryRequest &&
        key === state.contextHistoryKey
      ) {
        state.contextHistoryLoading = false;
        renderContextHistory();
      }
    }
  }

  function renderContextHistory() {
    const history = state.contextHistory;
    elements.contextHistoryBranch.textContent =
      state.detail?.summary?.branch || "提交历史";
    document.querySelectorAll("[data-history-scope]").forEach((button) => {
      const active = button.dataset.historyScope === state.contextHistoryScope;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    if (state.contextHistoryLoading && !history) {
      elements.contextCommitCount.textContent = "读取中";
      elements.contextCommitHistory.innerHTML = contextPlaceholder(
        "正在读取提交树"
      );
      return;
    }
    if (history?.error) {
      elements.contextCommitCount.textContent = "失败";
      elements.contextCommitHistory.innerHTML = contextPlaceholder(
        history.error
      );
      return;
    }

    const rows = history?.rows || [];
    const commitCount = rows.filter((row) => row.type === "commit").length;
    elements.contextCommitCount.textContent = `${commitCount} 条`;
    if (!commitCount) {
      elements.contextCommitHistory.innerHTML =
        contextPlaceholder("没有提交历史");
      return;
    }

    const graphWidth = Math.max(
      4,
      Math.min(Number(history.maxGraphWidth) || 4, 30)
    );
    elements.contextCommitHistory.innerHTML = rows
      .map((row) => {
        const graph = renderHistoryGraph(row.graph || "");
        if (row.type === "connector") {
          return `
            <div class="context-history-connector" style="--history-graph-width:${graphWidth}ch">
              <span class="context-history-graph">${graph}</span>
            </div>
          `;
        }
        return `
          <article class="context-history-row" style="--history-graph-width:${graphWidth}ch">
            <span class="context-history-graph">${graph}</span>
            <div class="context-history-content">
              <div class="context-history-subject">
                <span class="context-history-subject-text" title="${escapeHtml(
                  row.subject
                )}">${escapeHtml(row.subject)}</span>
                ${renderHistoryDecorations(row.decorations)}
              </div>
              <div class="context-history-meta">
                <span class="commit-hash">${escapeHtml(row.shortHash)}</span>
                <span>${escapeHtml(row.author)}</span>
                <span title="${escapeHtml(formatDateTime(row.date))}">
                  ${escapeHtml(formatRelative(row.date))}
                </span>
              </div>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderHistoryGraph(graph) {
    return [...String(graph || "")]
      .map((character, index) => {
        if (character === " ") {
          return " ";
        }
        const lane = index % 6;
        return `<span class="graph-char lane-${lane}">${escapeHtml(
          character
        )}</span>`;
      })
      .join("");
  }

  function renderHistoryDecorations(rawDecorations) {
    if (!rawDecorations) {
      return "";
    }
    const remoteNames = new Set(
      (state.detail?.remotes || [])
        .filter((remote) => remote.type === "fetch")
        .map((remote) => remote.name)
    );
    return rawDecorations
      .split(", ")
      .filter(Boolean)
      .map((decoration) => {
        let label = decoration;
        let className = "";
        if (decoration.startsWith("HEAD -> ")) {
          label = decoration.slice(8);
          className = "head";
        } else if (decoration === "HEAD") {
          className = "head";
        } else if (decoration.startsWith("tag: ")) {
          label = decoration.slice(5);
          className = "tag";
        } else {
          const remote = [...remoteNames].find((name) =>
            decoration.startsWith(`${name}/`)
          );
          if (remote) {
            className = "remote";
          }
        }
        return `<span class="context-history-decoration ${className}" title="${escapeHtml(
          decoration
        )}">${escapeHtml(label)}</span>`;
      })
      .join("");
  }

  function renderContextView() {
    const historyActive = state.contextView === "history";
    elements.contextHistorySection.hidden = !historyActive;
    elements.branchContextSection.hidden = historyActive;
    document.querySelectorAll("[data-context-view]").forEach((button) => {
      const active = button.dataset.contextView === state.contextView;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll("[data-history-scope]").forEach((button) => {
      const active = button.dataset.historyScope === state.contextHistoryScope;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function renderBranchList(branches) {
    const branchNames = new Set(
      branches
        .filter((branch) => !branch.current)
        .map((branch) => branch.name)
    );
    for (const selectedName of state.branchSelection) {
      if (!branchNames.has(selectedName)) {
        state.branchSelection.delete(selectedName);
      }
    }

    if (!branches.length) {
      updateBranchSelectionUi([]);
      elements.branchList.innerHTML = contextPlaceholder("没有本地分支");
      return;
    }

    const filteredBranches = branches.filter(matchesBranchSearch);
    updateBranchSelectionUi(filteredBranches);
    if (!filteredBranches.length) {
      elements.branchList.innerHTML = `
        <div class="empty-context">
          ${icon("search")}
          <span>没有匹配的分支名或作者</span>
        </div>
      `;
      return;
    }

    elements.branchList.innerHTML = filteredBranches
      .map(
        (branch) => `
          <div
            class="branch-row ${branch.current ? "current" : ""} ${
              state.branchSelection.has(branch.name) ? "selected" : ""
            }"
            ${
              branch.current
                ? ""
                : `data-branch-row="${escapeHtml(branch.name)}"`
            }
          >
            <button
              class="branch-check ${
                state.branchSelection.has(branch.name) ? "checked" : ""
              }"
              type="button"
              data-branch-select="${escapeHtml(branch.name)}"
              aria-label="${
                state.branchSelection.has(branch.name)
                  ? "取消选择"
                  : "选择"
              } ${escapeHtml(branch.name)}"
              aria-pressed="${state.branchSelection.has(branch.name)}"
              ${branch.current ? "disabled" : ""}
            >${
              state.branchSelection.has(branch.name)
                ? icon("check")
                : ""
            }</button>
            ${icon("git-branch")}
            <span class="branch-main">
              <span class="branch-name" title="${escapeHtml(branch.name)}">${escapeHtml(branch.name)}</span>
              <span class="branch-meta" title="${escapeHtml(formatDateTime(branch.date))}">
                ${escapeHtml(formatBranchDate(branch.date))} · ${escapeHtml(branch.author || "未知作者")}
              </span>
            </span>
            ${
              branch.current
                ? '<span class="current-label">当前</span>'
                : `<span class="branch-row-actions">
                    <button type="button" data-branch-action="checkout" data-branch="${escapeHtml(branch.name)}">切换</button>
                    <button type="button" data-branch-action="merge" data-branch="${escapeHtml(branch.name)}">合并</button>
                    <button type="button" data-branch-action="delete" data-branch="${escapeHtml(branch.name)}">删除</button>
                  </span>`
            }
          </div>
        `
      )
      .join("");
  }

  function matchesBranchSearch(branch) {
    if (!state.branchSearch) {
      return true;
    }
    return `${branch.name} ${branch.author || ""}`
      .toLocaleLowerCase("zh-CN")
      .includes(state.branchSearch);
  }

  function updateBranchSelectionUi(branches) {
    const deletable = branches.filter((branch) => !branch.current);
    const selectedCount = state.branchSelection.size;
    const allSelected =
      deletable.length > 0 &&
      deletable.every((branch) => state.branchSelection.has(branch.name));
    elements.branchSelectionCount.textContent = `已选 ${selectedCount}`;
    elements.branchBatchDeleteButton.disabled = selectedCount === 0;
    const selectAllButton = document.querySelector(
      "[data-branch-select-all]"
    );
    if (selectAllButton) {
      selectAllButton.textContent = allSelected
        ? "取消全选"
        : "全选可删";
      selectAllButton.disabled = deletable.length === 0;
    }
  }

  function toggleBranchSelection(branchName) {
    if (!branchName || !state.detail) {
      return;
    }
    if (state.branchSelection.has(branchName)) {
      state.branchSelection.delete(branchName);
    } else {
      state.branchSelection.add(branchName);
    }
    const selected = state.branchSelection.has(branchName);
    const checkbox = Array.from(
      document.querySelectorAll("[data-branch-select]")
    ).find((button) => button.dataset.branchSelect === branchName);
    if (checkbox) {
      checkbox.classList.toggle("checked", selected);
      checkbox.setAttribute("aria-pressed", String(selected));
      checkbox.setAttribute(
        "aria-label",
        `${selected ? "取消选择" : "选择"} ${branchName}`
      );
      checkbox.innerHTML = selected ? icon("check") : "";
    }
    const row = Array.from(document.querySelectorAll("[data-branch-row]")).find(
      (element) => element.dataset.branchRow === branchName
    );
    row?.classList.toggle("selected", selected);
    updateBranchSelectionUi(
      state.detail.branches.filter(matchesBranchSearch)
    );
  }

  function formatBranchDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "时间未知";
    }
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(date);
  }

  function renderStashList(stashes) {
    if (!stashes.length) {
      elements.stashList.innerHTML = contextPlaceholder("没有保存的 Stash");
      return;
    }
    elements.stashList.innerHTML = stashes
      .map(
        (stash) => `
          <div class="stash-row">
            <div class="stash-row-top">
              <span class="stash-ref">${escapeHtml(stash.ref)}</span>
              <button type="button" data-stash-action="pop" data-stash="${escapeHtml(stash.ref)}">恢复</button>
            </div>
            <span class="stash-subject">${escapeHtml(stash.subject)}</span>
          </div>
        `
      )
      .join("");
  }

  function renderRemoteList(remotes) {
    const uniqueRemotes = [];
    const seen = new Set();
    for (const remote of remotes) {
      if (remote.type === "fetch" && !seen.has(remote.name)) {
        seen.add(remote.name);
        uniqueRemotes.push(remote);
      }
    }
    if (!uniqueRemotes.length) {
      elements.remoteList.innerHTML = contextPlaceholder("未配置远端");
      return;
    }
    elements.remoteList.innerHTML = uniqueRemotes
      .map(
        (remote) => `
          <div class="remote-item">
            <span class="remote-name">${icon("git-branch")}${escapeHtml(remote.name)}</span>
            <span class="remote-url" title="${escapeHtml(remote.url)}">${escapeHtml(remote.url)}</span>
          </div>
        `
      )
      .join("");
  }

  function contextPlaceholder(text) {
    return `<div class="empty-context">${icon("clock")}${escapeHtml(text)}</div>`;
  }

  async function refreshAllSummaries({ quiet = false, force = false } = {}) {
    const activeRepositories = getActiveRepositories();
    if (state.refreshing && !force) {
      return;
    }
    if (!activeRepositories.length) {
      render();
      return;
    }

    state.refreshing = true;
    elements.refreshAllButton.disabled = true;
    const results = await Promise.allSettled(
      activeRepositories.map(async (repository) => {
        const response = await api(
          `/api/repositories/${repository.id}/status`
        );
        return { repository, summary: response.summary };
      })
    );

    results.forEach((result, index) => {
      const repository = activeRepositories[index];
      if (result.status === "fulfilled") {
        state.summaries.set(repository.id, result.value.summary);
        state.errors.delete(repository.id);
      } else {
        state.errors.set(repository.id, result.reason.message);
      }
    });

    state.refreshing = false;
    elements.refreshAllButton.disabled = false;
    render();

    if (!quiet) {
      const failed = results.filter((result) => result.status === "rejected");
      if (failed.length) {
        showToast(
          "部分仓库读取失败",
          `${results.length - failed.length} 个仓库已更新，${failed.length} 个不可用。`,
          "warning"
        );
      } else {
        showToast("状态已刷新", `${results.length} 个仓库已更新。`, "success");
      }
    }
  }

  async function selectRepository(id) {
    const repository = state.repositories.find((item) => item.id === id);
    if (!repository) {
      return;
    }

    if (
      repository.workspaceId &&
      repository.workspaceId !== state.activeWorkspaceId
    ) {
      setActiveWorkspace(repository.workspaceId, {
        loadRepository: false
      });
    }
    state.selectedId = id;
    state.activeTab = "changes";
    state.contextView = "history";
    state.contextHistoryScope = "all";
    state.contextHistory = null;
    state.contextHistoryLoading = false;
    state.contextHistoryKey = "";
    state.contextHistoryRequest += 1;
    state.fileFilter = "all";
    state.selectedFiles.clear();
    state.batchBusy = false;
    state.branchSelection.clear();
    state.branchSearch = "";
    elements.branchSearch.value = "";
    state.pendingBranchDeletion = [];
    state.selectedFile = null;
    state.previewMode = "diff";
    state.previewKey = "";
    state.previewRequest += 1;
    state.previewLoading = false;
    state.collapsedFolders.clear();
    resetEditor();
    state.detail = null;
    state.detailLoading = true;
    state.errors.delete(id);
    render();
    await loadRepositoryDetail(id);
  }

  async function loadRepositoryDetail(id) {
    const requestId = ++state.detailRequest;
    try {
      const detail = await api(`/api/repositories/${id}/detail`);
      if (requestId !== state.detailRequest || state.selectedId !== id) {
        return;
      }
      state.detail = detail;
      state.summaries.set(id, detail.summary);
      state.errors.delete(id);
    } catch (error) {
      if (requestId === state.detailRequest && state.selectedId === id) {
        state.errors.set(id, error.message);
      }
    } finally {
      if (requestId === state.detailRequest && state.selectedId === id) {
        state.detailLoading = false;
        state.detail = state.errors.has(id) ? null : state.detail;
        render();
      }
    }
  }

  async function performRepoAction(repoId, action, payload = {}) {
    const repository = state.repositories.find((item) => item.id === repoId);
    if (!repository || state.busyRepositories.has(repoId)) {
      return null;
    }

    state.busyRepositories.add(repoId);
    renderRepoList();
    updateComposerState();
    try {
      const result = await api(`/api/repositories/${repoId}/action`, {
        method: "POST",
        body: { action, ...payload }
      });
      applyActionResult(repoId, result);
      if (action === "commit") {
        state.drafts.delete(repoId);
      }
      if (Array.isArray(result.warnings) && result.warnings.length) {
        showToast(
          "操作部分完成",
          `${result.output || ""}；${result.warnings.join("；")}`,
          "warning"
        );
      } else {
        showToast(
          actionLabels[action] || "操作完成",
          result.output || `${repository.name} 已更新。`,
          "success"
        );
      }
      return result;
    } catch (error) {
      if (error && typeof error === "object") {
        error.alreadyReported = true;
      }
      showToast(
        actionFailureLabels[action] || "Git 操作失败",
        error.message,
        "error"
      );
      throw error;
    } finally {
      state.busyRepositories.delete(repoId);
      renderRepoList();
      updateComposerState();
    }
  }

  function applyActionResult(repoId, result) {
    if (result.summary) {
      state.summaries.set(repoId, result.summary);
      state.errors.delete(repoId);
    }
    if (state.selectedId === repoId) {
      state.contextHistory = null;
      state.contextHistoryKey = "";
      state.contextHistoryRequest += 1;
      state.detail = {
        repository: result.repository,
        summary: result.summary,
        commits: result.commits,
        branches: result.branches,
        stashes: result.stashes,
        remotes: result.remotes
      };
      state.detailLoading = false;
      render();
    }
  }

  function getSelectedRepository() {
    return (
      state.repositories.find(
        (repository) => repository.id === state.selectedId
      ) || null
    );
  }

  function getDraft() {
    return (
      state.drafts.get(state.selectedId) || {
        message: "",
        amend: false
      }
    );
  }

  function saveCurrentDraft(patch) {
    if (!state.selectedId) {
      return;
    }
    const current = getDraft();
    state.drafts.set(state.selectedId, { ...current, ...patch });
  }

  function handleDocumentClick(event) {
    if (!event.target.closest("#contextMenu")) {
      hideContextMenu();
    }
    if (!event.target.closest("#workspacePicker")) {
      closeWorkspaceDropdown();
    }

    const openAdd = event.target.closest("[data-open-add]");
    if (openAdd) {
      openAddRepositoryModal();
      return;
    }

    const closeToast = event.target.closest("[data-close-toast]");
    if (closeToast) {
      closeToast.closest(".toast")?.remove();
      return;
    }

    const bulkClear = event.target.closest("[data-bulk-clear]");
    if (bulkClear) {
      state.selectedIds.clear();
      renderRepoList();
      return;
    }

    const bulkAction = event.target.closest("[data-bulk-action]");
    if (bulkAction) {
      requestBulkAction(bulkAction.dataset.bulkAction);
      return;
    }

    const bulkRemove = event.target.closest("[data-bulk-remove]");
    if (bulkRemove) {
      requestBulkRemoveRepositories();
      return;
    }

    const repoMenuButton = event.target.closest("[data-repo-menu]");
    if (repoMenuButton) {
      event.stopPropagation();
      openRepoMenu(repoMenuButton.dataset.repoMenu, repoMenuButton);
      return;
    }

    const toggleRepo = event.target.closest("[data-toggle-repo]");
    if (toggleRepo) {
      event.stopPropagation();
      toggleBulkRepository(toggleRepo.dataset.toggleRepo);
      return;
    }

    const repoAction = event.target.closest("[data-repo-action]");
    if (repoAction) {
      requestRepoAction(repoAction.dataset.repoAction);
      return;
    }

    const repoTab = event.target.closest("[data-repo-tab]");
    if (repoTab) {
      state.activeTab = repoTab.dataset.repoTab;
      renderRepositoryView();
      return;
    }

    const fileFilter = event.target.closest("[data-file-filter]");
    if (fileFilter) {
      state.fileFilter = fileFilter.dataset.fileFilter;
      renderChanges(state.detail.summary);
      return;
    }

    const fileSelect = event.target.closest("[data-file-select]");
    if (fileSelect) {
      const filePath = fileSelect.dataset.fileSelect;
      if (state.selectedFiles.has(filePath)) {
        state.selectedFiles.delete(filePath);
      } else {
        state.selectedFiles.add(filePath);
      }
      const batchSelected = state.selectedFiles.has(filePath);
      fileSelect.classList.toggle("checked", batchSelected);
      fileSelect.setAttribute("aria-pressed", String(batchSelected));
      fileSelect.setAttribute(
        "aria-label",
        `${batchSelected ? "取消选择" : "选择"} ${filePath}`
      );
      fileSelect.innerHTML = batchSelected ? icon("check") : "";
      updateBatchSelectionUi(
        collectChangedEntries(state.detail.summary).filter(
          (entry) =>
            state.fileFilter === "all" ||
            entry.groups.has(state.fileFilter)
        )
      );
      updateComposerState();
      return;
    }

    const selectAllFiles = event.target.closest("[data-file-select-all]");
    if (selectAllFiles) {
      const visibleEntries = collectChangedEntries(state.detail.summary).filter(
        (entry) =>
          state.fileFilter === "all" ||
          entry.groups.has(state.fileFilter)
      );
      const allSelected = visibleEntries.every((entry) =>
        state.selectedFiles.has(entry.path)
      );
      for (const entry of visibleEntries) {
        if (allSelected) {
          state.selectedFiles.delete(entry.path);
        } else {
          state.selectedFiles.add(entry.path);
        }
      }
      renderFileTree(visibleEntries);
      updateComposerState();
      return;
    }

    const batchDiscard = event.target.closest("[data-batch-discard]");
    if (batchDiscard) {
      requestBatchDiscard();
      return;
    }

    const batchStage = event.target.closest("[data-batch-stage]");
    if (batchStage) {
      requestBatchStage();
      return;
    }

    const treeFolder = event.target.closest("[data-tree-folder]");
    if (treeFolder) {
      const folderPath = treeFolder.dataset.treeFolder;
      if (state.collapsedFolders.has(folderPath)) {
        state.collapsedFolders.delete(folderPath);
      } else {
        state.collapsedFolders.add(folderPath);
      }
      renderFileTree(
        collectChangedEntries(state.detail.summary).filter(
          (entry) =>
            state.fileFilter === "all" ||
            entry.groups.has(state.fileFilter)
        )
      );
      return;
    }

    const previewFile = event.target.closest("[data-preview-file]");
    if (previewFile) {
      requestPreviewFile(previewFile.dataset.previewFile);
      return;
    }

    const previewMode = event.target.closest("[data-preview-mode]");
    if (previewMode) {
      requestPreviewMode(previewMode.dataset.previewMode);
      return;
    }

    const previewAction = event.target.closest("[data-preview-action]");
    if (previewAction) {
      handlePreviewAction(previewAction.dataset.previewAction);
      return;
    }

    const fileAction = event.target.closest("[data-file-action]");
    if (fileAction) {
      requestFileAction(fileAction.dataset.fileAction, fileAction.dataset);
      return;
    }

    const contextViewButton = event.target.closest("[data-context-view]");
    if (contextViewButton) {
      state.contextView = contextViewButton.dataset.contextView;
      renderContextView();
      return;
    }

    const historyScopeButton = event.target.closest("[data-history-scope]");
    if (historyScopeButton) {
      const scope = historyScopeButton.dataset.historyScope;
      if (scope !== state.contextHistoryScope) {
        state.contextHistoryScope = scope;
        state.contextHistory = null;
        state.contextHistoryKey = "";
        state.contextHistoryRequest += 1;
        state.contextHistoryLoading = true;
        renderContextHistory();
        ensureContextHistory(true);
      }
      return;
    }

    const branchSelect = event.target.closest("[data-branch-select]");
    if (branchSelect) {
      toggleBranchSelection(branchSelect.dataset.branchSelect);
      return;
    }

    const selectAllBranches = event.target.closest(
      "[data-branch-select-all]"
    );
    if (selectAllBranches) {
      if (!state.detail) {
        return;
      }
      const deletable = state.detail.branches.filter(
        (branch) => !branch.current && matchesBranchSearch(branch)
      );
      const allSelected = deletable.every((branch) =>
        state.branchSelection.has(branch.name)
      );
      for (const branch of deletable) {
        if (allSelected) {
          state.branchSelection.delete(branch.name);
        } else {
          state.branchSelection.add(branch.name);
        }
      }
      renderBranchList(state.detail.branches);
      return;
    }

    const batchDeleteBranches = event.target.closest(
      "[data-branch-batch-delete]"
    );
    if (batchDeleteBranches) {
      if (!state.detail) {
        return;
      }
      const branches = state.detail.branches.filter((branch) =>
        state.branchSelection.has(branch.name)
      );
      openDeleteBranchesModal(branches);
      return;
    }

    const branchAction = event.target.closest("[data-branch-action]");
    if (branchAction) {
      requestBranchAction(
        branchAction.dataset.branchAction,
        branchAction.dataset.branch
      );
      return;
    }

    const branchRow = event.target.closest("[data-branch-row]");
    if (branchRow) {
      toggleBranchSelection(branchRow.dataset.branchRow);
      return;
    }

    const stashAction = event.target.closest("[data-stash-action]");
    if (stashAction) {
      requestStashAction(
        stashAction.dataset.stashAction,
        stashAction.dataset.stash
      );
      return;
    }

    const workspaceSwitch = event.target.closest("[data-workspace-switch]");
    if (workspaceSwitch) {
      closeModal();
      setActiveWorkspace(workspaceSwitch.dataset.workspaceSwitch);
      return;
    }

    const workspaceRename = event.target.closest("[data-workspace-rename]");
    if (workspaceRename) {
      const workspace = state.workspaces.find(
        (item) => item.id === workspaceRename.dataset.workspaceRename
      );
      if (workspace) {
        openWorkspaceNameModal("rename", workspace);
      }
      return;
    }

    const workspaceDelete = event.target.closest("[data-workspace-delete]");
    if (workspaceDelete) {
      requestDeleteWorkspace(workspaceDelete.dataset.workspaceDelete);
      return;
    }

    const workspaceMove = event.target.closest("[data-workspace-move]");
    if (workspaceMove) {
      moveRepositoryToWorkspace(
        state.moveRepositoryId,
        workspaceMove.dataset.workspaceMove
      );
      return;
    }

    const action = event.target.closest("[data-action]");
    if (action) {
      handleNamedAction(action.dataset.action);
      return;
    }

    const directoryAction = event.target.closest("[data-directory-action]");
    if (directoryAction) {
      handleDirectoryAction(directoryAction);
      return;
    }

    const modalAction = event.target.closest("[data-modal-action]");
    if (modalAction) {
      handleModalAction(modalAction);
      return;
    }

    const repositoryRow = event.target.closest("[data-open-repo]");
    if (repositoryRow && !event.target.closest("button")) {
      if (Date.now() < state.suppressRepoClickUntil) {
        return;
      }
      selectRepository(repositoryRow.dataset.openRepo);
    }
  }

  function handleContextMenu(event) {
    const repositoryRow = event.target.closest("[data-open-repo]");
    if (!repositoryRow) {
      return;
    }
    event.preventDefault();
    openRepoMenu(repositoryRow.dataset.openRepo, {
      left: event.clientX,
      top: event.clientY
    });
  }

  function handleKeydown(event) {
    const target = event.target;
    const isTyping =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement;

    if (event.key === "Escape") {
      if (!elements.directoryPickerBackdrop.hidden) {
        closeDirectoryPicker();
      } else if (!elements.modalBackdrop.hidden) {
        closeModal();
      } else if (!elements.workspaceDropdown.hidden) {
        closeWorkspaceDropdown();
      } else {
        hideContextMenu();
      }
      return;
    }

    if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === "s" &&
      state.previewMode === "edit"
    ) {
      event.preventDefault();
      saveEditor();
      return;
    }

    if (
      event.key === "Tab" &&
      target instanceof HTMLTextAreaElement &&
      target.id === "codeEditor"
    ) {
      event.preventDefault();
      const start = target.selectionStart;
      const end = target.selectionEnd;
      target.setRangeText("  ", start, end, "end");
      target.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    if (
      event.key === "Enter" &&
      target instanceof HTMLInputElement &&
      target.id === "directoryPathInput"
    ) {
      event.preventDefault();
      loadDirectory(target.value);
      return;
    }

    if (event.key === "/" && !isTyping && elements.modalBackdrop.hidden) {
      event.preventDefault();
      elements.repoSearch.focus();
      elements.repoSearch.select();
      return;
    }

    if (
      event.key === "Enter" &&
      (event.ctrlKey || event.metaKey) &&
      state.activeTab === "changes" &&
      state.detail
    ) {
      event.preventDefault();
      submitCommit();
      return;
    }

    if (
      (event.key === "Enter" || event.key === " ") &&
      !isTyping &&
      target.matches("[data-open-repo]")
    ) {
      event.preventDefault();
      selectRepository(target.dataset.openRepo);
    }
  }

  function requestRepoAction(action) {
    if (!state.selectedId) {
      return;
    }
    if (action === "pull" || action === "push") {
      const repository = getSelectedRepository();
      const summary = state.detail?.summary;
      showConfirm({
        eyebrow: action === "pull" ? "同步远端" : "发布提交",
        title: action === "pull" ? "拉取当前分支？" : "推送当前分支？",
        message:
          action === "pull"
            ? `将以快进方式拉取 <strong>${escapeHtml(summary?.upstream || summary?.branch || "当前分支")}</strong>。如果本地已有分叉提交，操作会停止并提示你。`
            : `将把 <strong>${escapeHtml(repository?.name || "")}</strong> 的 <strong>${escapeHtml(summary?.branch || "当前分支")}</strong> 推送到远端。`,
        confirmLabel: action === "pull" ? "确认拉取" : "确认推送",
        onConfirm: () => performRepoAction(state.selectedId, action)
      });
      return;
    }
    performRepoAction(state.selectedId, action).catch(() => {});
  }

  function requestFileAction(action, dataset) {
    const filePath = dataset.path;
    if (action === "diff") {
      openDiffModal(filePath, dataset.staged === "1");
      return;
    }
    if (action === "discardFile") {
      showConfirm({
        eyebrow: "还原文件",
        title: "放弃这个文件的改动？",
        message: `将还原 <strong>${escapeHtml(filePath)}</strong>。未跟踪文件会被删除，此操作无法通过 GitDeck 撤销。`,
        confirmLabel: "还原改动",
        danger: true,
        onConfirm: () =>
          performRepoAction(state.selectedId, "discardFile", {
            path: filePath
          })
      });
      return;
    }
    performRepoAction(state.selectedId, action, { path: filePath }).catch(
      () => {}
    );
  }

  function requestBranchAction(action, branchName) {
    if (action === "checkout") {
      showConfirm({
        eyebrow: "切换分支",
        title: "切换到这个分支？",
        message: `即将切换到 <strong>${escapeHtml(branchName)}</strong>。`,
        confirmLabel: "切换",
        onConfirm: () =>
          performRepoAction(state.selectedId, "checkoutBranch", {
            name: branchName
          })
      });
      return;
    }
    if (action === "merge") {
      showConfirm({
        eyebrow: "合并分支",
        title: "把分支合并到当前分支？",
        message: `将把 <strong>${escapeHtml(branchName)}</strong> 合并到当前分支。如果出现冲突，Git 会保留冲突标记。`,
        confirmLabel: "开始合并",
        onConfirm: () =>
          performRepoAction(state.selectedId, "mergeBranch", {
            name: branchName
          })
      });
      return;
    }
    if (action === "delete") {
      const branch = state.detail.branches.find(
        (item) => item.name === branchName
      );
      if (branch) {
        openDeleteBranchesModal([branch]);
      }
    }
  }

  function openDeleteBranchesModal(branches) {
    const deletableBranches = branches.filter(
      (branch) => branch && !branch.current
    );
    if (!deletableBranches.length) {
      showToast("没有可删除的分支", "当前分支不能删除。", "warning");
      return;
    }
    state.pendingBranchDeletion = deletableBranches;
    const remoteBranches = deletableBranches.filter(
      (branch) => branch.remoteTarget
    );
    const branchRows = deletableBranches
      .map(
        (branch) => `
          <div class="branch-delete-row">
            <span class="branch-delete-name">${escapeHtml(branch.name)}</span>
            <span class="branch-delete-meta">
              ${escapeHtml(formatBranchDate(branch.date))} · ${escapeHtml(branch.author || "未知作者")}
            </span>
            <span class="branch-delete-remote">
              ${
                branch.remoteTarget
                  ? `${escapeHtml(branch.remoteTarget.remote)}/${escapeHtml(branch.remoteTarget.branch)}`
                  : "无匹配远程分支"
              }
            </span>
          </div>
        `
      )
      .join("");

    openModal({
      eyebrow: "分支管理",
      title:
        deletableBranches.length === 1
          ? `删除分支 ${deletableBranches[0].name}？`
          : `删除 ${deletableBranches.length} 个本地分支？`,
      body: `
        <p class="confirm-copy">
          本地分支会使用安全删除，Git 会拒绝删除尚未合并的分支。
        </p>
        <div class="branch-delete-list">${branchRows}</div>
        <label class="branch-force-option">
          <input type="checkbox" id="forceDeleteBranches" />
          <span>
            <strong>强制删除未合并分支（-D）</strong>
            <small>勾选后会丢失本地分支上尚未合并的提交，请确认分支内容不再需要。</small>
          </span>
        </label>
        <label class="branch-remote-option ${
          remoteBranches.length ? "" : "disabled"
        }">
          <input
            type="checkbox"
            id="deleteRemoteBranches"
            ${remoteBranches.length ? "" : "disabled"}
          />
          <span>
            <strong>同时删除远程分支</strong>
            <small>${
              remoteBranches.length
                ? `将删除 ${remoteBranches.length} 个匹配的远程引用`
                : "没有找到匹配的远程分支"
            }</small>
          </span>
        </label>
        <div class="danger-callout">
          ${icon("alert")}
          <span>分支删除无法通过 GitDeck 撤销。远程删除需要有效的远端认证。</span>
        </div>
      `,
      footer: `
        <button class="button button-quiet" type="button" data-action="close-modal">取消</button>
        <button class="button button-danger" type="button" data-modal-action="delete-branches">
          ${icon("trash")}确认删除
        </button>
      `
    });
    state.modalType = "delete-branches";
  }

  async function deleteSelectedBranches(button) {
    const deleteRemoteInput = document.getElementById(
      "deleteRemoteBranches"
    );
    const deleteRemote =
      Boolean(deleteRemoteInput?.checked) &&
      !deleteRemoteInput?.disabled;
    const forceDelete = Boolean(
      document.getElementById("forceDeleteBranches")?.checked
    );
    const branches = state.pendingBranchDeletion.map((branch) => ({
      name: branch.name,
      deleteRemote: deleteRemote && Boolean(branch.remoteTarget),
      forceDelete
    }));
    await withModalButton(button, async () => {
      await performRepoAction(state.selectedId, "deleteBranches", {
        branches
      });
      state.branchSelection.clear();
      closeModal();
      renderBranchList(state.detail.branches);
    });
  }

  function requestStashAction(action, stashRef) {
    if (action !== "pop") {
      return;
    }
    showConfirm({
      eyebrow: "恢复 Stash",
      title: "把保存的改动恢复到工作区？",
      message: `将恢复 <strong>${escapeHtml(stashRef)}</strong>。如果与当前改动冲突，可能需要手动处理。`,
      confirmLabel: "恢复改动",
      onConfirm: () =>
        performRepoAction(state.selectedId, "stashPop", {
          ref: stashRef
        })
    });
  }

  function handleNamedAction(action) {
    if (action === "close-modal") {
      closeModal();
      return;
    }
    if (action === "open-workspaces") {
      closeWorkspaceDropdown();
      openWorkspacesModal();
      return;
    }
    if (action === "create-workspace") {
      closeWorkspaceDropdown();
      openWorkspaceNameModal("create");
      return;
    }
    if (action === "add-repository") {
      openAddRepositoryModal();
      return;
    }
    if (action === "toggle-file-view") {
      state.fileTreeMode =
        state.fileTreeMode === "tree" ? "flat" : "tree";
      persistFileTreeMode();
      if (state.detail) {
        renderChanges(state.detail.summary);
      } else {
        updateFileViewToggle();
      }
      return;
    }
    if (!state.selectedId) {
      return;
    }
    if (action === "commit") {
      submitCommit();
      return;
    }
    if (action === "new-branch") {
      openNewBranchModal();
      return;
    }
    if (action === "stash-save") {
      openStashModal();
    }
  }

  function openWorkspacesModal() {
    const rows = state.workspaces
      .map((workspace) => {
        const count = state.repositories.filter(
          (repository) => repository.workspaceId === workspace.id
        ).length;
        const active = workspace.id === state.activeWorkspaceId;
        return `
          <div class="workspace-manager-row ${active ? "active" : ""}">
            <button
              class="workspace-manager-main"
              type="button"
              data-workspace-switch="${workspace.id}"
            >
              <span class="workspace-manager-icon">${icon("layers")}</span>
              <span class="workspace-manager-copy">
                <strong>${escapeHtml(workspace.name)}</strong>
                <small>${count} 个仓库${active ? " · 当前工作区" : ""}</small>
              </span>
              ${active ? icon("check", "workspace-active-check") : ""}
            </button>
            <div class="workspace-manager-actions">
              <button
                type="button"
                data-workspace-rename="${workspace.id}"
                aria-label="重命名 ${escapeHtml(workspace.name)}"
                data-tooltip="重命名"
              >${icon("pencil")}</button>
              <button
                type="button"
                data-workspace-delete="${workspace.id}"
                aria-label="删除 ${escapeHtml(workspace.name)}"
                data-tooltip="删除工作区"
                ${state.workspaces.length <= 1 ? "disabled" : ""}
              >${icon("trash")}</button>
            </div>
          </div>
        `;
      })
      .join("");

    openModal({
      eyebrow: "仓库分组",
      title: "管理工作区",
      body: `
        <p class="confirm-copy">工作区用于把多个 Git 仓库归到同一组。删除工作区不会删除其中的仓库，仓库会移动到其他工作区。</p>
        <div class="workspace-manager-list">
          ${rows || '<div class="scan-empty">还没有工作区</div>'}
        </div>
      `,
      footer: `
        <button class="button button-quiet" type="button" data-action="close-modal">关闭</button>
        <button class="button button-primary" type="button" data-action="create-workspace">
          ${icon("plus")}新建工作区
        </button>
      `
    });
    state.modalType = "workspaces";
  }

  function openWorkspaceNameModal(mode, workspace = null) {
    const creating = mode === "create";
    state.workspaceNameMode = mode;
    state.workspaceRenameId = workspace?.id || "";
    openModal({
      eyebrow: creating ? "新建分组" : "编辑工作区",
      title: creating ? "新建工作区" : "重命名工作区",
      body: `
        <div class="form-field">
          <label for="workspaceNameInput">工作区名称</label>
          <input
            id="workspaceNameInput"
            type="text"
            maxlength="60"
            value="${escapeHtml(workspace?.name || "")}"
            placeholder="例如 后端项目、运维仓库"
            autocomplete="off"
          />
          <p class="form-help">一个工作区可以包含任意多个 Git 仓库。</p>
        </div>
      `,
      footer: `
        <button class="button button-quiet" type="button" data-action="close-modal">取消</button>
        <button class="button button-primary" type="button" data-modal-action="save-workspace-name">
          ${creating ? "创建并切换" : "保存名称"}
        </button>
      `
    });
    state.modalType = "workspace-name";
    document.getElementById("workspaceNameInput")?.focus();
  }

  async function saveWorkspaceName(button) {
    const name = document.getElementById("workspaceNameInput")?.value.trim();
    if (!name) {
      showToast("请输入工作区名称", "名称不能为空。", "warning");
      return;
    }
    await withModalButton(button, async () => {
      if (state.workspaceNameMode === "create") {
        const result = await api("/api/workspaces", {
          method: "POST",
          body: { name }
        });
        state.workspaces.push(result.workspace);
        closeModal();
        setActiveWorkspace(result.workspace.id);
        showToast("工作区已创建", result.workspace.name, "success");
      } else {
        const result = await api(
          `/api/workspaces/${state.workspaceRenameId}`,
          {
            method: "PATCH",
            body: { name }
          }
        );
        const workspace = state.workspaces.find(
          (item) => item.id === result.workspace.id
        );
        if (workspace) {
          workspace.name = result.workspace.name;
        }
        closeModal();
        render();
        showToast("工作区已重命名", result.workspace.name, "success");
      }
    });
  }

  function requestDeleteWorkspace(workspaceId) {
    if (state.workspaces.length <= 1) {
      showToast("不能删除最后一个工作区", "至少需要保留一个工作区。", "warning");
      return;
    }
    const workspace = state.workspaces.find(
      (item) => item.id === workspaceId
    );
    if (!workspace) {
      return;
    }
    const count = state.repositories.filter(
      (repository) => repository.workspaceId === workspaceId
    ).length;
    showConfirm({
      eyebrow: "删除工作区",
      title: `删除工作区 ${workspace.name}？`,
      message:
        count > 0
          ? `工作区中的 <strong>${count}</strong> 个仓库不会被删除，会移动到其他工作区。`
          : "这个工作区中没有仓库，可以直接删除。",
      confirmLabel: "删除工作区",
      danger: true,
      onConfirm: async () => {
        const result = await api(`/api/workspaces/${workspaceId}`, {
          method: "DELETE"
        });
        state.workspaces = state.workspaces.filter(
          (item) => item.id !== workspaceId
        );
        for (const repository of state.repositories) {
          if (repository.workspaceId === workspaceId) {
            repository.workspaceId = result.workspaceId;
          }
        }
        if (state.activeWorkspaceId === workspaceId) {
          state.activeWorkspaceId = result.workspaceId;
          persistActiveWorkspace(result.workspaceId);
          state.selectedId = null;
          state.detail = null;
          render();
          const repositories = getActiveRepositories();
          if (repositories.length) {
            refreshAllSummaries({ quiet: true }).then(() =>
              selectRepository(repositories[0].id)
            );
          }
        } else {
          render();
        }
        showToast("工作区已删除", "仓库未删除。", "success");
      }
    });
  }

  function openMoveRepositoryModal(repositoryId) {
    if (state.workspaces.length <= 1) {
      showToast("只有一个工作区", "请先新建其他工作区。", "warning");
      return;
    }
    const repository = state.repositories.find(
      (item) => item.id === repositoryId
    );
    if (!repository) {
      return;
    }
    state.moveRepositoryId = repositoryId;
    const choices = state.workspaces
      .filter((workspace) => workspace.id !== repository.workspaceId)
      .map(
        (workspace) => `
          <button
            class="workspace-move-option"
            type="button"
            data-workspace-move="${workspace.id}"
          >
            ${icon("layers")}
            <span>${escapeHtml(workspace.name)}</span>
            ${icon("chevron-right")}
          </button>
        `
      )
      .join("");
    openModal({
      eyebrow: "仓库归属",
      title: `移动 ${repository.name}`,
      body: `
        <p class="confirm-copy">选择要移动到的目标工作区。</p>
        <div class="workspace-move-list">${choices}</div>
      `,
      footer: `
        <button class="button button-quiet" type="button" data-action="close-modal">取消</button>
      `
    });
    state.modalType = "move-repository";
  }

  async function moveRepositoryToWorkspace(repositoryId, workspaceId) {
    const repository = state.repositories.find(
      (item) => item.id === repositoryId
    );
    const workspace = state.workspaces.find(
      (item) => item.id === workspaceId
    );
    if (!repository || !workspace) {
      return;
    }
    try {
      const result = await api(
        `/api/repositories/${repositoryId}/workspace`,
        {
          method: "POST",
          body: { workspaceId }
        }
      );
      repository.workspaceId = result.repository.workspaceId;
      closeModal();
      if (
        state.selectedId === repositoryId &&
        repository.workspaceId !== state.activeWorkspaceId
      ) {
        state.selectedId = null;
        state.detail = null;
        const next = getActiveRepositories()[0];
        if (next) {
          await selectRepository(next.id);
        } else {
          render();
        }
      } else {
        render();
      }
      showToast(
        "仓库已移动",
        `${repository.name} → ${workspace.name}`,
        "success"
      );
    } catch (error) {
      showToast("移动失败", error.message, "error");
    }
  }

  async function submitCommit() {
    if (!state.detail || state.busyRepositories.has(state.selectedId)) {
      return;
    }
    const draft = getDraft();
    if (!draft.message.trim() && !draft.amend) {
      showToast("还差提交说明", "请填写提交说明后再提交。", "warning");
      elements.commitMessage.focus();
      return;
    }
    if (state.editor.dirty) {
      showToast("请先保存文件", "编辑器还有未保存修改。", "warning");
      return;
    }

    const availablePaths = new Set(
      collectChangedEntries(state.detail.summary).map((entry) => entry.path)
    );
    const paths = [...state.selectedFiles].filter((filePath) =>
      availablePaths.has(filePath)
    );
    if (paths.length) {
      try {
        await performRepoAction(state.selectedId, "commitSelected", {
          message: draft.message,
          amend: draft.amend,
          paths
        });
        state.selectedFiles.clear();
        renderChanges(state.detail.summary);
      } catch {
        // Git 错误已由动作请求统一提示。
      }
      return;
    }

    if (state.detail.summary.counts.staged === 0) {
      showToast(
        "没有暂存内容",
        "请勾选要提交的文件，或先暂存至少一个文件。",
        "warning"
      );
      return;
    }
    await performRepoAction(state.selectedId, "commit", {
      message: draft.message,
      amend: draft.amend
    }).catch(() => {});
  }

  function toggleBulkRepository(id) {
    if (state.selectedIds.has(id)) {
      state.selectedIds.delete(id);
    } else {
      state.selectedIds.add(id);
    }
    renderRepoList();
  }

  function requestBulkRemoveRepositories() {
    const activeIds = new Set(
      getActiveRepositories().map((repository) => repository.id)
    );
    const ids = [...state.selectedIds].filter((id) => activeIds.has(id));
    if (!ids.length) {
      showToast("没有选择仓库", "请先勾选要移出的仓库。", "warning");
      return;
    }
    showConfirm({
      eyebrow: "维护工作区",
      title: `从当前工作区移出 ${ids.length} 个仓库？`,
      message:
        "只会从 GitDeck 工作区列表中移除，不会删除磁盘目录、仓库文件或 Git 历史。",
      confirmLabel: `移出 ${ids.length} 个仓库`,
      danger: true,
      onConfirm: async () => {
        const result = await api("/api/repositories/remove", {
          method: "POST",
          body: {
            workspaceId: state.activeWorkspaceId,
            ids
          }
        });
        const removedIds = new Set(result.removedIds);
        state.repositories = state.repositories.filter(
          (repository) => !removedIds.has(repository.id)
        );
        for (const id of removedIds) {
          state.summaries.delete(id);
          state.errors.delete(id);
          state.selectedIds.delete(id);
          state.drafts.delete(id);
        }
        state.selectedIds.clear();
        if (removedIds.has(state.selectedId)) {
          state.selectedId = null;
          state.detail = null;
          const next = getActiveRepositories()[0];
          if (next) {
            await selectRepository(next.id);
          } else {
            render();
          }
        } else {
          render();
        }
        showToast(
          "仓库已移出工作区",
          "磁盘目录和 Git 数据均未修改。",
          "success"
        );
      }
    });
  }

  function requestBulkAction(action) {
    const ids = [...state.selectedIds].filter((id) =>
      state.repositories.some((repository) => repository.id === id)
    );
    if (!ids.length || state.bulkBusy) {
      return;
    }
    if (action === "pull" || action === "push") {
      showConfirm({
        eyebrow: "批量操作",
        title:
          action === "pull"
            ? `拉取选中的 ${ids.length} 个仓库？`
            : `推送选中的 ${ids.length} 个仓库？`,
        message:
          action === "pull"
            ? "每个仓库都会尝试以快进方式拉取当前分支；存在分叉或本地冲突的仓库会单独失败。"
            : "每个仓库都会推送当前分支；没有配置上游或认证失败的仓库会单独提示。",
        confirmLabel: action === "pull" ? "批量拉取" : "批量推送",
        onConfirm: () => executeBulkAction(action, ids)
      });
      return;
    }
    executeBulkAction(action, ids).catch(() => {});
  }

  async function executeBulkAction(action, ids) {
    if (state.bulkBusy) {
      return;
    }
    state.bulkBusy = true;
    ids.forEach((id) => state.busyRepositories.add(id));
    renderRepoList();

    try {
      const results = await Promise.allSettled(
        ids.map(async (id) => {
          const result = await api(`/api/repositories/${id}/action`, {
            method: "POST",
            body: { action }
          });
          if (result.summary) {
            state.summaries.set(id, result.summary);
            state.errors.delete(id);
          }
          return result;
        })
      );
      const failed = results.filter((result) => result.status === "rejected");
      if (state.selectedId) {
        await loadRepositoryDetail(state.selectedId);
      } else {
        render();
      }
      if (failed.length) {
        showToast(
          "批量操作部分完成",
          `${results.length - failed.length} 个成功，${failed.length} 个失败：${failed[0].reason.message}`,
          "warning"
        );
      } else {
        showToast(
          "批量操作完成",
          `${ids.length} 个仓库已执行${actionLabels[action] || "操作"}。`,
          "success"
        );
      }
    } finally {
      ids.forEach((id) => state.busyRepositories.delete(id));
      state.bulkBusy = false;
      renderRepoList();
    }
  }

  function openRepoMenu(repoId, anchor) {
    const repository = state.repositories.find((item) => item.id === repoId);
    if (!repository) {
      return;
    }
    state.menuRepositoryId = repoId;
    const rect =
      anchor instanceof Element
        ? anchor.getBoundingClientRect()
        : {
            left: anchor?.left || 16,
            top: anchor?.top || 16
          };

    elements.contextMenu.innerHTML = `
      <div class="context-menu-label">${escapeHtml(repository.name)}</div>
      <button type="button" data-menu-action="select">${icon("folder-open")}打开仓库</button>
      <button type="button" data-menu-action="fetch">${icon("download")}抓取远端</button>
      <button type="button" data-menu-action="pull">${icon("arrow-down")}拉取当前分支</button>
      <button type="button" data-menu-action="push">${icon("upload")}推送当前分支</button>
      <div class="context-menu-separator"></div>
      ${
        state.workspaces.length > 1
          ? `<button type="button" data-menu-action="move">${icon("layers")}移动到工作区</button>
             <div class="context-menu-separator"></div>`
          : ""
      }
      <button type="button" class="danger" data-menu-action="remove">${icon("trash")}从工作区移出</button>
    `;
    elements.contextMenu.hidden = false;

    const width = 190;
    const height = elements.contextMenu.offsetHeight;
    const left = Math.min(rect.left, window.innerWidth - width - 8);
    const top = Math.min(rect.top + 4, window.innerHeight - height - 8);
    elements.contextMenu.style.left = `${Math.max(8, left)}px`;
    elements.contextMenu.style.top = `${Math.max(8, top)}px`;
    elements.contextMenu.querySelector("button")?.focus();
  }

  function hideContextMenu() {
    elements.contextMenu.hidden = true;
    state.menuRepositoryId = null;
  }

  function handleContextMenuClick(event) {
    const button = event.target.closest("[data-menu-action]");
    if (!button) {
      return;
    }
    const repositoryId = state.menuRepositoryId;
    const action = button.dataset.menuAction;
    hideContextMenu();
    if (!repositoryId) {
      return;
    }
    if (action === "select") {
      selectRepository(repositoryId);
      return;
    }
    if (action === "remove") {
      requestRemoveRepository(repositoryId);
      return;
    }
    if (action === "move") {
      openMoveRepositoryModal(repositoryId);
      return;
    }
    if (repositoryId !== state.selectedId) {
      selectRepository(repositoryId).then(() => {
        if (action === "pull" || action === "push") {
          requestRepoAction(action);
        } else {
          performRepoAction(repositoryId, action).catch(() => {});
        }
      });
      return;
    }
    if (action === "pull" || action === "push") {
      requestRepoAction(action);
    } else {
      performRepoAction(repositoryId, action).catch(() => {});
    }
  }

  function openAddRepositoryModal(prefill = "") {
    openModal({
      eyebrow: "连接到本地",
      title: "添加 Git 仓库",
      body: `
        <div class="modal-callout">
          ${icon("alert")}
          <span>选择仓库根目录或其任意子目录。GitDeck 只读取本地 .git 数据，不会上传仓库内容。</span>
        </div>
        <div class="form-field">
          <label for="addRepositoryPath">仓库路径</label>
          <div class="input-action-row">
            <input id="addRepositoryPath" type="text" value="${escapeHtml(prefill)}" placeholder="例如 C:\\Projects\\my-app" spellcheck="false" />
            <button class="button button-secondary" type="button" data-modal-action="browse">选择目录</button>
          </div>
          <p class="form-help">也可以粘贴一个包含多个仓库的上级目录，再使用“扫描目录”。</p>
        </div>
      `,
      footer: `
        <button class="button button-quiet" type="button" data-action="close-modal">取消</button>
        <button class="button button-secondary" type="button" data-modal-action="open-scan">扫描目录</button>
        <button class="button button-primary" type="button" data-modal-action="add-repository">
          ${icon("plus")}添加仓库
        </button>
      `
    });
    state.modalType = "add";
    document.getElementById("addRepositoryPath")?.focus();
  }

  function openScanModal(prefill = state.scanRoot) {
    state.scanResults = [];
    state.scanRoot = prefill;
    openModal({
      eyebrow: "自动发现",
      title: "扫描本地仓库",
      body: renderScanModalBody(state.scanResults),
      footer: `
        <button class="button button-quiet" type="button" data-action="close-modal">取消</button>
        <button class="button button-secondary" type="button" data-modal-action="scan">
          ${icon("scan")}开始扫描
        </button>
      `
    });
    state.modalType = "scan";
    document.getElementById("scanRoot")?.focus();
  }

  function renderScanModalBody(results) {
    return `
      <div class="form-field">
        <label for="scanRoot">要扫描的目录</label>
        <div class="input-action-row">
          <input id="scanRoot" type="text" value="${escapeHtml(state.scanRoot)}" placeholder="例如 C:\\Projects" spellcheck="false" />
          <button class="button button-secondary" type="button" data-modal-action="browse-scan">选择目录</button>
        </div>
      </div>
      <div class="form-field">
        <label for="scanDepth">扫描深度</label>
        <select id="scanDepth">
          <option value="2">2 层，快速</option>
          <option value="3" selected>3 层，推荐</option>
          <option value="4">4 层，更多</option>
          <option value="5">5 层，较慢</option>
        </select>
      </div>
      <p class="form-help">自动跳过 .git、node_modules、vendor、dist、build、target 等目录。</p>
      <div class="scan-results" id="scanResults">
        ${
          results.length
            ? results
                .map(
                  (repository) => `
                    <label class="scan-row">
                      <input type="checkbox" name="scan-repository" value="${escapeHtml(repository.path)}" checked />
                      <span>
                        <span class="scan-name">${escapeHtml(repository.name)}</span>
                        <span class="scan-path">${escapeHtml(repository.path)}</span>
                      </span>
                    </label>
                  `
                )
                .join("")
            : '<div class="scan-empty">扫描后会在这里列出发现的仓库。</div>'
        }
      </div>
    `;
  }

  function openNewBranchModal() {
    if (!state.selectedId) {
      return;
    }
    openModal({
      eyebrow: "创建引用",
      title: "新建本地分支",
      body: `
        <div class="form-field">
          <label for="newBranchName">分支名</label>
          <input id="newBranchName" type="text" placeholder="例如 feature/multi-repo" spellcheck="false" autocomplete="off" />
          <p class="form-help">新分支会从当前 HEAD 创建，并立即切换过去。</p>
        </div>
      `,
      footer: `
        <button class="button button-quiet" type="button" data-action="close-modal">取消</button>
        <button class="button button-primary" type="button" data-modal-action="create-branch">创建并切换</button>
      `
    });
    state.modalType = "branch";
    document.getElementById("newBranchName")?.focus();
  }

  function openStashModal() {
    if (!state.selectedId) {
      return;
    }
    openModal({
      eyebrow: "临时保存",
      title: "保存改动到 Stash",
      body: `
        <div class="form-field">
          <label for="stashMessage">说明（可选）</label>
          <input id="stashMessage" type="text" placeholder="例如 切换分支前保存" />
          <p class="form-help">会保存已跟踪和未跟踪的改动，工作区随后恢复为干净状态。</p>
        </div>
      `,
      footer: `
        <button class="button button-quiet" type="button" data-action="close-modal">取消</button>
        <button class="button button-primary" type="button" data-modal-action="save-stash">
          ${icon("layers")}保存 Stash
        </button>
      `
    });
    state.modalType = "stash";
    document.getElementById("stashMessage")?.focus();
  }

  function openDiffModal(filePath, staged) {
    const repositoryId = state.selectedId;
    openModal({
      eyebrow: staged ? "已暂存差异" : "工作区差异",
      title: filePath,
      wide: true,
      body: `
        <div class="loading-state" style="min-height: 180px">
          <div class="spinner"></div>
          <span>正在生成差异</span>
        </div>
      `,
      footer: `<button class="button button-secondary" type="button" data-action="close-modal">关闭</button>`
    });
    state.modalType = "diff";

    api(
      `/api/repositories/${repositoryId}/diff?path=${encodeURIComponent(
        filePath
      )}&staged=${staged ? "1" : "0"}`
    )
      .then(({ diff }) => {
        if (state.modalType !== "diff") {
          return;
        }
        elements.modalBody.innerHTML = `
          <div class="diff-toolbar">
            <span class="diff-file" title="${escapeHtml(filePath)}">${escapeHtml(filePath)}</span>
            <span class="diff-kind">${staged ? "INDEX" : "WORKTREE"}</span>
          </div>
          <pre class="diff-view">${renderDiff(diff)}</pre>
        `;
      })
      .catch((error) => {
        elements.modalBody.innerHTML = `<p class="confirm-copy">${escapeHtml(
          error.message
        )}</p>`;
      });
  }

  function renderDiff(diff) {
    return String(diff || "")
      .split(/\r?\n/)
      .map((line) => {
        let className = "";
        if (
          line.startsWith("+++") ||
          line.startsWith("---") ||
          line.startsWith("diff --git") ||
          line.startsWith("index ") ||
          line.startsWith("new file") ||
          line.startsWith("deleted file")
        ) {
          className = "header";
        } else if (line.startsWith("@@")) {
          className = "hunk";
        } else if (line.startsWith("+")) {
          className = "added";
        } else if (line.startsWith("-")) {
          className = "removed";
        }
        return `<span class="diff-line ${className}">${escapeHtml(line || " ")}</span>`;
      })
      .join("");
  }

  async function handleModalAction(button) {
    const action = button.dataset.modalAction;
    if (action === "browse" || action === "browse-scan") {
      openDirectoryPicker(
        action === "browse" ? "addRepositoryPath" : "scanRoot",
        action === "browse" ? "选择仓库目录" : "选择扫描目录"
      );
      return;
    }
    if (action === "open-scan") {
      const input = document.getElementById("addRepositoryPath");
      openScanModal(input?.value.trim() || "");
      return;
    }
    if (action === "add-repository") {
      await addRepositoryFromModal(button);
      return;
    }
    if (action === "scan") {
      await scanFromModal(button);
      return;
    }
    if (action === "add-scan-results") {
      await addScanResults(button);
      return;
    }
    if (action === "create-branch") {
      await createBranchFromModal(button);
      return;
    }
    if (action === "save-stash") {
      await saveStashFromModal(button);
      return;
    }
    if (action === "save-workspace-name") {
      await saveWorkspaceName(button);
      return;
    }
    if (action === "delete-branches") {
      await deleteSelectedBranches(button);
      return;
    }
    if (action === "confirm") {
      await runModalConfirmation(button);
    }
  }

  function openDirectoryPicker(targetInputId, title) {
    state.directoryTargetInputId = targetInputId;
    state.directoryCurrentPath = "";
    state.directoryListing = null;
    state.directoryRequest += 1;
    elements.directoryPickerTitle.textContent = title;
    elements.directoryPickerBackdrop.hidden = false;
    const target = document.getElementById(targetInputId);
    loadDirectory(target?.value.trim() || "");
  }

  async function loadDirectory(directoryPath) {
    const requestId = ++state.directoryRequest;
    state.directoryLoading = true;
    elements.directoryPickerBody.innerHTML = `
      <div class="directory-loading">
        <div class="spinner"></div>
        <span>正在读取目录</span>
      </div>
    `;
    elements.directoryPickerFooter.innerHTML = `
      <button class="button button-quiet" type="button" data-directory-action="close">取消</button>
      <button class="button button-primary" type="button" disabled>选择当前目录</button>
    `;

    try {
      const listing = await api("/api/directories/list", {
        method: "POST",
        body: { path: directoryPath || "" }
      });
      if (requestId !== state.directoryRequest) {
        return;
      }
      state.directoryListing = listing;
      state.directoryCurrentPath = listing.currentPath;
      renderDirectoryPicker();
    } catch (error) {
      if (requestId !== state.directoryRequest) {
        return;
      }
      elements.directoryPickerBody.innerHTML = `
        <div class="directory-error">
          ${icon("alert")}
          <strong>无法读取这个目录</strong>
          <span>${escapeHtml(error.message)}</span>
          <button class="button button-secondary" type="button" data-directory-action="open" data-directory-path="">
            返回可访问位置
          </button>
        </div>
      `;
      elements.directoryPickerFooter.innerHTML = `
        <button class="button button-secondary" type="button" data-directory-action="close">关闭</button>
      `;
    } finally {
      if (requestId === state.directoryRequest) {
        state.directoryLoading = false;
      }
    }
  }

  function renderDirectoryPicker() {
    const listing = state.directoryListing;
    if (!listing) {
      return;
    }
    const roots = listing.roots
      .map(
        (root) => `
          <button
            class="directory-chip ${root.path === listing.currentPath ? "active" : ""}"
            type="button"
            data-directory-action="open"
            data-directory-path="${escapeHtml(root.path)}"
          >${escapeHtml(root.label)}</button>
        `
      )
      .join("");
    const quickPaths = listing.quickPaths
      .map(
        (quickPath) => `
          <button
            class="directory-quick ${quickPath.path === listing.currentPath ? "active" : ""}"
            type="button"
            data-directory-action="open"
            data-directory-path="${escapeHtml(quickPath.path)}"
            title="${escapeHtml(quickPath.path)}"
          >
            ${icon("folder")}
            <span>${escapeHtml(quickPath.label)}</span>
          </button>
        `
      )
      .join("");
    const directories = listing.directories
      .map(
        (directory) => `
          <button
            class="directory-row"
            type="button"
            data-directory-action="open"
            data-directory-path="${escapeHtml(directory.path)}"
            title="${escapeHtml(directory.path)}"
          >
            <span class="directory-row-icon">${icon("folder")}</span>
            <span class="directory-row-name">${escapeHtml(directory.name)}</span>
            ${directory.isRepository ? '<span class="directory-repo-badge">Git 仓库</span>' : ""}
            ${icon("chevron-right", "directory-chevron")}
          </button>
        `
      )
      .join("");

    elements.directoryPickerBody.innerHTML = `
      <div class="directory-path-row">
        <button
          class="icon-button"
          type="button"
          data-directory-action="up"
          data-directory-path="${escapeHtml(listing.parentPath || "")}"
          ${listing.parentPath ? "" : "disabled"}
          aria-label="上一级"
          data-tooltip="上一级"
        >
          ${icon("corner-down-left")}
        </button>
        <input
          id="directoryPathInput"
          type="text"
          value="${escapeHtml(listing.currentPath)}"
          spellcheck="false"
          aria-label="目录路径"
        />
        <button class="button button-secondary" type="button" data-directory-action="go">
          前往
        </button>
      </div>
      <div class="directory-context-row">
        <div class="directory-root-list">${roots}</div>
        ${listing.isRepository ? '<span class="directory-current-repo">当前目录是 Git 仓库</span>' : ""}
      </div>
      <div class="directory-quick-list">${quickPaths}</div>
      <div class="directory-list" role="list">
        ${
          directories ||
          `<div class="directory-empty">${icon("folder")}<span>这里没有子目录</span></div>`
        }
      </div>
      <p class="directory-help">点击文件夹继续进入，或直接选择当前目录。权限不足的目录会显示错误，不会卡住页面。</p>
    `;
    elements.directoryPickerFooter.innerHTML = `
      <span class="directory-selection-path" title="${escapeHtml(listing.currentPath)}">
        ${escapeHtml(listing.currentPath)}
      </span>
      <button class="button button-quiet" type="button" data-directory-action="close">取消</button>
      <button class="button button-primary" type="button" data-directory-action="select">
        ${icon("check")}选择当前目录
      </button>
    `;
    window.requestAnimationFrame(() => {
      document.getElementById("directoryPathInput")?.focus();
    });
  }

  function handleDirectoryAction(button) {
    const action = button.dataset.directoryAction;
    if (action === "close") {
      closeDirectoryPicker();
      return;
    }
    if (action === "up") {
      if (button.dataset.directoryPath) {
        loadDirectory(button.dataset.directoryPath);
      }
      return;
    }
    if (action === "open") {
      loadDirectory(button.dataset.directoryPath || "");
      return;
    }
    if (action === "go") {
      const input = document.getElementById("directoryPathInput");
      loadDirectory(input?.value || "");
      return;
    }
    if (action === "select") {
      chooseCurrentDirectory();
    }
  }

  function chooseCurrentDirectory() {
    const directoryPath = state.directoryCurrentPath;
    if (!directoryPath) {
      return;
    }
    const target = document.getElementById(state.directoryTargetInputId);
    if (target) {
      target.value = directoryPath;
      target.dispatchEvent(new Event("input", { bubbles: true }));
    }
    closeDirectoryPicker();
  }

  function closeDirectoryPicker() {
    state.directoryRequest += 1;
    elements.directoryPickerBackdrop.hidden = true;
    elements.directoryPickerBody.innerHTML = "";
    elements.directoryPickerFooter.innerHTML = "";
    state.directoryTargetInputId = "";
    state.directoryCurrentPath = "";
    state.directoryListing = null;
    state.directoryLoading = false;
  }

  async function addRepositoryFromModal(button) {
    const input = document.getElementById("addRepositoryPath");
    const repositoryPath = input?.value.trim();
    if (!repositoryPath) {
      showToast("需要仓库路径", "请选择或输入一个 Git 仓库目录。", "warning");
      input?.focus();
      return;
    }
    await withModalButton(button, async () => {
      const result = await api("/api/repositories", {
        method: "POST",
        body: {
          path: repositoryPath,
          workspaceId: state.activeWorkspaceId
        }
      });
      upsertRepository(result.repository);
      closeModal();
      showToast("仓库已添加", result.repository.name, "success");
      await selectRepository(result.repository.id);
      refreshAllSummaries({ quiet: true });
    });
  }

  async function scanFromModal(button) {
    const root = document.getElementById("scanRoot")?.value.trim();
    const depth = Number(document.getElementById("scanDepth")?.value || 3);
    if (!root) {
      showToast("需要扫描目录", "请选择或输入要扫描的上级目录。", "warning");
      document.getElementById("scanRoot")?.focus();
      return;
    }
    await withModalButton(button, async () => {
      const result = await api("/api/discover", {
        method: "POST",
        body: { root, depth }
      });
      state.scanRoot = root;
      state.scanResults = result.repositories;
      elements.modalBody.innerHTML = renderScanModalBody(result.repositories);
      elements.modalFooter.innerHTML = `
        <button class="button button-quiet" type="button" data-action="close-modal">取消</button>
        <button class="button button-secondary" type="button" data-modal-action="scan">
          ${icon("scan")}重新扫描
        </button>
        <button class="button button-primary" type="button" data-modal-action="add-scan-results" ${
          result.repositories.length ? "" : "disabled"
        }>
          ${icon("plus")}添加选中仓库
        </button>
      `;
      if (!result.repositories.length) {
        showToast("没有发现仓库", "可以换一个目录，或提高扫描深度。", "warning");
      }
    });
  }

  async function addScanResults(button) {
    const selected = [
      ...elements.modalBody.querySelectorAll(
        'input[name="scan-repository"]:checked'
      )
    ].map((input) => input.value);
    if (!selected.length) {
      showToast("没有选择仓库", "勾选至少一个扫描结果。", "warning");
      return;
    }

    await withModalButton(button, async () => {
      const added = [];
      for (const repositoryPath of selected) {
        const result = await api("/api/repositories", {
          method: "POST",
          body: {
            path: repositoryPath,
            workspaceId: state.activeWorkspaceId
          }
        });
        upsertRepository(result.repository);
        added.push(result.repository);
      }
      closeModal();
      showToast(
        "仓库已加入",
        `已添加 ${added.length} 个仓库，可多选后批量同步。`,
        "success"
      );
      await refreshAllSummaries({ quiet: true });
      if (added[0]) {
        await selectRepository(added[0].id);
      }
    });
  }

  async function createBranchFromModal(button) {
    const branchName = document.getElementById("newBranchName")?.value.trim();
    if (!branchName) {
      showToast("请输入分支名", "例如 feature/multi-repo。", "warning");
      return;
    }
    await withModalButton(button, async () => {
      closeModal();
      await performRepoAction(state.selectedId, "createBranch", {
        name: branchName
      });
    });
  }

  async function saveStashFromModal(button) {
    const message = document.getElementById("stashMessage")?.value.trim() || "";
    await withModalButton(button, async () => {
      closeModal();
      await performRepoAction(state.selectedId, "stashSave", { message });
    });
  }

  function showConfirm({
    eyebrow,
    title,
    message,
    confirmLabel,
    danger = false,
    bodyExtra = "",
    onConfirm
  }) {
    openModal({
      eyebrow,
      title,
      body: `
        <p class="confirm-copy">${message}</p>
        ${
          danger
            ? `<div class="danger-callout">${icon("alert")}<span>此操作会修改或删除本地内容，请确认目标无误。</span></div>`
            : ""
        }
        ${bodyExtra}
      `,
      footer: `
        <button class="button button-quiet" type="button" data-action="close-modal">取消</button>
        <button class="button ${danger ? "button-danger" : "button-primary"}" type="button" data-modal-action="confirm">
          ${escapeHtml(confirmLabel)}
        </button>
      `
    });
    state.modalType = "confirm";
    state.modalAction = onConfirm;
  }

  async function runModalConfirmation(button) {
    if (!state.modalAction) {
      closeModal();
      return;
    }
    const action = state.modalAction;
    await withModalButton(button, async () => {
      await action();
      closeModal();
    });
  }

  function openModal({ eyebrow, title, body, footer, wide = false }) {
    state.previousFocus = document.activeElement;
    state.modalAction = null;
    elements.modalEyebrow.textContent = eyebrow || "";
    elements.modalTitle.textContent = title || "";
    elements.modalBody.innerHTML = body || "";
    elements.modalFooter.innerHTML = footer || "";
    elements.modalPanel.classList.toggle("modal-wide", wide);
    elements.modalBackdrop.hidden = false;
    document.body.classList.add("modal-open");
    window.requestAnimationFrame(() => {
      const focusable =
        elements.modalPanel.querySelector(
          "input:not([disabled]), textarea:not([disabled]), select:not([disabled])"
        ) ||
        elements.modalPanel.querySelector(
          "[data-modal-action]:not([disabled]), [data-action]:not([disabled])"
        ) ||
        elements.modalPanel.querySelector("button:not([disabled])");
      focusable?.focus();
    });
  }

  function closeModal() {
    if (!elements.directoryPickerBackdrop.hidden) {
      closeDirectoryPicker();
    }
    elements.modalBackdrop.hidden = true;
    elements.modalBody.innerHTML = "";
    elements.modalFooter.innerHTML = "";
    state.modalAction = null;
    state.modalType = "";
    document.body.classList.remove("modal-open");
    if (state.previousFocus instanceof HTMLElement) {
      state.previousFocus.focus();
    }
  }

  async function withModalButton(button, callback) {
    if (!button || button.disabled) {
      return;
    }
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner" style="width:14px;height:14px"></span>处理中`;
    try {
      await callback();
    } catch (error) {
      if (!error?.alreadyReported) {
        showToast("操作失败", error.message, "error");
      }
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.innerHTML = original;
      }
    }
  }

  function requestRemoveRepository(repoId) {
    const repository = state.repositories.find((item) => item.id === repoId);
    if (!repository) {
      return;
    }
    showConfirm({
      eyebrow: "维护工作区",
      title: "从当前工作区移出？",
      message: `只会从 GitDeck 工作区列表移除 <strong>${escapeHtml(repository.name)}</strong>，不会删除磁盘目录、仓库文件或 Git 历史。`,
      confirmLabel: "从工作区移出",
      danger: true,
      onConfirm: async () => {
        await api(`/api/repositories/${repoId}`, { method: "DELETE" });
        state.repositories = state.repositories.filter(
          (item) => item.id !== repoId
        );
        state.summaries.delete(repoId);
        state.errors.delete(repoId);
        state.selectedIds.delete(repoId);
        state.drafts.delete(repoId);
        if (state.selectedId === repoId) {
          state.selectedId = null;
          state.detail = null;
          const next = getActiveRepositories()[0];
          if (next) {
            await selectRepository(next.id);
          } else {
            render();
          }
        } else {
          render();
        }
        showToast("仓库已移除", repository.name, "success");
      }
    });
  }

  function upsertRepository(repository) {
    if (!repository.workspaceId) {
      repository.workspaceId = state.activeWorkspaceId;
    }
    const existingIndex = state.repositories.findIndex(
      (item) => item.id === repository.id
    );
    if (existingIndex >= 0) {
      state.repositories[existingIndex] = repository;
    } else {
      state.repositories.push(repository);
    }
    renderRepoList();
  }

  function showToast(title, message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    const iconName = type === "error" || type === "warning" ? "alert" : "check";
    toast.innerHTML = `
      ${icon(iconName)}
      <span class="toast-copy">
        <span class="toast-title">${escapeHtml(title)}</span>
        <span class="toast-message">${escapeHtml(message || "")}</span>
      </span>
      <button type="button" data-close-toast aria-label="关闭提示">${icon("x")}</button>
    `;
    elements.toastRegion.appendChild(toast);
    elements.screenReaderStatus.textContent = `${title}。${message || ""}`;
    window.setTimeout(() => toast.remove(), 5200);
  }

  function formatRelative(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    const seconds = Math.round((Date.now() - date.getTime()) / 1000);
    if (seconds < 45) {
      return "刚刚";
    }
    if (seconds < 3600) {
      return `${Math.round(seconds / 60)} 分钟前`;
    }
    if (seconds < 86400) {
      return `${Math.round(seconds / 3600)} 小时前`;
    }
    if (seconds < 86400 * 7) {
      return `${Math.round(seconds / 86400)} 天前`;
    }
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit"
    }).format(date);
  }

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function icon(name, className = "") {
    return `<svg class="icon ${className}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
