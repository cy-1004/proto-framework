"""
Transcribe audio/video files using AssemblyAI and export subtitles (SRT + VTT).

Usage: python scripts/test_asr_assembly.py <file_path> [--format srt|vtt|both]
"""

import sys
import os
import time
import tempfile
from pathlib import Path

import requests
import ffmpeg
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

API_KEY = os.getenv("ASSEMBLYAI_API_KEY")
BASE_URL = "https://api.assemblyai.com/v2"
SCRIPTS_DIR = Path(__file__).resolve().parent

VIDEO_EXTS = {".mp4", ".avi", ".mov", ".mkv", ".webm", ".flv", ".wmv", ".m4v"}
AUDIO_EXTS = {".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac", ".wma"}


def extract_audio(video_path: str) -> str:
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.close()
    print(f"[extract] {Path(video_path).name} -> {tmp.name}")
    ffmpeg.input(video_path).output(tmp.name, ac=1, ar=16000).overwrite_output().run(quiet=True)
    return tmp.name


def upload_file(file_path: str) -> str:
    headers = {"authorization": API_KEY}
    print(f"[upload] {Path(file_path).name} ...")
    with open(file_path, "rb") as f:
        resp = requests.post(f"{BASE_URL}/upload", headers=headers, data=f, timeout=300)
    resp.raise_for_status()
    url = resp.json()["upload_url"]
    print(f"[upload] done -> {url[:80]}...")
    return url


def create_transcript(audio_url: str) -> str:
    headers = {"authorization": API_KEY, "content-type": "application/json"}
    payload = {"audio_url": audio_url, "speech_models": ["universal-3-pro"]}
    resp = requests.post(f"{BASE_URL}/transcript", headers=headers, json=payload, timeout=30)
    if not resp.ok:
        print(f"[error] {resp.status_code} {resp.text}")
        resp.raise_for_status()
    tid = resp.json()["id"]
    print(f"[transcript] created: {tid}")
    return tid


def poll_transcript(transcript_id: str) -> dict:
    headers = {"authorization": API_KEY}
    url = f"{BASE_URL}/transcript/{transcript_id}"
    while True:
        resp = requests.get(url, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        status = data["status"]
        if status == "completed":
            print(f"[transcript] completed")
            return data
        if status == "error":
            raise RuntimeError(f"Transcription failed: {data.get('error')}")
        print(f"[transcript] status={status}, waiting...")
        time.sleep(5)


def get_subtitles(transcript_id: str, fmt: str, chars_per_caption: int = 32) -> str:
    headers = {"authorization": API_KEY}
    params = {"chars_per_caption": chars_per_caption}
    resp = requests.get(
        f"{BASE_URL}/transcript/{transcript_id}/{fmt}",
        headers=headers, params=params, timeout=30,
    )
    resp.raise_for_status()
    return resp.text


def run(file_path: str, subtitle_format: str = "both"):
    if not API_KEY:
        raise RuntimeError("ASSEMBLYAI_API_KEY not set in .env")

    p = Path(file_path).resolve()
    if not p.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    ext = p.suffix.lower()
    tmp_audio = None

    if ext in VIDEO_EXTS:
        tmp_audio = extract_audio(str(p))
        audio_file = tmp_audio
    elif ext in AUDIO_EXTS:
        audio_file = str(p)
    else:
        print(f"[warn] unknown extension '{ext}', treating as audio")
        audio_file = str(p)

    try:
        audio_url = upload_file(audio_file)
        tid = create_transcript(audio_url)
        result = poll_transcript(tid)

        print(f"[info] text: {result.get('text', '')[:200]}...")

        formats = ["srt", "vtt"] if subtitle_format == "both" else [subtitle_format]
        for fmt in formats:
            content = get_subtitles(tid, fmt)
            out_path = SCRIPTS_DIR / f"{p.stem}.{fmt}"
            out_path.write_text(content, encoding="utf-8")
            print(f"[saved] {out_path}")
    finally:
        if tmp_audio and os.path.exists(tmp_audio):
            os.unlink(tmp_audio)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/test_asr_assembly.py <file_path> [--format srt|vtt|both]")
        sys.exit(1)

    fmt = "both"
    if "--format" in sys.argv:
        idx = sys.argv.index("--format")
        if idx + 1 < len(sys.argv):
            fmt = sys.argv[idx + 1]
            if fmt not in ("srt", "vtt", "both"):
                print(f"Invalid format: {fmt}. Use srt, vtt, or both")
                sys.exit(1)

    run(sys.argv[1], fmt)
