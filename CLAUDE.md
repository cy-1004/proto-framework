# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 工作根目录规则

默认工作根目录为 `./proto-framework`（即当前目录）。未做特殊声明时，所有文件读写、命令执行均在此目录范围内进行。若需操作此目录之外的文件，必须先向用户确认。

## 包安装方式

- **后端**：`backend/.venv` 虚拟环境，激活后用 `pip install -r backend/requirements.txt`
- **前端**：`cd frontend && pnpm install`

## 文档读取规则

禁止主动读取 `docs/` 目录下的任何文件（内容可能不完善）。

## 数据保护规则

开发过程中**禁止删除任何数据**（包括数据库记录、db 文件），除非用户明确要求。

## 命令触发规则

技能路径：`.claude/skills/{cmd}/SKILL.md`
特殊触发词 {cmd} 包括 ct, cdp, tb, tt, ppp, fix-bug, seeds, seedtasks, update-deploy

---

## 开发命令

### 一键启动（推荐）

```bash
# Windows
./deploy.ps1

# Linux/Mac
bash deploy.sh
```

脚本自动处理：创建 `.env`、安装依赖、并发启动前后端，日志写入 `all.log`。

### 手动启动后端

```bash
# 激活 venv（Windows）
backend\.venv\Scripts\activate
# 激活 venv（Linux/Mac）
source backend/.venv/bin/activate

cd backend
uvicorn main:app --reload --port 8000 --host 0.0.0.0
```

### 手动启动前端

```bash
cd frontend
pnpm dev          # 仅前端，访问 http://localhost:5173
pnpm dev:all      # 并发启动前端 + 后端
pnpm build        # 生产构建
```

---

## 架构概览

### 后端（`backend/`）

FastAPI 应用，入口 `main.py`：
- **`db.py`** — 数据库层，包含 SQLite 操作和 Chroma 向量库集成（向量召回 + FTS 排名融合）
- **`deps.py`** — 认证依赖：`require_login`、`require_admin`、`check_quota`；`ENABLE_LOGIN=0` 时所有请求视为 admin 匿名用户
- **`routers/`** — 各业务路由模块：`tasks`、`chat`、`generate`、`assets`、`narations`、`products`、`auth`、`users`、`debug`
- **`services/`** — `embedding.py`（向量嵌入）、`vector_store.py`（Chroma 封装）、`media_analyzer.py`（媒体分析）
- **数据库**：`tasks.db`（主业务数据）、`app.db`、`chroma_data/`（向量数据）
- **媒体文件**：存储在 `backend/media/`，通过 `/media` 静态路由访问

认证流程：Auth 中间件拦截所有非白名单路由，白名单为 `/api/auth/config`、`/api/auth/login`、`/media`、`/docs`、`/openapi.json`。

### 前端（`frontend/src/`）

React 19 + TypeScript + Vite，路由用 React Router v7：
- **`pages/`** — `HomePage`（任务列表）、`TaskPage`（任务详情，路由参数 `:id/:stageId/:category`）、`LoginPage`、`UserManagePage`
- **`contexts/`** — `AuthContext`（全局认证状态）、`NarationPlaybackContext`（音频播放状态）
- **`lib/api.ts`** — 封装的 `apiFetch`，统一处理 API 请求和 Token 注入；401 自动跳转登录
- **`config/options.tsx`** — 定义 `TASK_STAGES` 等业务配置常量
- **`components/`** — `ChatPanel/`（LLM 对话）、`ScriptEditorInput/`（TipTap 富文本编辑器）、`StoryboardInput/`、`FinecutInput/`、`LibraryInput/`（素材搜索）；UI 基于 shadcn/ui + TailwindCSS

### 外部 AI 服务（通过 `backend/.env` 配置）

| 变量 | 用途 |
|------|------|
| `OPENROUTER_API_KEY` | LLM 调用 |
| `SILICONFLOW_API_KEY` | Qwen 向量嵌入 |
| `ASSEMBLYAI_API_KEY` | ASR 语音识别 |
| `MINIMAX_API_KEY` | 海螺视频/图像生成 |
| `GOOGLE_API_KEY` | Veo 视频生成 |
| `ARK_API_KEY` | 即梦/Seedance 视频生成 |
| `XAI_API_KEY` | Grok 图像生成 |
| `FAL_API_KEY` | FAL 图像生成 |

### 搜索配置（`backend/.env`）

- `SCORE_METHOD=RRF` — 向量召回 + FTS 排名融合
- `SCORE_METHOD=SIM_BM25` — 混合评分：`0.7 * (1 - distance) + 0.3 * normalized_bm25`
- `SCORE_THRESHOLD_SIM` — SIM 模式相似度过滤阈值（默认 0.3）

---

## 关键架构模式

### 异步生成任务（Job Queue）

图像/视频/音频生成均为异步 Job，核心在 `routers/generate.py`（1500+ 行）：
1. 请求触发后立即返回 `job_id`
2. 后台任务调用对应 AI 服务（`_generate_one_image_*` / `_generate_one_video_*`）
3. 前端轮询 `GET /api/generate/jobs/{id}` 获取进度（StreamingResponse）

### 多 AI 服务商抽象

`generate.py` 通过 `provider` 参数路由到不同服务商实现（Veo、Seedance、Minimax、即梦、Grok、FAL 等），各 provider 实现独立函数，统一返回媒体 URL。

### 业务流程（4 阶段）

`TaskPage` 按 `TASK_STAGES`（`config/options.tsx`）渲染不同 Input 组件：
1. **脚本** → `ScriptEditorInput`（TipTap 编辑 + AI 生成）
2. **素材库** → `LibraryInput`（向量 + BM25 混合搜索）
3. **分镜** → `StoryboardInput`（AI 图像生成 + 画布布局，`canvas_config` JSON 存储到 Task）
4. **精剪** → `FinecutInput`（AI 视频生成 + 旁白合成）
