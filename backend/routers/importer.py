from fastapi import APIRouter, Depends, HTTPException

from agents.brochure_agent import build_brochure_draft
from collectors.generic_table_parser import normalize_listing_fields, normalize_table
from collectors.naver_land import collect_naver_listing
from dependencies import get_current_user
from schemas.import_schema import (
    ExtensionSnapshotRequest,
    ImageCandidate,
    ListingImportRequest,
    ListingImportResponse,
    RawListing,
)
from services.playwright_driver import PageFetchError
from services.vision_service import analyze_listing


router = APIRouter(prefix="/import", tags=["importer"])


def _build_raw_listing_from_snapshot(payload: ExtensionSnapshotRequest) -> RawListing:
    pair_dicts = [pair.model_dump() for pair in payload.pairs]
    table = normalize_table(pair_dicts)
    normalized = normalize_listing_fields(table, title=payload.title)
    images = [
        ImageCandidate(
            url=image.url,
            alt=image.alt,
            source=image.source or "extension",
        )
        for image in payload.images[:40]
    ]

    warnings = []
    if not table:
        warnings.append("The extension could not find enough field data on the current page.")
    if not images:
        warnings.append("The extension could not find image candidates on the current page.")

    return RawListing(
        source="naver_land_extension",
        listing_url=payload.listing_url,
        title=payload.title,
        page_title=payload.page_title,
        table=table,
        normalized_fields=normalized,
        image_urls=[image.url for image in images],
        images=images,
        screenshot_used=False,
        extraction_warnings=warnings,
    )


@router.post("/naver-listing", response_model=ListingImportResponse)
async def import_naver_listing(
    payload: ListingImportRequest,
    current_user: dict = Depends(get_current_user),
):
    try:
        raw_listing = await collect_naver_listing(payload.listing_url)
        vision_analysis = analyze_listing(raw_listing)
        brochure_draft = build_brochure_draft(raw_listing, vision_analysis)
        return ListingImportResponse(
            success=True,
            raw_listing=raw_listing,
            vision_analysis=vision_analysis,
            brochure_draft=brochure_draft,
            message="Naver listing imported. Please review before saving.",
        )
    except PageFetchError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to import listing: {exc}",
        ) from exc


@router.post("/naver-snapshot", response_model=ListingImportResponse)
async def import_naver_snapshot(
    payload: ExtensionSnapshotRequest,
    current_user: dict = Depends(get_current_user),
):
    try:
        raw_listing = _build_raw_listing_from_snapshot(payload)
        vision_analysis = analyze_listing(raw_listing)
        brochure_draft = build_brochure_draft(raw_listing, vision_analysis)
        return ListingImportResponse(
            success=True,
            raw_listing=raw_listing,
            vision_analysis=vision_analysis,
            brochure_draft=brochure_draft,
            message="Extension snapshot imported. Please review before saving.",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process extension snapshot: {exc}",
        ) from exc
