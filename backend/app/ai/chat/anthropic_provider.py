"""Claude Messages streaming for a single bureau."""
import anthropic

from app.ai.chat.base import ChatProvider
from app.ai.errors import AIProviderError, AIProviderTimeoutError


class ClaudeChatProvider(ChatProvider):
    provider = "anthropic"

    def __init__(self, key, model, timeout, max_tokens, retries=None):
        options = {"max_retries": retries} if retries is not None else {}
        self.client = anthropic.Anthropic(api_key=key, timeout=timeout, **options)
        self.model = model
        self.max_tokens = max_tokens

    def stream(self, messages):
        self.last_usage = self.last_finish_reason = None
        system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
        try:
            with self.client.messages.stream(model=self.model, system=system, max_tokens=self.max_tokens or 4096,
                                             messages=[m for m in messages if m["role"] != "system"]) as stream:
                yield from stream.text_stream
                response = stream.get_final_message()
                self.last_usage = {"prompt_tokens": response.usage.input_tokens, "completion_tokens": response.usage.output_tokens}
                self.last_finish_reason = "length" if response.stop_reason == "max_tokens" else "stop"
        except anthropic.APITimeoutError:
            raise AIProviderTimeoutError("Claude yanıt süresini aştı.") from None
        except anthropic.AnthropicError:
            raise AIProviderError("Claude yanıtı alınamadı.") from None
