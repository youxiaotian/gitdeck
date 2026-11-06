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
rem Closing the desktop window stops the backend; the next launch starts a new
rem one. Still clean up any leftover old process so the new server.js can bind
rem the port and load the latest backend code. Keep rem lines ASCII only: cmd.exe
rem mis-parses some UTF-8 Chinese comments as commands even after chcp 65001.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\restart-server.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%NODE_EXE%' -ArgumentList 'server.js' -WorkingDirectory '%CD%' -WindowStyle Hidden"
exit /b 0
