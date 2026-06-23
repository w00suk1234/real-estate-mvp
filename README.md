# AgentNote

- Production: [https://agentnote.co.kr](https://agentnote.co.kr/)
- Vercel: [https://real-estate-mvp-navy.vercel.app](https://real-estate-mvp-navy.vercel.app/)
- Repository: [https://github.com/w00suk1234/real-estate-mvp](https://github.com/w00suk1234/real-estate-mvp)

## 프로젝트 소개

AgentNote는 부동산 중개 업무에서 반복되는 고객 조건 정리, 일정 관리, 매물 비교, 소개서 작성, 정산 확인을 한 흐름으로 묶은 업무 관리 MVP입니다.

고객의 희망 조건과 매물 정보를 기준으로 상담에 필요한 내용을 정리하고, AI 브리핑 결과를 사용자가 확인한 뒤 메모 저장, 일정 생성, 소개서 작성으로 이어갈 수 있게 구성했습니다.

## 주요 기능

- 고객관리: 고객 정보, 희망 지역, 예산, 월세, 면적, 용도, 상담 메모 관리
- 일정관리: 고객 인입, 미팅, 계약, 잔금일 등 일정 등록 및 확인
- 매물 추천: 고객 조건과 저장된 매물 정보를 비교해 후보 매물 정렬
- AI 브리핑: 고객 조건과 후보 매물 비교, 상담 요약, 고객 발송 문구, 확인사항 생성
- 승인형 AI 액션: AI 결과를 사용자가 확인한 뒤 고객 메모 저장, 상담 일정 생성, 소개서 작성 이동, 문구 복사 실행
- PDF 소개서: 매물 정보와 이미지를 바탕으로 고객용 소개서를 만들고 PDF로 저장
- 정산 관리: 잔금일 기준 정산 예정 항목과 월별 정산 목록 관리
- 네이버 매물 가져오기 보조: 크롬 확장 프로그램으로 매물 정보를 추출해 앱으로 전달하는 구조

## 기술 스택

- Frontend: React 19, Vite
- API: Vercel Serverless Functions
- Database/Auth: Supabase JS Client
- AI: OpenAI API
- PDF/Image: html2canvas, jsPDF
- Test/Lint: Node test runner, ESLint

## 핵심 구현 포인트

- OpenAI API Key는 프론트엔드에 두지 않고 Vercel Serverless Function에서만 사용합니다.
- `/api/ai-briefing`에서 면적, 예산, 월세, 주차, 용도 조건을 먼저 검증한 뒤 OpenAI에 전달합니다.
- AI가 바로 DB를 수정하지 않고, 사용자가 버튼을 눌러 승인한 작업만 메모 저장, 일정 생성, 소개서 작성으로 이어집니다.
- Supabase 설정이 없는 환경에서도 일부 기능을 확인할 수 있도록 localStorage fallback을 둔 구조입니다.
- 정산 테이블이 준비되지 않은 경우에도 잔금일 일정 데이터를 기준으로 정산 예정 항목을 표시합니다.

## 프로젝트 구조

```txt
real-estate-mvp/
├─ frontend/
│  ├─ api/
│  │  ├─ ai-briefing.js
│  │  ├─ ai-briefings/
│  │  └─ _shared/
│  ├─ src/
│  │  ├─ App.jsx
│  │  ├─ pages/
│  │  ├─ services/
│  │  ├─ utils/
│  │  ├─ components/
│  │  └─ styles/
│  ├─ package.json
│  └─ vercel.json
├─ chrome-extension/
├─ docs/
└─ README.md
```

## 실행 방법

```bash
cd frontend
npm install
npm run dev
```

테스트와 빌드는 아래 명령으로 확인할 수 있습니다.

```bash
npm test
npm run build
```

환경변수는 `frontend/.env.example`을 기준으로 설정합니다.

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
VITE_APP_URL=https://agentnote.co.kr

OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-nano
AI_ENABLE_LLM=true
```

## 배포 주소 또는 데모 주소

- 운영 도메인: [https://agentnote.co.kr](https://agentnote.co.kr)
- Vercel 배포: [https://real-estate-mvp-navy.vercel.app](https://real-estate-mvp-navy.vercel.app)

## 개선 예정 사항

- Supabase schema migration과 Row Level Security 정책 정리
- AI 사용량 제한, 로그, 관리자 확인 화면 보완
- 소개서 이미지 저장소와 업로드 정책 정리
- 에러 모니터링과 배포 환경별 로그 정리
