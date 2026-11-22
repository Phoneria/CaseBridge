"""Allow the criminal case category on PostgreSQL."""
from alembic import op

revision = "fa28b1d90311"
down_revision = "e914c60adc31"
branch_labels = None
depends_on = None


def upgrade():
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TYPE casetype ADD VALUE IF NOT EXISTS 'ceza'")


def downgrade():
    # PostgreSQL enum labels are additive. Preserve already imported cases.
    pass
