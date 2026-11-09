# 常见问题排查

## 浏览器提示 `Failed to fetch`

常见原因：

- Node 服务已停止；
- 服务重启后端口变化；
- 页面仍连接旧服务进程。

检查：

```powershell
netstat -ano | Select-String ':4321'
curl.exe -s -o NUL -w "%{http_code}" http://127.0.0.1:4321/
```

确认返回 200 后刷新页面。

## 刷新页面报 `ERR_CONNECTION_REFUSED`（127.0.0.1 拒绝连接）

说明监听 4321 的 Node 服务进程已经不在了，页面本身没有问题。

历史原因：旧版桌面壳用「30 秒收不到前端心跳就 `process.exit(0)`」判断窗口已关闭。Chrome 会节流甚至冻结后台窗口的 JS 定时器，系统睡眠也会让心跳停摆，窗口其实还开着，服务却被误杀。

当前版本：

- 服务**关闭窗口即退出**（依据 `--app` 窗口进程的 `exit` 事件），重新运行 `.\start.cmd` 拉起；心跳中断不会误杀，只有显式设置 `GITDECK_HEARTBEAT=1` 才额外启用心跳自动退出，且带 120 秒超时、15 秒确认窗口和睡眠挂起感知。
- 启动、看门狗判定、未捕获异常堆栈都写入 `data/server.log`（超过 256 KB 轮转为 `server.log.1`），隐藏窗口启动时也能查。
- 未捕获的异步异常会记录堆栈并让服务继续运行，不再静默终止进程。

排查顺序：

```powershell
Get-Content .\data\server.log -Tail 30
curl.exe -s -o NUL -w "%{http_code}" http://127.0.0.1:4321/
```

日志末尾若是「桌面窗口已关闭，GitDeck 后端退出。」，说明用户关闭了桌面窗口（正常行为，重新双击 `start.cmd` 即可）；若是「确认窗口内仍无心跳，判定桌面窗口已关闭」，说明额外启用了 `GITDECK_HEARTBEAT=1`。若只有启动记录没有退出记录，多半是进程被外部结束或系统重启。

## 提示“请求来源不受信任”

- 这是 API 会话令牌校验失败，不是 Git 仓库损坏。
- 常见原因是 GitDeck 服务重启后生成了新令牌，但浏览器仍是旧页面。
- 当前前端检测到 HTTP 403 会自动刷新页面并获取新令牌。
- 如果 5 秒内重复 403，自动刷新会停止，避免死循环。
- 仍失败时手动刷新页面，或重启 `start.cmd`。

## 双击 `start.cmd` 出现 `'vel'` 或 `'ho'` 不是内部命令

原因是批处理文件使用了 LF 换行。Windows `cmd.exe` 对批处理换行敏感，会把
命令拆坏。

当前仓库已经：

- 把 `start.cmd` 改为标准 CRLF；
- 增加 `.gitattributes`，固定 `*.cmd` 使用 CRLF；
- 在 `start.cmd` 中加入 `node.exe` 常见安装路径兜底；
- `rem` 注释一律使用 ASCII。UTF-8 中文 `rem` 即使有 `chcp 65001` 也可能被 `cmd.exe` 截断后当成命令执行，报类似 `'…时加载，…' is not recognized`；`tests/project-files.test.js` 会拦截这种情况。

如果文件被编辑器重新保存后再次出现该错误，在项目根目录执行：

```powershell
$path = ".\start.cmd"
$content = [IO.File]::ReadAllText($path) -replace "`r?`n", "`r`n"
[IO.File]::WriteAllText($path, $content, [Text.UTF8Encoding]::new($false))
```

## `start.cmd` 提示找不到 Node.js

脚本会依次检查：

- `PATH` 中的 `node`；
- `%ProgramFiles%\nodejs\node.exe`；
- `%ProgramFiles%\nvmnode\node.exe`；
- `%LocalAppData%\Programs\nodejs\node.exe`。

如果都不存在，请安装 Node.js 18 或更高版本。

## `detected dubious ownership`

Git 发现仓库所有者与当前 Windows 账号不同。GitDeck 导入和后续操作会为精确仓库路径添加 `safe.directory`。

如果仍失败：

1. 确认路径是实际的 Git 顶层目录。
2. 确认服务用正常本地账号运行。
3. 查看 toast 或服务日志中的完整错误。
4. 不要把全局 `safe.directory=*` 当作首选方案。

