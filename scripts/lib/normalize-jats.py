#!/usr/bin/env python3
"""Emit NormalizedDocument JSON for a JATS file (stdout). Avoids normalizers/__init__.py deps."""
import importlib.util
import json
import sys
from pathlib import Path

def main() -> None:
    if len(sys.argv) < 2:
        print("usage: normalize-jats.py <paper.xml>", file=sys.stderr)
        sys.exit(1)
    xml_path = Path(sys.argv[1]).resolve()
    explorer_root = Path(__file__).resolve().parents[2]
    jats_path = explorer_root.parent / "source-normalize" / "normalizers" / "jats.py"
    spec = importlib.util.spec_from_file_location("jats", str(jats_path))
    jats = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(jats)
    raw = jats.normalize_jats(str(xml_path))
    if raw is None:
        print(f"Failed to normalize JATS: {xml_path}", file=sys.stderr)
        sys.exit(1)
    doc = {
        "url": "doi:10.1016/j.molmet.2020.101102",
        "source_type": "jats",
        "normalized_at": raw.get("normalized_at") or "",
        "article": {
            "sections": [
                {
                    "heading": s["heading"],
                    "heading_level": s["heading_level"],
                    "paragraphs": [{"text": p["text"]} for p in s.get("paragraphs", [])],
                }
                for s in raw["sections"]
            ]
        },
    }
    print(json.dumps(doc))

if __name__ == "__main__":
    main()
