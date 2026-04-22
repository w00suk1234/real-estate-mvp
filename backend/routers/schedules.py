from datetime import datetime

from fastapi import APIRouter, Body, Depends
from sqlalchemy import delete, insert, select, update

from db import engine, rows_to_dicts, schedules
from dependencies import get_current_user, require_admin


router = APIRouter(prefix="/schedules", tags=["schedules"])


def _now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _schedule_values(payload: dict):
    return {
        "title": str(payload.get("title", "")).strip(),
        "schedule_type": str(payload.get("schedule_type", "미팅")).strip(),
        "schedule_date": str(payload.get("schedule_date", "")).strip(),
        "customer_name": str(payload.get("customer_name", "")).strip(),
        "note": str(payload.get("note", "")).strip(),
    }


@router.get("")
def list_schedules(current_user: dict = Depends(get_current_user)):
    with engine.connect() as conn:
        rows = conn.execute(
            select(schedules).order_by(schedules.c.schedule_date.asc(), schedules.c.id.desc())
        ).fetchall()
    return {"items": rows_to_dicts(rows)}


@router.post("")
def create_schedule(payload: dict = Body(...), current_user: dict = Depends(require_admin)):
    values = _schedule_values(payload)
    if not values["title"]:
        return {"success": False, "message": "일정명은 필수입니다."}

    values["created_at"] = _now()
    with engine.begin() as conn:
        result = conn.execute(
            insert(schedules).values(**values).returning(schedules.c.id)
        )
        schedule_id = result.scalar_one()

    return {"success": True, "message": "일정이 등록되었습니다.", "id": schedule_id}


@router.put("/{schedule_id}")
def update_schedule(
    schedule_id: int,
    payload: dict = Body(...),
    current_user: dict = Depends(require_admin),
):
    values = _schedule_values(payload)
    if not values["title"]:
        return {"success": False, "message": "일정명은 필수입니다."}

    with engine.begin() as conn:
        result = conn.execute(
            update(schedules).where(schedules.c.id == schedule_id).values(**values)
        )

    if result.rowcount == 0:
        return {"success": False, "message": "일정을 찾을 수 없습니다."}

    return {"success": True, "message": "일정이 수정되었습니다."}


@router.delete("/{schedule_id}")
def delete_schedule(schedule_id: int, current_user: dict = Depends(require_admin)):
    with engine.begin() as conn:
        result = conn.execute(delete(schedules).where(schedules.c.id == schedule_id))

    if result.rowcount == 0:
        return {"success": False, "message": "일정을 찾을 수 없습니다."}

    return {"success": True, "message": "일정이 삭제되었습니다."}
