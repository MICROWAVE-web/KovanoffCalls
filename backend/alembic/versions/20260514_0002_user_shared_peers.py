"""user_shared_peers

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-14

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_shared_peers",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("owner_user_id", sa.Integer(), nullable=False),
        sa.Column("peer_telegram_id", sa.BigInteger(), nullable=False),
        sa.Column("first_name", sa.String(length=255), nullable=True),
        sa.Column("last_name", sa.String(length=255), nullable=True),
        sa.Column("username", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "owner_user_id",
            "peer_telegram_id",
            name="uq_user_shared_peers_owner_peer",
        ),
    )
    op.create_index(
        "ix_user_shared_peers_owner_user_id",
        "user_shared_peers",
        ["owner_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_user_shared_peers_peer_telegram_id",
        "user_shared_peers",
        ["peer_telegram_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_user_shared_peers_peer_telegram_id", table_name="user_shared_peers")
    op.drop_index("ix_user_shared_peers_owner_user_id", table_name="user_shared_peers")
    op.drop_table("user_shared_peers")
