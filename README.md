# AgentNote Real Estate MVP

AgentNote는 부동산 중개사가 고객, 일정, 네이버 매물 기반 소개서, 정산 업무를 한 화면에서 관리하기 위한 업무툴 MVP입니다.
현재 운영 기준은 **Vercel + Supabase + Chrome Extension** 구조이며, 강남권 사무실/상가 중개 업무를 우선 대상으로 합니다.

## 배포 주소

- 서비스 도메인: https://agentnote.co.kr
- Vercel 기본 주소: https://real-estate-mvp-navy.vercel.app
- GitHub 저장소: https://github.com/w00suk1234/real-estate-mvp

사용자에게 공유하는 대표 주소는 `https://agentnote.co.kr`입니다. Vercel 기본 주소는 장애 대응 또는 배포 확인용 참고 주소로만 사용합니다.

## 현재 운영 구조

```text
사용자 브라우저
  -> Vercel 정적 프론트엔드
  -> Supabase Auth / Database / Storage

네이버 부동산 페이지
  -> Chrome Extension
  -> AgentNote 소개서 작성 화면으로 데이터 전달
```

- Frontend: Vite + React
- Hosting: Vercel
- Auth: Supabase Auth
- Database: Supabase Postgres
- File Storage: Supabase Storage
- Storage bucket: `property-images`
- Browser automation: Chrome Extension
- Legacy backend: `backend/` 폴더에 FastAPI 실험 구조가 남아 있으나, 현재 운영 배포 기준은 Vercel + Supabase입니다.

## 핵심 기능

- 회원가입 / 로그인
- 내 정보 관리
  - 부동산 이름
  - 담당자명
  - 연락처
  - 이메일
- 고객관리
  - 고객 등록 / 수정 / 삭제
  - 월별 조회
  - 매물종류 필터
  - 계약상태 관리
- 일정관리
  - 월간 달력
  - 일정 등록 / 수정 / 삭제
  - 고객인입 / 미팅 / 계약금입금 / 계약서일정 / 잔금날 관리
  - 잔금 일정 저장 시 정산 대기 자동 생성
- 소개서 작성
  - 네이버 매물 정보 반자동 가져오기
  - 매물 정보 입력
  - 고객용 소개서 미리보기
  - PDF 다운로드 / 인쇄 / 새 창 보기
  - 최근 생성 소개서 관리
- 정산관리
  - 임차인 수수료
  - 임대인 수수료
  - 합계 수수료
  - 정산완료 처리
  - 정산완료 매출 합계
- 계산기
  - 중개보수 계산
  - 임대료 일할 계산
- 사진 편집기
- 주소 / 지번 허브

## 프로젝트 폴더 구조

```text
real-estate-mvp/
  frontend/
    src/
      auth/
        AuthContext.jsx
        ProtectedRoute.jsx
      cards/
        PreviewCard.jsx
        RecentBrochureList.jsx
        ResultCard.jsx
        StateCard.jsx
      components/
        importer/
          NaverImportPanel.jsx
        layout/
          PageShell.jsx
          Sidebar.jsx
          Topbar.jsx
        pdf/
          BriefingPdfView.jsx
      form/
        FileUploadBox.jsx
        PropertyForm.jsx
      lib/
        supabase.js
      pages/
        AddressHubPage.jsx
        AIPropertyRecommendPage.jsx
        BriefingMakerPage.jsx
        CalculatorsPage.jsx
        CustomersPage.jsx
        LoginPage.jsx
        PhotoEditorPage.jsx
        ProfilePage.jsx
        SchedulesPage.jsx
        SettlementPage.jsx
      services/
        aiRecommendationService.js
        supabaseRepository.js
      styles/
        agentnote-ops.css
        auth.css
        layout.css
        theme.css
      utils/
        brochure.js
        imageCompression.js
        pdf.js
        recommendProperties.js
      App.jsx
      main.jsx
    package.json
    vite.config.js

  chrome-extension/
    manifest.json
    content.js
    background.js
    popup.html
    popup.js
    icons/
    README.md

  docs/
    NAVER_IMPORT_AGENT.md

  backend/
    main.py
    routers/
    services/
    collectors/
    agents/
    schemas/

  images/
    icon1.png
```

## 주요 파일 역할

### Frontend

