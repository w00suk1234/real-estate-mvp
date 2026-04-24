import re

from schemas.import_schema import BrochureDraft, ImageCandidate, RawListing, VisionAnalysis


PRICE_NOISE_TOKENS = ["허위매물", "신고", "인쇄", "문의", "상담", "공유"]


def compact(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def strip_price_noise(value: str | None) -> str:
    text = compact(value)
    for token in PRICE_NOISE_TOKENS:
        text = text.replace(token, " ")
    return compact(text)


def first_value(fields: dict[str, str], *keys: str) -> str:
    for key in keys:
        value = compact(fields.get(key))
        if value:
            return value
    return ""


def numeric_area(value: str) -> str:
    match = re.search(r"[\d,.]+", value or "")
    return match.group(0).replace(",", "") if match else ""


def infer_deal_type(fields: dict[str, str]) -> str:
    text = " ".join(fields.values())
    if "전세" in text:
        return "전세"
    if "매매" in text:
        return "매매"
    return "월세"


def clean_number(value: str | None) -> str:
    match = re.search(r"[\d,.]+", value or "")
    return match.group(0).replace(",", "") if match else ""


def money_to_manwon(value: str) -> str:
    text = strip_price_noise(value).replace(",", "")
    eok_match = re.search(r"([\d.]+)\s*억", text)
    if eok_match:
        eok_value = float(eok_match.group(1))
        rest_text = text[eok_match.end() :]
        rest_match = re.search(r"([\d.]+)", rest_text)
        rest_value = float(rest_match.group(1)) if rest_match else 0
        return str(int(round(eok_value * 10000 + rest_value)))
    return clean_number(text)


def split_price(fields: dict[str, str]) -> dict[str, str]:
    price_text = strip_price_noise(first_value(fields, "price_text"))
    deal_type = infer_deal_type(fields)
    deposit = clean_number(first_value(fields, "deposit"))
    monthly_rent = clean_number(first_value(fields, "monthly_rent"))
    maintenance_fee = clean_number(first_value(fields, "maintenance_fee"))
    premium = clean_number(first_value(fields, "premium", "key_money"))

    if price_text and not (deposit or monthly_rent):
      numbers = re.findall(r"[\d,.]+", price_text)
      if deal_type == "월세" and len(numbers) >= 2:
          deposit = money_to_manwon(price_text.split("/")[0])
          monthly_rent = money_to_manwon(price_text.split("/")[1])
      elif deal_type in {"전세", "매매"} and numbers:
          deposit = money_to_manwon(price_text)

    if deal_type == "월세":
        if deposit and monthly_rent:
            price_status = "ok"
        elif deposit or monthly_rent:
            price_status = "partial"
        elif maintenance_fee or premium:
            price_status = "manual_required"
        else:
            price_status = "missing"
    else:
        if deposit:
            price_status = "ok"
        elif maintenance_fee or premium:
            price_status = "manual_required"
        else:
            price_status = "missing"

    return {
        "deposit": deposit,
        "monthly_rent": monthly_rent,
        "maintenance_fee": maintenance_fee,
        "premium": premium,
        "price_status": price_status,
    }


def build_one_line_summary(title: str, address: str, exclusive_area: str, supply_area: str, floor: str, parking: str, recommended_industry: str) -> str:
    area = exclusive_area or supply_area
    area_text = f"전용 {exclusive_area}㎡" if exclusive_area else (f"공급 {supply_area}㎡" if supply_area else "")
    chunks = [address, floor and f"{floor} 기준", area_text, parking and "주차 조건 확인 가능"]
    chunks = [chunk for chunk in chunks if chunk]
    suffix = f"{recommended_industry}에 어울리는" if recommended_industry else "실무형"
    if chunks:
        return f"{', '.join(chunks)} 조건을 갖춘 {suffix} 매물입니다."
    if title:
        return f"{title} 매물은 {suffix} 사무실/상가로 검토할 수 있습니다."
    return f"{suffix} 사무실/상가 매물입니다."


def build_strengths(fields: dict[str, str]) -> list[str]:
    strengths: list[str] = []
    if first_value(fields, "address"):
        strengths.append("위치 확인 완료")
    if "즉시" in first_value(fields, "available_from", "move_in"):
        strengths.append("즉시 입주 가능")
    if first_value(fields, "parking"):
        strengths.append("주차 가능")
    if first_value(fields, "elevator") and "없" not in first_value(fields, "elevator"):
        strengths.append("엘리베이터 있음")
    if first_value(fields, "sign_allowed") and "불가" not in first_value(fields, "sign_allowed"):
        strengths.append("간판 협의 가능")
    if first_value(fields, "hvac"):
        strengths.append(f"{first_value(fields, 'hvac')} 구비")
    if first_value(fields, "recommended_industry"):
        strengths.append("추천 업종 명확")
    return strengths[:4]


def build_recommended_targets(fields: dict[str, str], exclusive_area: str) -> list[str]:
    items = [item.strip() for item in re.split(r"[,/]", first_value(fields, "recommended_industry")) if item.strip()]
    if exclusive_area:
        area_value = float(exclusive_area)
        if area_value <= 40:
            items.append("1~3인 소규모 사무실")
        elif area_value <= 100:
            items.append("예약제 업종 또는 팀 사무실")
    if first_value(fields, "sign_allowed") and "불가" not in first_value(fields, "sign_allowed"):
        items.append("노출형 업종 검토 가능")
    return list(dict.fromkeys(items))[:4]


def build_consult_points(fields: dict[str, str]) -> list[str]:
    points = []
    if first_value(fields, "available_from", "move_in"):
        points.append(f"입주 가능일: {first_value(fields, 'available_from', 'move_in')}")
    if first_value(fields, "maintenance_includes"):
        points.append(f"관리비 포함 항목: {first_value(fields, 'maintenance_includes')}")
    if first_value(fields, "parking"):
        points.append(f"주차 조건: {first_value(fields, 'parking')}")
    if first_value(fields, "restroom", "restroom_detail"):
        points.append(f"화장실: {first_value(fields, 'restroom', 'restroom_detail')}")
    if first_value(fields, "hvac"):
        points.append(f"냉난방: {first_value(fields, 'hvac')}")
    if first_value(fields, "sign_allowed"):
        points.append(f"간판 가능 여부: {first_value(fields, 'sign_allowed')}")
    return points[:4]


def build_check_items(fields: dict[str, str], price_fields: dict[str, str]) -> list[str]:
    items = []
    if price_fields["price_status"] != "ok":
        items.append("정확한 보증금/월차임")
    if not first_value(fields, "maintenance_includes"):
        items.append("관리비 포함 항목")
    if not first_value(fields, "parking"):
        items.append("주차 가능 대수")
    if not first_value(fields, "restroom", "restroom_detail"):
        items.append("화장실 위치/형태")
    if not first_value(fields, "recommended_industry"):
        items.append("추천 업종 또는 업종 제한 여부")
    caution = first_value(fields, "caution_notes")
    if caution:
        items.extend([item.strip() for item in re.split(r"[,/]", caution) if item.strip()])
    return list(dict.fromkeys(items))[:5]


def build_description(summary: str, strengths: list[str], consult_points: list[str]) -> str:
    parts = [summary]
    if strengths:
        parts.append("핵심 장점: " + " / ".join(strengths[:3]))
    if consult_points:
        parts.append("상담 포인트: " + " / ".join(consult_points))
    return "\n".join([part for part in parts if part]).strip()


def build_brochure_draft(raw_listing: RawListing, vision: VisionAnalysis) -> BrochureDraft:
    fields = {**raw_listing.normalized_fields, **vision.screenshot_fields}
    price_fields = split_price(fields)

    title = first_value(fields, "title") or raw_listing.title or "네이버 매물 초안"
    address = first_value(fields, "address")
    supply_area = numeric_area(first_value(fields, "supply_area", "area_text"))
    exclusive_area = numeric_area(first_value(fields, "exclusive_area"))
    floor = first_value(fields, "floor")
    parking = first_value(fields, "parking")
    restroom = first_value(fields, "restroom", "restroom_detail")
    available_from = first_value(fields, "available_from", "move_in")
    hvac = first_value(fields, "hvac")
    recommended_industry = first_value(fields, "recommended_industry")
    sign_allowed = first_value(fields, "sign_allowed")
    maintenance_includes = first_value(fields, "maintenance_includes")

    summary = build_one_line_summary(title, address, exclusive_area, supply_area, floor, parking, recommended_industry)
    strengths = build_strengths(fields)
    recommended_targets = build_recommended_targets(fields, exclusive_area or supply_area)
    consult_points = build_consult_points(fields)
    check_items = build_check_items(fields, price_fields)
    description = build_description(summary, strengths, consult_points)

    summary_points = []
    if address:
        summary_points.append(address)
    if price_fields["deposit"] or price_fields["monthly_rent"]:
        if price_fields["monthly_rent"]:
            summary_points.append(f"보증금 {price_fields['deposit']} / 월차임 {price_fields['monthly_rent']}")
        else:
            summary_points.append(f"{infer_deal_type(fields)} {price_fields['deposit']}")
    elif price_fields["maintenance_fee"]:
        summary_points.append(f"관리비 {price_fields['maintenance_fee']}")
    if exclusive_area:
        summary_points.append(f"전용 {exclusive_area}㎡")
    elif supply_area:
        summary_points.append(f"공급 {supply_area}㎡")
    if floor:
        summary_points.append(f"층수 {floor}")

    field_mapping = {
        "title": title,
        "deal_type": infer_deal_type(fields),
        "address": address,
        "supply_area": supply_area,
        "exclusive_area": exclusive_area,
        "floor": floor,
        "restroom_detail": restroom,
        "parking_count": "1" if "가능" in parking else "",
        "available_from": available_from,
        "hvac": hvac,
        "recommended_industry": recommended_industry,
        "sign_allowed": sign_allowed,
        "maintenance_includes": maintenance_includes,
        "description": description,
        "caution_notes": ", ".join(check_items),
        **price_fields,
    }
    field_mapping = {key: value for key, value in field_mapping.items() if value}

    recommended_images: list[ImageCandidate] = []
    if vision.images:
        main = [item for item in vision.images if item.url == vision.recommended_main_image_url]
        others = [item for item in vision.images if item.url != vision.recommended_main_image_url]
        recommended_images = (main + others)[:10]

    warnings = []
    if price_fields["price_status"] != "ok":
        warnings.append("가격을 정확히 읽지 못했습니다. 보증금, 월차임, 권리금은 직접 확인해 주세요.")
    if not address:
        warnings.append("주소를 읽지 못했습니다. 상세 정보 패널에서 주소가 보이는지 먼저 확인해 주세요.")
    if not supply_area and not exclusive_area:
        warnings.append("면적을 읽지 못했습니다. 공급면적이나 전용면적이 보이는 상태에서 다시 가져와 주세요.")
    warnings.extend(raw_listing.extraction_warnings)
    warnings.extend(vision.warnings)

    return BrochureDraft(
        brochure_title=title,
        summary_points=summary_points,
        description=description,
        field_mapping=field_mapping,
        recommended_images=recommended_images,
        warnings=warnings,
    )


BROCHURE_AGENT_PROMPT_TEMPLATE = """
You are a Korean real-estate brokerage assistant.
Transform raw office/shop listing data into a concise, customer-facing brochure draft.

Rules:
- Do not invent missing facts.
- Prefer DOM-extracted values over screenshot guesses.
- Keep missing pricing natural: use warnings instead of fake numbers.
- Output JSON with brochure_title, summary_points, description,
  field_mapping, recommended_images, warnings.
"""

