#!/usr/bin/env sh
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "没找到 Node.js，请先安装 22.13 或更高版本：https://nodejs.org"; exit 1; }
node scripts/free-port.js 8765
mkdir -p data
nohup node --disable-warning=ExperimentalWarning server.js --open --auto-exit "$@" >> data/server.log 2>&1 &
echo "momo-web 已在后台启动，关闭网页后自动退出（日志 data/server.log）"
