# 단어방 (DANEOBANG) — 1차 MVP

학원이 가입해 사용하는 단어 테스트 관리 SaaS. **계정은 하나, 학원과 역할은 여러 개** — Google/Kakao 로 단어방 계정을 만들고 학원(학원장·선생님) 또는 학생으로 연결한다. 단어장 파일(HWPX·DOCX·PDF·사진/스캔 OCR) 등록·검수, DAY별 무작위 사지선다, 온라인 응시, 종이 시험지(QR·마킹) 사진 채점, 성적·재시험·오답노트, 플랫폼 관리자.

## v5.0 — Web + Mobile Monorepo (pnpm · turbo · Expo)

```text
apps/web      @daneobang/web     기존 Next.js 전체 (기능 변화 없음)
apps/mobile   @daneobang/mobile  Expo 앱 — 로그인(Google·Kakao·Dev) · 학원 선택 · 오늘 · 학생 · 학생 상세 · 시험 · 시험 상세 · 설정
packages/     types · validation · api-client · design-tokens · utils · tsconfig  (React 컴포넌트·CSS 는 공유하지 않음)
```

- 패키지 매니저는 **pnpm** (`start-server.bat` 이 없으면 설치). 루트: `pnpm dev:web` · `pnpm build:web` · `pnpm dev:mobile` · `pnpm typecheck`. 웹 스크립트는 `pnpm --filter @daneobang/web run <script>` 또는 `cd apps/web && pnpm run <script>`.
- 모바일은 같은 계정·DB·`/api/v1`·권한 모델. `Authorization: Bearer` + `x-academy-id` 헤더. 시험 출제·단어장·결제 등 PC 작업은 웹에 남긴다.
- 자세한 구조·Windows 시작·OAuth 키·스모크 체크리스트: `docs/MOBILE_MVP.md`.

## v4.7 — 업로드 카드 · 출제 기본값(지금 시작 · 7일 마감) · 시각 QA

- 단어장 **업로드 카드 재디자인**: 상태 읽기(READY / 1 FILE / N PHOTOS / UPLOADING), 원형 아이콘 드롭존 + 형식 칩, 고른 파일은 확장자 배지·크기·× 취소, 지원 안 되는 파일 안내 인라인, 저장 위치 전폭 토글, 이어 붙일 단어장은 단어 수·DAY 가 보이는 목록(6개 넘으면 검색). 같은 파일을 새 단어장으로 또 올리면 기존 단어장으로 안내. 휴대폰은 업로드 카드가 맨 위.
- **출제 기본값**: 시작 = 지금(출제 즉시, 서버 시각) · 마감 = 시작 + 7일 같은 시각. 시작 예약(datetime)·마감 프리셋(1주 뒤·오늘·이번 주·직접·없음), 마감 ≤ 시작은 화면·서버 모두 거부. 예약 시험은 학생 앱에 "… 부터 응시할 수 있어요" / `WAIT`.
- 선생님 계정의 출제 반 칩 인원 = **담당 학생 수**(0명 반은 비활성). 시험 상세: 출제 상태에 시작·마감 줄, 대상 추가 패널(시작 지금/예약·마감 기본값·더할 학생 있는 반만), 전원 완료 뒤에도 마감 표시. 시험 목록에 마감 열.
- 시각 QA 로 고친 것: 선생님 표 줄바꿈, 학생 상세 마감 라벨, 학원 설정 색상 견본, 학생 앱 휴대폰 인사말 레이아웃 등 → `docs/QA_REPORT_v4.7.md`.
- 스크립트: `pnpm run qa:visual`(역할별 66장 촬영 + 자동 검사) · `pnpm run e2e:compose`(출제 흐름 41 체크) — `apps/web` 에서.

## v4.6 — 계정·학원·역할 구조

- 로그인 = 가입: `/login` 에 Google/Kakao 버튼만. 처음이면 계정이 만들어지고, 같은 이메일의 기존 계정이 있으면 로그인 수단만 붙는다 (`UserIdentity`). 이메일·휴대폰 계정은 `/login/email` 로 이전용 로그인만.
- 첫 로그인 `/welcome`: 학생이에요 / 선생님이에요 (영구 역할이 아니라 지금 하려는 일).
  - 선생님 → `/welcome/new` 학원 이름 하나로 학원 + 학원장 + 기본 반(반 코드) 생성 → `/app`. 초대 링크(`/invite/<token>`)는 로그인 뒤 [참여].
  - 학생 → `/welcome/student` 반 코드 + 이름 / 문자 인증번호(휴대폰 + 6자리) / 초대 링크(`/join/<token>`) → 로그인한 계정에 학생 명단 연결 → `/learn`.
