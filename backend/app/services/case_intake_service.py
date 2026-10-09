"""Fill-from-document: one model call that turns a document into a case draft.

Nothing is saved. Failures never log the document or the model's answer, only
the exception type.
"""
import logging
from dataclasses import dataclass

from app.ai.case_intake import UNCONFIGURED_MESSAGE, CaseIntakeDraft, build_extraction_prompts
from app.ai.courtroom import parse_with_one_repair
from app.ai.errors import AIProviderConfigError, AIProviderError, AIProviderTimeoutError, AIResponseValidationError
from app.ai.llm_levels import provider_for
from app.ai.providers.base import LLMProvider
from app.core.config import settings

logger = logging.getLogger("casebridge")

NOT_READ_MESSAGE = "Belge okunamadı. Lütfen tekrar deneyin veya alanları elle doldurun."
TIMEOUT_MESSAGE = "AI zamanında yanıt vermedi. Lütfen tekrar deneyin."


class CaseIntakeError(Exception):
    """A user-facing extraction failure (the route turns it into an HTTP error)."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class CaseIntakeResult:
    draft: CaseIntakeDraft
    truncated: bool
    source_chars: int


class CaseIntakeService:
    def __init__(self, provider: LLMProvider):
        self.provider = provider

    def extract(self, text: str) -> CaseIntakeResult:
        limit = settings.case_intake_max_chars
        system_prompt, user_prompt = build_extraction_prompts(text[:limit])
        try:
            raw = provider_for(self.provider, "case_intake.extract").complete(
                system_prompt=system_prompt, user_prompt=user_prompt, response_format="json_object"
            )
            draft = parse_with_one_repair(
                self.provider, raw, CaseIntakeDraft, repair_task="case_intake.json_repair"
            )
        except AIProviderTimeoutError as exc:
            self._log(exc)
            raise CaseIntakeError(504, TIMEOUT_MESSAGE) from exc
        except AIProviderConfigError as exc:
            self._log(exc)
            raise CaseIntakeError(503, UNCONFIGURED_MESSAGE) from exc
        except (AIProviderError, AIResponseValidationError) as exc:
            self._log(exc)
            raise CaseIntakeError(502, NOT_READ_MESSAGE) from exc
        return CaseIntakeResult(draft=draft, truncated=len(text) > limit, source_chars=len(text))

    @staticmethod
    def _log(exc: Exception) -> None:
        logger.warning("Case intake extraction failed: %s", type(exc).__name__)
