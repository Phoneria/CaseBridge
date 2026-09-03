"""add interactive courtroom training tables

Revision ID: 6f2d1c4a9b77
Revises: 9b5e49bd0875
Create Date: 2026-09-03 14:20:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "6f2d1c4a9b77"
down_revision: Union[str, Sequence[str], None] = "9b5e49bd0875"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "courtroom_scenarios",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("category", sa.String(length=80), nullable=False),
        sa.Column(
            "difficulty",
            sa.Enum("beginner", "intermediate", "advanced", name="scenariodifficulty"),
            nullable=False,
        ),
        sa.Column("estimated_rounds", sa.Integer(), nullable=False),
        sa.Column("learning_objectives", sa.JSON(), nullable=False),
        sa.Column("public_facts", sa.JSON(), nullable=False),
        sa.Column("disputed_issues", sa.JSON(), nullable=False),
        sa.Column("plaintiff_private_brief", sa.JSON(), nullable=False),
        sa.Column("defendant_private_brief", sa.JSON(), nullable=False),
        sa.Column("judge_instructions", sa.JSON(), nullable=False),
        sa.Column("legal_context", sa.JSON(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_courtroom_scenarios_slug"), "courtroom_scenarios", ["slug"], unique=True)

    op.create_table(
        "scenario_evidence",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("scenario_id", sa.String(length=36), nullable=False),
        sa.Column("code", sa.String(length=60), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("evidence_type", sa.String(length=80), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("owner_role", sa.String(length=20), nullable=False),
        sa.Column("initially_available", sa.Boolean(), nullable=False),
        sa.Column("authenticity_status", sa.String(length=40), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["scenario_id"], ["courtroom_scenarios.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("scenario_id", "code", name="uq_scenario_evidence_code"),
    )
    op.create_index(op.f("ix_scenario_evidence_scenario_id"), "scenario_evidence", ["scenario_id"])

    op.create_table(
        "courtroom_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("scenario_id", sa.String(length=36), nullable=False),
        sa.Column("law_firm_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("chosen_role", sa.Enum("plaintiff", "defendant", name="courtroomrole"), nullable=False),
        sa.Column("opponent_role", sa.Enum("plaintiff", "defendant", name="courtroomrole"), nullable=False),
        sa.Column(
            "status",
            sa.Enum("active", "completed", "failed", "abandoned", name="courtroomsessionstatus"),
            nullable=False,
        ),
        sa.Column(
            "phase",
            sa.Enum(
                "opening", "main_arguments", "evidence", "examination", "rebuttal", "closing", "verdict",
                name="courtroomphase",
            ),
            nullable=False,
        ),
        sa.Column(
            "current_actor",
            sa.Enum("user", "opponent", "judge", "system", name="courtroomactor"),
            nullable=False,
        ),
        sa.Column("round_number", sa.Integer(), nullable=False),
        sa.Column("max_rounds", sa.Integer(), nullable=False),
        sa.Column("pending_judge_question", sa.Text(), nullable=True),
        sa.Column("presented_evidence_codes", sa.JSON(), nullable=False),
        sa.Column("admitted_evidence_codes", sa.JSON(), nullable=False),
        sa.Column("rejected_evidence_codes", sa.JSON(), nullable=False),
        sa.Column("failure_category", sa.String(length=40), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("model", sa.String(length=100), nullable=True),
        sa.Column("prompt_version", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["scenario_id"], ["courtroom_scenarios.id"]),
        sa.ForeignKeyConstraint(["law_firm_id"], ["law_firms.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_courtroom_sessions_scenario_id"), "courtroom_sessions", ["scenario_id"])
    op.create_index(op.f("ix_courtroom_sessions_law_firm_id"), "courtroom_sessions", ["law_firm_id"])
    op.create_index(op.f("ix_courtroom_sessions_user_id"), "courtroom_sessions", ["user_id"])

    op.create_table(
        "courtroom_turns",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=False),
        sa.Column("sequence_number", sa.Integer(), nullable=False),
        sa.Column("actor", sa.Enum("user", "opponent", "judge", "system", name="courtroomactor"), nullable=False),
        sa.Column("legal_role", sa.String(length=40), nullable=False),
        sa.Column(
            "turn_type",
            sa.Enum(
                "instruction", "opening", "argument", "rebuttal", "evidence", "objection", "question",
                "answer", "ruling", "closing", "verdict", "feedback", "error",
                name="courtroomturntype",
            ),
            nullable=False,
        ),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("evidence_id", sa.String(length=36), nullable=True),
        sa.Column("client_request_id", sa.String(length=64), nullable=True),
        sa.Column("structured_data", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["evidence_id"], ["scenario_evidence.id"]),
        sa.ForeignKeyConstraint(["session_id"], ["courtroom_sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("session_id", "client_request_id", name="uq_courtroom_turn_request"),
        sa.UniqueConstraint("session_id", "sequence_number", name="uq_courtroom_turn_sequence"),
    )
    op.create_index(op.f("ix_courtroom_turns_session_id"), "courtroom_turns", ["session_id"])

    op.create_table(
        "judge_evaluations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=False),
        sa.Column("verdict", sa.String(length=30), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("reasoning", sa.Text(), nullable=False),
        sa.Column("evidence_assessment", sa.JSON(), nullable=False),
        sa.Column("unanswered_questions", sa.JSON(), nullable=False),
        sa.Column("user_strengths", sa.JSON(), nullable=False),
        sa.Column("user_weaknesses", sa.JSON(), nullable=False),
        sa.Column("learning_notes", sa.JSON(), nullable=False),
        sa.Column("relevance_score", sa.Integer(), nullable=False),
        sa.Column("evidence_score", sa.Integer(), nullable=False),
        sa.Column("rebuttal_score", sa.Integer(), nullable=False),
        sa.Column("courtroom_strategy_score", sa.Integer(), nullable=False),
        sa.Column("total_score", sa.Integer(), nullable=False),
        sa.Column("confidence", sa.String(length=20), nullable=False),
        sa.Column("requires_verification", sa.Boolean(), nullable=False),
        sa.Column("disclaimer", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["courtroom_sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("session_id"),
    )
    op.create_index(op.f("ix_judge_evaluations_session_id"), "judge_evaluations", ["session_id"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_judge_evaluations_session_id"), table_name="judge_evaluations")
    op.drop_table("judge_evaluations")
    op.drop_index(op.f("ix_courtroom_turns_session_id"), table_name="courtroom_turns")
    op.drop_table("courtroom_turns")
    op.drop_index(op.f("ix_courtroom_sessions_user_id"), table_name="courtroom_sessions")
    op.drop_index(op.f("ix_courtroom_sessions_law_firm_id"), table_name="courtroom_sessions")
    op.drop_index(op.f("ix_courtroom_sessions_scenario_id"), table_name="courtroom_sessions")
    op.drop_table("courtroom_sessions")
    op.drop_index(op.f("ix_scenario_evidence_scenario_id"), table_name="scenario_evidence")
    op.drop_table("scenario_evidence")
    op.drop_index(op.f("ix_courtroom_scenarios_slug"), table_name="courtroom_scenarios")
    op.drop_table("courtroom_scenarios")