- 반 코드: 반마다 6자리. 동명 학생이 이미 있으면 바로 붙이지 않고 참여 요청 → 선생님이 [기존 학생과 연결] / [새 학생으로 추가] / [거절].
- `/switch` 계정 전환: 학원 역할(학원장·선생님)과 **학원별 학생 명단**이 각각 독립된 자리. 학생 화면(`/learn`)은 선택한 학생 자리(`db_student` 쿠키 = Student.id, 본인 계정 소유일 때만) 기준으로만 시험·성적·재시험·연습·종이 제출을 보여준다. 로그인 후 자리 1개면 바로, 여러 개면 마지막 자리 또는 전환 화면. 모바일 API 는 `x-student-id` 헤더.
- 반 담당 선생님(`ClassRoom.teacherMemberId`): 반 코드로 들어온 학생은 반 담당의 담당 학생이 되고 알림이 간다. 반을 만든 선생님이 기본 담당, 학원장은 반 관리에서 지정. 반 코드·인증번호 대입은 사용자당 실패 5회/5분 잠금, 시간당 20회.
- 보안: production 에서 `SESSION_SECRET` 이 없거나 개발용 값이면 세션 발급이 실패한다. OAuth 는 공급사가 **검증한 이메일**일 때만 기존 계정에 자동으로 붙는다.
- 선생님 앱 메뉴: 오늘 · 학생 · 단어장 · 시험(사진 채점 포함) · 성적 · 재시험 | 선생님 · 요금제 · 학원 설정. 학생 앱: 이번 주 · 성적 · 재시험 · 연습.

## 빠른 시작 (Windows)

