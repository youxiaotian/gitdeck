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
echo GitDeck 正在启动，浏览器将自动打开……
"%NODE_EXE%" server.js
set "EXIT_CODE=%ERRORLEVEL%"
if "%EXIT_CODE%"=="0" exit /b 0
echo.
echo GitDeck 异常退出，退出码：%EXIT_CODE%
echo 可在当前目录打开命令行并运行 node server.js 查看详细错误。
pause
exit /b %EXIT_CODE%
