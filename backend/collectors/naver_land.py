from collectors.generic_table_parser import normalize_listing_fields, normalize_table
from schemas.import_schema import ImageCandidate, RawListing
from services.playwright_driver import PageFetchError, fetch_page_dom_snapshot


class NaverLandCollector:
    source = "naver_land"

    async def collect(self, listing_url: str) -> RawListing:
        snapshot = await fetch_page_dom_snapshot(listing_url)
        table = normalize_table(snapshot.get("pairs", []))
        title = snapshot.get("title") or snapshot.get("pageTitle") or ""
        normalized = normalize_listing_fields(table, title=title)

        images = [
            ImageCandidate(
                url=item["url"],
                alt=item.get("alt", ""),
                source=item.get("source", "dom"),
            )
            for item in snapshot.get("images", [])
        ]

        warnings = []
        if not table:
            warnings.append("DOM에서 표 정보를 충분히 찾지 못했습니다. screenshot fallback이 필요할 수 있습니다.")
        if not images:
            warnings.append("DOM에서 이미지 URL을 찾지 못했습니다. 갤러리 탭 구조 변경 가능성이 있습니다.")

        return RawListing(
            source=self.source,
            listing_url=listing_url,
            title=title,
            page_title=snapshot.get("pageTitle", ""),
            table=table,
            normalized_fields=normalized,
            image_urls=[item.url for item in images],
            images=images,
            screenshot_used=not bool(table),
            extraction_warnings=warnings,
        )


async def collect_naver_listing(listing_url: str) -> RawListing:
    try:
        return await NaverLandCollector().collect(listing_url)
    except PageFetchError:
        raise
