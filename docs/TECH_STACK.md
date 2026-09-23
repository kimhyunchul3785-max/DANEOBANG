# 단어방 — 기술 스택 · 데이터 모델 · API

버전: 3.0 · 기준일: 2026-09-22

## 1. 1차 구현 스택 (현재 코드)

| 계층 | 선택 | 비고 |
|---|---|---|
| 웹 프레임워크 | **Next.js 15 (App Router) + React 19 + TypeScript** | 화면(Server Components) + Server Actions + Route Handlers 를 한 프로젝트에 |
| 스타일 | Tailwind CSS 4 | `globals.css` 에 btn/card/badge 컴포넌트 클래스 |
| DB | **SQLite (libsql)** via **Prisma 7 + `@prisma/adapter-libsql`** | Rust 엔진 불필요. `prisma/init.sql` 로 초기화(`npm run db:push`), PostgreSQL 전환 시 provider 만 변경 |
| 인증 | 자체 세션(jose HS256 JWT) — 웹 HttpOnly 쿠키 / 모바일 Bearer | Google OIDC · Kakao REST OAuth 를 서버에서 직접 처리(`src/lib/oauth.ts`), 이메일 로그인은 bcrypt |
| 파일 저장 | 로컬 `storage/` (uploads·scans·pdf·scans-corrected) | S3 전환 지점: `src/lib/storage.ts` |
| 문서 추출 | jszip + fast-xml-parser(HWPX·DOCX), pdfjs-dist(텍스트 PDF) | `src/lib/parsers/` |
| PDF 생성 | pdfkit + qrcode, Noto Sans KR 서브셋 폰트(`assets/fonts`) | `src/lib/omr/pdf.ts` — PDF 와 manifest 동일 계산 |
| 사진 판독 | sharp(디코드·리사이즈·EXIF) + jsQR + 자체 구현(Otsu 이진화·연결 성분·호모그래피·채움 판독) | `src/lib/omr/analyze.ts`, OpenCV 불필요 |
| 작업 큐 | DB `Job` 테이블 + 인프로세스 워커(lease·재시도·재시작 복구) | `src/lib/jobs.ts`, `instrumentation.ts` |
| 검증 | tsx 스크립트(파서·OMR), Playwright E2E | `scripts/` |
| 실행 | `start-server.bat` (Windows), Node 20+ | 설치→DB 초기화→seed→빌드→실행 |

## 2. 권장 운영 스택 (확장 시)

| 영역 | 권장 | 전환 지점 |
|---|---|---|
| DB | PostgreSQL (RDS/Supabase) | `schema.prisma` provider, `@prisma/adapter-pg`, `init.sql` 대신 `prisma migrate` |
| 파일 | S3 + CloudFront(비공개, signed URL) | `storage.ts` 의 saveFile/readFile |
| 워커 | 별도 프로세스(ECS Fargate) 에서 `runJob` 폴링 | `jobs.ts` 의 `resumePendingJobs` 를 워커 진입점으로 |
| 캐시/큐 | Redis (선택) | 현재 불필요 |
| 웹 배포 | Vercel 또는 ECS | 장시간 작업은 워커로 분리 필요(Vercel 함수 제한) |
| 모바일 | React Native + Expo(Expo Router, AuthSession, Secure Store, TanStack Query) | `/api/v1` 그대로 사용 |
| 모노레포 | pnpm + Turborepo (`apps/web`, `apps/mobile`, `packages/api-client`) | 현재 단일 앱 |

## 3. 실행 구조

```
브라우저(교사 Dashboard / 학생 420px 화면)
   ├─ Next.js 페이지 · Server Actions  ──┐
모바일 앱 (후속)                        │
   └─ /api/v1 REST (Bearer) ───────────┼─ 권한 검사(auth.ts · scope.ts) ─ Prisma ─ SQLite
                                        │
파일: /api/files/{print|answer-key|scan|scan-corrected|wrong-note}/{id}  (소속·목적 검사 후 응답)
Job: import · render_print · analyze_scan  (Job 테이블, setImmediate 실행, 재시작 시 재개)
```

## 4. 계정·권한 모델

```
User ─┬─ AcademyMember(role OWNER|TEACHER) ─ Academy
      │        └─ TeacherStudent ─ Student(명단, userId nullable)
      └─ Student.userId (학생 계정 연결)
User.isPlatformAdmin → /admin
```

- `requireAcademy()`: 쿠키(`db_academy`) 또는 `x-academy-id` 헤더로 현재 학원을 정하고, 활성 소속인지 DB 에서 확인한다.
- `studentScope(ctx)`: OWNER 는 학원 전체, TEACHER 는 `TeacherStudent` 로 지정된 학생만. 학생·응시·성적·파일 조회의 where 절에 항상 포함된다.
- 학생 API 는 `assignment.student.userId === 현재 사용자` 로 본인 여부를 검사한다.

## 5. 데이터 모델 (Prisma, 32 테이블)

| 그룹 | 테이블 |
|---|---|
| 계정·학원 | `User`, `Academy`, `AcademyMember`, `Invitation` |
| 반·학생 | `ClassRoom`, `Student`, `TeacherStudent`, `StudentLinkRequest` |
| 단어장 | `VocabBook`, `BookDay`, `Word`, `WordRevision` |
| 파일 추출 | `Import`, `ImportRow` |
| 시험 | `Exam`, `ExamScope`, `ExamForm`(불변 버전, seed·hash), `FormItem`, `FormOption`(isCorrect = 정답 키) |
| 응시·성적 | `Assignment`(examId+studentId 유일, mode 잠금), `Attempt`(차수·revision·마감), `AttemptAnswer`, `GradeRevision`(current 1개) |
| 종이·OMR | `PrintInstance`(pdfPath·manifest), `PrintPage`(QR 토큰), `ScanUpload`(detections·reviewed·correctedPath) |
| 재시험 | `RetakeTask`(sourceAttemptId 유일) |
| 시스템 | `Job`, `AuditLog`, `UsageEvent`, `DeviceToken`, `Notification` |

