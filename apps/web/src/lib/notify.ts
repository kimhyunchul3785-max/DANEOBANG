import { prisma } from "./db";

/** 학생 앱 알림 (종 아이콘). 실패해도 본 작업을 막지 않는다. */
export async function notifyUser(userId: string, title: string, body: string, link?: string) {
  try {
    await prisma.notification.create({ data: { userId, title, body, link: link ?? null } });
  } catch {
    /* ignore */
  }
}

/**
 * 모바일 앱 푸시 (Expo push token 이 등록된 기기에만 · best effort).
 * 토큰은 POST /api/v1/devices 로 앱이 등록한다. 웹 학생 앱은 종 아이콘 폴링 + 브라우저 알림(탭이 열려 있을 때)으로 받는다.
 */
export async function pushToUsers(userIds: string[], msg: { title: string; body: string; data?: Record<string, unknown> }) {
  if (!userIds.length) return { sent: 0 };
  try {
    const tokens = await prisma.deviceToken.findMany({ where: { userId: { in: userIds }, platform: { in: ["android", "ios"] } }, select: { token: true } });
    const expo = tokens.map((t) => t.token).filter((t) => /^Expo(nent)?PushToken\[/.test(t));
    if (!expo.length) return { sent: 0 };
    let sent = 0;
    for (let i = 0; i < expo.length; i += 100) {
      const chunk = expo.slice(i, i + 100).map((to) => ({ to, title: msg.title, body: msg.body, data: msg.data ?? {}, sound: "default", priority: "high" }));
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      try {
        const r = await fetch("https://exp.host/--/api/v2/push/send", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(chunk), signal: ctrl.signal });
        if (r.ok) sent += chunk.length;
      } finally {
        clearTimeout(t);
      }
    }
    return { sent };
  } catch {
    return { sent: 0 };
  }
}
