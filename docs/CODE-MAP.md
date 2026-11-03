# Code Map

本文件按约定保留英文符号索引，便于直接按函数名搜索；说明性文档统一使用中文。

This is a symbol-level index. Prefer these names with `rg -n "<symbol>"` over
relying on stale line numbers.

## Server Entry and HTTP

| Symbol | File | Responsibility |
| --- | --- | --- |
| `main()` | `server.js` | Create HTTP server, listen, select port, optionally open browser |
| `handleApi()` | `server.js` | Route all local API requests |
| `isTrustedRequest()` | `server.js` | Validate session token and origin |
| `readJson()` | `server.js` | Bounded JSON request body reader |
| `serveStatic()` | `server.js` | Serve static frontend and inject session token |
| `sendJson()` / `sendError()` | `server.js` | JSON response helpers |
| `httpError()` | `server.js` | Error with HTTP status |

## Workspace and Repository Metadata

| Symbol | File | Responsibility |
| --- | --- | --- |
| `RepositoryStore.loadState()` | `src/repository-store.js` | Load schema v2 state and migrate old data |
| `RepositoryStore.saveState()` | `src/repository-store.js` | Atomic serialized JSON write |
| `RepositoryStore.repositoryId()` | `src/repository-store.js` | Stable repository hash ID |
| `RepositoryStore.workspaceId()` | `src/repository-store.js` | Random workspace ID |
| `addRepository()` | `server.js` | Resolve Git root and register metadata |
| `resolveWorkspace()` | `server.js` | Validate workspace membership |
| `createWorkspace()` / `renameWorkspace()` / `deleteWorkspace()` | `server.js` | Workspace CRUD |
| `moveRepositoryToWorkspace()` | `server.js` | Change repository membership |
| `removeRepositoriesFromWorkspace()` | `server.js` | Metadata-only batch removal |
| `reorderRepositories()` | `server.js` | Persist custom workspace repository order |
| `getRepository()` | `server.js` | Resolve API repository ID |

## Status, Logs, Branches

| Symbol | File | Responsibility |
| --- | --- | --- |
| `parseStatus()` | `src/git-utils.js` | Parse porcelain v2 status |
| `parseLog()` | `src/git-utils.js` | Parse commit records |
| `parseBranches()` | `src/git-utils.js` | Parse branch name/current/upstream/date/author |
| `parseStashes()` | `src/git-utils.js` | Parse Stash records |
| `parseGraphHistory()` | `src/git-utils.js` | Parse graph lines, decorations and commit rows |
| `getStatusSummary()` | `server.js` | Fetch status and latest commit |
| `getRepositoryDetail()` | `server.js` | Fetch status, 50 commits, branches, Stashes, remotes |
| `getCommitHistory()` | `server.js` | Fetch current/all-branch graph history |
| `getRemotes()` | `server.js` | Parse `git remote -v` |
| `resolveRemoteTarget()` | `server.js` | Map remote ref to remote + branch |

## Repository Actions

| Symbol | File | Responsibility |
| --- | --- | --- |
| `runRepositoryAction()` | `server.js` | Whitelisted action dispatcher and lock scope |
| `commit()` | `server.js` | Commit staged changes |
| `stagePaths()` | `server.js` | Batch stage via NUL pathspec file |
| `commitSelected()` | `server.js` | Stage and commit only selected paths |
| `normalizePaths()` | `server.js` | Deduplicate/validate action paths |
| `checkoutBranch()` / `createBranch()` | `server.js` | Branch navigation and creation |
| `deleteBranches()` | `server.js` | Safe local and remote branch deletion |
| `mergeBranch()` | `server.js` | Merge into current branch |
| `stashPop()` | `server.js` | Restore Stash |
| `unstageAll()` / `unstagePath()` | `server.js` | Remove staged state |
| `discardPath()` / `discardPaths()` | `server.js` | Restore worktree or delete untracked |
| `acquireRepositoryLock()` | `server.js` | Serialize actions per repository |

## Diff and Editor

| Symbol | File | Responsibility |
| --- | --- | --- |
| `getDiff()` | `server.js` | Generate tracked diff or synthetic untracked patch |
| `getFileContent()` | `server.js` | Read editable text metadata/content |
| `saveFileContent()` | `server.js` | Hash-checked save with line ending preservation |
| `resolveEditableFile()` | `server.js` | Reject non-files and symlink escapes |
| `hashContent()` | `server.js` | SHA-256 content hash |
| `isProbablyBinary()` | `server.js` | NUL-byte binary heuristic |
| `validateRepositoryPath()` | `server.js` | Reject traversal/absolute/.git paths |

## Directory Browser and Discovery

