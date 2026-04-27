from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select

from db import engine, row_to_dict, users
from services.security import decode_access_token


def get_current_user(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="로그인이 필요합니다.",
        )

    token = authorization.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="로그인이 만료되었거나 올바르지 않습니다.",
        )

    with engine.connect() as conn:
        row = conn.execute(
            select(
                users.c.id,
                users.c.username,
                users.c.role,
                users.c.office_name,
                users.c.manager_name,
                users.c.phone,
                users.c.email,
                users.c.privacy_agreed,
                users.c.is_active,
                users.c.created_at,
                users.c.updated_at,
            ).where(users.c.id == int(payload["sub"]))
        ).first()

    user = row_to_dict(row)
    if not user or not user["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="사용할 수 없는 계정입니다.",
        )

    return user


def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="관리자 권한이 필요합니다.",
        )
    return current_user


def is_admin(user: dict):
    return user.get("role") == "admin"
