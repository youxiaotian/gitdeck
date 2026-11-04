"use strict";

// @module install-shortcut
// 生成 GitDeck 应用快捷方式（开始菜单 + 桌面），使用 assets/gitdeck.ico 图标。
// 快捷方式指向 tools/gitdeck-launch.vbs，静默启动、无控制台闪烁。
// 运行：node tools/install-shortcut.js
// 说明：Windows 无法可靠地编程固定到任务栏；安装后在开始菜单右键 GitDeck
// 选择"固定到任务栏"即可（只需一次）。

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const ICON = path.join(ROOT, "assets", "gitdeck.ico");
const LAUNCHER = path.join(ROOT, "tools", "gitdeck-launch.vbs");

for (const required of [ICON, LAUNCHER]) {
  if (!fs.existsSync(required)) {
    console.error(`缺少文件：${required}`);
    console.error("请先运行 node tools/make-icon.js 生成图标。");
    process.exit(1);
  }
}

const DESCRIPTION = "GitDeck - \u591a\u4ed3\u5de5\u4f5c\u53f0";

const psScript = [
  "$ErrorActionPreference = 'Stop'",
  `$root = '${ROOT.replace(/'/g, "''")}'`,
  `$icon = '${ICON.replace(/'/g, "''")}'`,
  `$launcher = '${LAUNCHER.replace(/'/g, "''")}'`,
  "$ws = New-Object -ComObject WScript.Shell",
  "$targets = @(",
  "  (Join-Path $ws.SpecialFolders('Programs') 'GitDeck.lnk'),",
  "  (Join-Path $ws.SpecialFolders('Desktop') 'GitDeck.lnk')",
  ")",
  "foreach ($target in $targets) {",
  "  $sc = $ws.CreateShortcut($target)",
  "  $sc.TargetPath = Join-Path $env:WINDIR 'System32\\wscript.exe'",
  `  $sc.Arguments = '"' + $launcher + '"'`,
  "  $sc.WorkingDirectory = $root",
  "  $sc.IconLocation = $icon + ',0'",
  `  $sc.Description = '${DESCRIPTION}'`,
  "  $sc.WindowStyle = 7",
  "  $sc.Save()",
  "  Write-Output ('created: ' + $target)",
  "}"
].join("\r\n");

const encoded = Buffer.from(psScript, "utf16le").toString("base64");
const result = spawnSync(
  path.join(process.env.WINDIR || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
  ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
  { encoding: "utf8", windowsHide: true }
);

if (result.error) {
  console.error("启动 PowerShell 失败：", result.error.message);
  process.exit(1);
}
if (result.stdout.trim()) {
  console.log(result.stdout.trim());
}
if (result.status !== 0) {
  console.error(result.stderr.trim());
  process.exit(result.status || 1);
}
console.log("完成。在开始菜单或桌面右键 GitDeck 可固定到任务栏。");
