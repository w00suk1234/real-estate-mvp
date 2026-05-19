# AgentNote 면접/포트폴리오 설명 노트

이 문서는 README보다 더 실전용입니다. 면접, 포트폴리오 발표, 프로젝트 회고에서 바로 말할 수 있도록 프론트엔드 구성, 백엔드/API 구성, AI 설계, 데이터 흐름, 기술 선택 이유를 정리했습니다.

## 1. 한 줄 소개

AgentNote는 부동산 중개사의 고객 상담, 일정관리, 매물 소개서 작성, 정산관리, AI 상담 브리핑을 하나의 업무 흐름으로 묶은 React 기반 부동산 업무 통합 MVP입니다.

## 2. 30초 소개 스크립트

> AgentNote는 부동산 중개 업무에서 반복되는 고객 조건 정리, 일정 기록, 매물 비교, 소개서 작성, 정산 확인을 한 화면에서 처리할 수 있도록 만든 SaaS형 MVP입니다.  
> 특히 OpenAI를 단순 문장 생성이 아니라, 서버에서 먼저 고객 필수 조건과 매물 조건을 검증한 뒤 상담 브리핑을 생성하는 방식으로 연결했습니다.  
> AI가 자동으로 DB를 수정하지 않고 사용자가 버튼을 눌러 승인해야 고객 메모 저장, 상담 일정 생성, 소개서 작성 이동이 실행되는 구조로 설계했습니다.

## 3. 1분 소개 스크립트

> 이 프로젝트는 실제 부동산 중개 업무 흐름을 기준으로 만들었습니다.  
> 프론트엔드는 React와 Vite로 구성했고, 고객관리, 일정관리, AI 브리핑, AI 매물 추천, 소개서 작성, 정산관리 페이지를 각각 독립적인 페이지 컴포넌트로 나눴습니다.  
> 데이터는 Supabase를 기본 저장소로 사용하고, 일부 테이블이 준비되지 않은 상황에서도 화면이 깨지지 않도록 localStorage fallback과 schedule 기반 정산 예정 자동 생성 로직을 추가했습니다.  
> AI 브리핑은 `/api/ai-briefing` Vercel Serverless Function에서 OpenAI를 호출합니다. API Key는 프론트에 넣지 않고 서버에서만 사용합니다.  
> 중요한 점은 AI가 추천 점수를 마음대로 판단하지 않도록, 서버에서 면적, 예산, 월세, 주차, 용도 조건을 먼저 계산하고 그 결과를 OpenAI 프롬프트에 전달했다는 점입니다.  
> 그래서 면적 조건을 못 맞춘 매물이 AI 문장 때문에 1순위 추천처럼 보이는 위험을 줄였습니다.

## 4. 핵심 기능

- 고객관리: 고객명, 연락처, 희망 지역, 예산, 월세, 면적, 용도, 메모 관리
- 일정관리: 고객 인입, 미팅, 계약 일정, 잔금일 관리
- AI 매물 추천: 고객 조건 기준으로 저장 매물 중 가까운 후보 자동 선정
- AI 브리핑: 고객 조건과 후보 매물 비교 후 상담용 요약, 고객 발송 문구, 확인사항 생성
- 승인형 AI 액션: 고객 메모 저장, 상담 일정 만들기, 소개서 작성 이동, 고객 문구 복사
- 소개서 작성: 매물 정보 입력, 이미지 업로드, 고객용 PDF 소개서 생성
- 정산관리: 잔금일 기준 1주일 내 정산 예정 표시, 월별 정산 목록 관리
- 네이버 매물 가져오기 보조: 크롬 확장 프로그램 기반 매물 정보 추출 구조

## 5. 프론트엔드 구성

### 기술 스택

- React 19
- Vite
- CSS 기반 커스텀 디자인 시스템
- Supabase JS Client
- html2canvas, jsPDF
- Node test runner
- ESLint

### 주요 구조

```txt
frontend/src/
├─ App.jsx
├─ pages/
│  ├─ AIBriefingPage.jsx
│  ├─ AIPropertyRecommendPage.jsx
│  ├─ BriefingMakerPage.jsx
│  ├─ CustomersPage.jsx
│  ├─ SchedulesPage.jsx
│  ├─ SettlementPage.jsx
│  └─ TeamModePage.jsx
├─ services/
│  ├─ supabaseRepository.js
│  ├─ aiBriefingService.js
│  └─ aiRecommendationService.js
├─ utils/
│  ├─ aiBriefing.js
│  ├─ recommendProperties.js
│  ├─ settlementAlerts.js
│  ├─ brochure.js
│  └─ calculators.js
├─ components/
├─ cards/
├─ auth/
└─ styles/
   ├─ theme.css
   └─ agentnote-ops.css
```

