## 技术栈

FastAPI + Vite React + shadcn/ui

## 依赖管理

后端用 Python venv（`.venv`）+ pip；前端用 pnpm

## 部署脚本
deploy.ps1 自动完成：生成 .env、安装前后端依赖、并发启动服务（日志写入 all.log）
后续启动直接运行 deploy.ps1，无需手动操作

## 搜索配置
后端 `backend/.env` 支持 `SCORE_METHOD`：
- `RRF`：向量召回 + FTS 排名融合
- `SIM_BM25`：`0.7 * (1 - distance) + 0.3 * normalized_bm25`
