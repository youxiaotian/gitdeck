' GitDeck silent launcher.
' Runs start.cmd with no visible window, so shortcuts created by
' tools/install-shortcut.js launch without a console flash.
' Path-independent: resolves the project root from this file's location.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
sh.CurrentDirectory = root
sh.Run "cmd.exe /c """ & root & "\start.cmd""", 0, False