### 프론트엔드에서 설명할 포인트

- `App.jsx`에서 현재 페이지 상태를 관리하고, URL path/query에 따라 페이지를 전환합니다.
- 사이드바 메뉴를 늘리기보다 기존 업무 메뉴 안에서 기능을 확장했습니다.
- 각 업무 도메인은 `pages` 아래에 독립 페이지로 분리했습니다.
- Supabase 접근은 화면에서 직접 흩뿌리지 않고 `services/supabaseRepository.js`에 모아두었습니다.
- 계산/정규화/추천 점수 같은 순수 로직은 `utils`로 분리해 테스트 가능하게 만들었습니다.
- AI 브리핑 화면은 `sessionStorage` draft를 사용해 소개서 화면으로 갔다가 돌아와도 선택 고객, 선택 매물, AI 결과가 유지되도록 했습니다.

## 6. 백엔드/API 구성

이 프로젝트의 백엔드는 별도 Express 서버가 아니라 Vercel Serverless Function 중심입니다.

```txt
frontend/api/
├─ ai-briefing.js
├─ ai-briefings/
│  ├─ index.js
│  └─ generate.js
├─ customer-property-feedback.js
├─ ai-usage.js
└─ _shared/
   └─ aiServer.js
```

### API 설계 설명

- 프론트엔드는 OpenAI를 직접 호출하지 않습니다.
- 브라우저는 내부 API인 `/api/ai-briefing`만 호출합니다.
- `OPENAI_API_KEY`는 Vercel Serverless Function 환경변수로만 사용합니다.
- `aiServer.js`에는 JSON 요청/응답 처리, AI 설정, 공통 서버 유틸이 들어갑니다.
- `/api/ai-briefing`에서 고객 조건과 매물 조건을 먼저 검증한 뒤 OpenAI에 전달합니다.

## 7. 데이터 구성

기본 데이터 저장소는 Supabase입니다.

주요 데이터 개념:

- customers: 고객 정보, 상담 조건, 메모
- schedules: 일정 정보, 고객 인입/미팅/계약/잔금일
- brochures: 소개서 작성 데이터
- settlements: 정산 데이터
- feedback/ai logs: AI 추천 피드백 또는 사용량 관리용 API 구조

### fallback 전략

포트폴리오/테스트 환경에서는 Supabase 테이블이 완전히 준비되지 않을 수 있습니다. 그래서 다음 fallback을 넣었습니다.

- Supabase 미설정 시 localStorage 기반 저장
- customers/schedules/brochures는 사용자 scope를 붙인 localStorage key 사용
- settlements 테이블이 없을 때는 잔금일 일정에서 정산 예정 항목을 자동 생성
- Supabase schema cache 에러는 사용자에게 날것 그대로 보여주지 않고 안내 메시지로 변환

면접에서 말할 포인트:

> 실제 운영 환경에서는 DB schema가 안정적이어야 하지만, MVP 단계에서는 테이블이 일부 없거나 마이그레이션이 늦어져도 주요 화면이 무너지지 않도록 fallback을 넣었습니다.

## 8. AI 브리핑 설계

### 왜 서버 조건 검증을 넣었나

초기 AI 브리핑에서는 고객 조건이 `최소 면적 48㎡ 이상`인데 32㎡ 매물이 `높음`으로 표시될 위험이 있었습니다.  
LLM은 그럴듯한 설명을 만들 수 있지만, 업무상 중요한 필수 조건 판단은 결정론적으로 계산해야 한다고 판단했습니다.

그래서 서버에서 먼저 `conditionChecks`를 만듭니다.

```js
conditionChecks: {
  area: {
    required: "48㎡ 이상",
    actual: "32㎡",
    passed: false,
    message: "최소 면적 조건 미달"
  },
  monthlyRent: {
    required: "월세 140만원 이하",
    actual: "220만원",
    passed: false,
    message: "월세 조건 초과"
  }
}
```

### AI 점수 제한 규칙

- 면적 필수 조건 미달이면 `fitScore: 높음` 금지
- 예산이 명확히 초과하면 `fitScore: 높음` 금지
- 용도 불일치가 명확하면 `fitScore: 높음` 금지
- 필수 조건 2개 이상 미달이면 낮은 우선순위
- 정보가 부족한 경우 `확인 필요`로 표시
- 모든 후보가 조건 미달이면 조건 조정 안내 표시

### 면접에서 말할 포인트

> LLM에게 모든 판단을 맡기지 않고, 숫자와 필수 조건은 서버에서 먼저 검증했습니다.  
> OpenAI는 최종 상담 문구, 요약, 고객 발송 문장처럼 자연어 생성이 필요한 부분에 집중하도록 역할을 분리했습니다.

