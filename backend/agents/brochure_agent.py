import re

from schemas.import_schema import BrochureDraft, ImageCandidate, RawListing, VisionAnalysis


def compact(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


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
        "deposit": first_value(fields, "deposit"),
        "monthly_rent": first_value(fields, "monthly_rent"),
        "maintenance_fee": first_value(fields, "maintenance_fee"),
    }
    price_text = first_value(fields, "price_text")
    if price_text and not (result["deposit"] or result["monthly_rent"]):
        numbers = re.findall(r"[\d,.]+", price_text)
        if "월세" in price_text and len(numbers) >= 2:
            result["deposit"] = numbers[0].replace(",", "")
            result["monthly_rent"] = numbers[1].replace(",", "")
        elif ("전세" in price_text or "매매" in price_text) and numbers:
            result["deposit"] = numbers[0].replace(",", "")
    return {key: value for key, value in result.items() if value}


def build_description(fields: dict[str, str], summary_points: list[str]) -> str:
    base = []
    feature = first_value(fields, "feature")
    if feature:
        base.append(feature)
    if summary_points:
        base.append(" / ".join(summary_points))
    return "\n".join(base).strip()


def build_brochure_draft(raw_listing: RawListing, vision: VisionAnalysis) -> BrochureDraft:
    fields = {**raw_listing.normalized_fields, **vision.screenshot_fields}
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
        summary_points.append(f"계약면적 {supply_area}")
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
        "parking_count": "1" if "가능" in parking else "",
        "description": build_description(fields, summary_points),
        **split_price(fields),
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
