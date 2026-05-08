#!/usr/bin/env bash
set -e

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 1. 复制 .env 文件
env_copied=false
if [ ! -f "$root/frontend/.env" ]; then
    cp "$root/frontend/.env.example" "$root/frontend/.env"
    echo "已创建 frontend/.env"
    env_copied=true
fi
if [ ! -f "$root/backend/.env" ]; then
    cp "$root/backend/.env.example" "$root/backend/.env"
    echo "已创建 backend/.env"
    env_copied=true
fi

# 2. 仅在有新建 .env 时才提示用户修改
if [ "$env_copied" = true ]; then
    echo ""
    echo -e "\033[33m请检查并修改 .env 文件，按任意键继续...\033[0m"
    read -r -s -n 1
    echo ""
fi

# 3. 安装前端依赖
if [ ! -d "$root/frontend/node_modules" ]; then
    echo -e "\033[36m安装前端依赖...\033[0m"
    (cd "$root/frontend" && pnpm install)
fi

# 4. 初始化 Python 虚拟环境
if [ ! -d "$root/backend/.venv" ]; then
    echo -e "\033[36m初始化 Python 虚拟环境...\033[0m"
    (cd "$root/backend" && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt)
fi

# 5. 启动服务
cd "$root/frontend"
pnpm dev:all 2>&1 | tee "$root/all.log"
