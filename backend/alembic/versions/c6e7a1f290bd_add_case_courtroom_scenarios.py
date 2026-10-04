"""Allow firm-scoped courtroom scenarios derived from a selected case."""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c6e7a1f290bd"
down_revision: Union[str, Sequence[str], None] = "a51c7d8e9f20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("courtroom_scenarios") as batch:
        batch.add_column(sa.Column("law_firm_id", sa.String(length=36), nullable=True))
        batch.add_column(sa.Column("source_case_id", sa.String(length=36), nullable=True))
        batch.create_foreign_key("fk_courtroom_scenarios_firm", "law_firms", ["law_firm_id"], ["id"])
        batch.create_foreign_key("fk_courtroom_scenarios_case", "cases", ["source_case_id"], ["id"], ondelete="SET NULL")
        batch.create_index("ix_courtroom_scenarios_law_firm_id", ["law_firm_id"])
        batch.create_index("ix_courtroom_scenarios_source_case_id", ["source_case_id"])


def downgrade() -> None:
    with op.batch_alter_table("courtroom_scenarios") as batch:
        batch.drop_index("ix_courtroom_scenarios_source_case_id")
        batch.drop_index("ix_courtroom_scenarios_law_firm_id")
        batch.drop_constraint("fk_courtroom_scenarios_case", type_="foreignkey")
        batch.drop_constraint("fk_courtroom_scenarios_firm", type_="foreignkey")
        batch.drop_column("source_case_id")
        batch.drop_column("law_firm_id")
