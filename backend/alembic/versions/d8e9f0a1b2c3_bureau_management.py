"""Bureau operations and tenant-scoped platform profiles."""
from alembic import op
import sqlalchemy as sa

revision = "d8e9f0a1b2c3"
down_revision = "b9d3e7f1a520"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("last_seen_at", sa.DateTime(), nullable=True))
    op.create_table(
        "management_records",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("law_firm_id", sa.String(36), sa.ForeignKey("law_firms.id"), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("case_id", sa.String(36), sa.ForeignKey("cases.id")),
        sa.Column("owner_id", sa.String(36), sa.ForeignKey("users.id")),
        sa.Column("due_date", sa.Date()),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted_at", sa.DateTime()),
    )
    op.create_index("ix_management_firm_kind", "management_records", ["law_firm_id", "kind", "deleted_at"])
    op.create_table(
        "management_audits",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("law_firm_id", sa.String(36), sa.ForeignKey("law_firms.id"), nullable=False),
        sa.Column("actor_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("entity_id", sa.String(36), nullable=False),
        sa.Column("entity_type", sa.String(32), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("before", sa.JSON()), sa.Column("after", sa.JSON()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_management_audit_firm_time", "management_audits", ["law_firm_id", "created_at"])
    op.create_table(
        "workspace_access",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("law_firm_id", sa.String(36), sa.ForeignKey("law_firms.id"), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("position", sa.String(24), nullable=False),
        sa.Column("case_ids", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("user_id", name="uq_workspace_access_user"),
    )
    op.create_index("ix_workspace_access_law_firm_id", "workspace_access", ["law_firm_id"])
    op.create_table(
        "firm_profiles",
        sa.Column("law_firm_id", sa.String(36), sa.ForeignKey("law_firms.id"), primary_key=True),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "work_transfers",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("law_firm_id", sa.String(36), sa.ForeignKey("law_firms.id"), nullable=False),
        sa.Column("from_user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("to_user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("counts", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("accepted_at", sa.DateTime()),
    )
    op.create_index("ix_work_transfers_law_firm_id", "work_transfers", ["law_firm_id"])


def downgrade():
    op.drop_table("work_transfers")
    op.drop_table("firm_profiles")
    op.drop_table("workspace_access")
    op.drop_table("management_audits")
    op.drop_table("management_records")
    op.drop_column("users", "last_seen_at")
