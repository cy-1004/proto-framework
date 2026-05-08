"""Copy Forge — entry point.

Usage:
    python main.py
    python main.py "产品需求或商品链接..."
"""

from __future__ import annotations

import re
import sys

from core.graph import build_graph
from core.state import make_initial_state
from tools.logger import ForgeLogger

_URL_PATTERN = re.compile(r"https?://\S+")

_LANGUAGES = {
    "1": "中文",
    "2": "English",
    "3": "日本語",
    "4": "한국어",
    "5": "custom",
}


def select_language() -> str:
    """Prompt user to select output language. Returns language string."""
    print("请选择文案语言：")
    print("  1. 中文（默认）")
    print("  2. English")
    print("  3. 日本語")
    print("  4. 한국어")
    print("  5. 其他（自定义）")
    choice = input("输入序号（直接回车选中文）：").strip()

    if not choice or choice == "1":
        return "中文"
    if choice in _LANGUAGES:
        if choice == "5":
            lang = input("请输入语言名称：").strip()
            return lang or "中文"
        return _LANGUAGES[choice]
    # If user typed a language name directly
    return choice


def extract_product_info(user_request: str) -> str:
    """If input contains a URL, fetch and extract structured product info.

    Prints extracted info to console and returns it as the enriched request.
    Falls back to original input on any error.
    """
    if not _URL_PATTERN.search(user_request):
        return user_request

    print("🔗 检测到商品链接，正在联网提炼产品信息...\n")
    try:
        from agents.product_extractor import ProductExtractor
        extractor = ProductExtractor()
        extracted = extractor.extract(user_request)

        print("─" * 50)
        print("📦 提炼到的产品信息：")
        print(extracted)
        print("─" * 50)
        print()
        return extracted
    except Exception as e:
        print(f"⚠️  产品信息提炼失败（{e}），将使用原始输入继续。\n")
        return user_request


def run(user_request: str, language: str = "中文") -> str:
    """Run the Copy Forge pipeline, log everything, and return the final report."""
    graph = build_graph()
    logger = ForgeLogger()
    initial_state = make_initial_state(user_request, language)

    logger.log_session_header(user_request, language)
    logger.start_tee()  # from here all print() also goes to the log file

    try:
        print("🔨 Copy Forge 启动...\n")
        final_state: dict = {}
        for step in graph.stream(initial_state, stream_mode="updates"):
            node_name = list(step.keys())[0]
            data = step[node_name]
            final_state.update(data)

            if node_name == "manager":
                decision = data.get("manager_decision", "")
                print(f"📋 Manager 决策：{decision}")
            elif node_name == "writer":
                round_num = data.get("current_round", "?")
                print(f"✏️  Writer Round {round_num} 完成")
            elif node_name == "roaster":
                score = data.get("current_score", 0)
                print(f"🔍 Roaster 评分：{score} / 10")
            elif node_name == "report":
                print("\n📊 锻造完成！\n")

        report = final_state.get("final_report", "（未生成报告）")

        # Write full copies + reviews for all rounds to log
        logger.stop_tee()
        logger.log_all_rounds(final_state.get("history", []))
        logger.log_final_report(report)

    finally:
        logger.stop_tee()
        logger.close()
        print(f"\n📁 日志已保存：{logger.path}")

    return report


def main() -> None:
    if len(sys.argv) > 1:
        request = " ".join(sys.argv[1:])
        # CLI mode: no interactive language selection
        request = extract_product_info(request)
        report = run(request)
    else:
        print("=" * 60)
        print("🔨 Copy Forge — 短视频文案锻造炉")
        print("=" * 60)
        print()

        language = select_language()
        print(f"✅ 已选择语言：{language}\n")

        print("请输入产品需求或商品链接（输入完毕后按两次回车）：\n")
        lines = []
        while True:
            line = input()
            if line == "" and lines and lines[-1] == "":
                break
            lines.append(line)
        request = "\n".join(lines).strip()

        if not request:
            print("❌ 未提供产品需求，退出。")
            sys.exit(1)

        request = extract_product_info(request)
        report = run(request, language=language)

    print(report)


if __name__ == "__main__":
    main()
