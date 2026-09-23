import fs from "fs";
import path from "path";
import { writeLog, logDir } from "./logger";

/**
 * 메일 발송 — 인증 메일·초대 메일·학생 계정 설정 링크.
 * - SMTP_URL (예: smtps://user:pass@smtp.gmail.com:465) 또는 SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS 가 있으면 nodemailer 로 보낸다.
 * - 없으면 "개발 모드": 보내지 않고 log/mail.log 에 적고, 호출한 화면이 링크를 직접 보여줄 수 있게 돌려준다.
 */
export type MailResult = { sent: boolean; devLink?: string; error?: string };

export function mailConfigured() {
  return !!(process.env.SMTP_URL || process.env.SMTP_HOST);
}

function from() {
  return process.env.MAIL_FROM || "단어방 <no-reply@daneobang.local>";
}

async function transport() {
  const nodemailer = (await import("nodemailer")).default;
  if (process.env.SMTP_URL) return nodemailer.createTransport(process.env.SMTP_URL);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true" || process.env.SMTP_PORT === "465",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

function devLog(entry: Record<string, unknown>) {
  try {
    const dir = logDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "mail.log"), JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
  } catch {}
}

export async function sendMail(opts: { to: string; subject: string; text: string; html?: string; link?: string }): Promise<MailResult> {
  writeLog({ kind: "mail", event: "send", detail: { to: opts.to, subject: opts.subject, configured: mailConfigured() } });
  if (!mailConfigured()) {
    devLog({ mode: "dev", to: opts.to, subject: opts.subject, link: opts.link, text: opts.text });
    return { sent: false, devLink: opts.link };
  }
  try {
    const t = await transport();
    await t.sendMail({ from: from(), to: opts.to, subject: opts.subject, text: opts.text, html: opts.html ?? `<pre style="font-family:inherit;white-space:pre-wrap">${opts.text.replace(/</g, "&lt;")}</pre>` });
    return { sent: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    devLog({ mode: "error", to: opts.to, subject: opts.subject, link: opts.link, error });
    return { sent: false, devLink: opts.link, error };
  }
}

export function verifyMail(link: string, academyName: string) {
  return { subject: `[단어방] 이메일을 확인해주세요 — ${academyName}`, text: `${academyName} 관리자 계정의 이메일 인증 링크입니다.\n\n${link}\n\n링크는 24시간 동안 유효합니다. 본인이 요청하지 않았다면 이 메일을 무시하세요.`, link };
}

export function teacherInviteMail(link: string, academyName: string) {
  return { subject: `[단어방] ${academyName}에서 초대했습니다`, text: `${academyName}에서 단어시험 시스템에 선생님으로 초대했습니다.\n\n아래 링크를 열고 이 이메일의 Google 또는 카카오 계정으로 로그인하면 바로 참여됩니다.\n\n${link}\n\n링크는 7일 동안 유효합니다.`, link };
}

export function studentActivateMail(link: string, academyName: string, studentName: string) {
  return { subject: `[단어방] ${academyName}에서 ${studentName} 학생을 초대했습니다`, text: `${studentName} 학생, ${academyName}에서 단어시험에 초대했습니다.\n\n아래 링크를 열고 Google 또는 카카오로 로그인하면 바로 연결됩니다.\n\n${link}\n\n링크는 7일 동안 유효합니다.`, link };
}
