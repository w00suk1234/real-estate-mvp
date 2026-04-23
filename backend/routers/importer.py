from fastapi import APIRouter, Depends, HTTPException

from agents.brochure_agent import build_brochure_draft
from collectors.naver_land import collect_naver_listing
from dependencies import get_current_user
from schemas.import_schema import ListingImportRequest, ListingImportResponse
from services.playwright_driver import PageFetchError
from services.vision_service import analyze_listing


router = APIRouter(prefix="/import", tags=["importer"])


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
            message="네이버 매물 정보를 가져왔습니다. 저장 전 내용을 확인하세요.",
        )
    except PageFetchError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"매물 가져오기 중 오류가 발생했습니다: {exc}",
        ) from exc
