"""Allow the UDF (UYAP Doküman Formatı) document type on PostgreSQL."""
from alembic import op

revision = "e2b4d6f8a1c3"
down_revision = "0244bf696c5e"
branch_labels = None
depends_on = None


def upgrade():
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TYPE documenttype ADD VALUE IF NOT EXISTS 'udf'")


def downgrade():
    # PostgreSQL enum labels are additive. Preserve already uploaded UDF documents.
    pass
