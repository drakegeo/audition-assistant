import base64
import json
import os

from anthropic import AsyncAnthropic


class AnthropicClient:
    """LLMClient implementation backed by Claude (Anthropic API).

    Uses streaming + extended-output beta so large scripts (40+ pages) complete
    without hitting the default 8,192-token output limit. Tested at ~46k output
    tokens for a 39-page play.
    """

    def __init__(self) -> None:
        self._client = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        self._model = os.getenv("LLM_MODEL", "claude-haiku-4-5-20251001")

    async def complete_json(self, prompt: str, *, schema: dict) -> dict:  # type: ignore[type-arg]
        """Stream the LLM response and return parsed JSON.

        max_tokens=64000 with extended-output beta handles full-length plays.
        Strips markdown fences defensively in case the model adds them.
        """
        chunks: list[str] = []

        async with self._client.beta.messages.stream(
            model=self._model,
            max_tokens=64000,
            messages=[{"role": "user", "content": prompt}],
            betas=["output-128k-2025-02-19"],
        ) as stream:
            async for text in stream.text_stream:
                chunks.append(text)

        raw = "".join(chunks).strip()

        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        return json.loads(raw)  # type: ignore[no-any-return]

    async def ocr_pages(self, images: list[bytes]) -> str:
        """Extract text from PNG page images using Claude Vision.

        Accepts up to _OCR_BATCH_SIZE pages as raw PNG bytes and returns
        the concatenated plain text, preserving script layout.
        """
        content: list[dict] = []  # type: ignore[type-arg]
        for img_bytes in images:
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": base64.standard_b64encode(img_bytes).decode(),
                },
            })
        content.append({
            "type": "text",
            "text": (
                "These are pages from a theatrical script scanned as images. "
                "Extract all text exactly as it appears, preserving the structure: "
                "character names (usually ALL CAPS before their line), "
                "stage directions (in parentheses or italics), "
                "scene headers, and dialogue. "
                "Output only the extracted text — no commentary, no markdown."
            ),
        })
        message = await self._client.messages.create(
            model=self._model,
            max_tokens=8096,
            messages=[{"role": "user", "content": content}],
        )
        return message.content[0].text  # type: ignore[union-attr]
