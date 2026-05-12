# AgentNote 팀플모드 MVP

## 개요

팀플모드는 대표 공인중개사 또는 팀장이 팀원의 고객관리, 일정관리, 정산 현황을 함께 확인하고 고객 배정/이관을 관리하는 유료 기능이다.

이번 MVP는 실제 결제 PG를 붙이지 않는다. 대신 `team_subscriptions.status`가 `active` 또는 `trialing`이면 팀플모드가 활성화되는 구조로 구현한다.

## 플랜 구조

- `team_basic`: 기본 플랜, 팀장 포함 5명
- `team_extra`: 추가 좌석 플랜용
- `team_unlimited`: 좌석 제한 없음

좌석 계산:

- 사용 중 좌석 = active/invited 팀원 + pending 초대
- `is_unlimited = true` 또는 `plan_type = team_unlimited`이면 좌석 제한 없음
- 그 외에는 `seat_limit + extra_seat_count`

## 역할과 권한

- `owner`: 팀 생성자, 모든 관리 가능
- `admin`: 초대, 고객 배정/이관, 팀 현황 관리 가능
- `member`: 본인에게 배정된 고객/일정/정산 조회
- `viewer`: 조회 전용

보안 원칙:

- owner/admin만 팀 전체 고객/일정/정산을 본다.
- member는 본인에게 배정된 데이터만 본다.
- 급여명세서는 owner/admin과 대상 사용자만 본다.
- 기존 개인 데이터는 `team_id`가 null이면 팀에 자동 노출되지 않는다.

## 팀 생성/초대 흐름

1. 팀장이 팀플모드에서 팀을 만든다.
2. 생성자는 `owner`로 `team_members`에 추가된다.
3. `team_subscriptions`가 `trialing` 상태로 생성된다.
4. owner/admin이 초대 링크를 생성한다.
5. 초대 token 원문은 DB에 저장하지 않고 `token_hash`만 저장한다.
6. 팀원은 초대 링크 token을 입력해 수락한다.

실제 이메일 발송은 이번 MVP에서 제외한다.

## 고객 배정/이관

팀장은 개인 고객을 팀 고객으로 배정할 수 있다.

- `customers.team_id` 설정
- `customers.assigned_to_user_id` 설정
- `customer_assignments` 기록

담당자 변경 또는 퇴사 인수인계 시:

- 기존 담당자와 새 담당자를 기록
- `customer_transfer_logs`에 이관 로그 저장
- 필요하면 일괄 이관으로 특정 팀원의 고객을 다른 팀원에게 넘긴다.

## 팀장 대시보드

월 기준으로 다음을 보여준다.

- 손님 인입 수
- 계약 고객 수
- 정산 금액
- 팀원 수 / 좌석 수
- 팀원별 인입, 계약, 일정, 정산 금액

## 팀 일정관리

팀장/관리자는 팀 전체 일정을 본다.

일정 유형 카운트:

- 고객인입
- 미팅
- 계약서작성
- 잔금

팀원은 본인에게 배정된 일정만 보는 구조다.

## 팀 정산

월별 정산 요약:

- 손님 인입 수
- 계약 고객 수
- 정산 금액
- 정산 건수
- 팀원별 정산 현황

금액은 `tenant_fee + landlord_fee`를 우선 사용하고, 없으면 `total_fee` 또는 `commission_amount`를 fallback으로 사용한다.

## 급여명세서 MVP

owner/admin은 팀원별 급여명세서 초안을 만든다.

항목:

- 기본급
- 수수료
- 보너스
- 공제액
- 총 지급액
- 메모
- 상태: `draft`, `delivered`, `canceled`

이번 MVP는 실제 발송을 하지 않고 `전달 완료` 상태만 관리한다.

주의 문구:

> 급여명세서는 내부 정산 참고용입니다. 실제 지급/세무 처리는 별도 확인이 필요합니다.

## 환경변수

Vite 프론트엔드에서는 공개 가능한 설정만 `VITE_` prefix로 사용한다.

```env
VITE_TEAM_MODE_ENABLED=true
VITE_TEAM_MODE_ALLOW_SELF_CREATE=true
VITE_TEAM_MODE_DEFAULT_TRIAL_DAYS=14
```

서버/운영 문서에서는 같은 의미로 다음 이름을 사용할 수 있다.

```env
TEAM_MODE_ENABLED=true
TEAM_MODE_ALLOW_SELF_CREATE=true
TEAM_MODE_DEFAULT_TRIAL_DAYS=14
```

## 결제 연동 다음 단계

이번 MVP에서 제외한 항목:

- Stripe/Toss/PortOne 결제
- 추가 좌석 과금
- 무제한 플랜 결제
- 결제 실패 webhook 처리
- 세금계산서

나중에 PG를 붙일 때는 `team_subscriptions.provider`, `provider_subscription_id`, `status`, `current_period_start`, `current_period_end`를 업데이트하면 된다.

## Supabase 설정

[TEAM_MODE_SUPABASE.sql](./TEAM_MODE_SUPABASE.sql)을 Supabase SQL editor에서 실행한다.

기존 개인 데이터는 자동으로 팀에 노출하지 않는다. 팀플모드에서 고객을 배정/이관해야 `team_id`가 생긴다.
