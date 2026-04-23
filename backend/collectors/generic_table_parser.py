import re


FIELD_ALIASES = {
    "address": ["소재지", "주소", "위치"],
    "feature": ["매물특징", "특징", "매물 설명"],
    "supply_area": ["계약면적", "공급면적", "분양면적"],
    "exclusive_area": ["전용면적", "전용"],
    "floor": ["층수", "해당층", "층"],
    "direction": ["방향"],
    "move_in": ["입주가능일", "입주 가능일", "입주"],
    "parking": ["주차가능여부", "주차", "주차가능"],
    "restroom": ["화장실수", "화장실", "욕실"],
    "listing_number": ["매물번호", "매물 번호"],
    "deal_type": ["거래유형", "거래 종류", "거래"],
    "deposit": ["보증금"],
    "monthly_rent": ["월세"],
    "maintenance_fee": ["관리비"],
}


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", value).strip()


def normalize_table(raw_pairs: list[dict[str, str]]) -> dict[str, str]:
    table: dict[str, str] = {}
    for pair in raw_pairs:
        key = normalize_text(pair.get("key"))
        value = normalize_text(pair.get("value"))
        if key and value and key not in table:
            table[key] = value
    return table


def find_by_alias(table: dict[str, str], aliases: list[str]) -> str:
    for key, value in table.items():
        normalized_key = normalize_text(key)
        if any(alias in normalized_key for alias in aliases):
            return value
    return ""


def normalize_listing_fields(table: dict[str, str], title: str = "") -> dict[str, str]:
    fields = {"title": normalize_text(title)}
    for target, aliases in FIELD_ALIASES.items():
        fields[target] = find_by_alias(table, aliases)

    price_text = " ".join(
        value for key, value in table.items() if any(token in key for token in ["가격", "월세", "보증금", "전세"])
    )
    if price_text:
        fields["price_text"] = normalize_text(price_text)

    area_text = " ".join(
        value for key, value in table.items() if any(token in key for token in ["면적", "계약", "전용"])
    )
    if area_text:
        fields["area_text"] = normalize_text(area_text)

    return {key: value for key, value in fields.items() if value}
