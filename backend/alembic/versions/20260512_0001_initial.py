"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-05-12

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("telegram_id", sa.BigInteger(), nullable=False),
        sa.Column("username", sa.String(length=255), nullable=True),
        sa.Column("first_name", sa.String(length=255), nullable=True),
        sa.Column("last_name", sa.String(length=255), nullable=True),
        sa.Column("photo_url", sa.String(length=1024), nullable=True),
        sa.Column("language_code", sa.String(length=16), nullable=True),
        sa.Column(
            "last_seen",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_users_telegram_id", "users", ["telegram_id"], unique=True)

    call_status = postgresql.ENUM(
        "pending", "active", "ended", "missed", "declined",
        name="call_status",
        create_type=True,
    )
    call_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "calls",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "caller_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "callee_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "status",
            postgresql.ENUM(name="call_status", create_type=False),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
    )
    op.create_index("ix_calls_caller_id", "calls", ["caller_id"])
    op.create_index("ix_calls_callee_id", "calls", ["callee_id"])


def downgrade() -> None:
    op.drop_index("ix_calls_callee_id", table_name="calls")
    op.drop_index("ix_calls_caller_id", table_name="calls")
    op.drop_table("calls")
    op.execute("DROP TYPE IF EXISTS call_status")
    op.drop_index("ix_users_telegram_id", table_name="users")
    op.drop_table("users")