| Symbol | File | Responsibility |
| --- | --- | --- |
| `discoverRepositories()` | `server.js` | Recursive repository scan with depth/limit |
| `listDirectories()` | `server.js` | In-app directory picker listing |
| `findExistingDirectory()` | `server.js` | Resolve inaccessible/missing path upward |
| `listSystemRoots()` | `server.js` | Windows drive list |
| `listQuickPaths()` | `server.js` | User/app/current quick locations |
| `isRepositoryRoot()` | `server.js` | Detect `.git` marker |

## Process Execution

| Symbol | File | Responsibility |
| --- | --- | --- |
| `runProcess()` | `server.js` | Spawn process, capture output, timeout, close stdin |
| `runGit()` | `server.js` | Git wrapper with exact safe directory |
| `gitAction()` | `server.js` | Long-running Git wrapper for actions |
| `toGitPath()` | `server.js` | Normalize Windows path for Git config |
| `openTortoiseGit()` | `server.js` | Launch TortoiseGit log UI for one repository |

## Frontend Lifecycle

| Symbol | File | Responsibility |
| --- | --- | --- |
| `init()` | `public/app.js` | Bootstrap, active workspace, summaries, auto refresh |
| `api()` | `public/app.js` | Token-aware fetch wrapper |
| `render()` | `public/app.js` | Global render coordinator |
| `renderGlobalSummary()` | `public/app.js` | Active workspace summary pills |
| `renderRepoList()` | `public/app.js` | Active repository list |
| `renderWorkspacePicker()` | `public/app.js` | Custom workspace dropdown |
| `renderMain()` / `renderRepositoryView()` | `public/app.js` | Main selected-repository UI |
| `renderContextPanel()` | `public/app.js` | Branch/Stash/remotes side panel |
| `renderContextHistory()` / `renderContextView()` | `public/app.js` | Right-side history/branch tabs |
| `renderHistoryGraph()` / `renderHistoryDecorations()` | `public/app.js` | Color lanes and branch/remote/tag labels |
| `refreshAllSummaries()` | `public/app.js` | Active workspace status refresh |
| `selectRepository()` / `loadRepositoryDetail()` | `public/app.js` | Detail navigation/loading |
| `performRepoAction()` | `public/app.js` | Action call, busy state, refreshed detail |
| `moveRepositoryOrder()` | `public/app.js` | Optimistic drag ordering and API save |

## Frontend File and Editor

| Symbol | File | Responsibility |
| --- | --- | --- |
| `renderChanges()` | `public/app.js` | Changed-file tree + preview + composer |
| `collectChangedEntries()` | `public/app.js` | Merge staged/unstaged/untracked file states |
| `renderFileTree()` / `renderTreeNode()` | `public/app.js` | Hierarchical tree rendering |
| `renderFlatFileList()` / `updateFileViewToggle()` | `public/app.js` | Flat file list and tree/flat switch |
| `fileStatus()` | `public/app.js` | Status letter/class/label |
| `renderPreviewHeader()` | `public/app.js` | Diff/edit controls and actions |
| `loadFilePreview()` | `public/app.js` | Fetch diff or editable file content |
| `renderEditor()` / `saveEditor()` | `public/app.js` | Inline text editor and save |
| `submitCommit()` | `public/app.js` | Commit all staged or selected-only paths |
| `requestBatchStage()` | `public/app.js` | Batch stage selected files |
| `requestBatchDiscard()` | `public/app.js` | Confirm and batch restore |

## Frontend Branches and Workspaces

| Symbol | File | Responsibility |
| --- | --- | --- |
| `renderBranchList()` | `public/app.js` | Metadata, checkboxes, branch actions |
| `matchesBranchSearch()` | `public/app.js` | Name/author search |
| `openDeleteBranchesModal()` | `public/app.js` | Delete local + optional remote |
| `openWorkspacesModal()` | `public/app.js` | Rename/delete/manage workspaces |
| `openWorkspaceNameModal()` | `public/app.js` | Create/rename workspace |
| `openMoveRepositoryModal()` | `public/app.js` | Cross-workspace repository move |
| `requestBulkRemoveRepositories()` | `public/app.js` | Metadata-only batch removal |

## Frontend Infrastructure

| Symbol | File | Responsibility |
| --- | --- | --- |
| `handleDocumentClick()` | `public/app.js` | Delegated UI action router |
| `handleKeydown()` | `public/app.js` | Escape, shortcuts, editor Tab |
| `initializeResizers()` | `public/app.js` | Three draggable panel widths |
| `openModal()` / `closeModal()` | `public/app.js` | Shared main modal |
| `openDirectoryPicker()` | `public/app.js` | In-app directory picker |
| `showToast()` | `public/app.js` | Success/warning/error notifications |
| `icon()` / `escapeHtml()` | `public/app.js` | Rendering helpers |
