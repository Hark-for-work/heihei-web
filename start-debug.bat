@echo off
chcp 65001 >nul
cd /d %~dp0
rem 带窗口启动，方便看日志排错；关掉这个窗口即停止服务
where node >nul 2>nul || (echo 没找到 Node.js，请先安装 22.13 或更高版本：https://nodejs.org & pause & exit /b 1)
node scripts/free-port.js 8765
node --disable-warning=ExperimentalWarning server.js --host 0.0.0.0 --open %*
pause
