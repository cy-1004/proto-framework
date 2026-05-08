# Copy Forge — 短视频文案锻造炉

> 像铁匠锻造一把刀：反复加热、锤打、淬火，直到锋利为止。

基于 **LangGraph + OpenRouter** 的多 Agent 文案自动化系统。输入产品需求或商品链接，自动完成「生成 → 审查 → 修改」闭环，输出可直接用于拍摄的结构化短视频带货脚本。

支持平台：抖音 / TikTok / 快手 / 微信视频号 / 小红书

## 项目结构

```
TextGeneration/
├── agents/
│   ├── base.py                # 基类：加载 prompt、调用 LLM
│   ├── manager_agent.py       # 决策 Agent（JSON 输出）
│   ├── copy_writer_agent.py   # 文案生成 Agent
│   ├── copy_roaster_agent.py  # 文案审查 Agent
│   └── product_extractor.py  # 商品链接提炼 Agent（httpx 抓取 + LLM 解析）
├── config/
│   ├── settings.py            # OpenRouter 配置、模型选择、阈值
│   └── prompts/               # 各 Agent 系统提示词（Markdown）
│       ├── manager.md
│       ├── copy_writer.md
│       └── copy_roaster.md
├── core/
│   ├── state.py               # LangGraph 共享状态 ForgeState
│   └── graph.py               # 工作流节点 + 路由逻辑
├── tools/
│   ├── score_parser.py        # 从审查文本提取总分
│   ├── copy_parser.py         # Writer 输出 → 结构化 JSON
│   └── logger.py              # 日志记录（Tee 模式，写入 logs/）
├── logs/                      # 自动生成的锻造日志（按时间戳命名）
├── app.py                     # FastAPI 服务入口
├── main.py                    # CLI 入口
├── API.md                     # API 接口文档
├── example.json               # JSON 响应格式示例
├── .env                       # 环境变量（本地，不提交）
└── requirements.txt
```

## 快速开始

### CLI 模式

```bash
# 1. 安装依赖
pip install -r requirements.txt

# 2. 配置 API Key
cp .env.example .env
# 编辑 .env，填入 OPENROUTER_API_KEY

# 3. 运行
python main.py                        # 交互模式（含语言选择）
python main.py "产品需求描述..."        # 单次模式
python main.py "https://..."          # 传入商品链接，自动提炼产品信息
```

### API 模式

```bash
# 启动 FastAPI 服务
uvicorn app:app --host 0.0.0.0 --port 8000

# 调用接口（PowerShell）
$body = @{ user_request = "产品需求..."; language = "中文" } | ConvertTo-Json
Invoke-WebRequest -Uri "http://localhost:8000/generate" -Method Post -ContentType "application/json" -Body $body

# Swagger 文档
http://localhost:8000/docs
```

详细接口说明见 [API.md](API.md)。

## 核心配置

通过 `.env` 文件覆盖：

| 环境变量 | 说明 | 默认值 |
|---|---|---|
| `OPENROUTER_API_KEY` | **必填** | — |
| `OPENROUTER_MODEL` | 全局默认模型 | `google/gemini-3.1-pro-preview` |
| `MANAGER_MODEL` | Manager 专用模型 | 同全局 |
| `WRITER_MODEL` | Writer 专用模型 | 同全局 |
| `ROASTER_MODEL` | Roaster 专用模型 | 同全局 |

代码层阈值（在 `config/settings.py` 修改）：

| 参数 | 默认值 | 含义 |
|---|---|---|
| `MAX_ITERATIONS` | 5 | 最大迭代轮次 |
| `PASS_SCORE` | 7.0 | 合格分数线 |
| `PLATEAU_DELTA` | 0.3 | 触发角度切换的分差阈值 |

## 数据流转

```
用户输入（文本 or 商品链接）
   │
   ├─ 含 URL → ProductExtractor（httpx 抓页面 → LLM 提炼结构化信息）
   │
   ▼
manager_node          ← 分析状态，输出 JSON decision
   │
   ├─ write/rewrite ──→ writer_node    ← 生成/修改完整脚本
   │                         │
   │                         ▼
   │                    roaster_node   ← 评分 + 逐段手术
   │                         │
   └──────────────── ◄────────┘  （循环，最多 5 轮）
   │
   ├─ pass/finish ───→ report_node    ← 生成锻造报告
   │
   ▼
copy_parser           ← Writer 输出 → 结构化 JSON
   │
   ▼
API 响应 / CLI 输出
```

每轮状态通过 `ForgeState` TypedDict 在节点间流动，最终输出历史最高分版本。

## 扩展新 Agent

1. 在 `agents/` 新建文件，继承 `BaseAgent`，设置 `name` 和 `prompt_file`
2. 在 `config/prompts/` 添加对应 Markdown 系统提示词
3. 在 `core/graph.py` 添加节点函数并接入路由
4. （可选）在 `config/settings.py` 添加专用模型 env var
