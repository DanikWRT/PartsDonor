"""be4_kb

Revision ID: be4_kb
Revises: be3_chat
Create Date: 2026-09-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'be4_kb'
down_revision: Union[str, Sequence[str], None] = 'be3_chat'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: add knowledge-base tables (kb_categories, kb_articles)."""
    op.create_table(
        'kb_categories',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('slug', sa.String(length=64), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('sort', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('slug'),
    )

    op.create_table(
        'kb_articles',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('cat', sa.String(length=64), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('excerpt', sa.Text(), nullable=False, server_default=''),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('model', sa.String(length=128), nullable=False, server_default=''),
        sa.Column('tags', sa.String(length=255), nullable=False, server_default=''),
        sa.Column('author_id', sa.UUID(), nullable=True),
        sa.Column('priority', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('rating', sa.Float(), nullable=False, server_default='0'),
        sa.Column('votes', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('views', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['author_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_kb_articles_cat'), 'kb_articles', ['cat'], unique=False)
    op.create_index(op.f('ix_kb_articles_author_id'), 'kb_articles', ['author_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema: remove knowledge-base tables (reverse create order)."""
    op.drop_index(op.f('ix_kb_articles_author_id'), table_name='kb_articles')
    op.drop_index(op.f('ix_kb_articles_cat'), table_name='kb_articles')
    op.drop_table('kb_articles')
    op.drop_table('kb_categories')
