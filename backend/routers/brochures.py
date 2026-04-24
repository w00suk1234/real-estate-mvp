from datetime import datetime
from html import escape
import json
import logging

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from sqlalchemy import delete, insert, select

from db import brochures, engine, row_to_dict, rows_to_dicts
from dependencies import get_current_user, is_admin
from services.storage import delete_stored_file, save_html_file, save_remote_image, save_upload_image


router = APIRouter(tags=["brochures"])
logger = logging.getLogger(__name__)


def _now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _has_value(value: str) -> bool:
    return bool(str(value or "").strip())


def _build_price_text(
    deal_type: str,
    deposit: str,
    monthly_rent: str,
    maintenance_fee: str,
    price_unit: str,
) -> str:
    parts: list[str] = []
    if _has_value(deposit):
        label = "보증금" if deal_type == "월세" else deal_type
        parts.append(f"{label} {deposit}{price_unit}")
    if deal_type == "월세" and _has_value(monthly_rent):
        parts.append(f"월세 {monthly_rent}{price_unit}")
    if _has_value(maintenance_fee):
        parts.append(f"관리비 {maintenance_fee}{price_unit}")
    return " / ".join(parts) if parts else "가격 확인 필요"


def _make_spec_html(label: str, value: str) -> str:
    if not _has_value(value):
        return ""
    return f'<div class="spec"><span>{escape(label)}</span><strong>{escape(value)}</strong></div>'


@router.get("/brochures")
def list_brochures(current_user: dict = Depends(get_current_user)):
    query = select(brochures).order_by(brochures.c.id.desc()).limit(50)
    if not is_admin(current_user):
        query = query.where(brochures.c.owner_id == current_user["id"])

    with engine.connect() as conn:
        rows = conn.execute(query).fetchall()
    return {"items": rows_to_dicts(rows)}


@router.delete("/brochures/{brochure_id}")
def delete_brochure(brochure_id: int, current_user: dict = Depends(get_current_user)):
    query = select(brochures).where(brochures.c.id == brochure_id)
    delete_query = delete(brochures).where(brochures.c.id == brochure_id)
    if not is_admin(current_user):
        query = query.where(brochures.c.owner_id == current_user["id"])
        delete_query = delete_query.where(brochures.c.owner_id == current_user["id"])

    with engine.begin() as conn:
        row = conn.execute(query).first()
        item = row_to_dict(row)
        if not item:
            return {"success": False, "message": "소개서를 찾을 수 없습니다."}

        conn.execute(delete_query)

    delete_stored_file(item.get("image_filename"), item.get("image_storage_key"))
    delete_stored_file(item.get("brochure_filename"), item.get("brochure_storage_key"))

    return {"success": True, "message": "소개서가 삭제되었습니다."}


