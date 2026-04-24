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


def _has_value(value: str | None) -> bool:
    return bool(str(value or "").strip())


def _clean_number(value: str | None) -> str:
    import re

    match = re.search(r"[\d,.]+", value or "")
    return match.group(0).replace(",", "") if match else ""


def _format_amount(value: str | None, unit: str = "만원") -> str:
    numeric = _clean_number(value)
    if not numeric:
        return ""
    if "." in numeric:
        integer_part, decimal_part = numeric.split(".", 1)
        return f"{int(integer_part):,}.{decimal_part}{unit}"
    return f"{int(float(numeric)):,}{unit}"


def _get_price_status(deal_type: str, deposit: str, monthly_rent: str, maintenance_fee: str, premium: str, raw_status: str) -> str:
    if raw_status:
        return raw_status

    has_deposit = _has_value(deposit)
    has_monthly = _has_value(monthly_rent)
    has_maintenance = _has_value(maintenance_fee)
    has_premium = _has_value(premium)

    if deal_type == "월세":
        if has_deposit and has_monthly:
            return "ok"
        if has_deposit or has_monthly:
            return "partial"
        if has_maintenance or has_premium:
            return "manual_required"
        return "missing"

    if has_deposit:
        return "ok"
    if has_maintenance or has_premium:
        return "manual_required"
    return "missing"


def _build_price_parts(deal_type: str, deposit: str, monthly_rent: str, maintenance_fee: str, premium: str, price_unit: str) -> list[str]:
    parts: list[str] = []
    if _has_value(deposit):
        label = "보증금" if deal_type == "월세" else deal_type
        parts.append(f"{label} {_format_amount(deposit, price_unit)}")
    if deal_type == "월세" and _has_value(monthly_rent):
        parts.append(f"월차임 {_format_amount(monthly_rent, price_unit)}")
    if _has_value(maintenance_fee):
        parts.append(f"관리비 {_format_amount(maintenance_fee, price_unit)}")
    if _has_value(premium):
        parts.append(f"권리금 {_format_amount(premium, price_unit)}")
    return parts


def _build_price_text(deal_type: str, deposit: str, monthly_rent: str, maintenance_fee: str, premium: str, price_unit: str, price_status: str) -> str:
    parts = _build_price_parts(deal_type, deposit, monthly_rent, maintenance_fee, premium, price_unit)
    if price_status == "ok":
        return " / ".join(parts)
    if price_status == "partial":
        return " · ".join(["가격 확인 필요", *parts]) if parts else "가격 확인 필요"
    if price_status == "manual_required":
        return " · ".join(["금액 협의", *parts]) if parts else "금액 협의"
    return " / ".join(parts) if parts else "가격 확인 필요"


def _build_area_text(supply_area: str, supply_area_unit: str, exclusive_area: str, exclusive_area_unit: str) -> str:
    parts: list[str] = []
    if _has_value(supply_area):
        parts.append(f"공급 {supply_area}{supply_area_unit}")
    if _has_value(exclusive_area):
        parts.append(f"전용 {exclusive_area}{exclusive_area_unit}")
    return " / ".join(parts)


def _build_parking_text(parking_count: str, parking_type: str, parking_fee: str, price_unit: str) -> str:
    parts: list[str] = []
    if _has_value(parking_count):
        parts.append(f"{parking_count}대")
    if _has_value(parking_type):
        parts.append(parking_type)
    if parking_type == "유료" and _has_value(parking_fee):
        parts.append(_format_amount(parking_fee, price_unit))
    return " / ".join(parts)


def _build_strengths(address: str, available_from: str, parking_text: str, elevator: str, sign_allowed: str, hvac: str, recommended_industry: str, maintenance_includes: str) -> list[str]:
    strengths: list[str] = []
    if _has_value(address):
        strengths.append("위치 확인 완료")
    if "즉시" in (available_from or ""):
        strengths.append("즉시 입주 가능")
    if _has_value(parking_text):
        strengths.append("주차 가능")
    if elevator == "유":
        strengths.append("엘리베이터 있음")
    if _has_value(sign_allowed) and "불가" not in sign_allowed:
        strengths.append("간판 협의 가능")
    if _has_value(hvac):
        strengths.append(f"{hvac} 구비")
    if _has_value(recommended_industry):
        strengths.append("추천 업종 명확")
    if _has_value(maintenance_includes):
        strengths.append("관리비 항목 확인 가능")
    return strengths[:4]


