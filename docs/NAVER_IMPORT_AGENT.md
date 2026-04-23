# Naver Listing Import Agent

네이버 부동산 URL을 입력하면 매물 페이지를 읽고, 사진/표 정보/스크린샷 보조 분석을 거쳐 소개서 작성 폼에 넣을 초안을 만드는 업무 에이전트 설계입니다.

## 1단계: 전체 구조 설계

Flow:

```text
React URL input
  -> POST /import/naver-listing
  -> Playwright browser automation
  -> Naver adapter DOM extraction
  -> generic table parser
  -> vision image classifier
  -> brochure agent
  -> JSON draft
  -> React form auto-fill
  -> user review and save
```

역할 분리:

- `routers/importer.py`: HTTP API 진입점
- `services/playwright_driver.py`: 브라우저 자동화, 스크린샷, 공통 팝업/스크롤 처리
- `collectors/naver_land.py`: 네이버 부동산 adapter
- `collectors/generic_table_parser.py`: 표/키-값 텍스트 normalize
- `collectors/generic_gallery.py`: 이미지 후보 정리
- `services/vision_service.py`: Vision provider 추상화
- `agents/brochure_agent.py`: 소개서 초안 생성
- `schemas/import_schema.py`: request/response JSON 구조

## 2단계: 백엔드 폴더 구조

```text
backend/
  routers/
    importer.py
  services/
    playwright_driver.py
    vision_service.py
  collectors/
    naver_land.py
    generic_gallery.py
    generic_table_parser.py
  agents/
    brochure_agent.py
  schemas/
    import_schema.py
```

사이트별 adapter를 늘릴 때는 `collectors/{site_name}.py`를 추가하고 같은 `RawListing` schema로 반환하게 맞춥니다.

## 3단계: 네이버 부동산 수집기

현재 MVP 코드는 `backend/collectors/naver_land.py`와 `backend/services/playwright_driver.py`에 있습니다.

핵심 전략:

- 허용 host를 네이버 부동산으로 제한
- DOM 추출 우선
- `table`, `dl`, `li`, detail box에서 key-value 후보 추출
- `img`, `background-image`, `og:image` 류 URL 후보 수집
- 스크롤로 lazy loading 유도
- 팝업 닫기 시도
- DOM 표가 비어 있으면 `screenshot_used=true`로 fallback 필요 표시

## 4단계: Vision 분석 구조

현재 `services/vision_service.py`는 provider 교체 가능한 구조입니다.

```python
class VisionProvider:
    def analyze_listing_images(self, images): ...
    def analyze_listing_screenshot(self, screenshot_base64): ...
```

MVP는 `HeuristicVisionProvider`로 시작합니다.

향후 실제 Vision API 연결 시 기대 출력:

```json
{
  "provider": "openai",
  "images": [
    {
      "url": "https://...",
      "category": "interior_main",
      "confidence": 0.91,
      "duplicate_candidate": false,
      "quality_flags": []
    }
  ],
  "recommended_main_image_url": "https://...",
  "screenshot_fields": {},
  "warnings": []
}
```

## 5단계: 소개서 자동기입 에이전트

`agents/brochure_agent.py`는 raw listing과 vision 결과를 받아 현재 소개서 폼 field로 변환합니다.

출력:

- `brochure_title`
- `summary_points`
- `description`
- `field_mapping`
- `recommended_images`
- `warnings`

Prompt 원칙:

```text
Do not invent missing facts.
Prefer DOM-extracted table values over screenshot guesses.
Mark uncertain values in warnings.
Output JSON with brochure_title, summary_points, description,
field_mapping, recommended_images, warnings.
```

## 6단계: FastAPI API

Endpoint:

```text
POST /import/naver-listing
```

Request:

```json
{
  "listing_url": "https://new.land.naver.com/..."
}
```

Response:

```json
{
  "success": true,
  "raw_listing": {},
  "vision_analysis": {},
  "brochure_draft": {}
}
```

로그인 사용자만 호출할 수 있게 `get_current_user` dependency를 사용합니다.

## 7단계: React 연결

추가 파일:

```text
frontend/src/components/importer/NaverImportPanel.jsx
frontend/src/api.js
frontend/src/pages/BriefingMakerPage.jsx
```

동작:

- URL 입력
- 가져오기 버튼
- 로딩/에러 표시
- 수집 결과 요약 표시
- `소개서 폼에 반영` 클릭 시 `field_mapping`을 `form` state에 merge

## 8단계: 예외처리/현실 이슈

- 사이트 구조 변경: selector 하나에 의존하지 말고 generic parser 후보를 많이 모읍니다.
- iframe: 필요 시 frame 탐색을 `playwright_driver.py`에 추가합니다.
- 로그인 필요: 로그인 우회는 하지 않습니다. 사용자가 접근 가능한 페이지 기준으로만 처리합니다.
- lazy loading 이미지: 스크롤을 여러 번 실행합니다.
- 팝업/탭 전환: 공통 닫기 selector를 점진적으로 추가합니다.
- DOM 추출 실패: screenshot fallback을 표시하고 Vision provider가 보조 추출합니다.
- 사용자 검토: 자동 저장하지 않고 반드시 사용자가 검토 후 저장합니다.
- 법적/운영 주의: 이용약관과 저작권을 확인하고, 과도한 요청/대량 수집/재배포 목적 사용은 피합니다.

## 9단계: MVP 우선순위

1차 MVP:

- URL 입력
- DOM 표 추출
- 이미지 URL 후보 수집
- heuristic 이미지 분류
- 소개서 field mapping
- 폼 자동기입

2차:

- 실제 Vision API provider 연결
- screenshot OCR/구조화
- 이미지 다운로드 후 R2 임시 저장
- 추천 대표사진을 폼 파일로 가져오는 proxy flow
- 사이트별 adapter 추가

3차:

- 가져오기 작업 queue
- 관리자 감사 로그
- 저장 전 diff 확인 UI
- PDF export 품질 개선
