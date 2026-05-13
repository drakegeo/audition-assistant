from typing import Protocol


class LLMClient(Protocol):
    async def complete_json(self, prompt: str, *, schema: dict) -> dict:  # type: ignore[type-arg]
        """Send prompt, return parsed JSON matching schema. Raises on failure."""
        ...