주요 제약: `Academy.slug`, `AcademyMember(academyId,userId)`, `Student(academyId,userId)`, `BookDay(bookId,dayNo)`, `ExamForm(examId,version)`, `FormItem(formId,position)`, `FormOption(itemId,position)`, `Assignment(examId,studentId)`, `AttemptAnswer(attemptId,itemId)`, `GradeRevision(attemptId,revisionNo)`, `PrintPage.token`, `RetakeTask.sourceAttemptId`, `Job.idempotencyKey`.

## 6. API (`/api/v1`) — 웹·모바일 공용

응답 형식: `{ data, error }` · 오류: `{ error: { code, message, retryable } }` · 상태코드 401/403/404/409/422/500.

| Method · Path | 호출자 | 설명 |
|---|---|---|
| POST `/auth/login` | 모바일 | 이메일·비밀번호 → Bearer 토큰(30일) |
| POST `/auth/oauth` | 모바일 | `{provider, accessToken}` 를 공급사에 검증 → 단어방 토큰 |
| GET `/me` | 모두 | 사용자·소속·학생 연결 |
| GET `/academies` | 교사 | 소속 학원. 이후 `x-academy-id` 헤더 |
| GET `/dashboard` | 교사 | 오늘 시험·미응시·재시험·검수 대기·최근 성적 |
| GET `/students`, `/students/{id}` | 교사 | 담당 범위 |
| GET `/exams`, `/exams/{id}` | 교사 | 시험·배정 현황 |
| GET `/results?examId&studentId` | 교사 | 확정 성적 |
| GET `/jobs/{id}` | 교사 | 작업 상태 |
| POST `/devices` | 모두 | 푸시 토큰 등록 |
| GET `/learn/assignments` | 학생 | 내 배정 |
| POST `/assignments/{id}/start` | 학생 | 응시 시작(방식 잠금) |
| GET `/attempts/{id}` | 학생 | 정답 없는 DTO + 저장 답안 + revision + 서버 시각 |
| PATCH `/attempts/{id}/answers` | 학생 | `{expected_revision, answers[{item_id, option_id}]}` → 409 `revision_conflict` 시 재동기화 |
| POST `/attempts/{id}/submit` | 학생 | 미전송 답안 포함 원자 제출, 반복 제출 멱등 |
| GET `/attempts/{id}/result` | 학생 | 공개 정책 적용 결과·오답 |

파일: `GET /api/files/print/{printId}` `answer-key/{formId}` `scan/{scanId}` `scan-corrected/{scanId}` `wrong-note/{attemptId}?scope=attempt|cumulative`.

## 7. 환경변수 (`.env`)

| 변수 | 용도 |
|---|---|
| `DATABASE_URL` | `file:./prisma/dev.db` (PostgreSQL 전환 시 접속 문자열) |
| `APP_URL` | OAuth 리디렉션 기준 URL |
| `SESSION_SECRET` | 세션 서명 키(운영 시 반드시 변경) |
| `ALLOW_DEV_LOGIN` | `false` 면 이메일 로그인·API 로그인 비활성 |
| `GOOGLE_CLIENT_ID/SECRET`, `KAKAO_CLIENT_ID/SECRET` | 소셜 로그인. 리디렉션 URI `{APP_URL}/api/auth/callback/{google|kakao}` |
| `STORAGE_DIR` | 파일 저장 루트 |

## 8. 보안 원칙 (구현됨)

- 정답 키는 `FormOption.isCorrect` 로만 존재하고 학생 DTO·결과 API·HTML 에 포함되지 않는다.
- 초대·학생 토큰은 해시만 저장, 만료·1회 사용·경쟁 승인 트랜잭션.
- 업로드는 매직 바이트 판정, ZIP 엔트리/해제 크기/경로 검사, XML DTD·ENTITY 거부, PDF 페이지 제한.
- 파일 URL 은 권한 검사를 통과해야 응답(`Cache-Control: private, no-store`). 다른 학원 리소스는 404.
- 오류 응답에 스택·토큰 없음. 감사 로그(`AuditLog`)에 학생 원문·정답 미기록.

## v5.0 — Monorepo (2026-09-23)

- pnpm workspace (`apps/*`, `packages/*`) + Turborepo. `node-linker=hoisted`. 루트 `pnpm-lock.yaml` 하나.
- `apps/web` = 이 문서의 Next.js 전체 (Prisma 포함, Server-only). `apps/mobile` = Expo SDK 57 (Expo Router · TanStack Query · SecureStore).
- 공유: `packages/types`(DTO) · `validation`(Zod) · `api-client`(fetch 봉투 처리 · `DaneobangApiError`) · `design-tokens` · `utils`. UI 컴포넌트·CSS·Prisma 는 공유하지 않는다.
- 모바일 인증: `POST /api/v1/auth/oauth`(공급사 access token 검증) → 30일 JWT(`signToken(user.id, "mobile", "30d")`) → SecureStore. 학원 컨텍스트는 `x-academy-id`, 학생은 `x-student-id`. 자세히: `docs/MOBILE_MVP.md`.