1. [Node.js 20 LTS 이상](https://nodejs.org) 설치
2. `start-server.bat` 더블클릭 — pnpm 준비 → 패키지 설치 → DB 초기화 → 데모 데이터 → 빌드 → http://localhost:3000 실행 (웹은 `apps/web`)
   - 개발 모드(코드 수정 즉시 반영): `start-server.bat dev`
   - 모바일 앱: `cd apps\mobile && copy .env.example .env` 뒤 루트에서 `pnpm dev:mobile` (`docs/MOBILE_MVP.md`)
3. 데모 계정 (비밀번호 `password`, `/login/email` 에서 로그인 · 한빛영어학원 반 코드 `482913`)
   - `admin@daneobang.dev` 플랫폼 관리자 → `/admin`
   - `owner@daneobang.dev` 한빛영어학원 학원장
   - `teacher@daneobang.dev` 한빛영어학원 선생님 (담당 학생 5명)
   - `student@daneobang.dev` 학생 (박학생 명단에 연결됨)
   - `owner2@daneobang.dev` 사랑학원 학원장 (테넌트 분리 확인용)

구글/카카오 로그인은 `.env` 에 `GOOGLE_CLIENT_ID/SECRET`, `KAKAO_CLIENT_ID` 를 넣으면 활성화됩니다 (리디렉션 URI: `http://localhost:3000/api/auth/callback/google`, `/kakao`).

## .env 로 켜고 끄는 것

| 변수 | 기본 | 설명 |
|---|---|---|
| `BILLING_ENABLED` | `false` | 결제·Seat 과금. 꺼져 있으면 체험(무료·무제한)이고 요금제 메뉴가 숨습니다. 켜면 학원을 만든 직후 결제 대기 → `/app/billing` 결제 화면 |
| `ALLOW_DEV_LOGIN` | `true` | `/login/email` 이메일·휴대폰 비밀번호 로그인(기존 계정 이전용). `false` 면 Google/Kakao 만 |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | – / `gpt-5.6-luna` | 사진·스캔 PDF 단어장 OCR. `OPENAI_CONCURRENCY`(4) 병렬 수, `OCR_PAGES_PER_CHUNK`(3) PDF 묶음 쪽수 |
| `SMS_PROVIDER` | – | 학생 휴대폰 인증번호 발송. 없으면 `log/sms.log` 와 화면에 번호가 표시됩니다 |
| `SMTP_URL`, `MAIL_FROM` | – | 초대·인증 메일. 없으면 `log/mail.log` 와 화면에 링크가 표시됩니다 |

## 폴더

```
apps/web/prisma/       schema.prisma, init.sql(생성), seed.ts, dev.db
apps/web/src/app/      페이지·서버 액션·API (app=교사, learn=학생, admin=운영자, api/v1=REST)
apps/web/src/lib/      auth, scope(테넌트 경계), exam-gen, grading, attempts, parsers/, omr/, jobs
apps/web/assets/fonts/ PDF 용 Noto Sans KR 서브셋
apps/web/fixtures/     파서·OMR 테스트 파일
apps/web/scripts/      db-init, gen-sqlite-ddl, test-parsers, test-omr, test-ocr, test-api-client, e2e*, qa-shots, qa-visual
apps/web/storage/      업로드·PDF·사진 (자동 생성, git 제외)
apps/mobile/           Expo 앱 (app/ 화면 · src/ 로직 · app.json · eas.json · .env)
packages/              types · validation · api-client · design-tokens · utils · tsconfig
docs/                  PRD.md, MVP.md, TECH_STACK.md, MOBILE_MVP.md, QA_REPORT_*.md
log/                   조작 로그·QA 스크린샷 (git 제외)
```

## 명령

루트(모노레포): `pnpm dev:web` · `pnpm build:web` · `pnpm start:web` · `pnpm setup:web` · `pnpm dev:mobile` · `pnpm typecheck`.
아래는 `apps/web` 안에서 (`cd apps/web` 또는 `pnpm --filter @daneobang/web run …`):

```
pnpm run setup          # generate + db:push + seed
pnpm run dev / build / start
pnpm run test:parsers   # HWPX/DOCX/PDF 추출 테스트
pnpm run test:omr       # 합성 OMR 판독 테스트
pnpm run test:api-client # 공용 API 클라이언트(@daneobang/api-client) 스모크 19 체크 (서버 실행 필요)
npx tsx scripts/e2e.ts  # 브라우저 E2E (서버 실행 + playwright 설치 필요)
pnpm run e2e:linked     # 연동 계정(학원장·선생님1·학생01) E2E → log 에 로그·스크린샷 (v4.6 이후 /switch 로 바뀌어 손봐야 함)
pnpm run e2e:onboarding # v4.6 온보딩 9단계: /welcome → 학원 생성·반 코드 → 선생님 초대 [참여] → 학생 반 코드(즉시/동명 요청/새 학생 추가) → 학생 자리 2개 분리 → 잠금 → 초대 이메일 불일치
pnpm run e2e:compose    # v4.7 출제 흐름 41 체크: 업로드 → 출제(시작 지금·마감 7일) → 상세 3단계 → 대상 추가 → 학생 응시 → 예약 시작 → 초안 → 검증 (log/e2e-compose)
pnpm run qa:visual      # v4.7 페이지별 시각 QA: 역할별 33화면 × 데스크톱·휴대폰 촬영 + 넘침·잘림·오류 자동 검사 (log/qa-visual)
pnpm run e2e:trial      # (v4.5 가입 위저드 기준 — 폐지된 /start 흐름이라 실패함. e2e:signup 도 동일. 참고용)
                        # e2e:retake · qa:shots 도 v4.6 UI 변경 이전 셀렉터라 손봐야 돈다
pnpm run test:ocr       # OCR 파이프라인(모의 OpenAI) 테스트
pnpm run e2e:retake     # 재시험(오답만/같은 범위·마감·알림·2차) · 반복 오답 출제 · 성적 위젯 보드 · 종이 QR 규칙
node scripts/gen-sqlite-ddl.cjs   # schema.prisma 변경 후 init.sql 재생성 (@prisma/internals 필요)
```

## 스키마 변경 시

`apps/web/prisma/schema.prisma` 수정 → (`apps/web` 에서) `npx prisma generate` → `node scripts/gen-sqlite-ddl.cjs` → `pnpm run db:push` (`CREATE TABLE IF NOT EXISTS` 만 적용되므로 기존 테이블 컬럼 변경은 `prisma/dev.db` 를 지우고 다시 만들거나 수동 ALTER 필요).

## 문서

- `docs/MOBILE_MVP.md` — v5.0 monorepo 구조 · 모바일 앱 화면/인증 · Windows 시작(Android Development Build) · OAuth 키 · 스모크 체크리스트 · 회귀 결과
- `docs/QA_REPORT_v4.7.md` — v4.7 업로드 카드 재디자인·출제 기본값(지금 시작·7일 마감)·페이지별 시각 QA(66장)·출제 흐름 QA(41 체크) 결과와 남은 항목
- `docs/IA_REVIEW_v4.md` §6 — v4.4 출제 흐름 IA/UX(동작 바)·재시험 개편(보강 제거, 오답만/같은 범위·마감·알림·2차)·성적 가변 위젯·종이 QR 채점 규칙·반응형 중단점
- `docs/IA_REVIEW_v4.md` §5 — v4.3 결제 분리(체험)·휴대폰 인증번호 가입·OCR 단어장·시험 상세 3단계·출제 화면 정리
- `docs/PRD_B2B_SIGNUP.md` — v4.2 B2B 가입·Seat 과금 (학원 단위 결제, 선생님 초대 기반 가입, 학생 계정 설정 링크, 요금제 화면, 모의 결제·메일 개발 모드)
- `docs/IA_REVIEW_v4.md` — v4 계정별 IA 검수 (소셜 로그인, 엑셀 등록, 학생/성적 탭 재정의, 게임형 응시, 종이 시험 학생 제출·QR)
- `docs/QA_REPORT_v3.md` — IA·UX 개선 v3 (업로드 자동 저장·DAY 나누기, 그룹 대시보드, 1화면 출제, 재시험→보강 흐름) QA 결과
- `docs/PRD.md` — 제품 요구사항 (학원 SaaS 기준, 1차 구현 상태 표기)
- `docs/MVP.md` — 범위·수용 기준·검증 결과
- `docs/TECH_STACK.md` — 스택·데이터 모델·API·환경변수
- `docs/QA_REPORT.md` — IA/UX QA 결과, 조작 단축 내역, 로그 위치, 연동 E2E 시나리오
