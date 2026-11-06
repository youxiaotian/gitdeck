# Stop the previous GitDeck server before start.cmd launches a new one.
# Normally closing the desktop window already stops the backend (window-process
# lifecycle). This script still covers: an older always-on server left over from
# a previous version, or re-running start.cmd while the window is still open.
# Only the process listening on the GitDeck port AND running server.js is stopped.
$ErrorActionPreference = "SilentlyContinue"

$port = 4321
if ($env:PORT -match "^\d+$") {
    $port = [int]$env:PORT
}

# Stopping node with TerminateProcess would orphan any git.exe it spawned, and a
# half-finished fetch can leave index.lock / FETCH_HEAD behind for TortoiseGit.
# Kill those descendants first, but never touch the Chrome window (also a child).
function Stop-GitDescendants($rootPid) {
    $all = @(Get-CimInstance Win32_Process)
    $gitNames = @('git.exe', 'git-remote-https.exe', 'git-credential-manager.exe', 'ssh.exe')
    $queue = @($rootPid)
    $targets = @()

    for ($depth = 0; $depth -lt 3 -and $queue.Count -gt 0; $depth++) {
        $next = @()
        foreach ($parentId in $queue) {
            foreach ($proc in $all) {
                if ($proc.ParentProcessId -eq $parentId -and $gitNames -contains $proc.Name) {
                    $targets += $proc.ProcessId
                    $next += $proc.ProcessId
                }
            }
        }
        $queue = $next
    }

    foreach ($id in ($targets | Select-Object -Unique)) {
        Stop-Process -Id $id -Force
    }
}

$connections = @(Get-NetTCPConnection -LocalPort $port -State Listen)
foreach ($connection in $connections) {
    $processId = $connection.OwningProcess
    if (-not $processId) { continue }

    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId"
    if (-not $process -or $process.CommandLine -notmatch "server\.js") { continue }

    Stop-GitDescendants $processId
    Stop-Process -Id $processId -Force
}

# Old versions launched --app using the user's everyday Chrome profile. If that
# window survives the restart it becomes an orphan pointing at a dead backend,
# and with the new lifecycle the backend would be watching a different window.
# Only the GitDeck --app main process is matched; renderer/gpu children and all
# other browser windows are left untouched.
$appWindowPrefix = "--app=http://127.0.0.1:$port"
$appWindows = @(Get-CimInstance Win32_Process | Where-Object {
    ($_.Name -eq 'chrome.exe' -or $_.Name -eq 'msedge.exe') -and
    $_.CommandLine -and $_.CommandLine.Contains($appWindowPrefix)
})
foreach ($window in $appWindows) {
    Stop-Process -Id $window.ProcessId -Force
}

# Wait until the listener is gone so the new process can take the same port
# instead of silently falling back to the next one.
if ($connections.Count -gt 0) {
    for ($attempt = 0; $attempt -lt 15; $attempt++) {
        $stillListening = @(Get-NetTCPConnection -LocalPort $port -State Listen)
        if ($stillListening.Count -eq 0) { break }
        Start-Sleep -Milliseconds 200
    }
}
