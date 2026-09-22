# 영어학원 B2B SaaS 회원가입·Seat 과금 — PRD 요약과 구현 (v4.2)

원문 PRD(50개 절)의 결정 사항을 그대로 따르되, 현재 스택(Next.js · Prisma/SQLite · 자체 JWT 세션)에 맞게 구현했다.
PRD 의 Supabase Auth 역할은 기존 `User`/세션이, PostgreSQL 역할은 Prisma 모델이 맡는다.

## 1. 원칙 (PRD 3 · 15 · 49)

| 항목 | 결정 |
|---|---|
| 계약·결제 단위 | **Academy**. `Subscription.academyId` 로 연결 — 원장이 바뀌어도 구독 유지 |
| 가격 | Teacher Seat 1개 = 월 **9,900원**, 최소 1 |
| Seat | 별도 레코드가 아니라 숫자(`Subscription.seatQuantity`). 사용량은 `AcademyMember(status=active, isTeacher=true)` 를 세어 계산 |
| 원장 | 관리자로는 무료. `isTeacher=true` 면 Seat 1개 소비 (1인 학원 = OWNER + TEACHER 한 계정) |
| 학생 | 과금 없음. 학원이 먼저 등록하고 학생은 계정 설정 링크로 활성화 |
| 초대 | 보내는 순간 Seat 예약(pending). `used + pending ≤ quantity` 를 넘는 초대는 거절 |
| 퇴사 | 접근 중지(`disabled`) → used −1. 구매 Seat 는 자동으로 줄이지 않는다 (요금제에서 직접) |
| 용어 | 사용자에게는 "선생님 수 / 이용 중인 선생님 n / m명", 코드·문서에서만 Teacher Seat |

## 2. 데이터 모델 (`prisma/schema.prisma`)

```
Academy            + representativeName · phone · region · status(pending_payment|active|past_due|read_only|suspended)
AcademyMember      + isTeacher (Seat 소비) · status(active|disabled)   role: OWNER|ADMIN|TEACHER
Invitation         + isTeacher · name · revokedAt   (email = 계정 이메일, pending = usedAt/revokedAt 없음 & 미만료)
Subscription       academyId(unique) · provider · seatQuantity · unitPrice · status(pending|active|past_due|canceled)
                   currentPeriodStart/End · cardLast4 · lastPaymentAt/Error
Payment            subscriptionId · amount · seatQuantity · status(succeeded|failed) · providerRef · error
SignupSession      가입 위저드 임시 상태 (쿠키 토큰의 해시) · 인증 토큰 해시 · userId/academyId · step · completedAt
User               + emailVerifiedAt · phone
Student            + email · phone · inviteSentAt  (계정 상태는 파생: userId→ACTIVE, 초대 토큰→INVITED, 그 외 REGISTERED)
```

기존 DB 는 `scripts/db-init.ts` 가 컬럼을 추가하고, `inactive→disabled`, 기존 사용자 이메일 인증 처리, 기존 학원에 `legacy` 구독(활성 선생님 수만큼) 생성까지 멱등하게 보정한다.

## 3. 가입 Flow (PRD 8~17 · 41 · 50) — `/start`

```
랜딩 [학원 시작하기] → ① 학원 정보(학원명·대표자명·전화·지역) → ② 선생님 수(−/+, 월 요금 즉시 계산)
→ ③ 원장님도 직접 지도하시나요? (네 = Seat 1 사용) → ④ 관리자 계정(이름·이메일·비밀번호)
→ 이메일 인증(24h 링크) → 계정·학원(pending_payment)·OWNER 구성원·구독(pending) 생성 + 로그인
→ ⑤ 결제(카드) → Academy/Subscription ACTIVE → ⑥ 선생님 초대(남은 자리만큼) → 대시보드
```

- ①~③ 은 브라우저 상태, ④ 에서 한 번에 서버로 (`SignupSession`). 인증 메일을 다른 브라우저에서 열어도 로그인 상태로 이어진다.
- 이미 로그인한 사용자(구글·카카오 등)는 ④ 에서 그 계정으로 바로 학원을 만든다(인증 생략).
- 결제 전에는 `/app/*` 가 학원장은 `/app/billing` 으로, 선생님은 "결제가 필요합니다" 안내로 막힌다 (PRD 38).
- 결제 실패는 `Payment(failed)` 로 남고 학원은 `pending_payment` 유지 → 재시도.

## 4. 결제 (PRD 14 · 24 · 38 · 39)

`src/lib/billing.ts` — `chargeCard(provider)` 한 곳만 바꾸면 PG 를 붙일 수 있다. 지금은 `BILLING_PROVIDER=mock`:
아무 카드나 승인, 끝자리 `0000` 은 거절(실패 흐름 검증용). 화면에 "테스트 결제" 안내가 붙는다.
정기 결제 실패 → `past_due` → 유예 후 `read_only` 처리는 PG 웹훅이 있어야 하므로 상태값·게이트만 준비해 두었다.

## 5. 선생님 (PRD 18~22 · 26)

- 공개 회원가입 없음. `/signup` → `/start`. 선생님은 원장의 초대 메일 링크 `/invite/<token>` 에서 **이름·비밀번호만** 정하면 가입+참여 완료 (초대 이메일 = 계정 이메일).
- 이미 계정이 있으면 로그인 후 수락. 다른 계정으로 로그인 중이면 거절.
- 선생님 화면: "이용 중인 선생님 n / m명", 초대 대기(INVITED)·ACTIVE·DISABLED, 접근 중지/복구, 자리 없으면 "선생님 수 늘리기" 로 안내.

## 6. 요금제 및 결제 화면 (PRD 23~29 · 44) — `/app/billing` (학원장)

월 이용료 · 다음 결제일 · 카드 끝자리 · 이용 중인 선생님(초대 대기 포함) · 선생님 수 −/+ (변경 후 요금 미리보기, 활성+대기 이하로는 못 줄임) ·
원장 본인의 선생님 기능 켜기/끄기(빈 자리 없으면 "1명 추가하고 사용하기") · 결제 내역.

## 7. 학생 (PRD 학생 절)

학원이 등록(엑셀 양식에 이메일 열 추가) → 학생 상세 "계정 설정 링크 보내기" (이메일 있으면 메일, 없으면 링크 전달) →
학생은 `/join/<token>` 에서 로그인 이메일·비밀번호만 설정 → 즉시 연결(선생님 승인 불필요) → `/learn`.
명단의 계정 열: REGISTERED / INVITED / ACTIVE.

## 8. 메일

`src/lib/mail.ts` — `SMTP_URL`(또는 SMTP_HOST/PORT/USER/PASS) 이 있으면 nodemailer 로 발송. 없으면 개발 모드:
`log/mail.log` 에 기록하고 화면에 링크를 바로 보여준다(인증·초대·학생 링크 모두).

## 9. 검증

`npm run e2e:signup` (14단계): 랜딩→위저드→인증→결제 실패/성공→초대 2명→Seat 1/3→초대 초과 거절→초대 수락(비밀번호만)→
접근 중지·초대 취소→Seat 3→1→원장 선생님 기능 끄기/켜기→Seat 1→2→학생 등록·계정 설정 링크·활성화→관리자 구독 표시→공개 가입 없음.
