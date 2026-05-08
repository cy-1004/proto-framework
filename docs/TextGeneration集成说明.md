# TextGeneration 模块集成说明

> 最后更新：2026-04-14

---

## 1. 模块概述

`backend/services/TextGeneration/` 是一个基于 **LangGraph + OpenRouter** 的多 Agent 带货文案生成系统，现已以**最小侵入方式**接入主系统（proto-framework）。

### 整体架构

```
用户 → 带货脚本 ChatPanel → /api/generate/narration/stream (SSE)
                                ↓
                    backend/services/textgen.py（适配层）
                                ↓
                    ChatAgent.stream_chat()（TextGeneration 内部）
                                ↓
              ┌─────────────────┴─────────────────┐
              │ 普通问答路径                          │ 文案生成路径
              │ token 事件流式回复                   │ LangGraph 管线
              │ ~33字/秒打字机效果                  │ manager→writer→roaster→report
              │                                     │ copy 事件 → 写入数据库
              └─────────────────┬─────────────────┘
                                ↓
                    前端展示：文字气泡 + NarrationResult 卡片
                                ↓
                    点击卡片 → ScriptEditor → ScriptStoryboard 结构化展示
```

---

## 2. 核心文件清单

### 后端

| 文件 | 说明 |
|------|------|
| `backend/services/textgen.py` | **唯一适配层**，连接主系统与 TextGeneration 模块 |
| `backend/routers/generate.py` | 新增 `/generate/narration/stream` SSE 端点 |
| `backend/services/TextGeneration/agents/chat_agent.py` | ChatAgent，带 ForgeLogger 日志 |
| `backend/services/TextGeneration/memory/base.py` | MemoryStore 基类（增加 `**kwargs` 兼容） |
| `backend/services/TextGeneration/config/prompts/chat_agent.md` | ChatAgent 路由决策 Prompt |

### 前端

| 文件 | 说明 |
|------|------|
| `frontend/src/components/ChatPanel/index.tsx` | SSE 消费、打字机效果、NarrationResult 卡片插入 |
| `frontend/src/components/ChatPanel/NarrationResultCard.tsx` | 可点击的文案结果卡片 |
| `frontend/src/components/ChatPanel/MessageList.tsx` | 新增 `onClickNarration` prop |
| `frontend/src/components/spaces/script/ScriptStoryboard.tsx` | **新建**，结构化展示 video_project JSON |
| `frontend/src/components/spaces/script/ScriptEditor.tsx` | 检测 JSON 内容并切换至 ScriptStoryboard |
| `frontend/src/components/ScriptEditorInput/SettingLanguage.tsx` | **新建**，语言选择 Widget |
| `frontend/src/components/ScriptEditorInput/data.tsx` | 去除文件上传，加语言选择控件 |
| `frontend/src/components/ScriptEditorInput/index.tsx` | 提升 language 状态，传入 createConfig |
| `frontend/src/components/ui/ChatInput.tsx` | ControllerConfig 加 `align` 属性 |
| `frontend/vite.config.ts` | 修复 IPv6 和端口跳号两处问题 |

---

## 3. 适配层详解（`textgen.py`）

```python
# 1. 路径注入（修复原有导入错误）
_TEXTGEN_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "TextGeneration")
)
if os.path.isdir(_TEXTGEN_DIR) and _TEXTGEN_DIR not in sys.path:
    sys.path.insert(0, _TEXTGEN_DIR)

# 2. BackendChatMemory — 统一写入主系统 chat_messages 表
class BackendChatMemory:
    _ALLOWED_HISTORY_TYPES = ("text", "agent_memory")
    
    def append(self, session_id, role, content, **kwargs):
        # msg_type = "text"（普通消息）或 "agent_memory"（完整文案，前端不渲染）
        ...
    
    def get_history(self, session_id, limit=None):
        # 只读 msg_type IN ('text', 'agent_memory')，过滤 JSON 卡片行
        ...

# 3. ChatAgent 单例（懒加载）
def get_chat_agent():
    global _chat_agent
    if _chat_agent is None:
        from agents.chat_agent import ChatAgent
        _chat_agent = ChatAgent(BackendChatMemory())
    return _chat_agent

# 4. 暴露给 routers/generate.py 的唯一接口
def stream_narration_chat(session_id, message, language="中文"):
    agent = get_chat_agent()
    yield from agent.stream_chat(session_id, message, language)
```

---

## 4. SSE 流式接口

### 请求

```
POST /api/generate/narration/stream
Content-Type: application/json

{
  "task_id": 1,
  "prompt": "用户消息内容",
  "session_id": 123,
  "language": "中文"
}
```

### 事件类型

| 事件类型 | Payload | 前端行为 |
|----------|---------|---------|
| `token` | `{ delta: "..." }` | 打字机队列，~33字/秒 |
| `chat` | `{ role, content }` | 无操作（后端已存库） |
| `progress` | `{ message: "..." }` | 替换 assistant 气泡文字，加 ⏳ 前缀 |
| `copy` | `{ reply, narration_id, title }` | 设置 assistant 最终文字 + 插入 NarrationResult 卡片 |
| `error` | `{ message: "..." }` | 显示错误文字 |

