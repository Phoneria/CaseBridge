import os
import re
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health():
    result = {"status": "ok", "app": "casebridge"}
    commit = os.getenv("CASEBRIDGE_RELEASE_COMMIT", "")
    version = os.getenv("CASEBRIDGE_APP_VERSION", "")
    if re.fullmatch(r"[0-9a-f]{40}", commit):
        result["release_commit"] = commit
    if re.fullmatch(r"[0-9]+\.[0-9]+", version):
        result["application_version"] = version
    return result
