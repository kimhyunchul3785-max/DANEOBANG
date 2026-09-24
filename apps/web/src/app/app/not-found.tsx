import Link from "next/link";

/** 앱 셸 안의 404 — 내비게이션은 그대로 두고, 무엇을 못 찾았는지와 돌아갈 곳을 알려준다 */
export default function AppNotFound() {
  return (
    <div className="mx-auto max-w-lg py-10" data-testid="not-found">
      <div className="card card-body">
        <div className="kicker">찾을 수 없음</div>
        <h1 className="h1 mt-1">이 화면을 찾을 수 없어요</h1>
        <p className="muted mt-2">지워졌거나, 다른 학원의 항목이거나, 주소가 잘못됐을 수 있어요.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/app/tests" className="btn-primary">
            시험 목록
          </Link>
          <Link href="/app/students" className="btn-secondary">
            학생 목록
          </Link>
          <Link href="/app" className="btn-ghost">
            오늘
          </Link>
        </div>
      </div>
    </div>
  );
}
