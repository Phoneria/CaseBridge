"""add chat assistant conversations and messages

Revision ID: c4d1a7e9f2b3
Revises: b83a4e0c1d29
Create Date: 2026-10-02 00:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c4d1a7e9f2b3"
down_revision: Union[str, Sequence[str], None] = "b83a4e0c1d29"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "chat_conversations",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("law_firm_id", sa.String(length=36), sa.ForeignKey("law_firms.id"), nullable=False),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_chat_conversations_law_firm_id", "chat_conversations", ["law_firm_id"])
    op.create_index("ix_chat_conversations_user_id", "chat_conversations", ["user_id"])

    op.create_table(
        "chat_messages",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "conversation_id",
            sa.String(length=36),
            sa.ForeignKey("chat_conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("law_firm_id", sa.String(length=36), sa.ForeignKey("law_firms.id"), nullable=False),
        sa.Column("role", sa.Enum("user", "assistant", name="chatrole"), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("streaming", "complete", "error", "stopped", name="chatmessagestatus"),
            nullable=True,
        ),
        sa.Column("model", sa.String(length=200), nullable=True),
        sa.Column("prompt_tokens", sa.Integer(), nullable=True),
        sa.Column("completion_tokens", sa.Integer(), nullable=True),
        sa.Column("latency_ms", sa.Float(), nullable=True),
        sa.Column("feedback", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_chat_messages_conversation_id", "chat_messages", ["conversation_id"])
    op.create_index("ix_chat_messages_law_firm_id", "chat_messages", ["law_firm_id"])


def downgrade() -> None:
    op.drop_index("ix_chat_messages_law_firm_id", table_name="chat_messages")
    op.drop_index("ix_chat_messages_conversation_id", table_name="chat_messages")
    op.drop_table("chat_messages")
    op.drop_index("ix_chat_conversations_user_id", table_name="chat_conversations")
    op.drop_index("ix_chat_conversations_law_firm_id", table_name="chat_conversations")
    op.drop_table("chat_conversations")
    sa.Enum(name="chatmessagestatus").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="chatrole").drop(op.get_bind(), checkfirst=True)
