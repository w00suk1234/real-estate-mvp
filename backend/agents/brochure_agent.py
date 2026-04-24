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


def split_price(fields: dict[str, str]) -> dict[str, str]:
    result = {
        "deposit": compact(fields.get("deposit", "")).replace(",", ""),
        "monthly_rent": compact(fields.get("monthly_rent", "")).replace(",", ""),
        "maintenance_fee": compact(fields.get("maintenance_fee", "")).replace(",", ""),
    }
    result = {key: value for key, value in result.items() if value}

    price_text = strip_price_noise(first_value(fields, "price_text"))
    if price_text and not (result.get("deposit") or result.get("monthly_rent")):
        numbers = re.findall(r"[\d,.]+", price_text)
        if "월세" in price_text and len(numbers) >= 2:
            result["deposit"] = numbers[0].replace(",", "")
            result["monthly_rent"] = numbers[1].replace(",", "")
        elif ("전세" in price_text or "매매" in price_text) and numbers:
            result["deposit"] = numbers[0].replace(",", "")

    return result


def build_description(fields: dict[str, str], summary_points: list[str]) -> str:
    parts = []

    feature = first_value(fields, "feature")
    if feature:
        parts.append(feature)

    if summary_points:
        parts.append("핵심 정보: " + " / ".join(summary_points))

    floor = first_value(fields, "floor")
    parking = first_value(fields, "parking")
    direction = first_value(fields, "direction")
    guidance = []
    if floor:
        guidance.append(f"층수는 {floor} 기준으로 확인해 주세요.")
    if parking:
        guidance.append(f"주차 조건은 {parking}입니다.")
    if direction:
        guidance.append(f"방향은 {direction} 기준입니다.")
    if guidance:
        parts.append("상담 포인트: " + " ".join(guidance))

    return "\n".join(parts).strip()


def build_brochure_draft(raw_listing: RawListing, vision: VisionAnalysis) -> BrochureDraft:
    fields = {**raw_listing.normalized_fields, **vision.screenshot_fields}
    price_fields = split_price(fields)

    title = first_value(fields, "title") or raw_listing.title or "네이버 부동산 매물"
    address = first_value(fields, "address")
    supply_area = numeric_area(first_value(fields, "supply_area", "area_text"))
    exclusive_area = numeric_area(first_value(fields, "exclusive_area"))
    floor = first_value(fields, "floor")
    parking = first_value(fields, "parking")
    restroom = first_value(fields, "restroom")

    summary_points = []
    if address:
        summary_points.append(address)
    if supply_area:
        summary_points.append(f"공급면적 {supply_area}")
    if exclusive_area:
        summary_points.append(f"전용면적 {exclusive_area}")
    if floor:
        summary_points.append(f"층수 {floor}")
    if parking:
        summary_points.append(f"주차 {parking}")

    field_mapping = {
        "title": title,
        "deal_type": infer_deal_type(fields),
        "address": address,
        "supply_area": supply_area,
        "exclusive_area": exclusive_area,
        "floor": floor,
        "restroom_detail": restroom,
        "maintenance_fee": price_fields.get("maintenance_fee", ""),
        "parking_count": "1" if "가능" in parking else "",
        "description": build_description(fields, summary_points),
        **price_fields,
    }
    field_mapping = {key: value for key, value in field_mapping.items() if value}

    recommended_images: list[ImageCandidate] = []
    if vision.images:
        main = [item for item in vision.images if item.url == vision.recommended_main_image_url]
        others = [item for item in vision.images if item.url != vision.recommended_main_image_url]
        recommended_images = (main + others)[:10]

    warnings = []
    for required in ["address", "supply_area", "floor"]:
        if required not in field_mapping:
            warnings.append(f"{required} field could not be extracted automatically. Please review it.")
    warnings.extend(raw_listing.extraction_warnings)
    warnings.extend(vision.warnings)

    return BrochureDraft(
        brochure_title=title,
        summary_points=summary_points,
        description=field_mapping.get("description", ""),
        field_mapping=field_mapping,
        recommended_images=recommended_images,
        warnings=warnings,
    )


BROCHURE_AGENT_PROMPT_TEMPLATE = """
You are a Korean real-estate brokerage assistant.
Transform raw listing data into concise brochure form fields.

Rules:
- Do not invent missing facts.
- Prefer DOM-extracted table values over screenshot guesses.
- Mark uncertain values in warnings.
- Output JSON with brochure_title, summary_points, description,
  field_mapping, recommended_images, warnings.
"""
