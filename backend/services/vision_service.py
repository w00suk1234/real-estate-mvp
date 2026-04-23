import os

from collectors.generic_gallery import classify_image_by_metadata, dedupe_image_candidates
from schemas.import_schema import ImageCandidate, RawListing, VisionAnalysis


class VisionProvider:
    name = "base"

    def analyze_listing_images(self, images: list[ImageCandidate]) -> VisionAnalysis:
        raise NotImplementedError

    def analyze_listing_screenshot(self, screenshot_base64: str | None) -> dict[str, str]:
        return {}


class HeuristicVisionProvider(VisionProvider):
    name = "heuristic"

    def analyze_listing_images(self, images: list[ImageCandidate]) -> VisionAnalysis:
        classified = [
            classify_image_by_metadata(image.model_copy(deep=True), index)
            for index, image in enumerate(images)
        ]
        classified = dedupe_image_candidates(classified)
        recommended = next((item.url for item in classified if item.category == "interior_main"), None)
        if not recommended and classified:
            recommended = classified[0].url

        warnings = []
        if not classified:
            warnings.append("분석할 이미지가 없습니다.")

        return VisionAnalysis(
            provider=self.name,
            images=classified,
            recommended_main_image_url=recommended,
            warnings=warnings,
        )


class ExternalVisionProvider(VisionProvider):
    name = "external"

    def analyze_listing_images(self, images: list[ImageCandidate]) -> VisionAnalysis:
        # Provider hook. Replace this class with OpenAI, Google, or another vision API.
        # Expected categories: interior_main, exterior, bathroom, kitchen, hallway,
        # terrace, parking, duplicate_candidate.
        return HeuristicVisionProvider().analyze_listing_images(images)


def get_vision_provider() -> VisionProvider:
    provider = os.getenv("VISION_PROVIDER", "heuristic").strip().lower()
    if provider in {"external", "openai", "google"}:
        return ExternalVisionProvider()
    return HeuristicVisionProvider()


def analyze_listing(raw_listing: RawListing) -> VisionAnalysis:
    provider = get_vision_provider()
    analysis = provider.analyze_listing_images(raw_listing.images)
    if raw_listing.screenshot_used:
        analysis.screenshot_fields = provider.analyze_listing_screenshot(None)
    return analysis
