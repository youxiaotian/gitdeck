@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

set "NODE_EXE="
where node >nul 2>nul
if not errorlevel 1 set "NODE_EXE=node"
if defined NODE_EXE goto run

if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if defined NODE_EXE goto run

if exist "%ProgramFiles%\nvmnode\node.exe" set "NODE_EXE=%ProgramFiles%\nvmnode\node.exe"
if defined NODE_EXE goto run

if exist "%LocalAppData%\Programs\nodejs\node.exe" set "NODE_EXE=%LocalAppData%\Programs\nodejs\node.exe"
if defined NODE_EXE goto run

echo GitDeck 需要 Node.js 18 或更高版本。
echo 没有找到 node.exe。请先安装 Node.js，或把 Node.js 加入 PATH。
pause
exit /b 1

:run
set "GITDECK_DESKTOP=1"
rem 后端代码只在进程启动时加载；服务默认常驻，必须先停掉旧进程，
rem 否则重新运行只会多起一个抢不到端口的进程，界面仍连着旧代码。
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\restart-server.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%NODE_EXE%' -ArgumentList 'server.js' -WorkingDirectory '%CD%' -WindowStyle Hidden"
exit /b 0
