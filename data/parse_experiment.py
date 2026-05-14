"""
Local experiment: parse a script PDF end-to-end without the web app.

Usage (from repo root):
    uv run --project backend python data/parse_experiment.py

Output: data/parsed_output.json  +  data/parsed_output_summary.txt
"""

import asyncio
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / "backend" / ".env")

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from src.ingestion.pdf_extractor import extract_text
from src.ingestion.parser import _PROMPT_TEMPLATE, _SCHEMA, _SCRIPT_SENTINEL, _validate

import anthropic
import jsonschema

PDF_PATH = Path(__file__).parent / "The Shape of Things - V2 Script_g_compressed.pdf"
OUTPUT_JSON = Path(__file__).parent / "parsed_output.json"
OUTPUT_SUMMARY = Path(__file__).parent / "parsed_output_summary.txt"


async def main() -> None:
    print(f"Reading PDF: {PDF_PATH.name}")
    pdf_bytes = PDF_PATH.read_bytes()
    text = extract_text(pdf_bytes)
    print(f"  Extracted: {len(text.split()):,} words  /  {len(text):,} chars")

    prompt = _PROMPT_TEMPLATE.replace(_SCRIPT_SENTINEL, text)
    input_tokens_estimate = len(prompt) // 4
    print(f"  Estimated input tokens: ~{input_tokens_estimate:,}")
    print()

    model = os.getenv("LLM_MODEL", "claude-haiku-4-5-20251001")
    print(f"Calling LLM ({model}) with extended output beta...")

    client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    raw_chunks: list[str] = []
    input_tokens = 0
    output_tokens = 0

    async with client.beta.messages.stream(
        model=model,
        max_tokens=64000,
        messages=[{"role": "user", "content": prompt}],
        betas=["output-128k-2025-02-19"],
    ) as stream:
        async for text in stream.text_stream:
            raw_chunks.append(text)
            print(".", end="", flush=True)
        final = await stream.get_final_message()
        input_tokens = final.usage.input_tokens
        output_tokens = final.usage.output_tokens

    print()
    raw = "".join(raw_chunks).strip()
    print(f"  Response length: {len(raw):,} chars")
    print(f"  Input tokens used:  {input_tokens:,}")
    print(f"  Output tokens used: {output_tokens:,}")
    print()

    # Strip markdown fences defensively
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    print("Parsing JSON...")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"  JSON parse FAILED: {e}")
        (Path(__file__).parent / "parsed_output_raw.txt").write_text(raw, encoding="utf-8")
        print("  Raw response saved to data/parsed_output_raw.txt")
        return

    print("Validating schema...")
    try:
        jsonschema.validate(data, _SCHEMA)
        _validate(data)
    except Exception as e:
        print(f"  Validation FAILED: {e}")
        return

    OUTPUT_JSON.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    chars = data["characters"]
    lines = data["lines"]
    dialogue = [l for l in lines if l["kind"] == "dialogue"]
    directions = [l for l in lines if l["kind"] == "stage_direction"]
    headers = [l for l in lines if l["kind"] == "scene_header"]

    summary = f"""Parse result: {data['title']}
{'=' * 50}
Characters ({len(chars)}):
""" + "\n".join(f"  {c['name']}: {sum(1 for l in dialogue if l.get('character') == c['name'])} lines"
                for c in chars) + f"""

Lines total:    {len(lines)}
  Dialogue:     {len(dialogue)}
  Stage dirs:   {len(directions)}
  Scene headers:{len(headers)}

Tokens used:
  Input:  {input_tokens:,}
  Output: {output_tokens:,}

First 5 dialogue lines:
""" + "\n".join(
    f"  [{l['character']}] {l['text'][:80]}"
    for l in dialogue[:5]
)

    print()
    print(summary)
    OUTPUT_SUMMARY.write_text(summary, encoding="utf-8")
    print(f"\nSaved: {OUTPUT_JSON.name}  +  {OUTPUT_SUMMARY.name}")


asyncio.run(main())
