from datetime import datetime

from fastapi import APIRouter, Body, Depends
from sqlalchemy import delete, insert, select, update

from db import customers, engine, rows_to_dicts, schedules
from dependencies import get_current_user, is_admin


router = APIRouter(prefix="/schedules", tags=["schedules"])


def _now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _clean_text(value, limit=300):
    return str(value or "").strip()[:limit]


def _schedule_values(payload: dict):
    return {
        "title": _clean_text(payload.get("title"), 160),
        "schedule_type": _clean_text(payload.get("schedule_type"), 80) or "미팅",
        "schedule_date": _clean_text(payload.get("schedule_date"), 30),
        "schedule_time": _clean_text(payload.get("schedule_time"), 20),
        "customer_name": _clean_text(payload.get("customer_name"), 120),
        "note": _clean_text(payload.get("note"), 1200),
    }


def _create_customer_inflow(conn, schedule_id: int, values: dict, owner_id: int):
    if values["schedule_type"] != "고객인입":
        return None

    customer_name = values["customer_name"] or values["title"]
    if not customer_name:
        customer_name = "고객인입 일정"

    memo_lines = [
        "일정관리에서 고객인입 일정으로 자동 등록된 고객입니다.",
        values["schedule_date"] and f"인입일: {values['schedule_date']}",
        values["schedule_time"] and f"인입시간: {values['schedule_time']}",
        values["note"] and f"비고: {values['note']}",
    ]

    customer_values = {
        "name": customer_name,
        "phone": "",
        "wanted_condition": "",
        "contract_status": "미계약",
        "priority": "보통",
        "meeting_status": "상담 대기",
        "memo": "\n".join([line for line in memo_lines if line]),
        "source": "고객인입 일정",
        "source_schedule_id": schedule_id,
        "inflow_date": values["schedule_date"],
        "owner_id": owner_id,
        "created_at": _now(),
    }

    result = conn.execute(insert(customers).values(**customer_values).returning(customers.c.id))
    return result.scalar_one()


@router.get("")
def list_schedules(current_user: dict = Depends(get_current_user)):
    query = select(schedules).order_by(schedules.c.schedule_date.asc(), schedules.c.schedule_time.asc(), schedules.c.id.desc())
    if not is_admin(current_user):
        query = query.where(schedules.c.owner_id == current_user["id"])

    with engine.connect() as conn:
        rows = conn.execute(query).fetchall()
    return {"items": rows_to_dicts(rows)}


@router.post("")
def create_schedule(payload: dict = Body(...), current_user: dict = Depends(get_current_user)):
    values = _schedule_values(payload)
    if not values["title"]:
        return {"success": False, "message": "일정명은 필수입니다."}

    values["created_at"] = _now()
    values["owner_id"] = current_user["id"]
    values["linked_customer_id"] = None

    with engine.begin() as conn:
        result = conn.execute(insert(schedules).values(**values).returning(schedules.c.id))
        schedule_id = result.scalar_one()
        linked_customer_id = _create_customer_inflow(conn, schedule_id, values, current_user["id"])
        if linked_customer_id:
            conn.execute(
                update(schedules)
                .where(schedules.c.id == schedule_id)
                .values(linked_customer_id=linked_customer_id)
            )

    return {
        "success": True,
        "message": "일정을 등록했습니다.",
        "id": schedule_id,
        "linked_customer_id": linked_customer_id,
    }


@router.put("/{schedule_id}")
def update_schedule(
    schedule_id: int,
    payload: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    values = _schedule_values(payload)
    if not values["title"]:
        return {"success": False, "message": "일정명은 필수입니다."}

    query = update(schedules).where(schedules.c.id == schedule_id)
    if not is_admin(current_user):
        query = query.where(schedules.c.owner_id == current_user["id"])

    with engine.begin() as conn:
        current_row = conn.execute(select(schedules).where(schedules.c.id == schedule_id)).first()
        if not current_row:
            return {"success": False, "message": "일정을 찾을 수 없습니다."}

        current_item = dict(current_row._mapping)
        linked_customer_id = current_item.get("linked_customer_id")
        result = conn.execute(query.values(**values))

        if result.rowcount == 0:
            return {"success": False, "message": "일정을 찾을 수 없습니다."}

        if values["schedule_type"] == "고객인입":
            if linked_customer_id:
                conn.execute(
                    update(customers)
                    .where(customers.c.id == linked_customer_id)
                    .values(
                        name=values["customer_name"] or values["title"] or "고객인입 일정",
                        source="고객인입 일정",
                        source_schedule_id=schedule_id,
                        inflow_date=values["schedule_date"],
                        memo="\n".join(
                            [
                                line
                                for line in [
                                    "일정관리에서 고객인입 일정으로 자동 등록된 고객입니다.",
                                    values["schedule_date"] and f"인입일: {values['schedule_date']}",
                                    values["schedule_time"] and f"인입시간: {values['schedule_time']}",
                                    values["note"] and f"비고: {values['note']}",
                                ]
                                if line
                            ]
                        ),
                    )
                )
            else:
                linked_customer_id = _create_customer_inflow(conn, schedule_id, values, current_user["id"])
                if linked_customer_id:
                    conn.execute(
                        update(schedules)
                        .where(schedules.c.id == schedule_id)
                        .values(linked_customer_id=linked_customer_id)
                    )

    return {"success": True, "message": "일정을 수정했습니다."}


@router.delete("/{schedule_id}")
def delete_schedule(schedule_id: int, current_user: dict = Depends(get_current_user)):
    query = delete(schedules).where(schedules.c.id == schedule_id)
    if not is_admin(current_user):
        query = query.where(schedules.c.owner_id == current_user["id"])

    with engine.begin() as conn:
        result = conn.execute(query)

    if result.rowcount == 0:
        return {"success": False, "message": "일정을 찾을 수 없습니다."}

    return {"success": True, "message": "일정을 삭제했습니다."}
