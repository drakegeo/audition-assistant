import os

from .client import LLMClient


def get_llm_client() -> LLMClient:
    """Return the configured LLM client. Controlled by LLM_PROVIDER env var."""
    provider = os.getenv("LLM_PROVIDER", "anthropic").lower()
    match provider:
        case "anthropic":
            from .anthropic import AnthropicClient
            return AnthropicClient()
        case "groq":
            from .groq import GroqClient
            return GroqClient()
        case _:
            raise ValueError(
                f"Unknown LLM_PROVIDER: {provider!r}. Valid values: 'anthropic', 'groq'."
            )
