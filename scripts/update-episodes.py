#!/usr/bin/env python3
"""Fetch Nerd Snipe episodes and exact GStack mentions for G-Rank."""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

CHANNEL_ID = "UC2mPtIOYm1XihpmfrJKXjMw"
FEED_URL = f"https://www.youtube.com/feeds/videos.xml?channel_id={CHANNEL_ID}"
OUT = Path(__file__).resolve().parents[1] / "data" / "episodes.json"
GSTACK_PATTERN = re.compile(r"\b(?:g[\s-]*stack|gstack)\b", re.I)


def parse_clock(clock: str) -> int:
    parts = [int(part) for part in clock.split(":")]
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return 0


def format_clock(seconds: int | float) -> str:
    seconds = int(seconds)
    hours, rem = divmod(seconds, 3600)
    minutes, secs = divmod(rem, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def child_text(entry: ET.Element, path: str, ns: dict[str, str]) -> str:
    child = entry.find(path, ns)
    return child.text if child is not None and child.text is not None else ""


def fetch_feed() -> list[dict]:
    root = ET.fromstring(urllib.request.urlopen(FEED_URL, timeout=30).read())
    ns = {
        "atom": "http://www.w3.org/2005/Atom",
        "yt": "http://www.youtube.com/xml/schemas/2015",
    }
    episodes = []
    for entry in root.findall("atom:entry", ns):
        video_id = child_text(entry, "yt:videoId", ns)
        episodes.append(
            {
                "id": video_id,
                "title": child_text(entry, "atom:title", ns),
                "published": child_text(entry, "atom:published", ns),
                "url": f"https://youtu.be/{video_id}",
                "show": "Nerd Snipe",
            }
        )
    return episodes


def fetch_transcript(video_id: str) -> tuple[list[dict], str | None]:
    try:
        from youtube_transcript_api import YouTubeTranscriptApi

        api = YouTubeTranscriptApi()
        fetched = api.fetch(video_id)
        rows = [
            {"text": seg.text, "timeSeconds": int(seg.start), "time": format_clock(seg.start)}
            for seg in fetched
        ]
        if not rows:
            return [], "Transcript API returned zero rows"
        return rows, None
    except Exception as exc:  # noqa: BLE001 - preserve the per-video failure in data
        message = str(exc).strip().splitlines()[0] if str(exc).strip() else exc.__class__.__name__
        return [], message[:300]


def hydrate_episode(episode: dict, previous: dict | None = None) -> dict:
    rows, error = fetch_transcript(episode["id"])
    if error and previous and previous.get("transcriptStatus") == "ok":
        # YouTube frequently IP-blocks transcript fetches from automation hosts.
        # Never destroy known-good historical data during a refresh; keep the old
        # receipts and record the refresh failure for debugging.
        kept = {**previous, **{k: episode[k] for k in ["id", "title", "published", "url", "show"]}}
        kept.pop("refreshStatus", None)
        kept.pop("refreshError", None)
        print(f"  kept previous transcript data: {error}", flush=True)
        return kept

    episode["transcriptStatus"] = "ok" if rows else "error"
    if error:
        episode["error"] = error
        episode["mentions"] = []
        episode["mentionCount"] = 0
        return episode

    mentions = [row for row in rows if GSTACK_PATTERN.search(row["text"])]
    duration = max((row["timeSeconds"] for row in rows), default=0)
    first = mentions[0] if mentions else None
    episode.update(
        {
            "durationSeconds": duration,
            "duration": format_clock(duration),
            "lineCount": len(rows),
            "mentions": mentions,
            "firstMention": first,
            "mentionCount": len(mentions),
            "gstackDensityPerHour": round(len(mentions) / max(1 / 60, duration / 3600), 2),
            "firstMentionPercent": round(first["timeSeconds"] / max(1, duration) * 100, 1) if first else None,
        }
    )
    return episode


def load_previous() -> dict[str, dict]:
    if not OUT.exists():
        return {}
    try:
        return {episode["id"]: episode for episode in json.loads(OUT.read_text())}
    except Exception:  # noqa: BLE001 - corrupt data should not block a fresh fetch
        return {}


def main() -> int:
    previous = load_previous()
    episodes = fetch_feed()
    hydrated = []
    for index, episode in enumerate(episodes, start=1):
        print(f"[{index}/{len(episodes)}] {episode['id']} {episode['title']}", flush=True)
        hydrated.append(hydrate_episode(episode, previous.get(episode["id"])))
        time.sleep(0.25)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(hydrated, indent=2) + "\n")
    print(f"Wrote {OUT}")
    print(f"Episodes: {len(hydrated)}")
    print(f"Exact GStack drops: {sum(len(ep.get('mentions', [])) for ep in hydrated)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
