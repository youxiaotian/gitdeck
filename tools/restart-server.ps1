# Stop the previous GitDeck server before start.cmd launches a new one.
# The desktop server stays alive after the window is closed, so a plain
# Start-Process would otherwise only add a second process that fails to bind.
# Only the process listening on the GitDeck port AND running server.js is stopped.
$ErrorActionPreference = "SilentlyContinue"

$port = 4321
if ($env:PORT -match "^\d+$") {
    $port = [int]$env:PORT
}

$connections = @(Get-NetTCPConnection -LocalPort $port -State Listen)
foreach ($connection in $connections) {
    $processId = $connection.OwningProcess
    if (-not $processId) { continue }

    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId"
    if (-not $process -or $process.CommandLine -notmatch "server\.js") { continue }

    Stop-Process -Id $processId -Force
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
