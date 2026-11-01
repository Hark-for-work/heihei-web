' Launch momo-web without a console window: free the port, run the server in background
' (log: data\server.log). Listens on the LAN so phones on the same Wi-Fi can open it;
' keeps running after the page is closed - double-click stop.bat to stop it.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
sh.CurrentDirectory = root
If Not fso.FolderExists(root & "\data") Then fso.CreateFolder(root & "\data")
sh.Run "cmd /c node scripts\free-port.js 8765", 0, True
sh.Run "cmd /c node --disable-warning=ExperimentalWarning server.js --host 0.0.0.0 --open >> data\server.log 2>&1", 0, False
