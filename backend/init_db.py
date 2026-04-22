from db import init_db
from services.seed import create_user_if_missing


SEED_USERS = [
    ("admin", "admin1234", "admin"),
    ("viewer", "viewer1234", "viewer"),
]


def seed_users():
    init_db()
    for username, password, role in SEED_USERS:
        create_user_if_missing(username, password, role)


if __name__ == "__main__":
    seed_users()
    print("Seed users are ready.")
    print("admin / admin1234")
    print("viewer / viewer1234")
