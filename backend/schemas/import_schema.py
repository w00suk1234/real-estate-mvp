from pydantic import BaseModel, Field


class ListingImportRequest(BaseModel):
    listing_url: str = Field(..., min_length=10)


class ImageCandidate(BaseModel):
    url: str
    alt: str = ""
    source: str = "dom"
    category: str = "unknown"
    confidence: float = 0.0
    duplicate_candidate: bool = False
    quality_flags: list[str] = Field(default_factory=list)


class RawListing(BaseModel):
    source: str = "naver_land"
    listing_url: str
    title: str = ""
    page_title: str = ""
    table: dict[str, str] = Field(default_factory=dict)
    normalized_fields: dict[str, str] = Field(default_factory=dict)
    image_urls: list[str] = Field(default_factory=list)
    images: list[ImageCandidate] = Field(default_factory=list)
    screenshot_used: bool = False
    extraction_warnings: list[str] = Field(default_factory=list)


class VisionAnalysis(BaseModel):
    provider: str = "heuristic"
    images: list[ImageCandidate] = Field(default_factory=list)
    recommended_main_image_url: str | None = None
    screenshot_fields: dict[str, str] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


class BrochureDraft(BaseModel):
    brochure_title: str = ""
    summary_points: list[str] = Field(default_factory=list)
    description: str = ""
    field_mapping: dict[str, str] = Field(default_factory=dict)
    recommended_images: list[ImageCandidate] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ListingImportResponse(BaseModel):
    success: bool
    raw_listing: RawListing | None = None
    vision_analysis: VisionAnalysis | None = None
    brochure_draft: BrochureDraft | None = None
    message: str = ""
