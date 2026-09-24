export function StatusBadge({ s }: { s: string }) {
  const map: Record<string, [string, string]> = {
    assigned: ["badge-gray", "안 침"],
    in_progress: ["badge-blue", "응시 중"],
    completed: ["badge-green", "완료"],
    expired: ["badge-red", "미응시"],
    review: ["badge-amber", "확인 필요"],
  };
  const [cls, label] = map[s] ?? ["badge-gray", s];
  return <span className={cls}>{label}</span>;
}
