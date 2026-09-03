"""Shared column type helpers.

SQLAlchemy's Enum(SomeEnum) stores the Python member NAME in the
database by default (e.g. "KIRA"), not its .value (e.g. "kira") -
even for str-mixin enums like `class CaseType(str, enum.Enum)`. That
silently diverges from the API/JSON contract (which always uses
.value) and breaks the moment anything touches the raw column: bulk
seed scripts inserting "kira", analytics running raw SQL, or a future
Postgres migration relying on a native enum type keyed by value. Use
`str_enum()` everywhere a str-mixin enum backs a column so the stored
value always matches the Python .value.
"""
from typing import Type

from sqlalchemy import Enum


def str_enum(enum_cls: Type) -> Enum:
    return Enum(enum_cls, values_callable=lambda cls: [member.value for member in cls])
