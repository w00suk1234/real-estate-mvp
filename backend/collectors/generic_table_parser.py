import re


FIELD_ALIASES = {
    "address": ["소재지", "주소", "위치"],
    "feature": ["매물특징", "특징", "매물 설명", "설명"],
    "supply_area": ["계약면적", "공급면적", "분양면적", "면적"],
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


def first_match(text: str, patterns: list[str]) -> str:
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return normalize_text(match.group(1))
    return ""


def extract_number(value: str) -> str:
    match = re.search(r"[\d,.]+", value or "")
    return match.group(0).replace(",", "") if match else ""


def infer_from_visible_text(text: str) -> dict[str, str]:
    text = normalize_text(text)
    fields: dict[str, str] = {}

    fields["address"] = first_match(
        text,
        [
            r"(서울[^\s]{0,10}\s+[^\s]{1,20}\s+[^\s]{1,30}(?:\s+\d{1,5})?)",
            r"(경기[^\s]{0,10}\s+[^\s]{1,20}\s+[^\s]{1,30}(?:\s+\d{1,5})?)",
            r"주소\s*([^\n]{4,80})",
            r"소재지\s*([^\n]{4,80})",
        ],
    )

    fields["floor"] = first_match(
        text,
        [
            r"(\d+\s*/\s*\d+\s*층)",
            r"(\d+\s*층\s*/\s*\d+\s*층)",
            r"층수\s*([^\s]{1,20})",
            r"해당층\s*([^\s]{1,20})",
        ],
    )

    fields["exclusive_area"] = first_match(
        text,
        [
            r"전용면적\s*([\d,.]+\s*(?:㎡|m2|평)?)",
            r"전용\s*([\d,.]+\s*(?:㎡|m2|평)?)",
        ],
    )

    fields["supply_area"] = first_match(
        text,
        [
            r"계약면적\s*([\d,.]+\s*(?:㎡|m2|평)?)",
            r"공급면적\s*([\d,.]+\s*(?:㎡|m2|평)?)",
            r"면적\s*([\d,.]+\s*(?:㎡|m2|평)?)",
        ],
    )

    fields["parking"] = first_match(
        text,
        [
            r"주차(?:가능여부)?\s*([^\s]{1,20})",
            r"(주차\s*(?:가능|불가|협의|무료|유료))",
        ],
    )

    fields["restroom"] = first_match(
        text,
        [
            r"화장실(?:수)?\s*([^\s]{1,20})",
            r"욕실\s*([^\s]{1,20})",
        ],
    )

    fields["feature"] = first_match(
        text,
        [
            r"매물특징\s*([^\n]{4,160})",
            r"특징\s*([^\n]{4,160})",
        ],
    )

    price = first_match(
        text,
        [
            r"(월세\s*[\d,.]+\s*/\s*[\d,.]+)",
            r"(보증금\s*[\d,.]+[^\s]{0,10}\s*/\s*월세\s*[\d,.]+[^\s]{0,10})",
            r"(전세\s*[\d,.]+[^\s]{0,10})",
            r"(매매\s*[\d,.]+[^\s]{0,10})",
        ],
    )
    if price:
        fields["price_text"] = price
        if "월세" in price:
            fields["deal_type"] = "월세"
            numbers = re.findall(r"[\d,.]+", price)
            if len(numbers) >= 2:
                fields["deposit"] = numbers[0].replace(",", "")
                fields["monthly_rent"] = numbers[1].replace(",", "")
        elif "전세" in price:
            fields["deal_type"] = "전세"
            fields["deposit"] = extract_number(price)

    return {key: value for key, value in fields.items() if value}


def normalize_listing_fields(table: dict[str, str], title: str = "") -> dict[str, str]:
    fields = {"title": normalize_text(title)}
    for target, aliases in FIELD_ALIASES.items():
        fields[target] = find_by_alias(table, aliases)

    visible_fields = infer_from_visible_text(table.get("_visible_text", ""))
    for key, value in visible_fields.items():
        fields.setdefault(key, value)
        if not fields.get(key):
            fields[key] = value

    price_text = " ".join(
        value for key, value in table.items() if any(token in key for token in ["가격", "월세", "보증금", "전세", "매매"])
    )
    if price_text:
        fields["price_text"] = normalize_text(price_text)

    area_text = " ".join(
        value for key, value in table.items() if any(token in key for token in ["면적", "계약", "전용", "공급"])
    )
    if area_text:
        fields["area_text"] = normalize_text(area_text)

    return {key: value for key, value in fields.items() if value}
