export function StatusBadge({ s }: { s: string }) {
  const map: Record<string, [string, string]> = {
    assigned: ["badge-gray", "OPEN"],
    in_progress: ["badge-blue", "LIVE"],
    completed: ["badge-green", "DONE"],
    expired: ["badge-red", "MISSED"],
    review: ["badge-amber", "REVIEW"],
  };
  const [cls, label] = map[s] ?? ["badge-gray", s];
  return <span className={cls}>{label}</span>;
}
