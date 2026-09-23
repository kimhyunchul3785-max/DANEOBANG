/**
 * 시험 상세 — 진행 상태 · 학생별 응시 상태 · 성적. 응시자는 서버 scope(담당 학생)대로.
 */
import React from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { fmtMD } from "@daneobang/utils";
import { useExam } from "@/query/hooks";
import { errorMessage } from "@/api/client";
import { Badge, Button, Card, Digital, Empty, ErrorView, Label, Loading, Row, Screen, StatTile, StatusBadge } from "@/components/ui";
import { colors, spacing, text } from "@/theme";

export default function ExamDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
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

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Button variant="ghost" onPress={() => router.back()} style={{ alignSelf: "flex-start", paddingHorizontal: 0 }}>
        ← 시험
      </Button>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorView message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : e ? (
        <>
          <View>
            <Text style={text.h1}>{e.title}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
              <StatusBadge status={e.status} />
              <Text style={text.muted}>
                {e.questionCount}문항 · 통과 {e.passScore}점{published ? ` · v${published.version}` : ""}
              </Text>
            </View>
          </View>

          <Card tone={overdue > 0 ? "accent" : "dark"}>
            <Label tone="onAccent">Progress · 진행</Label>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, marginTop: 10 }}>
              <Text style={[text.numXl, { color: overdue > 0 ? colors.accentInk : "#ECE9E3" }]}>{done}</Text>
              <Text style={[text.numMd, { marginBottom: 8, color: overdue > 0 ? "rgba(255,244,240,0.7)" : "rgba(236,233,227,0.6)" }]}>/ {rows.length} 완료</Text>
            </View>
            <Text style={[text.body, { color: overdue > 0 ? "rgba(255,244,240,0.9)" : "rgba(236,233,227,0.75)", marginTop: 4 }]}>
              {rows.length === 0 ? "아직 응시 대상이 없어요 (웹 시험 상세 › 응시 대상)." : overdue > 0 ? `${overdue}명이 마감을 넘겼어요.` : `${rows.length - done}명 남음`}
            </Text>
          </Card>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <StatTile label="Average · 평균" value={avg ?? "—"} sub={`확정 ${graded.length}명`} />
            <StatTile label="Pass · 통과율" value={passRate === null ? "—" : `${passRate}%`} sub={`통과 ${graded.filter((g) => g.passed).length}명`} accent={passRate !== null && passRate < 50} />
          </View>

          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <Label>Students · 학생별</Label>
              <Digital>
                {done}/{rows.length} DONE
              </Digital>
            </View>
            {rows.length === 0 ? (
              <Empty title="응시 대상이 없어요" />
            ) : (
              rows.map((a, i) => {
                const expired = !!a.dueAt && new Date(a.dueAt).getTime() < now && a.status !== "completed";
                const g = a.latest?.grade;
                return (
                  <Row
                    key={a.assignmentId}
                    first={i === 0}
                    title={a.student.name}
                    subtitle={`${a.dueAt ? `마감 ${fmtMD(a.dueAt)}` : "마감 없음"}${a.mode ? ` · ${a.mode === "paper" ? "종이" : "온라인"}` : ""}`}
                    onPress={() => router.push({ pathname: "/(teacher)/students/[id]", params: { id: a.student.id } })}
                    right={
                      g ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text style={[text.numMd, { fontSize: 22 }, !g.passed && text.accent]}>{g.score}</Text>
                          <Badge tone={g.passed ? "green" : "red"}>{g.passed ? "통과" : "미달"}</Badge>
                        </View>
                      ) : (
                        <StatusBadge status={a.latest?.status === "review" ? "review" : a.status} expired={expired} />
                      )
                    }
                  />
                );
              })
            )}
          </Card>
          <Text style={text.muted}>마감 변경·정답 공개·종이 시험지·재출제는 웹 시험 상세에서 합니다.</Text>
        </>
      ) : null}
    </Screen>
  );
}