## `Unable to create .../.git/index.lock: Permission denied`

常见原因：

- 存在无法访问的 `.git/index.lock`；
- 写入目标跑到了 `<repo>` 之外，被沙箱拦截；
- 另一个 Git 进程正在占用索引锁。

处理：

1. 检查锁文件和活动 Git 进程。
2. 写入操作使用正常本地权限运行 GitDeck。
3. 状态和还原已经使用 `GIT_OPTIONAL_LOCKS=0`，但 add/commit 仍需要仓库写权限。
4. 有其他 Git 进程运行时不能直接删除锁文件。
5. 若报错是 `File exists`（残留的陈旧锁）而不是权限不足，GitDeck 会自动判定占用情况并处理，见下文「创建提交报 `index.lock` / `File exists`」。

## 提示“该目录不是 Git 仓库”

- 确认目录位于带 `.git` 的工作树中。
- GitDeck 使用 `git rev-parse --show-toplevel` 查找顶层。
- 检查 `.git` 是目录或有效的 worktree 文件。
- 检查目录所有权和权限。

## 目录选择器无响应

当前使用内置目录浏览器，不调用 Windows 文件夹对话框。

检查：

1. Node 服务是否仍在运行。
2. 目录是否存在。
3. 服务日志是否显示权限错误。
4. `POST /api/directories/list` 是否正常返回。

目录列表滚动卡顿曾由「每帧写 `hidden` 属性 + 全屏 `backdrop-filter` + 后台整页重绘」叠加造成，现已去掉这些开销；若仍不流畅，检查是否有浏览器扩展或远程桌面环境影响了合成滚动。

## 编辑器无法打开或保存

- 二进制文件会被拒绝。
- 超过 512 KB 的文件会被拒绝。
- 符号链接会被拒绝。
- HTTP 409 表示打开后文件被其他程序修改。

重新打开文件获取新哈希后再保存。

## 选中文件提交失败

- 提交说明不能为空，除非选择修正提交。
- 选中文件可能在勾选后被删除或移动。
- 冲突文件需要先手动解决。
- 编辑器有未保存内容时不能提交。

## 分支删除失败

- 当前分支不能删除。
- `git branch -d` 会拒绝未合并分支。错误内容通常包含
  `is not fully merged`。
- 如果确认该分支提交不再需要，在删除弹窗勾选“强制删除未合并分支（-D）”：批量删除弹窗是 `#forceDeleteBranches`，提交历史分支徽标右键「删除引用」是 `#forceDeleteRef`。删除失败时确认框会保持打开，可直接勾选后再点一次，不必重新右键。
- 强制删除会丢失未合并提交，默认关闭。
- 远程删除需要匹配的上游或远程跟踪分支。
- 远端认证可能缺失或过期。
- 部分操作失败会显示警告。

## 远端操作卡住或失败

- GitDeck 禁止交互式终端提示。
- 在 GitDeck 外部配置 Git credential manager。
- 检查远端 URL 和网络。
- 可打开仓库终端查看详细诊断。

## 点击 TortoiseGit 按钮没有打开窗口

- 确认安装的是 TortoiseGit，而不是只安装 TortoiseSVN。
- 需要存在 `TortoiseGitProc.exe`。
- 常见位置：
  - `%ProgramFiles%\TortoiseGit\bin\TortoiseGitProc.exe`
  - `%ProgramFiles(x86)%\TortoiseGit\bin\TortoiseGitProc.exe`
- GitDeck 使用 `/command:log /path:<仓库>` 打开日志界面。
- 没有安装时，接口会提示“未找到 TortoiseGitProc.exe”。

## 工作区数据看起来丢失

检查：

```powershell
Get-Content data/repositories.json
```

注意：

- 当前工作区保存在浏览器本地存储中；
- 删除工作区会移动仓库，不删除仓库；
- 在工作区间移动仓库不会更换 JSON 文件；
- 从工作区移除仓库只删除元数据。

## 窄屏布局异常

820 px 以下分隔条会隐藏；820–1080 px 时上下文面板移动到主区域下方。

## 端口被占用

桌面模式端口固定为 `4321`（`PORT` 可改）。重新运行 `.\start.cmd` 会先执行 `tools/restart-server.ps1`，精确停掉占用该端口且运行 `server.js` 的旧进程，等端口释放后再启动新进程，不会退化到后续端口。浏览器模式（`node server.js`）才会自动尝试后续 10 个端口，查看启动日志中的实际地址。

