# 단어방 Web + Mobile Monorepo MVP v0.1 — 구현 노트 (2026-09-23)

기준 문서: "DANEOBANG Web + Mobile Monorepo MVP v0.1". 이번에 Phase 1–7 을 구현했다 (Phase 8 모션 · Phase 9 iPhone/EAS 는 다음).

## 1. 구조

```text
DANEOBANG
├─ apps/
│  ├─ web/        @daneobang/web   — 기존 Next.js 전체 (src · public · prisma · scripts · assets · fixtures · storage · .env)
│  └─ mobile/     @daneobang/mobile — Expo SDK 57 · Expo Router · TanStack Query (Android + iOS 한 프로젝트)
├─ packages/
│  ├─ types/          @daneobang/types          /api/v1 DTO (Prisma 모델 아님, 날짜는 ISO 문자열)
│  ├─ validation/     @daneobang/validation     Zod 요청 스키마 — API route 와 앱이 같은 파일
│  ├─ api-client/     @daneobang/api-client     createApiClient({ baseUrl, getAccessToken, getAcademyId, getStudentId, onUnauthorized })
│  ├─ design-tokens/  @daneobang/design-tokens  color · radius · spacing · motion · typography
│  ├─ utils/          @daneobang/utils          순수 함수 (fmtDate · seoulWeekRange · parseSeoulLocal · seededRandom …)
│  └─ tsconfig/       @daneobang/tsconfig       공용 tsconfig base
├─ package.json · pnpm-workspace.yaml · turbo.json · .npmrc
└─ start-server.bat  (pnpm 자동 설치 → apps/web 설치·DB·빌드·실행)
```

- 패키지 매니저 **pnpm 10** (`node-linker=hoisted` — Next 와 Metro 모두 평평한 node_modules 를 기대). `package-lock.json` 은 없애고 `pnpm-lock.yaml` 하나.
- 공용 패키지는 빌드 없이 TS 소스를 그대로 쓴다: Next 는 `transpilePackages`, Metro 는 워크스페이스를 자동 인식.
- React 는 웹·모바일 모두 **19.2.3** 로 맞췄다 (RN 0.86 요구, hoisted 트리에 react 가 하나만 있어야 react-dom 이 깨지지 않음). Next 15.5.4 그대로.
- Prisma 는 `apps/web` 안에만 (Server-only). `packages/*` 에 Prisma 의존이 없다.
- 로그·스크린샷 폴더: 저장소 루트 `log/` (`LOG_DIR="../../log"`, apps/web 기준).

## 2. 웹 변경 (기능 변화 없음)

| 파일 | 변경 |
|---|---|
| `apps/web/next.config.ts` | `outputFileTracingRoot`(저장소 루트) · `transpilePackages` |
| `apps/web/src/lib/util.ts` | 순수 함수는 `@daneobang/utils` 에서 re-export, Node 전용(sha256·randomToken)만 남김 |
| `api/v1/auth/login·oauth`, `devices`, `attempts/{id}/answers·submit`, `students` | 인라인 zod 대신 `@daneobang/validation` 스키마 |
| `apps/web/scripts/*` | `../log` → `../../log`. `e2e-retake · e2e-linked · e2e` 는 `/login` → `/login/email` (로그인은 통과하나 v4.6 UI 변경으로 뒤 단계가 깨져 있음 — 아래 회귀 표) |
| `apps/web/scripts/test-api-client.ts` (새) | 공용 클라이언트 스모크 19 체크 |

### 회귀 (이번 monorepo 전환 후)

| 검사 | 결과 |
|---|---|
| `pnpm typecheck` (turbo · 7개) | 통과 |
| `pnpm build:web` | 통과 |
| `test:parsers` · `test:omr` | 통과 (OMR 40/40) |
| `e2e:onboarding` | 9/9 |
| `e2e:compose` | 41/41 |
| `test:api-client` | 19/19 |
| `e2e:retake` | v4.6 에서 없어진 `retake-mode-summary` 셀렉터에서 실패 (전환 전부터) |
| `e2e:linked` | v4.5 `/workspaces` 를 기대 (v4.6 은 `/switch`) — 전환 전부터 실패 |

## 3. 모바일 (apps/mobile)

### 화면
```text
app/
├─ _layout.tsx          Query · Auth 공급자 + AuthGate (미로그인 → login · 학원 여러 개 → select-academy · 학원 없음/학생만 → student-only · 그 외 → (teacher))
├─ (auth)/login.tsx     Google(@react-native-google-signin) · Kakao(expo-auth-session 코드 흐름) · __DEV__ 에서만 Dev login
├─ (auth)/dev-login.tsx 이메일/휴대폰 + 비밀번호 → POST /auth/login (서버 ALLOW_DEV_LOGIN=false 면 403)
├─ select-academy.tsx   /me.memberships 카드 → AsyncStorage 에 academyId
├─ student-only.tsx     학생 자리만 / 연결 없음 → 웹 /login · /welcome 열기
└─ (teacher)/           탭: 오늘(index) · 학생(students/, [id]) · 시험(exams/, [id]) · 설정(settings)
src/
├─ api/client.ts        createApiClient + 401 → authEvents → signOut
├─ auth/AuthProvider    SecureStore 토큰 → /me → 학원 선택 규칙 · signOut · selectAcademy(queryClient.clear())
├─ auth/providers.ts    Google/Kakao 토큰 획득 (공급사 토큰은 저장하지 않음)
├─ push/register.ts     Expo push token → POST /devices (projectId 있고 Development Build 일 때만)
├─ query/               keys(["dashboard", academyId] …) · client · hooks
├─ storage/             token(SecureStore) · academy(AsyncStorage)
├─ theme/               design-tokens → StyleSheet (text · surface · badge)
└─ components/ui.tsx    Label · Digital · Card · Badge · StatusBadge · Button · Row · Screen · StatTile …
```