@router.post("/brochure/create")
async def create_brochure(
    request: Request,
    title: str = Form(...),
    deal_type: str = Form("월세"),
    template_type: str = Form("1page"),
    deposit: str = Form(""),
    monthly_rent: str = Form(""),
    maintenance_fee: str = Form(""),
    price_unit: str = Form("만원"),
    address: str = Form(...),
    supply_area: str = Form(""),
    supply_area_unit: str = Form("평"),
    exclusive_area: str = Form(""),
    exclusive_area_unit: str = Form("평"),
    floor: str = Form(""),
    elevator: str = Form(""),
    rooms: str = Form("0"),
    restroom_type: str = Form(""),
    restroom_detail: str = Form(""),
    parking_count: str = Form(""),
    parking_type: str = Form(""),
    parking_fee: str = Form(""),
    description: str = Form(""),
    contact_name: str = Form(""),
    contact_phone: str = Form(""),
    main_image_url: str = Form(""),
    extra_image_urls: str = Form("[]"),
    main_image: UploadFile | None = File(None),
    extra_images: list[UploadFile] | None = File(None),
    current_user: dict = Depends(get_current_user),
):
    base_url = str(request.base_url).rstrip("/")

    try:
        main_image_file = None
        if main_image and main_image.filename:
            main_image_file = save_upload_image(main_image, base_url)
        elif main_image_url:
            main_image_file = save_remote_image(main_image_url, base_url)

        if not main_image_file:
            return {"success": False, "message": "대표 이미지는 jpg, png, webp 형식만 가능합니다."}

        extra_image_files = []
        for img in (extra_images or [])[:10]:
            saved = save_upload_image(img, base_url)
            if saved:
                extra_image_files.append(saved)

        try:
            remote_extra_urls = json.loads(extra_image_urls or "[]")
        except json.JSONDecodeError:
            remote_extra_urls = []

        for image_url in remote_extra_urls[: max(0, 10 - len(extra_image_files))]:
            saved = save_remote_image(str(image_url), base_url)
            if saved:
                extra_image_files.append(saved)
    except Exception:
        logger.exception("Failed to save uploaded brochure images")
        return {
            "success": False,
            "message": "파일 저장에 실패했습니다. R2 설정 또는 저장소 상태를 확인해주세요.",
        }

    price_text = _build_price_text(
        deal_type=deal_type,
        deposit=deposit,
        monthly_rent=monthly_rent,
        maintenance_fee=maintenance_fee,
        price_unit=price_unit,
    )

    restroom_text = restroom_detail or restroom_type or ""
    parking_text = ""
    if _has_value(parking_count):
        parking_text = f"{parking_count}대 / {parking_type or '주차'}"
        if _has_value(parking_fee):
            parking_text += f" ({parking_fee}{price_unit})"

    area_parts = []
    if _has_value(supply_area):
        area_parts.append(f"공급 {supply_area}{supply_area_unit}")
    if _has_value(exclusive_area):
        area_parts.append(f"전용 {exclusive_area}{exclusive_area_unit}")
    area_text = " / ".join(area_parts)

    floor_parts = []
    if _has_value(floor):
        floor_parts.append(floor)
    if _has_value(elevator):
        floor_parts.append(f"엘리베이터 {elevator}")
    floor_text = " / ".join(floor_parts)

    used_extra = extra_image_files[:10] if template_type == "2page" else extra_image_files[:2]
    extra_images_html = ""
    if used_extra:
        image_items = "\n".join(
            f'<div class="extra-item"><img src="{file.url}" alt="추가 사진" /></div>'
            for file in used_extra
        )
        extra_images_html = f"""
        <section class="section {'page-break' if template_type == '2page' else ''}">
          <div class="section-label">추가 사진</div>
          <div class="extra-grid">{image_items}</div>
        </section>
        """

    safe = {
        "title": escape(title),
        "deal_type": escape(deal_type),
        "address": escape(address),
        "price": escape(price_text),
        "area": escape(area_text),
        "floor": escape(floor_text),
        "rooms": escape(rooms or "-"),
        "restroom": escape(restroom_text),
        "parking": escape(parking_text),
        "description": escape(description or "-"),
        "contact_name": escape(contact_name or "-"),
        "contact_phone": escape(contact_phone or "-"),
    }

    spec_items_html = "".join(
        [
            _make_spec_html("면적", area_text),
            _make_spec_html("층수", floor_text),
            _make_spec_html("방", rooms if _has_value(rooms) and rooms != "0" else ""),
            _make_spec_html("화장실", restroom_text),
            _make_spec_html("주차", parking_text),
        ]
    )

    address_section_html = (
        f"""
      <section class="section">
        <div class="section-label">주소</div>
        <p class="text">{safe['address']}</p>
      </section>
        """
        if _has_value(address)
        else ""
    )

    description_section_html = (
        f"""
      <section class="section">
        <div class="section-label">상세 설명</div>
        <p class="text">{safe['description']}</p>
      </section>
        """
        if _has_value(description)
        else ""
    )

    contact_box_html = ""
    if _has_value(contact_name) or _has_value(contact_phone):
        contact_parts = []
        if _has_value(contact_name):
            contact_parts.append(f"담당자 {escape(contact_name)}")
        if _has_value(contact_phone):
            contact_parts.append(f"연락처 {escape(contact_phone)}")
        contact_box_html = f'<div class="contact-box">{" / ".join(contact_parts)}</div>'

    html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{safe['title']} 소개서</title>
  <style>
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      padding: 24px;
      background: #f4f7fb;
      font-family: Arial, sans-serif;
      color: #0f172a;
    }}
    .page {{
      max-width: 960px;
      margin: 0 auto;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 22px;
      overflow: hidden;
      box-shadow: 0 24px 60px rgba(3, 22, 53, 0.08);
    }}
    .cover {{ position: relative; height: 360px; overflow: hidden; }}
    .cover img {{ width: 100%; height: 100%; object-fit: cover; }}
    .cover-overlay {{
      position: absolute;
      inset: 0;
      background: linear-gradient(to top, rgba(3, 22, 53, 0.86), rgba(3, 22, 53, 0.16));
    }}
    .cover-content {{
      position: absolute;
      left: 32px;
      right: 32px;
      bottom: 28px;
      color: #fff;
    }}
    .badge {{
      display: inline-block;
      padding: 8px 14px;
      border-radius: 999px;
      background: #0058be;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 12px;
    }}
    .title {{ margin: 0; font-size: 34px; font-weight: 800; }}
    .body {{ padding: 30px 32px 34px; }}
    .section {{ margin-bottom: 22px; }}
    .section-label {{
      display: block;
      font-size: 11px;
      font-weight: 700;
      color: #64748b;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }}
    .price {{ font-size: 28px; font-weight: 800; line-height: 1.5; }}
    .text {{ margin: 0; color: #334155; line-height: 1.75; white-space: pre-wrap; }}
    .spec-grid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }}
    .spec {{ background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px; }}
    .spec span {{ display: block; font-size: 12px; color: #64748b; margin-bottom: 6px; }}
    .spec strong {{ font-size: 15px; color: #0f172a; }}
    .extra-grid {{ display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }}
    .extra-item img {{ width: 100%; height: 240px; object-fit: cover; border-radius: 14px; border: 1px solid #e5e7eb; }}
    .contact-box {{ margin-top: 28px; padding-top: 14px; border-top: 1px solid #e5e7eb; font-size: 13px; color: #64748b; text-align: right; }}
    .page-break {{ page-break-before: always; }}
    @media print {{
      body {{ background: #fff; padding: 0; }}
      .page {{ box-shadow: none; border: none; border-radius: 0; }}
    }}
  </style>
</head>
<body>
  <article class="page">
    <div class="cover">
      <img src="{main_image_file.url}" alt="대표 사진" />
      <div class="cover-overlay"></div>
      <div class="cover-content">
        <div class="badge">{safe['deal_type']} 매물</div>
        <h1 class="title">{safe['title']}</h1>
      </div>
    </div>
    <div class="body">
      <section class="section">
        <div class="section-label">가격</div>
        <div class="price">{safe['price']}</div>
      </section>
      {address_section_html}
      {f'<div class="spec-grid">{spec_items_html}</div>' if spec_items_html else ''}
      {description_section_html}
      {extra_images_html}
      {contact_box_html}
    </div>
  </article>
</body>
</html>
"""
    try:
        brochure_file = save_html_file(html, base_url)
    except Exception:
        logger.exception("Failed to save brochure HTML")
        return {
            "success": False,
            "message": "소개서 파일 저장에 실패했습니다. R2 설정 또는 저장소 상태를 확인해주세요.",
        }

    with engine.begin() as conn:
        result = conn.execute(
            insert(brochures)
            .values(
                title=title,
                deal_type=deal_type,
                address=address,
                price=price_text,
                area=area_text,
                floor=floor_text,
                rooms=rooms,
                bathrooms=restroom_text,
                contact_name=contact_name,
                contact_phone=contact_phone,
                description=description,
                image_filename=main_image_file.filename,
                brochure_filename=brochure_file.filename,
                image_url=main_image_file.url,
                brochure_url=brochure_file.url,
                image_storage_key=main_image_file.storage_key,
                brochure_storage_key=brochure_file.storage_key,
                owner_id=current_user["id"],
                created_at=_now(),
            )
            .returning(brochures.c.id)
        )
        brochure_id = result.scalar_one()

    return {
        "success": True,
        "message": "소개서가 생성되었습니다.",
        "brochure_id": brochure_id,
        "image_url": main_image_file.url,
        "brochure_url": brochure_file.url,
    }
