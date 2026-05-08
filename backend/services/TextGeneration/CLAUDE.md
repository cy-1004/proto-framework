# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TextGeneration is a multi-agent AI system (LangGraph + OpenRouter) that automates short-video e-commerce copywriting for Chinese platforms (抖音/Douyin, TikTok, 快手, 微信视频号, 小红书). It implements a generate → review → refine pipeline, targeting conversion-focused scripts for live-stream and short-form video marketing.

The system exposes both a **CLI entry point** (`main.py`) and a **FastAPI service** (`app.py`) that returns structured JSON matching `example.json`.

**Runtime:** Python 3.11

## Architecture

LangGraph state machine with three agents:

```
manager → writer → roaster → manager → (loop or END)
```

- **manager_agent** — Decision node. Receives full state (scores, history, review), outputs JSON decision (`write`/`rewrite`/`pass`/`finish`). Low temperature (0.3).
- **copy_writer_agent** — Generates/revises copy. High temperature (0.8). System prompt from `config/prompts/copy_writer.md`.
- **copy_roaster_agent** — Reviews and scores on 5 dimensions (hook 25%, human touch 25%, empathy 20%, conversion 20%, rhythm 10%). Outputs structured report with `总分：X.X / 10`. Score parsed by `tools/score_parser.py`.

Loop logic: score < 7.0 and iterations < 5 → rewrite. Plateau detection (delta < 0.3 over 2 rounds) triggers creative angle pivot. Max 5 iterations, then output best-scoring version.

## Project Structure

```
agents/
  base.py                # BaseAgent: loads prompt markdown, wraps LLM call
  manager_agent.py       # ManagerAgent: decides write/rewrite/pass/finish
  copy_writer_agent.py   # CopyWriterAgent: generate() / revise()
  copy_roaster_agent.py  # CopyRoasterAgent: review() with scoring
  product_extractor.py   # ProductExtractor: fetches URL via httpx, extracts product info
config/
  settings.py            # OpenRouter config, model selection, thresholds
  prompts/               # System prompts (markdown) — one per agent
    manager.md
    copy_writer.md
    copy_roaster.md
core/
  state.py               # ForgeState TypedDict (LangGraph shared state)
  graph.py               # LangGraph node functions + graph wiring
tools/
  score_parser.py        # Regex extraction of score from roaster output
  copy_parser.py         # Parses Writer markdown output → structured JSON (example.json format)
  logger.py              # ForgeLogger: Tee stdout to logs/ directory
logs/                    # Auto-generated session logs (timestamped)
app.py                   # FastAPI service: POST /generate → JSON
main.py                  # CLI entry point
API.md                   # API interface documentation
example.json             # JSON response format reference
```

## Development Commands

```bash
pip install -r requirements.txt
cp .env.example .env  # then fill in OPENROUTER_API_KEY

# CLI
python main.py                          # interactive mode
python main.py "产品需求描述..."         # one-shot mode
python main.py "https://..."            # URL mode (auto-extracts product info)

# API
uvicorn app:app --host 0.0.0.0 --port 8000
```

## Config (OpenRouter)

All LLM calls go through OpenRouter (`config/settings.py`). Per-agent model overrides via env vars:
- `OPENROUTER_API_KEY` (required)
- `OPENROUTER_MODEL` — global default (`google/gemini-3.1-pro-preview`)
- `MANAGER_MODEL`, `WRITER_MODEL`, `ROASTER_MODEL` — per-agent overrides

## FastAPI Service (`app.py`)

**POST /generate**
- Input: `{ "user_request": "...", "language": "中文" }`
- Output: structured JSON matching `example.json`
- If `user_request` contains a URL, `ProductExtractor` runs first to fetch and parse product info before the pipeline starts
- Full session logs are written to `logs/` for every API call (same as CLI)

## URL Product Extraction (`agents/product_extractor.py`)

Strategy:
1. `httpx` directly fetches the page HTML (timeout 10s, browser-like headers)
2. Strips HTML tags, truncates to 6000 chars, passes plain text to LLM
3. If fetch fails (login wall, anti-scraping), falls back to `openrouter:web_search`

**Do not** use `openrouter:web_search` as the primary method for URL fetching — it performs a web search rather than fetching the specific URL, which can return wrong products.

## Copy Parser (`tools/copy_parser.py`)

Converts Writer's markdown output to `example.json` JSON structure.

- Uses **emoji as primary field identifiers** (🎤 📷 📝 🎬) so it works regardless of whether field labels are in Chinese or English
- `parse_copy_to_json(copy_text)` is the main entry point
- Parses: metadata header → storyboard scenes (【...】blocks) → publishing strategy (💡 section)
- `_extract_header_field()` uses `[^\n：:]*[：:]` (no colon before delimiter) to avoid greedy matching of colons inside values like `20:00`

## Writer Output Format

`config/prompts/copy_writer.md` defines the output template. Key fields added for JSON parsing:
- `🔊 音频优先级` / `🎙 配音语气` in metadata header
- Time range in section headers: `【段落名 · Xs-Ys】`
- `🎬 后期备注` in each scene block
- `- 运营提示：` in publishing section

## Adding a New Agent

1. Create `agents/new_agent.py` inheriting `BaseAgent`, set `name` and `prompt_file`
2. Add system prompt markdown to `config/prompts/`
3. Add a node function in `core/graph.py` and wire it into the graph
4. (Optional) Add per-agent model override env var in `config/settings.py`

## Key Design Constraints

- **Compliance rules** are embedded in `config/prompts/copy_writer.md`: no absolute claims, no medical terminology, no platform-banned phrases.
- The roaster focuses on detecting "AI flavor" (排比句, 书面语, fake enthusiasm) — implementations must preserve this intent.
- Score parsing (`tools/score_parser.py`) relies on the roaster outputting `总分：X.X / 10` — if the prompt format changes, update the parser regex.
- Copy parser relies on emoji markers (🎤 📷 📝 🎬 💡) being present in Writer output — do not remove them from `copy_writer.md`.
