import Link from "next/link";

export default function LearnNotFound() {
  return (
    <div className="card card-body" data-testid="not-found">
      <div className="lbl">찾을 수 없음</div>
      <div className="mt-2 text-[18px] font-semibold">이 결과를 찾을 수 없어요</div>
      <p className="muted mt-1">지워졌거나 다른 계정의 시험일 수 있어요.</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link href="/learn" className="btn-primary py-3">
          이번 주
        </Link>
        <Link href="/learn/grades" className="btn-secondary py-3">
          성적
        </Link>
      </div>
    </div>
  );
}
