"""Add planning metadata to existing tasks."""
from alembic import op
import sqlalchemy as sa

revision = "e914c60adc31"
down_revision = "d8e9f0a1b2c3"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "case_precedent_links",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("law_firm_id", sa.String(36), sa.ForeignKey("law_firms.id"), nullable=False),
        sa.Column("case_id", sa.String(36), sa.ForeignKey("cases.id", ondelete="CASCADE"), nullable=False),
        sa.Column("precedent_id", sa.String(36), sa.ForeignKey("cases.id", ondelete="CASCADE"), nullable=False),
        sa.UniqueConstraint("case_id", "precedent_id", name="uq_case_precedent"),
    )
    op.add_column("tasks", sa.Column("open_stage", sa.String(16), nullable=False, server_default="todo"))
    op.add_column("tasks", sa.Column("priority", sa.String(12), nullable=False, server_default="normal"))


def downgrade():
    op.drop_table("case_precedent_links")
    op.drop_column("tasks", "priority")
    op.drop_column("tasks", "open_stage")