## 9. 승인형 Agentic AI 구조

AI 브리핑 결과 아래에는 `다음 작업 추천` 패널이 있습니다.

주요 액션:

- 고객 메모에 저장
- 상담 일정 만들기
- 소개서 초안 작성
- 추가 매물 찾기
- 고객 발송 문구 복사

설계 원칙:

- AI가 자동으로 DB를 수정하지 않습니다.
- 사용자가 버튼을 눌러 승인해야 저장/이동/복사가 실행됩니다.
- 실행 완료 상태를 sessionStorage에 저장해 화면 복귀 후 중복 실행을 줄였습니다.

면접 표현:

> 단순 챗봇 UI가 아니라, AI 결과를 실제 업무 액션으로 이어주는 구조를 만들었습니다. 다만 안전을 위해 자동 실행이 아니라 사용자의 명시적 클릭 후 실행되도록 했습니다.

## 10. 소개서 작성 기능

### 기능 흐름

1. 매물 기본 정보 입력
2. 가격/주소/특징/상담 포인트 입력
3. 사진 업로드
4. 오른쪽에서 고객용 요약 미리보기
5. PDF 다운로드 또는 소개서 생성

### 구현 포인트

- `BriefingMakerPage.jsx`에서 입력 폼과 미리보기를 함께 구성
- `utils/brochure.js`에서 표시용 가격 요약, 소개서 데이터 정규화 처리
- `html2canvas`와 `jsPDF`로 PDF 생성
- 섹션 탭을 sticky UI로 만들어 긴 폼에서 이동 편의성 개선

## 11. 정산관리 기능

### 기능 흐름

1. 고객 또는 일정관리에서 잔금일 입력
2. 정산 페이지에서 1주일 내 정산 예정 자동 표시
3. 월별 정산 목록에서 해당 월의 정산 대기 항목 확인
4. 정산 직접 입력 가능

### 구현 포인트

- `utils/settlementAlerts.js`에서 잔금일 일정인지 판별
- `buildScheduleSettlementEntries`로 schedule 기반 정산 대기 항목 생성
- `getUpcomingSettlements`로 오늘 기준 7일 이내, 최대 5개 표시
- 정산 테이블이 없을 때도 일정 데이터를 기준으로 화면이 비지 않도록 처리

## 12. 보안/개인정보 포인트

- OpenAI API Key는 프론트엔드에 넣지 않음
- `VITE_OPENAI_API_KEY` 사용 금지
- AI 호출은 `/api/ai-briefing` 서버리스 함수에서만 처리
- 고객 전화번호/이메일은 AI payload에서 제외
- 법률/세무/권리관계는 단정하지 않고 `확인 필요`로 표현
- sessionStorage에는 선택 상태와 AI 결과 draft만 저장하고, 불필요한 민감정보는 저장하지 않도록 설계

## 13. 테스트/검증

주요 테스트:

- AI 브리핑 조건 검증
- 면적 미달 시 `높음` 금지
- 월세 초과 시 `높음` 금지
- 주차 확인 필요 표시
- 모든 후보 조건 미달 시 조건 조정 안내
- 정산 예정 자동 생성
- 중개수수료 계산
- 팀 모드 helper
- 네이버 매물 추출 parser

실행 명령:

```bash
cd frontend
npm test
npm run build
```

## 14. 프로젝트에서 어려웠던 점

### 1. AI 추천이 실무적으로 위험하게 보일 수 있었던 문제

LLM이 면적 미달 매물을 좋게 설명하는 문제가 있었습니다.  
이를 해결하기 위해 서버 조건 검증과 fitScore 제한 규칙을 추가했습니다.

### 2. Supabase schema가 변동될 수 있는 문제

MVP 단계에서 테이블 구조가 확정되지 않은 부분이 있었습니다.  
그래서 저장 시 여러 payload variant를 시도하거나, localStorage fallback을 두는 방식으로 화면이 무너지지 않게 했습니다.

### 3. 긴 업무 화면의 UX 문제

소개서 작성, AI 브리핑, 정산 목록은 입력과 결과가 길어질 수 있습니다.  
sticky section nav, 자동 스크롤, 결과 카드, compact action panel을 통해 업무 흐름을 끊지 않도록 개선했습니다.

## 15. 기술 선택 이유

### React + Vite

- 빠른 MVP 개발에 적합
- Vercel 배포와 잘 맞음
- 페이지 단위로 업무 기능을 빠르게 확장하기 좋음

### Supabase

- 인증, DB, Storage를 한 번에 사용할 수 있음
- MVP에서 백엔드 구축 시간을 줄일 수 있음
- 실시간 서비스로 확장할 여지가 있음