---

## 5. ChatAgent 路由决策逻辑

ChatAgent 通过 function calling 自动判断路由：

| 输入场景 | 行为 |
|----------|------|
| 普通问候/问答 | 直接 token 流式回复 |
| 产品信息不足（缺任一：名/卖点/价格/受众/平台） | 反问用户 |
| 仅提供商品链接 | 询问"是否基于此链接写文案？" |
| 链接 + 平台风格/写文案意图 | 直接启动 LangGraph 管线 |
| 5 要素齐全 | 直接启动 LangGraph 管线 |

---

## 6. LangGraph 管线（TextGeneration 内部）

```
manager（规划）→ writer（初稿）→ roaster（评分/优化）→ report（最终输出）→ END
     ↑_______________________________↓（最多 3 轮）
```

- **ForgeLogger**：管线运行期间日志写入 `backend/services/TextGeneration/logs/forge_<时间戳>.log`
- **最终产物**：包含 `video_project`（分镜脚本 JSON）+ `content`（Markdown 文案）+ `score`（评分）

---

## 7. 数据存储

### chat_messages 表（主系统）

| `msg_type` | 说明 | 前端渲染 |
|------------|------|---------|
| `text` | 普通聊天消息 | 是 |
| `agent_memory` | 完整文案原文（LLM 上下文用） | **否** |
| `narration_result` | 文案卡片 JSON | 是（NarrationResultCard） |

### narations 表

文案生成成功后，`copy` 事件处理时写入：
- `asset_id`：16位随机 hex
- `content`：完整 video_project JSON 字符串
- `title`：从 JSON 提取的标题

---

## 8. 前端展示流程

```
1. 用户发送消息
   → 立即显示 user 气泡（乐观更新）
   → 立即显示 assistant 气泡（"💭 思考中..."）

2. SSE 连接建立
   token 事件 → 打字机效果（1字/30ms ≈ 33字/秒）
   progress 事件 → 显示管线进度（"⏳ 正在起草文案..."）

3. copy 事件到达
   → assistant 气泡更新为完整回复文字
   → 气泡下方插入 NarrationResult 卡片（含标题、摘要）
   → 触发 "narrations-updated" 事件刷新左侧旁白列表

4. 用户点击卡片
   → navigate('/task/{id}/script/editor?n={narration_id}')
   → ScriptEditor 读取 ?n 参数，选中对应旁白
   → 加载 narration content（JSON 字符串）
   → parseStructured() 检测到 video_project
   → 渲染 <ScriptStoryboard>
```

---

## 9. ScriptStoryboard 结构

结构化展示 TextGeneration 返回的 JSON，分三个区域：

1. **项目信息**：平台、商品名、时长、评分、受众 tags、音频配置
2. **分镜脚本**：每个场景卡片
   - 场景类型色标（开场/产品展示/促单/结尾）
   - 时间轴
   - 口播文案 / 画面描述 双栏展示
   - 贴纸文字、后期备注
3. **发布策略**：视频标题、最佳发布时间、运营提示、话题标签

---

## 10. 语言选择控件

带货脚本 Chat 框（写作模式）加入语言选择：

- 支持：中文 / English / 日本語 / 한국어
- 按钮标签动态显示当前语言（如"写作 · 中文"）
- 弹窗采用 `align: "left"` 防止左侧溢出屏幕

---

## 11. 已修复问题

| 问题 | 修复方式 |
|------|---------|
| TextGeneration 导入失败 | 修正 `textgen.py` 路径为 `./TextGeneration` |
| 语言选择弹窗左侧溢出 | `ControllerConfig` 加 `align` 属性，使用 `left-0` 定位 |
| 用户消息不显示 | 发送时立即插入 user 气泡（乐观更新） |
| 发送后显示空气泡 | 初始内容改为 "💭 思考中..." |
| 历史不共享（memory.db） | 新建 `BackendChatMemory`，读写主系统 `chat_messages` 表 |
| ForgeLogger 日志消失 | 在 `_stream_pipeline` 开/关处恢复 ForgeLogger 调用 |
| ECONNREFUSED（IPv6） | `vite.config.ts` proxy 改为 `127.0.0.1` |
| ECONNREFUSED（端口跳号） | `vite.config.ts` 优先读 `process.env.API_PORT` |

---

## 12. 注意事项

- **`start_tee()` 全局 stdout 替换**：ForgeLogger 替换 `sys.stdout` 进行日志 tee，单用户开发无影响，多用户并发场景需注意日志交叉
- **ChatAgent 单例**：进程级单例，多 session 共享同一个 Agent 实例（MemoryStore 按 session_id 隔离）
- **`agent_memory` 行**：数据库中存在 `msg_type='agent_memory'` 的行，前端不渲染，仅供 LLM 上下文使用，勿误删
