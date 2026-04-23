from schemas.import_schema import ImageCandidate


IMAGE_CATEGORY_KEYWORDS = {
    "bathroom": ["bath", "toilet", "restroom", "화장실", "욕실"],
    "kitchen": ["kitchen", "sink", "주방"],
    "parking": ["parking", "garage", "주차"],
    "terrace": ["terrace", "balcony", "베란다", "테라스"],
    "hallway": ["hall", "corridor", "복도"],
    "exterior": ["exterior", "building", "facade", "외관", "건물"],
}


def classify_image_by_metadata(image: ImageCandidate, index: int) -> ImageCandidate:
    text = f"{image.url} {image.alt}".lower()
    category = "interior_main" if index == 0 else "unknown"
    confidence = 0.45 if index == 0 else 0.2

    for label, keywords in IMAGE_CATEGORY_KEYWORDS.items():
        if any(keyword.lower() in text for keyword in keywords):
            category = label
            confidence = 0.7
            break

    image.category = category
    image.confidence = confidence
    image.duplicate_candidate = False
    image.quality_flags = []
    return image


def dedupe_image_candidates(images: list[ImageCandidate]) -> list[ImageCandidate]:
    seen = set()
    result = []
    for image in images:
        key = image.url.split("?")[0]
        if key in seen:
            image.duplicate_candidate = True
        seen.add(key)
        result.append(image)
    return result