## TortoiseGit / IDE 打开仓库时转圈或报「仓库被占用」

GitDeck **不再有任何碰用户仓库的后台定时任务**：没有定时 `git fetch --all`，也没有每 20 秒自动跑的 `git status`。仓库状态只在打开应用时读一次，之后由用户点「刷新」或执行 Git 动作后才更新；远端更新由用户主动抓取 / 拉取。

如果仍然转圈，排查顺序：

```powershell
Get-Content .\data\server.log -Tail 40
Get-ChildItem "<用户仓库>/.git" -Recurse -Force -File -Filter "*.lock" |
  Select-Object FullName, LastWriteTime
```

- 日志里若出现 `[auto-fetch]`，说明运行中的服务还是旧代码；关掉窗口后重新运行 `.\start.cmd`。
- 锁文件时间若是很久以前（几周、几个月），通常是历史残留而不是 GitDeck 正在占用；现在用户主动执行 Git 动作时，GitDeck 会先确认无人持有再自动清理这类陈旧锁（见下一节），不需要手动删。
- 若 TortoiseGit 持续「未响应」但系统里没有 git 子进程、仓库也没有近期锁，多半是它自身在 `<All Branches>` 模式下绘制大量远端分支图；可把范围切到当前分支，或清理不再需要的 `origin/*` 远程跟踪分支。

## 创建提交报 `index.lock` / `File exists`

`git add` 与 `git commit` 都要先拿到 `.git/index.lock`；上一条 git 进程被强杀（例如旧版关窗口时）会留下 0 字节的空锁。Git 不往锁里写 PID / 进程名，所以从文件本身查不出创建者。

现在 GitDeck 在**用户主动执行 Git 动作**时默认处理，不需要手动删锁，也没有任何后台巡检：

1. 以 Windows 独占方式（`FileShare.None`）尝试打开锁文件。
2. 能打开 → 没有任何进程持有，判定为陈旧锁，删除后自动重试该命令一次。toast 显示「检测到无人占用的陈旧 `.git/index.lock`，已自动删除并重试成功」，`data/server.log` 记一条 `[index-lock]`。
3. 打不开 → 仍有进程持有，**绝不删除**。返回 423，多行错误提示列出可能占用的进程（进程名、PID、命令行，命令行包含该仓库路径的优先）、占用判据和 Git 原始错误。关掉对应程序（常见是 TortoiseGit Log、Visual Studio、VSCode 或另一个正在跑的 git 命令）后重试即可。
4. 独占探测失败、无法确定 Git 目录、或锁文件不在 Git 目录内 → 一律不删任何文件，提示手动确认后再处理。

没有 `--force` 式的强制提交，也不建议用 `GIT_INDEX_FILE` 指向临时索引绕过：提交后主索引不更新，后续状态会彻底错乱。若确实需要手工处理，先确认没有 git / IDE 写进程，再**改名备份**而不是直接删除：

```powershell
cd <repo>
Get-CimInstance Win32_Process | ? { $_.Name -match '^git\.exe|^TortoiseGitProc' } | select ProcessId,CommandLine
ren .git\index.lock index.lock.stale-<日期>
git status --short
```

## 选中 `.sln` 按钮后提示「目录下没有 .sln 文件」

目录里明明有 `.sln` 却提示没有，通常不是扫描失败，而是**运行中的服务仍是旧代码**：`GET /api/repositories/:id/solutions` 只在 Node 进程启动时加载，服务默认常驻，按 F5 或关掉窗口重开都不会重载 `src/`。旧进程会返回 404，前端若把请求失败当成空结果，就会误报「目录下没有 .sln 文件」。

另外，解决方案列表**只扫描仓库根目录第一层**，不递归子目录（为避免大仓库刷新卡顿）。子目录里的 `.sln` 不会出现在列表里，这是预期行为，不是扫描失败。

现在界面会明确显示「GitDeck 服务仍是旧版本，缺少解决方案接口」。处理：

```powershell
.\start.cmd
```

`start.cmd` 会先调用 `tools/restart-server.ps1`，精确停掉占用 GitDeck 端口且命令行包含 `server.js` 的旧进程，等端口释放后再启动新进程。启动后按一次 F5（会话令牌随进程变化，页面通常会自动刷新）。

如果服务曾因端口占用回退到后续端口，界面可能连着旧进程；重新运行 `.\start.cmd` 会先释放端口，避免新旧进程并存。