### Vercel Serverless Functions

- 프론트와 API를 같은 프로젝트에서 관리 가능
- OpenAI Key를 서버 환경변수로 안전하게 관리 가능
- 작은 API 단위로 빠르게 배포 가능

### OpenAI API

- 상담 메모, 고객 발송 문구, 후보 비교 요약처럼 자연어 생성이 중요한 기능에 적합
- 단, 핵심 조건 판단은 서버에서 먼저 처리하도록 역할을 제한

## 16. 예상 면접 질문과 답변

### Q. 이 프로젝트에서 가장 신경 쓴 부분은?

A. AI 추천의 안전성입니다. LLM이 자연어를 잘 만들지만 숫자 조건 판단까지 맡기면 실무적으로 위험할 수 있다고 봤습니다. 그래서 면적, 예산, 월세, 주차, 용도 같은 조건은 서버에서 먼저 계산하고, OpenAI는 그 결과를 바탕으로 상담 문구를 작성하게 했습니다.

### Q. 프론트엔드 구조는 어떻게 나눴나요?

A. 페이지는 업무 도메인 기준으로 `pages`에 나눴고, Supabase 접근은 `services`, 계산/정규화/추천 로직은 `utils`, 레이아웃은 `components/layout`, 재사용 UI는 `cards`로 분리했습니다.

### Q. 백엔드는 어떻게 구성했나요?

A. 별도 Express 서버 대신 Vercel Serverless Function을 사용했습니다. `/api/ai-briefing`에서 OpenAI 호출과 서버 조건 검증을 처리하고, 프론트는 해당 내부 API만 호출합니다.

### Q. DB 테이블이 없을 때 왜 fallback을 넣었나요?

A. MVP 단계에서는 DB schema가 변경될 가능성이 높습니다. 핵심 화면이 테이블 하나 때문에 완전히 멈추지 않도록 localStorage fallback과 schedule 기반 정산 예정 자동 생성 로직을 넣었습니다.

### Q. 이 프로젝트를 운영 서비스로 만들려면 무엇을 보완해야 하나요?

A. Supabase schema migration 정리, 사용자별 row level security 강화, 파일 스토리지 정책 정리, AI 사용량 과금/제한 정책, 에러 모니터링, 대용량 이미지 최적화와 코드 스플리팅을 보완해야 합니다.

### Q. 가장 포트폴리오로 어필할 만한 기능은?

A. AI 브리핑입니다. 단순히 OpenAI를 붙인 것이 아니라, 서버 조건 검증, JSON schema 기반 응답, 조건 미달 점수 제한, 승인형 후속 액션, sessionStorage 상태 복원까지 하나의 업무 흐름으로 만들었습니다.

## 17. 발표할 때 순서

1. 문제 정의: 부동산 중개 업무는 고객 조건, 일정, 매물, 소개서, 정산이 분산되어 있다.
2. 해결 방향: AgentNote에서 업무 흐름을 한 화면으로 연결했다.
3. 프론트 구조: React 페이지 단위 + services/utils 분리.
4. 백엔드 구조: Vercel `/api` 함수 + Supabase + OpenAI.
5. AI 핵심: LLM에게 판단을 모두 맡기지 않고 서버 조건 검증을 먼저 수행.
6. UX 핵심: AI 결과를 보고 고객 메모 저장, 일정 생성, 소개서 작성으로 이어지는 승인형 액션.
7. 안정성: fallback, sessionStorage draft, 개인정보/API Key 보호.
8. 한계와 개선점: schema migration, RLS, 모니터링, 코드 스플리팅, 운영 과금 정책.

## 18. 꼭 외워둘 키워드

- React + Vite 기반 SaaS형 MVP
- Supabase 기반 고객/일정/소개서 데이터 관리
- Vercel Serverless Function 기반 OpenAI 호출
- 프론트엔드에 OpenAI Key 미노출
- 서버 조건 검증 레이어
- conditionChecks
- fitScore 제한
- 승인형 Agentic AI
- sessionStorage draft 복원
- schedule 기반 settlement fallback
- html2canvas + jsPDF 소개서 PDF
- 업무 도메인 기준 pages/services/utils 분리

## 19. 짧은 회고 문장

> 이 프로젝트를 만들면서 AI 기능은 단순히 붙이는 것보다, 어디까지 AI에게 맡기고 어디부터는 서버 로직으로 통제할지 나누는 설계가 중요하다는 걸 배웠습니다. 특히 부동산 상담처럼 조건이 중요한 업무에서는 LLM의 자연어 생성 능력과 결정론적인 조건 검증을 함께 사용하는 방식이 더 안전하다고 판단했습니다.

