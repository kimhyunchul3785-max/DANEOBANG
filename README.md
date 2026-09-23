# 단어방 (DANEOBANG) — 1차 MVP

학원이 가입해 사용하는 단어 테스트 관리 SaaS. **계정은 하나, 학원과 역할은 여러 개** — Google/Kakao 로 단어방 계정을 만들고 학원(학원장·선생님) 또는 학생으로 연결한다. 단어장 파일(HWPX·DOCX·PDF·사진/스캔 OCR) 등록·검수, DAY별 무작위 사지선다, 온라인 응시, 종이 시험지(QR·마킹) 사진 채점, 성적·재시험·오답노트, 플랫폼 관리자.

## v4.6 — 계정·학원·역할 구조

- 로그인 = 가입: `/login` 에 Google/Kakao 버튼만. 처음이면 계정이 만들어지고, 같은 이메일의 기존 계정이 있으면 로그인 수단만 붙는다 (`UserIdentity`). 이메일·휴대폰 계정은 `/login/email` 로 이전용 로그인만.
- 첫 로그인 `/welcome`: 학생이에요 / 선생님이에요 (영구 역할이 아니라 지금 하려는 일).
  - 선생님 → `/welcome/new` 학원 이름 하나로 학원 + 학원장 + 기본 반(반 코드) 생성 → `/app`. 초대 링크(`/invite/<token>`)는 로그인 뒤 [참여].
  - 학생 → `/welcome/student` 반 코드 + 이름 / 문자 인증번호(휴대폰 + 6자리) / 초대 링크(`/join/<token>`) → 로그인한 계정에 학생 명단 연결 → `/learn`.
- 반 코드: 반마다 6자리. 동명 학생이 이미 있으면 바로 붙이지 않고 참여 요청 → 선생님이 [기존 학생과 연결] / [새 학생으로 추가] / [거절].
- `/switch` 계정 전환: 학원(역할)·학생 자리 중 어디로 들어갈지. 로그인 후 자리 1개면 바로, 여러 개면 마지막 자리 또는 전환 화면.
- 선생님 앱 메뉴: 오늘 · 학생 · 단어장 · 시험(사진 채점 포함) · 성적 · 재시험 | 선생님 · 요금제 · 학원 설정. 학생 앱: 이번 주 · 성적 · 재시험 · 연습.

## 빠른 시작 (Windows)

1. [Node.js 20 LTS 이상](https://nodejs.org) 설치
2. `start-server.bat` 더블클릭 — 패키지 설치 → DB 초기화 → 데모 데이터 → 빌드 → http://localhost:3000 실행
   - 개발 모드(코드 수정 즉시 반영): `start-server.bat dev`
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
prisma/          schema.prisma, init.sql(생성), seed.ts
src/app/         페이지·서버 액션·API (app=교사, learn=학생, admin=운영자, api/v1=REST)
src/lib/         auth, scope(테넌트 경계), exam-gen, grading, attempts, parsers/, omr/, jobs
assets/fonts/    PDF 용 Noto Sans KR 서브셋
fixtures/        파서·OMR 테스트 파일
scripts/         db-init, gen-sqlite-ddl, test-parsers, test-omr, test-ocr, e2e, e2e-linked, e2e-signup, e2e-trial, e2e-retake, qa-shots
docs/            PRD.md, MVP.md, TECH_STACK.md
storage/         업로드·PDF·사진 (자동 생성, git 제외)
```

## 명령

```
npm run setup          # generate + db:push + seed
npm run dev / build / start
npm run test:parsers   # HWPX/DOCX/PDF 추출 테스트
npm run test:omr       # 합성 OMR 판독 테스트
npx tsx scripts/e2e.ts # 브라우저 E2E (서버 실행 + playwright 설치 필요)
npm run e2e:linked     # 연동 계정(학원장·선생님1·학생01) E2E → ../log 에 로그·스크린샷
npm run e2e:trial      # (v4.5 가입 위저드 기준 — v4.6 /welcome 흐름으로 아직 갱신 전) e2e:signup 도 동일
npm run test:ocr       # OCR 파이프라인(모의 OpenAI) 테스트
npm run e2e:retake     # 재시험(오답만/같은 범위·마감·알림·2차) · 반복 오답 출제 · 성적 위젯 보드 · 종이 QR 규칙
node scripts/gen-sqlite-ddl.cjs   # schema.prisma 변경 후 init.sql 재생성 (@prisma/internals 필요)
```

## 스키마 변경 시

`prisma/schema.prisma` 수정 → `npx prisma generate` → `node scripts/gen-sqlite-ddl.cjs` → `npm run db:push` (`CREATE TABLE IF NOT EXISTS` 만 적용되므로 기존 테이블 컬럼 변경은 `prisma/dev.db` 를 지우고 다시 만들거나 수동 ALTER 필요).

## 문서

- `docs/IA_REVIEW_v4.md` §6 — v4.4 출제 흐름 IA/UX(동작 바)·재시험 개편(보강 제거, 오답만/같은 범위·마감·알림·2차)·성적 가변 위젯·종이 QR 채점 규칙·반응형 중단점
- `docs/IA_REVIEW_v4.md` §5 — v4.3 결제 분리(체험)·휴대폰 인증번호 가입·OCR 단어장·시험 상세 3단계·출제 화면 정리
- `docs/PRD_B2B_SIGNUP.md` — v4.2 B2B 가입·Seat 과금 (학원 단위 결제, 선생님 초대 기반 가입, 학생 계정 설정 링크, 요금제 화면, 모의 결제·메일 개발 모드)
- `docs/IA_REVIEW_v4.md` — v4 계정별 IA 검수 (소셜 로그인, 엑셀 등록, 학생/성적 탭 재정의, 게임형 응시, 종이 시험 학생 제출·QR)
- `docs/QA_REPORT_v3.md` — IA·UX 개선 v3 (업로드 자동 저장·DAY 나누기, 그룹 대시보드, 1화면 출제, 재시험→보강 흐름) QA 결과
- `docs/PRD.md` — 제품 요구사항 (학원 SaaS 기준, 1차 구현 상태 표기)
- `docs/MVP.md` — 범위·수용 기준·검증 결과
- `docs/TECH_STACK.md` — 스택·데이터 모델·API·환경변수
- `docs/QA_REPORT.md` — IA/UX QA 결과, 조작 단축 내역, 로그 위치, 연동 E2E 시나리오
