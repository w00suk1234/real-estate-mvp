from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import insert, select
from sqlalchemy.exc import IntegrityError

from db import engine, row_to_dict, users
from dependencies import get_current_user
from services.security import create_access_token, hash_password, verify_password
from services.seed import _now


router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class SignupRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(payload: LoginRequest):
    username = payload.username.strip()

    with engine.connect() as conn:
        row = conn.execute(
            select(
                users.c.id,
                users.c.username,
                users.c.password_hash,
                users.c.role,
                users.c.is_active,
                users.c.created_at,
            ).where(users.c.username == username)
        ).first()

    user = row_to_dict(row)
    if not user or not user["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="아이디 또는 비밀번호가 올바르지 않습니다.",
        )

    if not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="아이디 또는 비밀번호가 올바르지 않습니다.",
        )

    public_user = {
        "id": user["id"],
        "username": user["username"],
        "role": user["role"],
    }
    return {
        "access_token": create_access_token(public_user),
        "token_type": "bearer",
        "user": public_user,
    }


@router.post("/signup")
def signup(payload: SignupRequest):
    username = payload.username.strip()
    password = payload.password.strip()

    if len(username) < 3:
        raise HTTPException(status_code=400, detail="아이디는 3자 이상이어야 합니다.")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="비밀번호는 8자 이상이어야 합니다.")

    try:
        with engine.begin() as conn:
            result = conn.execute(
                insert(users)
                .values(
                    username=username,
                    password_hash=hash_password(password),
                    role="viewer",
                    is_active=True,
                    created_at=_now(),
                )
                .returning(users.c.id)
            )
            user_id = result.scalar_one()
    except IntegrityError:
        raise HTTPException(status_code=409, detail="이미 사용 중인 아이디입니다.")

    public_user = {"id": user_id, "username": username, "role": "viewer"}
    return {
        "access_token": create_access_token(public_user),
        "token_type": "bearer",
        "user": public_user,
    }


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    return {"user": current_user}
