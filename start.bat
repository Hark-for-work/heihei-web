@echo off
chcp 65001 >nul
cd /d %~dp0
where node >nul 2>nul || (echo 没找到 Node.js，请先安装 22.13 或更高版本：https://nodejs.org & pause & exit /b 1)
start "" wscript.exe //nologo "%~dp0scripts\launch-hidden.vbs"
exit /b 0
