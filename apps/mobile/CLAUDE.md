# apps/mobile — 단어방 Expo 앱 (Android · iOS)

- Expo SDK 57 · Expo Router(`app/`) · TanStack Query · expo-secure-store(토큰) · AsyncStorage(학원 id). 화면 외 코드는 `src/`.
- **Expo API 는 학습 데이터로 답하지 말고** `https://docs.expo.dev/versions/v57.0.0/` 와 `https://docs.expo.dev/llms.txt` 를 먼저 확인한다.
- 서버·권한: `/api/v1` 만 쓴다 (`@daneobang/api-client`). 모바일은 role·학원·학생 권한을 판단하지 않는다 — 서버 scope 결과를 그대로 보여준다.
- 토큰은 SecureStore 에만. AsyncStorage·console.log·오류 리포트에 쓰지 않는다.
- 웹과 UI 컴포넌트를 공유하지 않는다. 공유는 `packages/*` (types · validation · api-client · design-tokens · utils) 만.
- 검증: `pnpm typecheck` · `pnpm export:android` (Metro 번들) · `npx expo-doctor`. 네이티브 모듈(google-signin·notifications·secure-store)은 Development Build 필요 (Expo Go 불가).
- 환경변수는 `.env` (`EXPO_PUBLIC_API_BASE_URL` — 에뮬레이터는 `http://10.0.2.2:3000`). 코드에 URL 하드코딩 금지.
