#!/bin/bash
# macOS 双击启动:自动装依赖 → 起服务 → 开浏览器
cd "$(dirname "$0")"
if [ ! -d ".venv" ]; then
  echo "[首次运行] 创建虚拟环境并安装依赖(约1分钟)..."
  python3 -m venv .venv
  .venv/bin/pip install -q -r backend/requirements.txt
fi
.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8420 &
SRV=$!
sleep 2
open http://localhost:8420
wait $SRV
