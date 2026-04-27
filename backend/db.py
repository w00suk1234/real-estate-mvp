import os
from pathlib import Path

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    create_engine,
    inspect,
    text,
)


BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", BASE_DIR / "uploads"))
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", BASE_DIR / "outputs"))
DB_PATH = BASE_DIR / "app.db"

FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"
FRONTEND_ASSETS = FRONTEND_DIST / "assets"


def _database_url():
    url = os.getenv("DATABASE_URL")
    if not url:
        return f"sqlite:///{DB_PATH.as_posix()}"
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


DATABASE_URL = _database_url()
IS_SQLITE = DATABASE_URL.startswith("sqlite")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if IS_SQLITE else {},
    pool_pre_ping=True,
)
metadata = MetaData()

users = Table(
    "users",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("username", String(80), nullable=False, unique=True),
    Column("password_hash", Text, nullable=False),
    Column("role", String(20), nullable=False),
    Column("office_name", Text),
    Column("manager_name", Text),
    Column("phone", Text),
    Column("email", Text),
    Column("privacy_agreed", Boolean, nullable=False, server_default=text("false")),
    Column("is_active", Boolean, nullable=False, server_default=text("true")),
    Column("created_at", String(30), nullable=False),
    Column("updated_at", String(30)),
    CheckConstraint("role IN ('admin', 'user', 'viewer')", name="ck_users_role"),
)

properties = Table(
    "properties",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("title", Text, nullable=False),
    Column("category", String(40), server_default="office"),
    Column("deal_type", String(40)),
    Column("address", Text),
    Column("deposit", String(80)),
    Column("monthly_rent", String(80)),
    Column("sale_price", String(80)),
    Column("area", String(120)),
    Column("floor", String(80)),
    Column("memo", Text),
    Column("owner_id", Integer),
    Column("created_at", String(30), nullable=False),
    Column("updated_at", String(30), nullable=False),
)

brochures = Table(
    "brochures",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("title", Text, nullable=False),
    Column("deal_type", String(40)),
    Column("address", Text),
    Column("price", Text),
    Column("area", Text),
    Column("floor", Text),
    Column("rooms", String(40)),
    Column("bathrooms", Text),
    Column("contact_name", Text),
    Column("contact_phone", Text),
    Column("description", Text),
    Column("image_filename", Text),
    Column("brochure_filename", Text),
    Column("image_url", Text),
    Column("brochure_url", Text),
    Column("image_storage_key", Text),
    Column("brochure_storage_key", Text),
    Column("owner_id", Integer),
    Column("created_at", String(30), nullable=False),
)

customers = Table(
    "customers",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("name", Text, nullable=False),
    Column("phone", Text),
    Column("wanted_condition", Text),
    Column("contract_status", String(80)),
    Column("priority", String(80)),
    Column("meeting_status", String(80)),
    Column("source", String(80)),
    Column("source_schedule_id", Integer),
    Column("inflow_date", String(30)),
    Column("memo", Text),
    Column("owner_id", Integer),
    Column("created_at", String(30), nullable=False),
)

schedules = Table(
    "schedules",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("title", Text, nullable=False),
    Column("schedule_type", String(80)),
    Column("schedule_date", String(30)),
    Column("schedule_time", String(20)),
    Column("customer_name", Text),
    Column("note", Text),
    Column("linked_customer_id", Integer),
    Column("owner_id", Integer),
    Column("created_at", String(30), nullable=False),
)


def ensure_runtime_dirs():
    UPLOAD_DIR.mkdir(exist_ok=True)
    OUTPUT_DIR.mkdir(exist_ok=True)


def row_to_dict(row):
    return dict(row._mapping) if row else None


def rows_to_dicts(rows):
    return [row_to_dict(row) for row in rows]


def _add_missing_columns():
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    needed_by_table = {
        "users": {
            "office_name": "TEXT",
            "manager_name": "TEXT",
            "phone": "TEXT",
            "email": "TEXT",
            "privacy_agreed": "BOOLEAN DEFAULT false",
            "updated_at": "TEXT",
        },
        "brochures": {
            "image_url": "TEXT",
            "brochure_url": "TEXT",
            "image_storage_key": "TEXT",
            "brochure_storage_key": "TEXT",
            "owner_id": "INTEGER",
        },
        "properties": {"owner_id": "INTEGER"},
        "customers": {
            "owner_id": "INTEGER",
            "source": "TEXT",
            "source_schedule_id": "INTEGER",
            "inflow_date": "TEXT",
        },
        "schedules": {
            "owner_id": "INTEGER",
            "schedule_time": "TEXT",
            "linked_customer_id": "INTEGER",
        },
    }

    with engine.begin() as conn:
        for table_name, needed in needed_by_table.items():
            if table_name not in existing_tables:
                continue
            existing = {column["name"] for column in inspector.get_columns(table_name)}
            for name, column_type in needed.items():
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {name} {column_type}"))


def init_db():
    ensure_runtime_dirs()
    metadata.create_all(engine)
    _add_missing_columns()
