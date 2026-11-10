"""Add an explicit conversation mode without changing existing sessions."""
from alembic import op
import sqlalchemy as sa

revision = "b9d3e7f1a520"
down_revision = "c4e6a8b0d2f3"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("courtroom_sessions", sa.Column("conversation_mode", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    op.drop_column("courtroom_sessions", "conversation_mode")
