"""friend_requests and call media_mode

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-16

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    friend_status = postgresql.ENUM(
        "pending",
        "accepted",
        "declined",
        name="friend_request_status",
        create_type=True,
    )
    friend_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "friend_requests",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("from_user_id", sa.Integer(), nullable=False),
        sa.Column("to_user_id", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(name="friend_request_status", create_type=False),
            nullable=False,
        ),
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
        sa.ForeignKeyConstraint(["from_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["to_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "from_user_id",
            "to_user_id",
            name="uq_friend_requests_from_to",
        ),
    )
    op.create_index(
        "ix_friend_requests_from_user_id",
        "friend_requests",
        ["from_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_friend_requests_to_user_status",
        "friend_requests",
        ["to_user_id", "status"],
        unique=False,
    )

    media_mode = postgresql.ENUM(
        "audio",
        "video",
        name="call_media_mode",
        create_type=True,
    )
    media_mode.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "calls",
        sa.Column(
            "media_mode",
            postgresql.ENUM(name="call_media_mode", create_type=False),
            nullable=False,
            server_default="video",
        ),
    )
    op.alter_column("calls", "media_mode", server_default=None)


def downgrade() -> None:
    op.drop_column("calls", "media_mode")
    op.execute("DROP TYPE IF EXISTS call_media_mode")

    op.drop_index("ix_friend_requests_to_user_status", table_name="friend_requests")
    op.drop_index("ix_friend_requests_from_user_id", table_name="friend_requests")
    op.drop_table("friend_requests")
    op.execute("DROP TYPE IF EXISTS friend_request_status")
