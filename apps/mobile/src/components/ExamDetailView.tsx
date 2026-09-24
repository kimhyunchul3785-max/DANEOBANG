/**
 * 시험 상세 본문 — 휴대폰 화면(/exams/[id])과 태블릿 가로 마스터-디테일(/exams 오른쪽)이 같이 쓴다.
 * 순서: 무엇(제목·상태) → 지금 어떤지(완료 막대 · 평균 · 통과율) → 무엇을 할지(마감 연장) → 누가(안 친 학생 먼저)
 */
import React from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { fmtMD } from "@daneobang/utils";
import { useExam, useExtendDue } from "@/query/hooks";
import { errorMessage } from "@/api/client";
import { Badge, Button, Card, Empty, ErrorView, Loading, Progress, Row, SectionHead, StatusBadge, confirmAsync, notice } from "@/components/ui";
import { colors, spacing, text } from "@/theme";

function dday(iso: string | null) {
  if (!iso) return null;
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400e3);
  return d < 0 ? `${-d}일 지남` : d === 0 ? "오늘 마감" : `D-${d}`;
}

export function ExamDetailView({ id }: { id: string }) {
  const router = useRouter();
  const q = useExam(id);
  const e = q.data;
  const now = Date.now();
  const rows = e?.assignments ?? [];
  const done = rows.filter((a) => a.status === "completed").length;
  const graded = rows.map((a) => a.latest?.grade).filter((g): g is { score: number; passed: boolean } => !!g);
  const avg = graded.length ? Math.round(graded.reduce((s, g) => s + g.score, 0) / graded.length) : null;
  const passRate = graded.length ? Math.round((graded.filter((g) => g.passed).length / graded.length) * 100) : null;
  const overdue = rows.filter((a) => a.dueAt && new Date(a.dueAt).getTime() < now && a.status !== "completed").length;
  const published = e?.forms.find((f) => f.status === "published");
  const open = rows.filter((a) => a.status !== "completed").length;
  const due = rows.find((a) => a.status !== "completed" && a.dueAt)?.dueAt ?? null;
  const extend = useExtendDue();
  const doExtend = async (days: number) => {
    if (!e) return;
    const scope = overdue > 0 ? "overdue" : "open";
    const who = scope === "overdue" ? `마감 지난 ${overdue}명` : `안 친 ${open}명`;
    if (!(await confirmAsync("마감 연장", `${who}의 마감을 ${days}일 뒤 23:59로 바꿔요. 학생에게 알림이 가요.`, "연장"))) return;
    extend.mutate({ examId: e.id, days, scope }, { onSuccess: (r) => notice(`${r.updated}명의 마감을 연장했어요.`), onError: (err) => notice(errorMessage(err)) });
  };
  // 할 일이 있는 학생(안 친 학생)이 먼저
  const todo = rows.filter((a) => a.status !== "completed");
  const finished = rows.filter((a) => a.status === "completed");

  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorView message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (!e) return null;
  const dd = dday(due);
  return (
    <>
      <View>
        <Text style={text.h1}>{e.title}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <StatusBadge status={e.status} />
          {dd && <Badge tone={overdue > 0 ? "red" : "gray"}>{dd}</Badge>}
          <Text style={text.muted}>
            {e.questionCount}문항 · 통과 {e.passScore}점{published ? ` · v${published.version}` : ""}
          </Text>
        </View>
      </View>

      {/* 상태: 완료 · 평균 · 통과율을 한 카드에 */}
      <Card>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
          <Text style={text.numXl}>{done}</Text>
          <Text style={[text.title, { color: colors.inkTertiary }]}>/ {rows.length} 완료</Text>
        </View>
        <View style={{ marginTop: 12 }}>
          <Progress value={done} total={rows.length} tone={overdue > 0 ? "accent" : "ink"} />
        </View>
        <Text style={[text.body, { marginTop: 10 }, overdue > 0 && { color: colors.accent, fontWeight: "600" }]}>
          {rows.length === 0 ? "아직 응시 대상이 없어요 (웹 시험 상세 › 응시 대상)." : overdue > 0 ? `${overdue}명이 마감을 넘겼어요.` : open > 0 ? `${open}명 남았어요.` : "모두 마쳤어요."}
        </Text>
        <View style={{ flexDirection: "row", marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Text style={text.label}>평균</Text>
            <Text style={[text.numMd, { marginTop: 2 }]}>{avg ?? "—"}</Text>
          </View>
          <View style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: colors.line, paddingLeft: spacing.md }}>
            <Text style={text.label}>통과율</Text>
            <Text style={[text.numMd, { marginTop: 2 }, passRate !== null && passRate < 50 && text.accent]}>{passRate === null ? "—" : `${passRate}%`}</Text>
          </View>
          <View style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: colors.line, paddingLeft: spacing.md }}>
            <Text style={text.label}>확정</Text>
            <Text style={[text.numMd, { marginTop: 2 }]}>{graded.length}명</Text>
          </View>
        </View>
      </Card>

      {/* 행동: 안 친 학생이 있을 때만. 마감이 지났으면 주 버튼 */}
      {open > 0 && (
        <Card>
          <SectionHead title={overdue > 0 ? `마감 지난 ${overdue}명 연장` : `안 친 ${open}명 마감 연장`} />
          <Text style={text.muted}>그날 23:59로 바꾸고 학생에게 알림을 보내요.</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md }}>
            {[1, 3, 7].map((d) => (
              <Button key={d} variant={overdue > 0 && d === 1 ? "primary" : "secondary"} onPress={() => doExtend(d)} loading={extend.isPending && extend.variables?.days === d} style={{ flex: 1, paddingHorizontal: 8 }}>
                +{d}일
              </Button>
            ))}
          </View>
        </Card>
      )}

      <Card>
        {rows.length === 0 ? (
          <Empty title="응시 대상이 없어요" />
        ) : (
          <>
            {todo.length > 0 && <SectionHead title={`안 친 학생 ${todo.length}`} />}
            {todo.map((a, i) => {
              const expired = !!a.dueAt && new Date(a.dueAt).getTime() < now;
              return (
                <Row
                  key={a.assignmentId}
                  first={i === 0}
                  title={a.student.name}
                  subtitle={`${a.dueAt ? `마감 ${fmtMD(a.dueAt)}` : "마감 없음"}${a.mode ? ` · ${a.mode === "paper" ? "종이" : "온라인"}` : ""}`}
                  onPress={() => router.push({ pathname: "/(teacher)/students/[id]", params: { id: a.student.id } })}
                  right={<StatusBadge status={a.latest?.status === "review" ? "review" : a.status} expired={expired} />}
                />
              );
            })}
            {finished.length > 0 && (
              <View style={{ marginTop: todo.length ? spacing.lg : 0 }}>
                <SectionHead title={`끝낸 학생 ${finished.length}`} />
              </View>
            )}
            {finished.map((a, i) => {
              const g = a.latest?.grade;
              return (
                <Row
                  key={a.assignmentId}
                  first={i === 0}
                  title={a.student.name}
                  onPress={() => router.push({ pathname: "/(teacher)/students/[id]", params: { id: a.student.id } })}
                  right={
                    g ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={[text.numMd, !g.passed && text.accent]}>{g.score}</Text>
                        <Badge tone={g.passed ? "green" : "red"}>{g.passed ? "통과" : "미달"}</Badge>
                      </View>
                    ) : (
                      <StatusBadge status={a.latest?.status === "review" ? "review" : a.status} />
                    )
                  }
                />
              );
            })}
          </>
        )}
      </Card>
      <Text style={text.muted}>정답 공개·종이 시험지·문항 수정은 웹 시험 상세에서 해요.</Text>
    </>
  );
}
