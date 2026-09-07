#!/bin/bash
# Stock-Analysis 启动脚本
cd "$(dirname "$0")"
if [ ! -d ".venv" ]; then
  echo "[首次运行] 创建虚拟环境并安装依赖..."
  python3 -m venv .venv
  .venv/bin/pip install -q -r backend/requirements.txt
fi
echo "启动 http://localhost:8420  (Ctrl+C 停止)"
exec .venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8420