| 파일 | 역할 |
| --- | --- |
| `frontend/src/App.jsx` | 전체 라우팅과 페이지 전환 |
| `frontend/src/auth/AuthContext.jsx` | Supabase 로그인 상태 관리 |
| `frontend/src/components/layout/PageShell.jsx` | 앱 공통 레이아웃 |
| `frontend/src/components/layout/Sidebar.jsx` | 좌측 메뉴와 AgentNote 브랜딩 |
| `frontend/src/components/layout/Topbar.jsx` | 상단 공통 바 |
| `frontend/src/pages/BriefingMakerPage.jsx` | 소개서 작성 메인 화면 |
| `frontend/src/form/PropertyForm.jsx` | 매물 입력 폼 |
| `frontend/src/cards/PreviewCard.jsx` | 고객용 소개서 미리보기 |
| `frontend/src/components/pdf/BriefingPdfView.jsx` | PDF 전용 소개서 렌더링 |
| `frontend/src/utils/pdf.js` | PDF 다운로드 처리 |
| `frontend/src/utils/imageCompression.js` | 이미지 리사이즈 / 압축 |
| `frontend/src/services/supabaseRepository.js` | Supabase 저장 / 조회 함수 모음 |
| `frontend/src/pages/CustomersPage.jsx` | 고객관리 |
| `frontend/src/pages/SchedulesPage.jsx` | 일정관리 |
| `frontend/src/pages/SettlementPage.jsx` | 정산관리 |

### Chrome Extension

| 파일 | 역할 |
| --- | --- |
| `chrome-extension/manifest.json` | 확장 프로그램 권한과 실행 설정 |
| `chrome-extension/content.js` | 네이버 부동산 화면에서 매물 정보 읽기 |
| `chrome-extension/background.js` | 확장 프로그램 백그라운드 처리 |
| `chrome-extension/popup.html` | 확장 프로그램 팝업 UI |
| `chrome-extension/popup.js` | 팝업 동작 처리 |

Chrome Extension은 네이버 부동산에서 현재 보고 있는 상세 패널의 텍스트와 이미지 후보를 읽어 AgentNote 소개서 작성 화면으로 전달합니다. 서버가 네이버 페이지를 다시 여는 방식보다, 사용자가 직접 보고 있는 화면을 읽는 반자동 흐름을 우선합니다.

### Backend

`backend/`는 FastAPI + SQLite/Railway 실험 단계에서 사용한 구조입니다. 현재 운영 서비스는 Vercel + Supabase 기준이므로 신규 기능은 기본적으로 `frontend/`와 Supabase 쪽에서 처리합니다.

## Supabase 구성

AgentNote는 Supabase를 다음 용도로 사용합니다.

- Auth: 회원가입 / 로그인
- Database: 고객, 일정, 소개서, 정산 데이터 저장
- Storage: 매물 이미지 저장

### 주요 테이블

| 테이블 | 용도 |
| --- | --- |
| `profiles` | 회원 부가 정보 |
| `customers` | 고객관리 데이터 |
| `schedules` | 일정관리 데이터 |
| `settlements` | 정산관리 데이터 |
| `brochures` 또는 `properties` | 소개서 / 매물 저장 데이터 |

프로젝트 초기 MVP에서는 SQL Editor로 필요한 컬럼과 RLS 정책을 직접 적용하는 방식으로 운영합니다.

## 이미지 저장 정책

이미지는 DB에 직접 저장하지 않습니다.

정상 흐름:

1. 사용자가 대표사진 또는 추가사진을 선택합니다.
2. 브라우저에서 이미지를 리사이즈 / 압축합니다.
3. 압축된 이미지를 Supabase Storage `property-images` bucket에 업로드합니다.
4. DB에는 이미지 본문이 아니라 public URL 또는 storage path만 저장합니다.

금지 사항:

- DB에 base64 문자열 저장 금지
- DB에 File 객체 저장 금지
- 원본 고해상도 이미지 본문 저장 금지
- `image_urls`, `images` 필드에 긴 data URL 저장 금지

권장 제한:

- 대표사진: 1장
- 추가사진: 최대 10장
- 원본 파일: 1장당 최대 10MB
- 허용 형식: jpg, jpeg, png, webp
- 저장 전 긴 변 기준 최대 1200px로 축소
- WebP 또는 JPEG 품질 0.8 전후
- 가능하면 압축 후 1MB 이하 유지

## 환경변수

