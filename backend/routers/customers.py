from fastapi import APIRouter, Body, Depends
from sqlalchemy import delete, insert, select, update

from db import customers, engine, rows_to_dicts
from dependencies import get_current_user, is_admin


router = APIRouter(prefix="/customers", tags=["customers"])


def _clean_text(value, limit=300):
    return str(value or "").strip()[:limit]


def _customer_values(payload: dict):
    return {
        "name": _clean_text(payload.get("name"), 120),
        "phone": _clean_text(payload.get("phone"), 80),
        "wanted_condition": _clean_text(payload.get("wanted_condition"), 1000),
        "contract_status": _clean_text(payload.get("contract_status"), 80) or "미계약",
        "priority": _clean_text(payload.get("priority"), 80) or "보통",
        "meeting_status": _clean_text(payload.get("meeting_status"), 80) or "미팅 전",
        "memo": _clean_text(payload.get("memo"), 1200),
        "source": _clean_text(payload.get("source"), 80),
        "source_schedule_id": payload.get("source_schedule_id"),
        "inflow_date": _clean_text(payload.get("inflow_date"), 30),
    }


@router.get("")
def list_customers(current_user: dict = Depends(get_current_user)):
    query = select(customers).order_by(customers.c.created_at.desc(), customers.c.id.desc())
    if not is_admin(current_user):
        query = query.where(customers.c.owner_id == current_user["id"])

    with engine.connect() as conn:
        rows = conn.execute(query).fetchall()
    return {"items": rows_to_dicts(rows)}


@router.post("")
def create_customer(payload: dict = Body(...), current_user: dict = Depends(get_current_user)):
    values = _customer_values(payload)
    if not values["name"]:
        return {"success": False, "message": "고객명은 필수입니다."}

    values["owner_id"] = current_user["id"]
    values["created_at"] = payload.get("created_at") or __import__("datetime").datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    with engine.begin() as conn:
        result = conn.execute(insert(customers).values(**values).returning(customers.c.id))
        customer_id = result.scalar_one()

    return {"success": True, "message": "고객 정보를 저장했습니다.", "id": customer_id}


@router.put("/{customer_id}")
def update_customer(
    customer_id: int,
    payload: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    values = _customer_values(payload)
    if not values["name"]:
        return {"success": False, "message": "고객명은 필수입니다."}

    query = update(customers).where(customers.c.id == customer_id)
    if not is_admin(current_user):
        query = query.where(customers.c.owner_id == current_user["id"])

    with engine.begin() as conn:
        result = conn.execute(query.values(**values))

    if result.rowcount == 0:
        return {"success": False, "message": "고객 정보를 찾을 수 없습니다."}

    return {"success": True, "message": "고객 정보를 수정했습니다."}


@router.delete("/{customer_id}")
def delete_customer(customer_id: int, current_user: dict = Depends(get_current_user)):
    query = delete(customers).where(customers.c.id == customer_id)
    if not is_admin(current_user):
        query = query.where(customers.c.owner_id == current_user["id"])

    with engine.begin() as conn:
        result = conn.execute(query)

    if result.rowcount == 0:
        return {"success": False, "message": "고객 정보를 찾을 수 없습니다."}

    return {"success": True, "message": "고객 정보를 삭제했습니다."}
