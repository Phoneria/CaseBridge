"""AI-layer exceptions. Callers (services) catch these, never raw SDK
exceptions - see app/ai/providers/openai_provider.py."""


class AIProviderError(Exception):
    """A generic, non-timeout failure talking to the LLM provider."""


class AIProviderTimeoutError(AIProviderError):
    """The LLM provider did not respond in time."""


class AIProviderConfigError(AIProviderError):
    """The selected LLM_PROVIDER is missing required configuration
    (e.g. LLM_PROVIDER=qwen but QWEN_API_KEY is unset). This is a safe,
    user-facing configuration problem - never leaks secret values - and
    must be reported clearly (startup log / AI health status), never
    silently papered over by falling back to MockProvider."""


class AIResponseValidationError(Exception):
    """The LLM provider returned a response that does not match the
    expected structured schema (section 14) - malformed JSON or missing
    required fields. Callers must not persist an unvalidated response."""