로컬 개발 시 `frontend/.env.local` 파일을 만듭니다.

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
VITE_APP_URL=https://agentnote.co.kr
VITE_API_BASE_URL=
```

주의:

- `VITE_SUPABASE_ANON_KEY` 또는 publishable key만 프론트에 넣습니다.
- Supabase `service_role` key, secret key는 절대 프론트엔드 `.env`에 넣지 않습니다.
- `.env.local`은 GitHub에 올리지 않습니다.

## 로컬 개발 방법

### 처음 받는 경우

```powershell
git clone https://github.com/w00suk1234/real-estate-mvp.git
cd real-estate-mvp\frontend
npm install
npm run dev
```

그 다음 브라우저에서 Vite가 안내하는 로컬 주소를 엽니다.

### 이미 프로젝트가 있는 경우

```powershell
cd C:\path\to\real-estate-mvp
git pull origin main
cd frontend
npm install
npm run dev
```

`package.json`이나 `package-lock.json`이 바뀐 경우에는 `npm install`을 다시 실행합니다.

## 빌드

```powershell
cd frontend
npm run build
```

빌드 결과물은 `frontend/dist/`에 생성됩니다. GitHub `main` 브랜치에 push하면 Vercel이 자동 배포합니다.

## Vercel 배포 흐름

1. 로컬에서 작업
2. `npm run build` 확인
3. Git commit
4. GitHub main 브랜치에 push
5. Vercel 자동 배포 시작
6. Vercel Dashboard에서 Deployments 확인
7. 몇 분 뒤 `https://agentnote.co.kr` 반영 확인

## Chrome Extension 설치 방법

1. Chrome에서 `chrome://extensions`를 엽니다.
2. 우측 상단 개발자 모드를 켭니다.
3. `압축해제된 확장 프로그램 로드`를 누릅니다.
4. 프로젝트의 `chrome-extension` 폴더를 선택합니다.
5. 네이버 부동산 탭을 새로고침합니다.
6. 매물 상세 패널을 연 뒤 `업무툴로 가져오기` 버튼을 사용합니다.

확장 프로그램은 `https://agentnote.co.kr` 기준으로 AgentNote에 데이터를 전달합니다.

## QA 체크리스트

배포 전 최소 확인 항목입니다.

- 로그인 / 회원가입이 되는지
- 내 정보 저장이 되는지
- 고객 등록 / 수정 / 삭제가 되는지
- 고객 매물종류 필터가 동작하는지
- 일정 등록 / 수정 / 삭제가 되는지
- 고객인입 일정 저장 시 고객관리 메모가 중복 생성되지 않는지
- 잔금날 일정 저장 시 정산대기가 생성되는지
- 정산완료 후 새로고침해도 상태와 매출 합계가 유지되는지
- 네이버 매물 가져오기가 동작하는지
- 소개서 생성 후 PDF 다운로드가 되는지
- 이미지가 Supabase Storage에 저장되고 DB에는 URL/path만 저장되는지
- `npm run build`가 통과하는지

## 집에서 이어서 작업하기

회사 컴퓨터에서 퇴근 전:

```powershell
git status
cd frontend
npm run build
cd ..
git log --oneline -5
git push origin main
```

집 컴퓨터에서 처음 시작:

```powershell
git clone https://github.com/w00suk1234/real-estate-mvp.git
cd real-estate-mvp\frontend
npm install
notepad .env.local
npm run dev
```

집 컴퓨터에 이미 프로젝트가 있다면:

```powershell
cd C:\path\to\real-estate-mvp
git pull origin main
cd frontend
npm install
npm run dev
```

## 남은 개선 후보

- 네이버 매물 수집 정확도 개선
- 소개서 PDF 레이아웃 추가 고도화
- 고객관리 엑셀 업로드
- 정산 통계 / 월별 매출 대시보드
- Supabase SQL migration 파일화
- Chrome Extension 배포 방식 개선
- 모바일 / 태블릿 UI 추가 QA

## 개발 원칙

- 실제 중개사가 반복해서 쓰는 업무 화면을 우선합니다.
- 완전 자동화보다 검토 가능한 반자동 초안을 우선합니다.
- DB에는 큰 이미지 본문을 넣지 않고 Storage URL/path만 저장합니다.
- 신규 기능보다 고객, 일정, 소개서, 정산 흐름의 안정성을 우선합니다.
