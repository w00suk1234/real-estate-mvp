from datetime import datetime

from fastapi import APIRouter, Body, Depends
from sqlalchemy import delete, insert, select, update

from db import customers, engine, rows_to_dicts
from dependencies import get_current_user, require_admin


router = APIRouter(prefix="/customers", tags=["customers"])


def _now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _customer_values(payload: dict):
    return {
        "name": str(payload.get("name", "")).strip(),
        "phone": str(payload.get("phone", "")).strip(),
        "wanted_condition": str(payload.get("wanted_condition", "")).strip(),
        "contract_status": str(payload.get("contract_status", "미계약")).strip(),
        "priority": str(payload.get("priority", "보통")).strip(),
        "meeting_status": str(payload.get("meeting_status", "미팅 전")).strip(),
        "memo": str(payload.get("memo", "")).strip(),
    }


@router.get("")
def list_customers(current_user: dict = Depends(get_current_user)):
    with engine.connect() as conn:
        rows = conn.execute(select(customers).order_by(customers.c.id.desc())).fetchall()
    return {"items": rows_to_dicts(rows)}


@router.post("")
def create_customer(payload: dict = Body(...), current_user: dict = Depends(require_admin)):
    values = _customer_values(payload)
    if not values["name"]:
        return {"success": False, "message": "고객명은 필수입니다."}

    values["created_at"] = _now()
    with engine.begin() as conn:
        result = conn.execute(
            insert(customers).values(**values).returning(customers.c.id)
        )
        customer_id = result.scalar_one()

    return {"success": True, "message": "고객이 등록되었습니다.", "id": customer_id}


@router.put("/{customer_id}")
def update_customer(
    customer_id: int,
    payload: dict = Body(...),
    current_user: dict = Depends(require_admin),
):
    values = _customer_values(payload)
    if not values["name"]:
        return {"success": False, "message": "고객명은 필수입니다."}

    with engine.begin() as conn:
        result = conn.execute(
            update(customers).where(customers.c.id == customer_id).values(**values)
        )

    if result.rowcount == 0:
        return {"success": False, "message": "고객을 찾을 수 없습니다."}

    return {"success": True, "message": "고객이 수정되었습니다."}


@router.delete("/{customer_id}")
def delete_customer(customer_id: int, current_user: dict = Depends(require_admin)):
    with engine.begin() as conn:
        result = conn.execute(delete(customers).where(customers.c.id == customer_id))

    if result.rowcount == 0:
        return {"success": False, "message": "고객을 찾을 수 없습니다."}

    return {"success": True, "message": "고객이 삭제되었습니다."}
