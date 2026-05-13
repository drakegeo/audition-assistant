import json
import os

from anthropic import AsyncAnthropic


class AnthropicClient:
    """LLMClient implementation backed by Claude (Anthropic API)."""

    def __init__(self) -> None:
        self._client = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        self._model = os.getenv("LLM_MODEL", "claude-haiku-4-5-20251001")

    async def complete_json(self, prompt: str, *, schema: dict) -> dict:  # type: ignore[type-arg]
        """Call the LLM and return parsed JSON. Strip markdown fences defensively."""
        resp = await self._client.messages.create(
            model=self._model,
            max_tokens=16000,
            messages=[{"role": "user", "content": prompt}],
        )
        text = resp.content[0].text.strip()
        # The model occasionally wraps its output in ```json ... ``` despite being asked not to.
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        return json.loads(text)  # type: ignore[no-any-return]
