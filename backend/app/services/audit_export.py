"""CSV export of audit_events for CaseBridge platform administrators.

The file is written inside the request into a spooled temp file (memory up
to 8 MB, then disk) so the database session is not needed while the
response streams."""
import csv
import io
import json
from datetime import date, datetime, time, timedelta
from tempfile import SpooledTemporaryFile
from typing import Iterator, Optional

from sqlalchemy.orm import Session

from app.models.audit import AuditEvent
from app.models.law_firm import LawFirm

DEFAULT_RANGE_DAYS = 30
MAX_RANGE_DAYS = 366
RANGE_REVERSED = "Başlangıç tarihi bitiş tarihinden sonra olamaz."
RANGE_TOO_LONG = "En fazla 366 günlük kayıt indirilebilir."
COLUMNS = ("occurred_at", "firm_id", "firm_name", "actor_user_id", "actor_role", "action", "case_id", "case_type",
           "target_type", "target_id", "details")
_SPOOL_BYTES = 8 * 1024 * 1024
_CHUNK_BYTES = 64 * 1024


class AuditRangeError(ValueError):
    pass


def resolve_range(start: Optional[date], end: Optional[date], today: date) -> tuple[date, date]:
    end = end or today
    start = start or end - timedelta(days=DEFAULT_RANGE_DAYS - 1)
    if start > end:
        raise AuditRangeError(RANGE_REVERSED)
    if (end - start).days + 1 > MAX_RANGE_DAYS:
        raise AuditRangeError(RANGE_TOO_LONG)
    return start, end


def _line(values) -> bytes:
    buffer = io.StringIO()
    csv.writer(buffer, lineterminator="\r\n").writerow(values)
    return buffer.getvalue().encode("utf-8")


def write_audit_csv(db: Session, start: date, end: date, firm_id: Optional[str] = None) -> SpooledTemporaryFile:
    spool = SpooledTemporaryFile(max_size=_SPOOL_BYTES, mode="w+b")
    spool.write("﻿".encode("utf-8") + _line(COLUMNS))
    query = (
        db.query(AuditEvent, LawFirm.name)
        .join(LawFirm, LawFirm.id == AuditEvent.law_firm_id)
        .filter(
            LawFirm.is_platform.is_(False),
            AuditEvent.occurred_at >= datetime.combine(start, time.min),
            AuditEvent.occurred_at < datetime.combine(end + timedelta(days=1), time.min),
        )
    )
    if firm_id is not None:
        query = query.filter(AuditEvent.law_firm_id == firm_id)
    for row, firm_name in query.order_by(AuditEvent.occurred_at, AuditEvent.id).yield_per(1000):
        spool.write(_line([
            row.occurred_at.strftime("%Y-%m-%dT%H:%M:%SZ"), row.law_firm_id, firm_name,
            row.actor_user_id or "", row.actor_role or "", row.action, row.case_id or "", row.case_type or "",
            row.target_type or "", row.target_id or "",
            json.dumps(row.details or {}, ensure_ascii=False, sort_keys=True),
        ]))
    spool.seek(0)
    return spool


def iter_chunks(spool: SpooledTemporaryFile) -> Iterator[bytes]:
    try:
        while chunk := spool.read(_CHUNK_BYTES):
            yield chunk
    finally:
        spool.close()
