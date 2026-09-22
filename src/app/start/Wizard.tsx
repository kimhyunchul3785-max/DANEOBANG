"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAccountAction } from "./actions";
import { StepBar } from "./StepBar";
import { VerifyStep } from "./VerifyStep";

const UNIT = 9900;
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/**
 * ①~④ 는 브라우저 상태로만 진행하고, ④ 계정에서 한 번에 서버로 보낸다.
 * 이미 로그인한 사용자(구글·카카오 등)는 ④ 에서 계정 입력 없이 그 계정으로 학원을 만든다.
 */
export function Wizard({ loggedIn, mailOn, billing }: { loggedIn: { name: string; email: string } | null; mailOn: boolean; billing: boolean }) {
  // 결제 꺼짐: ① 학원 정보 → ③ 원장 여부 → ④ 계정 (내부 step 번호는 결제 버전 기준으로 유지하고 표시만 바꾼다)
  const [step, setStep] = useState(1);
  const shown = billing ? step : step === 1 ? 1 : step === 3 ? 2 : 3;
  const [d, setD] = useState({ academyName: "", representativeName: "", phone: "", region: "", teacherCount: 1, ownerIsTeacher: "yes" as "yes" | "no", ownerName: "", email: "", password: "", password2: "" });
  const [err, setErr] = useState<string | null>(null);
  const [verify, setVerify] = useState<{ email: string; devLink?: string; message?: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (k: keyof typeof d, v: string | number) => setD((x) => ({ ...x, [k]: v }));
  const monthly = d.teacherCount * UNIT;
  const next = () => {
    setErr(null);
    if (step === 1 && (d.academyName.trim().length < 2 || !d.representativeName.trim())) return setErr("학원명(2자 이상)과 대표자명을 입력해주세요.");
    setStep(step === 1 && !billing ? 3 : step + 1);
  };
  const prev = (to: number) => setStep(to === 2 && !billing ? 1 : to);
  const submit = () => {
    setErr(null);
    const fd = new FormData();
    for (const [k, v] of Object.entries(d)) fd.set(k, String(v));
    start(async () => {
      const r = await createAccountAction(fd);
      if (!r.ok) return setErr(r.message ?? "실패했습니다.");
      if (r.step === 4) setVerify({ email: d.email, devLink: r.devLink, message: r.message });
      else router.refresh(); // 로그인 사용자: 학원 생성 완료 → 결제 단계 (서버 렌더)
    });
  };

  if (verify) return (
    <>
      <StepBar step={billing ? 4 : 3} billing={billing} />
      <VerifyStep email={verify.email} academyName={d.academyName} mailOn={mailOn} devLink={verify.devLink} note={verify.message} />
    </>
  );

  return (
    <div data-testid="wizard" data-step={shown}>
      <StepBar step={shown} billing={billing} />
      {step === 1 && (
        <section className="card card-body anim-fade-up">
          <div className="lbl">01 · Academy</div>
          <h1 className="h1 mt-1">학원 정보를 알려주세요</h1>
          <div className="mt-4 grid gap-3">
            <label className="block">
              <span className="label">학원명 *</span>
              <input className="input" value={d.academyName} onChange={(e) => set("academyName", e.target.value)} placeholder="예: ABC영어학원" maxLength={40} autoFocus data-testid="academyName" />
            </label>
            <label className="block">
              <span className="label">대표자명 *</span>
              <input className="input" value={d.representativeName} onChange={(e) => set("representativeName", e.target.value)} placeholder="예: 김현철" maxLength={30} data-testid="representativeName" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="label">학원 전화번호</span>
                <input className="input" value={d.phone} onChange={(e) => set("phone", e.target.value)} placeholder="02-000-0000" maxLength={30} />
              </label>
              <label className="block">
                <span className="label">지역</span>
                <input className="input" value={d.region} onChange={(e) => set("region", e.target.value)} placeholder="예: 서울 강남" maxLength={30} />
              </label>
            </div>
          </div>
          {err && <p className="mt-3 text-[13px]" style={{ color: "var(--accent)" }}>{err}</p>}
          <button type="button" className="btn-primary mt-5 w-full py-3" onClick={next} data-testid="next">
            계속
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="card card-body anim-fade-up">
          <div className="lbl">02 · Teachers</div>
          <h1 className="h1 mt-1">현재 영어 선생님은 몇 명인가요?</h1>
          <p className="muted mt-2">실제로 단어시험·재시험 시스템을 사용할 선생님 수를 입력해주세요. 원장님이 직접 수업하시는 경우 원장님도 포함합니다.</p>
          <div className="mt-5 flex items-center justify-center gap-6">
            <button type="button" className="btn-secondary h-12 w-12 rounded-full text-[20px]" onClick={() => set("teacherCount", Math.max(1, d.teacherCount - 1))} aria-label="한 명 줄이기">
              −
            </button>
            <div className="text-center">
              <div className="num-xl" data-testid="teacherCount">
                {d.teacherCount}
              </div>
              <div className="lbl">명</div>
            </div>
            <button type="button" className="btn-secondary h-12 w-12 rounded-full text-[20px]" onClick={() => set("teacherCount", Math.min(200, d.teacherCount + 1))} aria-label="한 명 늘리기" data-testid="seat-plus">
              +
            </button>
          </div>
          <div className="card-dark card-body mt-5 text-center">
            <div className="lbl" style={{ color: "rgba(236,233,227,0.55)" }}>
              월 이용료
            </div>
            <div className="num-lg mt-1" data-testid="monthly">
              {won(monthly)} <span className="lbl" style={{ color: "rgba(236,233,227,0.7)" }}>/ 월</span>
            </div>
            <div className="mt-1 text-[12.5px]" style={{ color: "rgba(236,233,227,0.75)" }}>
              {won(UNIT)} × 선생님 {d.teacherCount}명
            </div>
          </div>
          <div className="mt-5 grid grid-cols-[auto_1fr] gap-2">
            <button type="button" className="btn-secondary py-3" onClick={() => setStep(1)}>
              이전
            </button>
            <button type="button" className="btn-primary py-3" onClick={next} data-testid="next">
              계속
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="card card-body anim-fade-up">
          <div className="lbl">{billing ? "03" : "02"} · Owner</div>
          <h1 className="h1 mt-1">원장님도 직접 학생을 지도하시나요?</h1>
          <div className="mt-4 grid gap-2" role="radiogroup">
            {(
              [
                ["yes", "네, 저도 선생님으로 사용합니다.", billing ? `구매한 선생님 자리 ${d.teacherCount}개 중 1개를 원장님이 사용합니다. 초대 가능 ${Math.max(0, d.teacherCount - 1)}명` : "학생 담당·출제·채점을 직접 합니다. 선생님 화면과 학원 관리 화면을 모두 씁니다."],
                ["no", "아니요, 관리자 기능만 사용합니다.", billing ? `원장 계정은 자리를 쓰지 않습니다. 초대 가능 ${d.teacherCount}명` : "학원 현황·선생님·설정만 관리합니다. 나중에 요금제·내 계정에서 켤 수 있습니다."],
              ] as const
            ).map(([v, l, sub]) => (
              <button key={v} type="button" role="radio" aria-checked={d.ownerIsTeacher === v} onClick={() => set("ownerIsTeacher", v)} className="tile flex w-full items-start gap-3 rounded-[18px] px-4 py-3 text-left" style={d.ownerIsTeacher === v ? { background: "var(--ink)", color: "var(--surface-2)" } : { background: "var(--surface-2)", color: "var(--ink)" }} data-testid={`owner-${v}`}>
                <span className="digital mt-0.5">{d.ownerIsTeacher === v ? "●" : "○"}</span>
                <span>
                  <span className="block text-[15px] font-semibold">{l}</span>
                  <span className="block text-[12.5px]" style={{ opacity: 0.75 }}>
                    {sub}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-[auto_1fr] gap-2">
            <button type="button" className="btn-secondary py-3" onClick={() => prev(2)}>
              이전
            </button>
            <button type="button" className="btn-primary py-3" onClick={next} data-testid="next">
              계속
            </button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="card card-body anim-fade-up">
          <div className="lbl">{billing ? "04" : "03"} · Account</div>
          <h1 className="h1 mt-1">{loggedIn ? "이 계정으로 학원을 만듭니다" : "학원을 관리할 계정을 만들어주세요"}</h1>
          {loggedIn ? (
            <div className="card-sm card-body mt-4">
              <div className="text-[15px] font-semibold">{loggedIn.name}</div>
              <div className="muted">{loggedIn.email} · 학원장(OWNER)</div>
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              <label className="block">
                <span className="label">이름</span>
                <input className="input" value={d.ownerName} onChange={(e) => set("ownerName", e.target.value)} maxLength={40} autoFocus data-testid="ownerName" />
              </label>
              <label className="block">
                <span className="label">이메일</span>
                <input className="input" type="email" value={d.email} onChange={(e) => set("email", e.target.value)} placeholder="example@naver.com" data-testid="email" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="label">비밀번호</span>
                  <input className="input" type="password" value={d.password} onChange={(e) => set("password", e.target.value)} minLength={6} data-testid="password" />
                </label>
                <label className="block">
                  <span className="label">비밀번호 확인</span>
                  <input className="input" type="password" value={d.password2} onChange={(e) => set("password2", e.target.value)} data-testid="password2" />
                </label>
              </div>
              <p className="muted">{billing ? "가입 후 이메일 인증 → 결제 순서로 진행됩니다." : "가입 후 이메일 인증만 하면 바로 시작합니다."} 다른 선생님은 여기서 가입하지 않고, 이 계정의 초대 링크로 참여합니다.</p>
            </div>
          )}
          <div className="card-sm card-body mt-4 text-[13px]">
            <div className="flex justify-between">
              <span>{d.academyName}</span>
              <span className="muted">대표 {d.representativeName}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span>{billing ? `선생님 ${d.teacherCount}명 · ` : ""}원장 {d.ownerIsTeacher === "yes" ? "수업함" : "관리만"}</span>
              <span className="font-semibold">{billing ? `월 ${won(monthly)}` : "체험 · 무료"}</span>
            </div>
          </div>
          {err && <p className="mt-3 text-[13px]" style={{ color: "var(--accent)" }}>{err}</p>}
          <div className="mt-5 grid grid-cols-[auto_1fr] gap-2">
            <button type="button" className="btn-secondary py-3" onClick={() => setStep(3)} disabled={pending}>
              이전
            </button>
            <button type="button" className="btn-primary py-3" onClick={submit} disabled={pending} data-testid="create-account">
              {pending ? "처리 중…" : loggedIn ? (billing ? "학원 만들고 결제로" : "학원 만들기") : "계정 만들기"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
