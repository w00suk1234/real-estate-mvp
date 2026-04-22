from datetime import datetime

from sqlalchemy import insert, select

from db import engine, init_db, users
from services.security import hash_password


SEED_USERS = [
    ("admin", "admin1234", "admin"),
    ("viewer", "viewer1234", "viewer"),
]


def seed_users():
    init_db()
    with engine.begin() as conn:
        for username, password, role in SEED_USERS:
            existing = conn.execute(
                select(users.c.id).where(users.c.username == username)
            ).first()
            if existing:
                continue

            conn.execute(
                insert(users).values(
                    username=username,
                    password_hash=hash_password(password),
                    role=role,
                    is_active=True,
                    created_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                )
            )


if __name__ == "__main__":
    seed_users()
    print("Seed users are ready.")
    print("admin / admin1234")
    print("viewer / viewer1234")
