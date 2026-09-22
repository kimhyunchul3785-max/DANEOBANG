import fs from "fs";
import path from "path";
import { writeLog, logDir } from "./logger";

/**
 * 문자(SMS) 발송 — 학생 휴대폰 인증번호.
 * SMS_PROVIDER 가 없으면 "개발 모드": 보내지 않고 log/sms.log 에 적고, 화면에 인증번호를 그대로 보여준다
 * (선생님이 카톡 등으로 직접 전달할 수 있게). 문자 업체(솔라피·알리고 등)를 붙일 때는 send() 의 provider 분기만 추가.
 */
export type SmsResult = { sent: boolean; devCode?: string; error?: string };

export function smsConfigured() {
  return !!process.env.SMS_PROVIDER && process.env.SMS_PROVIDER !== "dev";
}

export { normalizePhone, fmtPhone, isPhone } from "./phone";
import { normalizePhone } from "./phone";

function devLog(entry: Record<string, unknown>) {
  try {
    fs.mkdirSync(logDir(), { recursive: true });
    fs.appendFileSync(path.join(logDir(), "sms.log"), JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
  } catch {}
}

export async function sendSms(to: string, text: string, code?: string): Promise<SmsResult> {
  const phone = normalizePhone(to);
  writeLog({ kind: "sms", event: "send", detail: { to: phone, configured: smsConfigured() } });
  if (!smsConfigured()) {
    devLog({ mode: "dev", to: phone, text, code });
    return { sent: false, devCode: code };
  }
  // 실제 업체 연동 자리 (예: SOLAPI). 아직 없으면 실패로 돌려 화면에서 코드를 직접 전달하게 한다.
  devLog({ mode: "error", to: phone, text, code, error: `provider ${process.env.SMS_PROVIDER} not implemented` });
  return { sent: false, devCode: code, error: `문자 업체(${process.env.SMS_PROVIDER}) 연동이 아직 없습니다.` };
}

export function studentCodeText(academyName: string, studentName: string, code: string, joinUrl: string) {
  return `[단어방] ${academyName} ${studentName} 학생 인증번호 ${code}\n${joinUrl} 에서 휴대폰 번호와 인증번호로 가입하세요. (3일간 유효)`;
}
