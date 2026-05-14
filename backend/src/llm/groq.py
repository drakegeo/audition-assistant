import json
import os

from groq import AsyncGroq


class GroqClient:
    """LLMClient implementation backed by Groq (OpenAI-compatible API)."""

    def __init__(self) -> None:
        self._client = AsyncGroq(api_key=os.environ["GROQ_API_KEY"])
        # llama-3.3-70b-versatile: 128k context, handles full play scripts comfortably
        self._model = os.getenv("LLM_MODEL", "llama-3.3-70b-versatile")

    async def complete_json(self, prompt: str, *, schema: dict) -> dict:  # type: ignore[type-arg]
        """Stream the LLM response and return parsed JSON.

        Note: Groq free tier limits (~6k TPM) are too small for full-length scripts.
        This works reliably on Groq paid tiers or with short scripts (<10 pages).
        """
        chunks: list[str] = []

        stream = await self._client.chat.completions.create(
            model=self._model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=32000,
            temperature=0,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                chunks.append(delta)

        text = "".join(chunks).strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        return json.loads(text)  # type: ignore[no-any-return]