def _build_one_line_summary(address: str, floor: str, exclusive_area: str, exclusive_area_unit: str, supply_area: str, supply_area_unit: str, parking_text: str, recommended_industry: str, title: str) -> str:
    area_text = (
        f"전용 {exclusive_area}{exclusive_area_unit}" if _has_value(exclusive_area) else (
            f"공급 {supply_area}{supply_area_unit}" if _has_value(supply_area) else ""
        )
    )
    chunks = [address, floor and f"{floor} 기준", area_text, parking_text and "주차 조건 확인 가능"]
    chunks = [chunk for chunk in chunks if chunk]
    suffix = f"{recommended_industry}에 어울리는" if _has_value(recommended_industry) else "실무형"
    if chunks:
        return f"{', '.join(chunks)} 조건을 갖춘 {suffix} 매물입니다."
    return f"{title} 매물은 {suffix} 사무실/상가로 검토할 수 있습니다."


def _build_recommended_targets(recommended_industry: str, exclusive_area: str, sign_allowed: str) -> list[str]:
    targets = [item.strip() for item in recommended_industry.replace("/", ",").split(",") if item.strip()]
    if _has_value(exclusive_area):
        try:
            area_value = float(_clean_number(exclusive_area))
            if area_value <= 40:
                targets.append("1~3인 소규모 사무실")
            elif area_value <= 100:
                targets.append("예약제 업종 또는 팀 사무실")
        except ValueError:
            pass
    if _has_value(sign_allowed) and "불가" not in sign_allowed:
        targets.append("노출형 업종 검토 가능")
    return list(dict.fromkeys(targets))[:4]


def _build_consult_points(available_from: str, maintenance_includes: str, parking_text: str, restroom_text: str, hvac: str, sign_allowed: str) -> list[str]:
    points = []
    if _has_value(available_from):
        points.append(f"입주 가능일: {available_from}")
    if _has_value(maintenance_includes):
        points.append(f"관리비 포함 항목: {maintenance_includes}")
    if _has_value(parking_text):
        points.append(f"주차 조건: {parking_text}")
    if _has_value(restroom_text):
        points.append(f"화장실: {restroom_text}")
    if _has_value(hvac):
        points.append(f"냉난방: {hvac}")
    if _has_value(sign_allowed):
        points.append(f"간판 가능 여부: {sign_allowed}")
    return points[:4]


def _build_check_items(price_status: str, maintenance_includes: str, parking_count: str, restroom_text: str, recommended_industry: str, caution_notes: str) -> list[str]:
    items = []
    if price_status != "ok":
        items.append("정확한 보증금/월차임")
    if not _has_value(maintenance_includes):
        items.append("관리비 포함 항목")
    if not _has_value(parking_count):
        items.append("주차 가능 대수")
    if not _has_value(restroom_text):
        items.append("화장실 위치/형태")
    if not _has_value(recommended_industry):
        items.append("추천 업종 또는 업종 제한 여부")
    if _has_value(caution_notes):
        items.extend([item.strip() for item in caution_notes.replace("/", ",").split(",") if item.strip()])
    return list(dict.fromkeys(items))[:5]


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

    return {"success": True, "message": "소개서를 삭제했습니다."}


