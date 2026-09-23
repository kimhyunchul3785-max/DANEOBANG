import { prisma } from "./db";

/** 학생 앱 알림 (종 아이콘). 실패해도 본 작업을 막지 않는다. */
export async function notifyUser(userId: string, title: string, body: string, link?: string) {
  try {
    await prisma.notification.create({ data: { userId, title, body, link: link ?? null } });
  } catch {
    /* ignore */
  }
}
