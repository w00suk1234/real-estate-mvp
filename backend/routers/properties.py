from datetime import datetime

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import delete, insert, select, update

from db import engine, properties, row_to_dict, rows_to_dicts
from dependencies import get_current_user, require_admin


router = APIRouter(prefix="/properties", tags=["properties"])


def _now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _property_values(payload: dict, now: str | None = None):
    values = {
        "title": str(payload.get("title", "")).strip(),
        "category": str(payload.get("category", "office")).strip(),
        "deal_type": str(payload.get("deal_type", "")).strip(),
        "address": str(payload.get("address", "")).strip(),
        "deposit": str(payload.get("deposit", "")).strip(),
        "monthly_rent": str(payload.get("monthly_rent", "")).strip(),
        "sale_price": str(payload.get("sale_price", "")).strip(),
        "area": str(payload.get("area", "")).strip(),
        "floor": str(payload.get("floor", "")).strip(),
        "memo": str(payload.get("memo", "")).strip(),
    }
    if now:
        values["created_at"] = now
    values["updated_at"] = now or _now()
    return values


@router.get("")
def list_properties(current_user: dict = Depends(get_current_user)):
    with engine.connect() as conn:
        rows = conn.execute(select(properties).order_by(properties.c.id.desc())).fetchall()
    return {"items": rows_to_dicts(rows)}


@router.get("/{property_id}")
def get_property(property_id: int, current_user: dict = Depends(get_current_user)):
    with engine.connect() as conn:
        row = conn.execute(
            select(properties).where(properties.c.id == property_id)
        ).first()

    item = row_to_dict(row)
    if not item:
        raise HTTPException(status_code=404, detail="매물을 찾을 수 없습니다.")

    return {"item": item}


@router.post("")
def create_property(payload: dict = Body(...), current_user: dict = Depends(require_admin)):
    title = str(payload.get("title", "")).strip()
    if not title:
        return {"success": False, "message": "매물명은 필수입니다."}

    now = _now()
    with engine.begin() as conn:
        result = conn.execute(
            insert(properties)
            .values(**_property_values(payload, now=now))
            .returning(properties.c.id)
        )
        item_id = result.scalar_one()

    return {"success": True, "message": "매물이 등록되었습니다.", "id": item_id}


@router.put("/{property_id}")
def update_property(
    property_id: int,
    payload: dict = Body(...),
    current_user: dict = Depends(require_admin),
):
    title = str(payload.get("title", "")).strip()
    if not title:
        return {"success": False, "message": "매물명은 필수입니다."}

    with engine.begin() as conn:
        result = conn.execute(
            update(properties)
            .where(properties.c.id == property_id)
            .values(**_property_values(payload))
        )

    if result.rowcount == 0:
        return {"success": False, "message": "매물을 찾을 수 없습니다."}

    return {"success": True, "message": "매물이 수정되었습니다."}


@router.delete("/{property_id}")
def delete_property(property_id: int, current_user: dict = Depends(require_admin)):
    with engine.begin() as conn:
        result = conn.execute(delete(properties).where(properties.c.id == property_id))

    if result.rowcount == 0:
        return {"success": False, "message": "매물을 찾을 수 없습니다."}

    return {"success": True, "message": "매물이 삭제되었습니다."}
