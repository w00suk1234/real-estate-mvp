from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import insert, or_, select, update
from sqlalchemy.exc import IntegrityError

from db import engine, row_to_dict, rows_to_dicts, users
from dependencies import get_current_user, require_admin
from services.security import create_access_token, hash_password, verify_password
from services.seed import _now


router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class SignupRequest(BaseModel):
    username: str
    password: str
    office_name: str = ""
    manager_name: str = ""
    phone: str = ""
    email: str = ""
    privacy_agreed: bool = False


class FindUsernameRequest(BaseModel):
    email: str = ""
    phone: str = ""


class PasswordResetRequest(BaseModel):
    username: str = ""


class ProfileUpdateRequest(BaseModel):
    office_name: str = ""
    manager_name: str = ""
    phone: str = ""
    email: str = ""


def _public_user(user: dict):
    return {
        "id": user["id"],
        "username": user["username"],
        "role": user["role"],
        "office_name": user.get("office_name") or "",
        "manager_name": user.get("manager_name") or "",
        "phone": user.get("phone") or "",
        "email": user.get("email") or "",
        "privacy_agreed": bool(user.get("privacy_agreed")),
        "created_at": user.get("created_at"),
        "updated_at": user.get("updated_at"),
    }


def _clean_text(value: str, limit: int = 200):
    return str(value or "").strip()[:limit]


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
                users.c.office_name,
                users.c.manager_name,
                users.c.phone,
                users.c.email,
                users.c.privacy_agreed,
                users.c.is_active,
                users.c.created_at,
                users.c.updated_at,
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

    public_user = _public_user(user)
    return {
        "access_token": create_access_token(public_user),
        "token_type": "bearer",
        "user": public_user,
    }


@router.post("/find-username")
def find_username(payload: FindUsernameRequest):
    email = _clean_text(payload.email, 120)
    phone = _clean_text(payload.phone, 80)
    if not email and not phone:
        raise HTTPException(status_code=400, detail="이메일 또는 연락처를 입력해 주세요.")

    conditions = []
    if email:
        conditions.append(users.c.email == email)
    if phone:
        conditions.append(users.c.phone == phone)

    with engine.connect() as conn:
        row = conn.execute(
            select(users.c.username, users.c.email, users.c.phone)
            .where(or_(*conditions))
            .limit(1)
        ).first()

    user = row_to_dict(row)
    if not user:
        raise HTTPException(status_code=404, detail="입력한 정보와 일치하는 계정을 찾지 못했습니다.")

    return {"username": user["username"], "email": user.get("email") or "", "phone": user.get("phone") or ""}


@router.post("/password-reset-request")
def password_reset_request(_: PasswordResetRequest):
    return {
        "success": True,
        "message": "비밀번호 재설정 요청을 접수했습니다. 운영 환경에서는 가입 이메일로 재설정 메일이 발송됩니다.",
    }


@router.post("/signup")
def signup(payload: SignupRequest):
    username = payload.username.strip()
    password = payload.password.strip()

    if len(username) < 3:
        raise HTTPException(status_code=400, detail="아이디는 3자 이상이어야 합니다.")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="비밀번호는 8자 이상이어야 합니다.")
    if not payload.privacy_agreed:
        raise HTTPException(status_code=400, detail="개인정보 수집 및 이용에 동의해 주세요.")

    values = {
        "username": username,
        "password_hash": hash_password(password),
        "role": "viewer",
        "office_name": _clean_text(payload.office_name),
        "manager_name": _clean_text(payload.manager_name),
        "phone": _clean_text(payload.phone, 80),
        "email": _clean_text(payload.email, 120),
        "privacy_agreed": True,
        "is_active": True,
        "created_at": _now(),
        "updated_at": _now(),
    }

    try:
        with engine.begin() as conn:
            result = conn.execute(
                insert(users)
                .values(**values)
                .returning(
                    users.c.id,
                    users.c.username,
                    users.c.role,
                    users.c.office_name,
                    users.c.manager_name,
                    users.c.phone,
                    users.c.email,
                    users.c.privacy_agreed,
                    users.c.created_at,
                    users.c.updated_at,
                )
            )
            row = result.first()
    except IntegrityError:
        raise HTTPException(status_code=409, detail="이미 사용 중인 아이디입니다.")

    public_user = _public_user(row_to_dict(row))
    return {
        "access_token": create_access_token(public_user),
        "token_type": "bearer",
        "user": public_user,
    }


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    return {"user": _public_user(current_user)}


@router.put("/me")
def update_me(
    payload: ProfileUpdateRequest,
    current_user: dict = Depends(get_current_user),
):
    values = {
        "office_name": _clean_text(payload.office_name),
        "manager_name": _clean_text(payload.manager_name),
        "phone": _clean_text(payload.phone, 80),
        "email": _clean_text(payload.email, 120),
        "updated_at": _now(),
    }

    with engine.begin() as conn:
        conn.execute(
            update(users)
            .where(users.c.id == current_user["id"])
            .values(**values)
        )
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
                users.c.created_at,
                users.c.updated_at,
            ).where(users.c.id == current_user["id"])
        ).first()

    return {"success": True, "user": _public_user(row_to_dict(row))}


@router.get("/users")
def list_users(_: dict = Depends(require_admin)):
    with engine.connect() as conn:
        rows = conn.execute(
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
            ).order_by(users.c.created_at.desc())
        ).fetchall()

    return {"items": rows_to_dicts(rows)}