- 사용하는 API: `POST /auth/login · /auth/oauth`, `GET /me · /academies · /dashboard · /students(?q) · /students/{id} · /exams · /exams/{id} · /results`, `POST /devices`. **서버 API 는 바꾸지 않았다** (요청 검증만 공용 스키마로).
- 헤더: `Authorization: Bearer` + `x-academy-id` (학생 API 는 `x-student-id`). 쿠키 흉내 없음.
- 권한은 서버가 결정한다. 앱은 `/me` 결과로 "어느 학원 헤더를 보낼지"만 고른다. 선생님이 담당 아닌 학생을 열면 서버 404 그대로.
- Google: expo-auth-session 의 Google provider 가 SDK 문서에서 deprecated 라 권장 라이브러리 `@react-native-google-signin/google-signin` 을 썼다 (Development Build 필요). Kakao 는 expo-auth-session 표준 인증 코드 흐름 (`daneobang://oauth/kakao`).
- 글꼴은 아직 시스템 글꼴. 토큰의 역할(라벨·숫자·디지털)만 크기·자간·굵기로 구분 — Pretendard·Space Grotesk·DotGothic16 파일을 `assets/fonts` 에 넣고 `expo-font` 로 실으면 된다.

### 검증한 것 / 못 한 것
- 통과: `pnpm --filter @daneobang/mobile typecheck`, `expo export --platform android` (Metro 번들 4.6MB, 워크스페이스 패키지 해석 포함), `expo-doctor` 19/21 (실패 2건은 컨테이너의 외부 네트워크 차단).
- **에뮬레이터·실기기 실행은 이 환경에서 할 수 없었다.** 아래 스모크 15항목은 사용자 PC 에서 확인해야 한다.

## 4. Windows 에서 시작하기

```powershell
# 1. 웹 (첫 실행이 pnpm 을 설치·활성화한다)
start-server.bat            # 또는 start-server.bat dev

# 2. 모바일 준비
cd apps\mobile
copy .env.example .env      # EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3000 (에뮬레이터) / 실기기는 PC 의 LAN IP
pnpm dev:mobile             # = expo start (루트에서). Expo Go 로는 Dev login·화면만 확인 가능 (네이티브 모듈 제외)

# 3. Android Development Build (Google 로그인·푸시·SecureStore 까지)
#    Android Studio + SDK + 에뮬레이터 설치 후
cd apps\mobile
npx expo prebuild --platform android
npx expo run:android        # 에뮬레이터/USB 기기에 개발 빌드 설치 → 이후엔 pnpm dev:mobile 만
```

OAuth 키:
- **Google** (Google Cloud Console › 사용자 인증 정보): Web 클라이언트 ID(`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, 필수) · Android 클라이언트(패키지 `com.daneobang.app` + 디버그/릴리스 SHA-1) · iOS 클라이언트 ID(`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `app.json` 플러그인의 `iosUrlScheme` 도 교체).
- **Kakao** (Kakao Developers): REST API 키 → `EXPO_PUBLIC_KAKAO_REST_API_KEY`, Redirect URI 에 `daneobang://oauth/kakao` 등록, Client Secret "사용 안함", 동의항목 닉네임·이메일. 서버 `.env` 의 `KAKAO_CLIENT_ID` 와 같은 앱이어야 서버 검증이 통한다.
- 푸시: `eas init` 으로 `app.json extra.eas.projectId` 가 채워지면 로그인 직후 토큰이 `/devices` 로 등록된다.

## 5. 모바일 스모크 체크리스트 (사용자 PC)

1. 로그인이 된다 (Dev login → tester.owner@ / test1234).
2. 토큰이 SecureStore 에 저장된다 (앱 재실행 시 로그인 화면이 아니라 바로 오늘).
3. 재실행 후 자동 로그인된다.
4. `/me` 가 성공한다.
5. 학원 하나면 자동 진입 (tester.t1@).
6. 여러 학원이면 선택 화면 (owner@ — 한빛·테스트학원).
7. `x-academy-id` 가 모든 학원 API 에 전달된다 (설정 › 현재 학원 표시, 오늘 데이터가 그 학원).
8. 오늘이 표시된다.
9. 학생 검색이 된다.
10. 학생 상세가 열린다 → 이력 탭 → 시험 상세.
11. 담당하지 않는 학생은 목록에 없고, URL 로 열어도 404 (tester.t1@ 는 A반 5명만).
12. 로그아웃하면 토큰이 삭제된다 (재실행 → 로그인 화면).
13. 서버에서 토큰을 무효화하거나 SESSION_SECRET 을 바꾸면 401 → 로그인 화면.
14. Android Emulator/실기기 정상.
15. iPhone Development Build (Phase 9 · EAS).

## 6. 다음 (Phase 8–9)
- Web GSAP: 대시보드 진입 stagger · 오버레이 · 상태 변화 3곳만 (CSS micro interaction 은 그대로). `pnpm --filter @daneobang/web add gsap @gsap/react`.
- Mobile Reanimated: Today 카드 등장 · 검색 결과 · 상세 진입 (`FadeInDown.duration(motion.duration.normal)`), `useReducedMotion` 존중.
- EAS: `eas build --profile development --platform ios` (Apple Developer 필요). `eas.json` 에 development · preview · production 프로필 준비됨.
- 학생 앱 v0.2: `api.learn.assignments()` · `api.attempts.*` 는 클라이언트에 이미 있다.
