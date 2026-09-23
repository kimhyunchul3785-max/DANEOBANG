/**
 * 학생 상세 — GET /students/{id}: 기본정보 · 최근 성적 · 시험 이력(탭하면 시험 상세) · 대기 중 재시험.
 */
import React from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { fmtMD } from "@daneobang/utils";
import type { StudentHistoryItem } from "@daneobang/types";
import { useStudent } from "@/query/hooks";
import { errorMessage } from "@/api/client";
import { Badge, Button, Card, Digital, Empty, ErrorView, Label, Loading, Row, Screen, StatusBadge } from "@/components/ui";
import { colors, spacing, text } from "@/theme";

function latestGrade(h: StudentHistoryItem) {
  const graded = h.attempts.filter((a) => a.grade);
  return graded.length ? graded[graded.length - 1] : null;
}

export default function StudentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const q = useStudent(id);
  const s = q.data;
  const now = Date.now();
  const graded = (s?.history ?? []).map(latestGrade).filter((a): a is NonNullable<typeof a> => !!a && !!a.grade);
  const recent = graded[0]?.grade ?? null;
  const avg = graded.length ? Math.round(graded.reduce((sum, a) => sum + (a.grade?.score ?? 0), 0) / graded.length) : null;

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Button variant="ghost" onPress={() => router.back()} style={{ alignSelf: "flex-start", paddingHorizontal: 0 }}>
        ← 학생
      </Button>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorView message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : s ? (
        <>
          <View>
            <Text style={text.h1}>{s.name}</Text>
            <Text style={[text.muted, { marginTop: 4 }]}>
              {[s.school, s.grade].filter(Boolean).join(" · ") || "학교·학년 미입력"}
              {s.class ? ` · ${s.class.name}` : " · 반 없음"}
              {s.linked ? " · 계정 연결됨" : ""}
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <Card tone="sm" style={{ flex: 1 }}>
              <Label>Recent · 최근 성적</Label>
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 10 }}>
                <Text style={[text.numLg, recent && !recent.passed && text.accent]}>{recent ? recent.score : "—"}</Text>
                {recent && <Badge tone={recent.passed ? "green" : "red"}>{recent.passed ? "통과" : "미달"}</Badge>}
              </View>
            </Card>
            <Card tone="sm" style={{ flex: 1 }}>
              <Label>Average · 평균</Label>
              <Text style={[text.numLg, { marginTop: 10 }]}>{avg ?? "—"}</Text>
              <Text style={[text.muted, { marginTop: 2 }]}>확정 {graded.length}회</Text>
            </Card>
          </View>

          {s.pendingRetakes.length > 0 && (
            <Card tone="accent">
              <Label tone="onAccent">Retake · 재시험 대기</Label>
              <Text style={[text.title, text.onAccent, { marginTop: 6 }]}>{s.pendingRetakes.length}건</Text>
              <Text style={[text.caption, { color: "rgba(255,244,240,0.8)", marginTop: 4 }]}>{s.pendingRetakes.map((r) => (r.dueAt ? `마감 ${fmtMD(r.dueAt)}` : "마감 없음")).join(" · ")} — 출제는 웹 재시험 탭에서</Text>
            </Card>
          )}

          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <Label>History · 시험 이력</Label>
              <Digital>{s.history.length}</Digital>
            </View>
            {s.history.length === 0 ? (
              <Empty title="아직 배정된 시험이 없어요" />
            ) : (
              s.history.map((h, i) => {
                const g = latestGrade(h);
                const expired = !!h.dueAt && new Date(h.dueAt).getTime() < now && h.status !== "completed";
                return (
                  <Row
                    key={h.assignmentId}
                    first={i === 0}
                    title={
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={text.bodyStrong} numberOfLines={1}>
                          {h.exam.title}
                        </Text>
                        {h.exam.isRetake && <Badge tone="amber">재시험</Badge>}
                      </View>
                    }
                    subtitle={`${h.dueAt ? `마감 ${fmtMD(h.dueAt)}` : "마감 없음"}${h.mode ? ` · ${h.mode === "paper" ? "종이" : "온라인"}` : ""}`}
                    onPress={() => router.push({ pathname: "/(teacher)/exams/[id]", params: { id: h.exam.id } })}
                    right={
                      g?.grade ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text style={[text.numMd, { fontSize: 22 }, !g.grade.passed && text.accent]}>{g.grade.score}</Text>
                          <Badge tone={g.grade.passed ? "green" : "red"}>{g.grade.passed ? "통과" : "미달"}</Badge>
                        </View>
                      ) : (
                        <StatusBadge status={h.status} expired={expired} />
                      )
                    }
                  />
                );
              })
            )}
          </Card>
          <Text style={[text.muted, { color: colors.inkTertiary }]}>정보 수정·담당 변경·재시험 출제는 웹 학생 상세에서 합니다.</Text>
        </>
      ) : null}
    </Screen>
  );
}
