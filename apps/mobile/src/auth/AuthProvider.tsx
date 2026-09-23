/**
 * 인증 상태 — SecureStore 토큰 → GET /me → 사용 가능한 자리(학원 · 학생) 판단.
 *  - 학원 1개: 바로 진입 · 여러 개: 학원 선택 · 학생 자리만: student-only 화면
 *  - 401 이면 토큰을 지우고 로그인으로. Refresh token 없음 (30일 JWT).
 *  - 모바일은 role·권한을 판단하지 않는다. 여기서 고르는 것은 "어느 학원 헤더를 보낼지"뿐이다.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { MeResponse } from "@daneobang/types";
import { api, authEvents } from "@/api/client";
import { tokenStore } from "@/storage/token";
import { academyStore } from "@/storage/academy";
import { queryClient } from "@/query/client";
import { registerPushToken } from "@/push/register";

export type AuthStatus = "loading" | "signedOut" | "signedIn";

interface AuthState {
  status: AuthStatus;
  me: MeResponse | null;
  /** 선택된 학원 (x-academy-id). memberships 에 없으면 null */
  academyId: string | null;
  /** 학원 자리 없이 학생 자리만 있는 계정 */
  studentOnly: boolean;
  /** 학원이 여러 개인데 아직 고르지 않음 */
  needsAcademySelect: boolean;
  /** 마지막 오류 (로그인 화면 안내용) */
  error: string | null;
  signInWithToken: (token: string) => Promise<MeResponse>;
  signOut: () => Promise<void>;
  selectAcademy: (academyId: string) => Promise<void>;
  clearAcademy: () => Promise<void>;
  refreshMe: () => Promise<MeResponse | null>;
}

const AuthContext = createContext<AuthState | null>(null);

function pickAcademy(me: MeResponse, stored: string | null): string | null {
  if (stored && me.memberships.some((m) => m.academy.id === stored)) return stored;
  if (me.memberships.length === 1) return me.memberships[0].academy.id;
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [academyId, setAcademyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const signingOut = useRef(false);

  const applyMe = useCallback(async (next: MeResponse) => {
    const stored = await academyStore.get();
    const picked = pickAcademy(next, stored);
    if (picked) await academyStore.set(picked);
    else await academyStore.clear();
    setMe(next);
    setAcademyId(picked);
    setStatus("signedIn");
    setError(null);
    return picked;
  }, []);

  const signOut = useCallback(async () => {
    if (signingOut.current) return;
    signingOut.current = true;
    try {
      await tokenStore.clear();
      await academyStore.clear();
      queryClient.clear();
      setMe(null);
      setAcademyId(null);
      setStatus("signedOut");
    } finally {
      signingOut.current = false;
    }
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const next = await api.me.get();
      await applyMe(next);
      queryClient.setQueryData(["me"], next);
      return next;
    } catch {
      return null;
    }
  }, [applyMe]);

  // 앱 시작: 토큰 → /me
  useEffect(() => {
    let alive = true;
    (async () => {
      const token = await tokenStore.get();
      if (!token) {
        if (alive) setStatus("signedOut");
        return;
      }
      try {
        const next = await api.me.get();
        if (!alive) return;
        await applyMe(next);
      } catch (e) {
        if (!alive) return;
        // 401 은 authEvents 가 signOut 을 부른다. 그 외(네트워크)는 로그인 화면에서 안내
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        const unauthorized = typeof e === "object" && e !== null && "status" in e && (e as { status: number }).status === 401;
        if (!unauthorized) setStatus("signedOut");
      }
    })();
    return () => {
      alive = false;
    };
  }, [applyMe]);

  // 어떤 요청이든 401 → 토큰 삭제 → 로그인
  useEffect(() => {
    const off = authEvents.onUnauthorized(() => void signOut());
    return () => {
      off();
    };
  }, [signOut]);

  const signInWithToken = useCallback(
    async (token: string) => {
      await tokenStore.set(token);
      queryClient.clear();
      const next = await api.me.get();
      await applyMe(next);
      void registerPushToken();
      return next;
    },
    [applyMe],
  );

  const selectAcademy = useCallback(async (id: string) => {
    await academyStore.set(id);
    queryClient.clear(); // 다른 학원 캐시가 순간적으로 보이지 않게
    setAcademyId(id);
  }, []);
  const clearAcademy = useCallback(async () => {
    await academyStore.clear();
    queryClient.clear();
    setAcademyId(null);
  }, []);

  const value = useMemo<AuthState>(() => {
    const hasAcademy = !!me && me.memberships.length > 0;
    return {
      status,
      me,
      academyId,
      studentOnly: !!me && !hasAcademy && me.students.length > 0,
      needsAcademySelect: !!me && hasAcademy && !academyId,
      error,
      signInWithToken,
      signOut,
      selectAcademy,
      clearAcademy,
      refreshMe,
    };
  }, [status, me, academyId, error, signInWithToken, signOut, selectAcademy, clearAcademy, refreshMe]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
