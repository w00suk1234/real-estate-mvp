import os
from datetime import datetime

from sqlalchemy import insert, select

from db import engine, users
from services.security import hash_password


def _now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def create_user_if_missing(username: str, password: str, role: str):
    username = username.strip()
    if not username or not password:
        return

    with engine.begin() as conn:
        existing = conn.execute(
            select(users.c.id).where(users.c.username == username)
        ).first()
        if existing:
            return

        conn.execute(
            insert(users).values(
                username=username,
                password_hash=hash_password(password),
                role=role,
                is_active=True,
                created_at=_now(),
            )
        )


def seed_users_from_env():
    admin_username = os.getenv("ADMIN_USERNAME")
    admin_password = os.getenv("ADMIN_PASSWORD")
    viewer_username = os.getenv("VIEWER_USERNAME")
    viewer_password = os.getenv("VIEWER_PASSWORD")

    if admin_username and admin_password:
        create_user_if_missing(admin_username, admin_password, "admin")

    if viewer_username and viewer_password:
        create_user_if_missing(viewer_username, viewer_password, "viewer")
