# 단어방 (DANEOBANG) — 1차 MVP

학원이 가입해 사용하는 단어 테스트 관리 SaaS. 학원(테넌트) → 선생님 → 담당 학생 구조, 구글/카카오/이메일 로그인, 단어장 파일(HWPX·DOCX·PDF) 등록·검수, DAY별 무작위 사지선다, 온라인 응시, 종이 시험지(QR·마킹) 사진 채점, 성적·재시험·오답노트, 플랫폼 관리자.

## 빠른 시작 (Windows)

1. [Node.js 20 LTS 이상](https://nodejs.org) 설치
2. `start-server.bat` 더블클릭 — 패키지 설치 → DB 초기화 → 데모 데이터 → 빌드 → http://localhost:3000 실행
   - 개발 모드(코드 수정 즉시 반영): `start-server.bat dev`
3. 데모 계정 (비밀번호 `password`)
   - `admin@daneobang.dev` 플랫폼 관리자 → `/admin`
   - `owner@daneobang.dev` 한빛영어학원 학원장
   - `teacher@daneobang.dev` 한빛영어학원 선생님 (담당 학생 5명)
   - `student@daneobang.dev` 학생 (박학생 명단에 연결됨)
   - `owner2@daneobang.dev` 사랑학원 학원장 (테넌트 분리 확인용)

구글/카카오 로그인은 `.env` 에 `GOOGLE_CLIENT_ID/SECRET`, `KAKAO_CLIENT_ID` 를 넣으면 활성화됩니다 (리디렉션 URI: `http://localhost:3000/api/auth/callback/google`, `/kakao`).

## 폴더

```
prisma/          schema.prisma, init.sql(생성), seed.ts
src/app/         페이지·서버 액션·API (app=교사, learn=학생, admin=운영자, api/v1=REST)
src/lib/         auth, scope(테넌트 경계), exam-gen, grading, attempts, parsers/, omr/, jobs
assets/fonts/    PDF 용 Noto Sans KR 서브셋
fixtures/        파서·OMR 테스트 파일
scripts/         db-init, gen-sqlite-ddl, test-parsers, test-omr, e2e, e2e-linked, e2e-signup, qa-shots
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
node scripts/gen-sqlite-ddl.cjs   # schema.prisma 변경 후 init.sql 재생성 (@prisma/internals 필요)
```

## 스키마 변경 시

`prisma/schema.prisma` 수정 → `npx prisma generate` → `node scripts/gen-sqlite-ddl.cjs` → `npm run db:push` (`CREATE TABLE IF NOT EXISTS` 만 적용되므로 기존 테이블 컬럼 변경은 `prisma/dev.db` 를 지우고 다시 만들거나 수동 ALTER 필요).

## 문서

- `docs/PRD_B2B_SIGNUP.md` — v4.2 B2B 가입·Seat 과금 (학원 단위 결제, 선생님 초대 기반 가입, 학생 계정 설정 링크, 요금제 화면, 모의 결제·메일 개발 모드)
- `docs/IA_REVIEW_v4.md` — v4 계정별 IA 검수 (소셜 로그인, 엑셀 등록, 학생/성적 탭 재정의, 게임형 응시, 종이 시험 학생 제출·QR)
- `docs/QA_REPORT_v3.md` — IA·UX 개선 v3 (업로드 자동 저장·DAY 나누기, 그룹 대시보드, 1화면 출제, 재시험→보강 흐름) QA 결과
- `docs/PRD.md` — 제품 요구사항 (학원 SaaS 기준, 1차 구현 상태 표기)
- `docs/MVP.md` — 범위·수용 기준·검증 결과
- `docs/TECH_STACK.md` — 스택·데이터 모델·API·환경변수
- `docs/QA_REPORT.md` — IA/UX QA 결과, 조작 단축 내역, 로그 위치, 연동 E2E 시나리오
