"""stub for be2 (caf5db912fa8)

Stub: the real BE-2 migration file lives on another worktree branch not yet
merged to master; the shared DB is already at be3_chat. This stub lets alembic
resolve the revision graph so later migrations (be4_kb) can chain onto be3_chat.
The DB is already past this revision, so upgrade never executes it.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'caf5db912fa8'
down_revision: Union[str, Sequence[str], None] = '1292e1d6a854'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