@router.post("/brochure/create")
async def create_brochure(
    request: Request,
    title: str = Form(...),
    deal_type: str = Form("월세"),
    template_type: str = Form("1page"),
    deposit: str = Form(""),
    monthly_rent: str = Form(""),
    maintenance_fee: str = Form(""),
    premium: str = Form(""),
    price_unit: str = Form("만원"),
    price_status: str = Form(""),
    address: str = Form(...),
    supply_area: str = Form(""),
    supply_area_unit: str = Form("㎡"),
    exclusive_area: str = Form(""),
    exclusive_area_unit: str = Form("㎡"),
    floor: str = Form(""),
    elevator: str = Form(""),
    rooms: str = Form("0"),
    restroom_type: str = Form(""),
    restroom_detail: str = Form(""),
    parking_count: str = Form(""),
    parking_type: str = Form(""),
    parking_fee: str = Form(""),
    recommended_industry: str = Form(""),
    hvac: str = Form(""),
    sign_allowed: str = Form(""),
    available_from: str = Form(""),
    maintenance_includes: str = Form(""),
    caution_notes: str = Form(""),
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
        for image in (extra_images or [])[:10]:
            saved = save_upload_image(image, base_url)
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
            "message": "파일 저장에 실패했습니다. R2 설정 또는 저장소 상태를 확인해 주세요.",
        }

    restroom_text = restroom_detail or restroom_type or ""
    parking_text = _build_parking_text(parking_count, parking_type, parking_fee, price_unit)
    normalized_price_status = _get_price_status(deal_type, deposit, monthly_rent, maintenance_fee, premium, price_status)
    price_text = _build_price_text(deal_type, deposit, monthly_rent, maintenance_fee, premium, price_unit, normalized_price_status)
    area_text = _build_area_text(supply_area, supply_area_unit, exclusive_area, exclusive_area_unit)
    strengths = _build_strengths(address, available_from, parking_text, elevator, sign_allowed, hvac, recommended_industry, maintenance_includes)
    one_line_summary = _build_one_line_summary(address, floor, exclusive_area, exclusive_area_unit, supply_area, supply_area_unit, parking_text, recommended_industry, title)
    recommended_targets = _build_recommended_targets(recommended_industry, exclusive_area or supply_area, sign_allowed)
    consult_points = _build_consult_points(available_from, maintenance_includes, parking_text, restroom_text, hvac, sign_allowed)
    check_items = _build_check_items(normalized_price_status, maintenance_includes, parking_count, restroom_text, recommended_industry, caution_notes)

    used_extra = extra_image_files[:10] if template_type == "2page" else extra_image_files[:4]
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

    info_cards = "".join(
        [
            _make_spec_html("전용면적", f"{exclusive_area}{exclusive_area_unit}" if _has_value(exclusive_area) else ""),
            _make_spec_html("공급면적", f"{supply_area}{supply_area_unit}" if _has_value(supply_area) else ""),
            _make_spec_html("층수", floor),
            _make_spec_html("엘리베이터", elevator),
            _make_spec_html("주차", parking_text),
            _make_spec_html("입주 가능일", available_from),
            _make_spec_html("냉난방", hvac),
            _make_spec_html("간판 가능", sign_allowed),
            _make_spec_html("화장실", restroom_text),
            _make_spec_html("관리비 포함", maintenance_includes),
        ]
    )

    strengths_html = (
        "<div class='badge-row'>"
        + "".join(f"<span class='chip'>{escape(item)}</span>" for item in strengths)
        + "</div>"
        if strengths
        else ""
    )

    recommended_html = (
        "<ul class='bullet-list'>"
        + "".join(f"<li>{escape(item)}</li>" for item in recommended_targets)
        + "</ul>"
        if recommended_targets
        else ""
    )
    consult_html = (
        "<ul class='bullet-list'>"
        + "".join(f"<li>{escape(item)}</li>" for item in consult_points)
        + "</ul>"
        if consult_points
        else ""
    )
    check_html = (
        "<ul class='bullet-list warning-list'>"
        + "".join(f"<li>{escape(item)}</li>" for item in check_items)
        + "</ul>"
        if check_items
        else ""
    )

    contact_box_html = ""
    if _has_value(contact_name) or _has_value(contact_phone):
        contact_parts = []
        if _has_value(contact_name):
            contact_parts.append(f"담당자 {escape(contact_name)}")
        if _has_value(contact_phone):
            contact_parts.append(f"연락처 {escape(contact_phone)}")
        contact_box_html = f"<div class='contact-box'>{' / '.join(contact_parts)}</div>"

    description_text = description or one_line_summary
    share_text = "\n".join(
        [
            title,
            one_line_summary,
            f"가격: {price_text}",
            f"주소: {address}" if _has_value(address) else "",
            f"추천 업종: {recommended_industry}" if _has_value(recommended_industry) else "",
        ]
    ).strip()

    html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{escape(title)} 소개서</title>
  <style>
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      padding: 24px;
      background: #f4f7fb;
      font-family: "Arial", sans-serif;
      color: #0f172a;
    }}
    .page {{
      max-width: 960px;
      margin: 0 auto;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 24px;
      overflow: hidden;
      box-shadow: 0 24px 60px rgba(3, 22, 53, 0.08);
    }}
    .cover {{
      position: relative;
      height: 340px;
      overflow: hidden;
      background: #dbe5f0;
    }}
    .cover img {{
      width: 100%;
      height: 100%;
      object-fit: cover;
    }}
    .cover-overlay {{
      position: absolute;
      inset: 0;
      background: linear-gradient(to top, rgba(3, 22, 53, 0.82), rgba(3, 22, 53, 0.16));
      display: flex;
      align-items: flex-end;
    }}
    .cover-content {{
      width: 100%;
      padding: 28px 32px;
      color: #fff;
    }}
    .badge {{
      display: inline-block;
      padding: 8px 14px;
      border-radius: 999px;
      background: #0b5dd7;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 12px;
    }}
    .title {{ margin: 0 0 10px; font-size: 34px; font-weight: 800; }}
    .address {{ margin: 0 0 8px; font-size: 15px; opacity: 0.92; }}
    .price {{ font-size: 28px; font-weight: 800; line-height: 1.45; }}
    .body {{ padding: 30px 32px 34px; }}
    .section {{ margin-bottom: 24px; }}
    .section-label {{
      display: block;
      margin-bottom: 10px;
      font-size: 11px;
      font-weight: 700;
      color: #64748b;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }}
    .summary {{
      margin: 0;
      font-size: 16px;
      color: #1e293b;
      line-height: 1.7;
    }}
    .badge-row {{
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }}
    .chip {{
      padding: 7px 12px;
      border-radius: 999px;
      background: #eff6ff;
      color: #1d4ed8;
      font-size: 12px;
      font-weight: 700;
    }}
    .spec-grid {{
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }}
    .spec {{
      background: #f8fafc;
      border: 1px solid #e5e7eb;
      border-radius: 14px;
      padding: 14px;
    }}
    .spec span {{
      display: block;
      margin-bottom: 6px;
      font-size: 12px;
      color: #64748b;
    }}
    .spec strong {{
      font-size: 15px;
      color: #0f172a;
    }}
    .text {{
      margin: 0;
      color: #334155;
      line-height: 1.8;
      white-space: pre-wrap;
    }}
    .bullet-list {{
      margin: 0;
      padding-left: 18px;
      color: #334155;
      line-height: 1.8;
    }}
    .warning-list li {{ color: #9a3412; }}
    .extra-grid {{
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 14px;
    }}
    .extra-item img {{
      width: 100%;
      height: 220px;
      object-fit: cover;
      border-radius: 14px;
      border: 1px solid #e5e7eb;
    }}
    .contact-box {{
      margin-top: 28px;
      padding-top: 14px;
      border-top: 1px solid #e5e7eb;
      font-size: 13px;
      color: #64748b;
      text-align: right;
    }}
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
      <img src="{main_image_file.url}" alt="대표 이미지" />
      <div class="cover-overlay">
        <div class="cover-content">
          <div class="badge">{escape(deal_type)} 매물</div>
          <h1 class="title">{escape(title)}</h1>
          <p class="address">{escape(address) if _has_value(address) else "주소 확인 필요"}</p>
          <div class="price">{escape(price_text)}</div>
        </div>
      </div>
    </div>
    <div class="body">
      {f"<section class='section'>{strengths_html}</section>" if strengths_html else ""}
      <section class="section">
        <div class="section-label">한 줄 요약</div>
        <p class="summary">{escape(one_line_summary)}</p>
      </section>
      {f"<section class='section'><div class='section-label'>기본 정보</div><div class='spec-grid'>{info_cards}</div></section>" if info_cards else ""}
      {f"<section class='section'><div class='section-label'>상세 설명</div><p class='text'>{escape(description_text)}</p></section>" if _has_value(description_text) else ""}
      {f"<section class='section'><div class='section-label'>추천 대상 / 추천 업종</div>{recommended_html}</section>" if recommended_html else ""}
      {f"<section class='section'><div class='section-label'>상담 시 강조 포인트</div>{consult_html}</section>" if consult_html else ""}
      {f"<section class='section'><div class='section-label'>확인 필요 사항</div>{check_html}</section>" if check_html else ""}
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
            "message": "소개서 파일 저장에 실패했습니다. R2 설정 또는 저장소 상태를 확인해 주세요.",
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
                floor=floor,
                rooms=rooms,
                bathrooms=restroom_text,
                contact_name=contact_name,
                contact_phone=contact_phone,
                description=description_text,
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
        "message": "소개서를 생성했습니다. 최종 소개서와 전달용 액션을 확인해 주세요.",
        "brochure_id": brochure_id,
        "image_url": main_image_file.url,
        "brochure_url": brochure_file.url,
        "share_text": share_text,
    }

