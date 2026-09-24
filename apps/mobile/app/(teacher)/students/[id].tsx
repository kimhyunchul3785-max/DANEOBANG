/**
 * 학생 상세 — GET /students/{id}: 기본정보 · 최근 성적 · 시험 이력(탭하면 시험 상세) · 대기 중 재시험.
 */
import React from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { fmtMD } from "@daneobang/utils";
import type { StudentHistoryItem } from "@daneobang/types";
import { useStudent, useIssueCombinedRetake, useIssueRetake } from "@/query/hooks";
import { errorMessage } from "@/api/client";
import { Badge, Button, Card, Columns, Empty, ErrorView, Loading, Row, Screen, SectionHead, StatusBadge, confirmAsync, notice, useSizeClass } from "@/components/ui";
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
  const size = useSizeClass();
  const [allHistory, setAllHistory] = React.useState(false);
  const graded = (s?.history ?? []).map(latestGrade).filter((a): a is NonNullable<typeof a> => !!a && !!a.grade);
  const recent = graded[0]?.grade ?? null;
  const issue = useIssueRetake();
  const combined = useIssueCombinedRetake();
  const notIssued = (s?.pendingRetakes ?? []).filter((r) => !r.issued);
  const waiting = (s?.pendingRetakes ?? []).filter((r) => r.issued);
  const doIssue = async () => {
    if (!s || !notIssued.length) return;
    if (notIssued.length === 1) {
      const r = notIssued[0];
      if (!(await confirmAsync("재시험 내기", `${r.title}\n틀린 단어만 · 3일 뒤 23:59 마감으로 바로 나가요. 학생에게 알림이 가요.`, "내기"))) return;
      issue.mutate({ taskId: r.id, mode: "wrong", days: 3 }, { onSuccess: (x) => notice(`재시험을 냈어요 · ${x.questionCount}문항`), onError: (err) => notice(errorMessage(err)) });
      return;
    }
    if (!(await confirmAsync("재시험 한 번에 내기", `출제 전 ${notIssued.length}건의 틀린 단어를 재시험 하나로 모아요 (겹침 제외) · 3일 뒤 23:59 마감`, "내기"))) return;
    combined.mutate({ studentId: s.id, taskIds: notIssued.map((r) => r.id), days: 3 }, { onSuccess: (x) => notice(`${notIssued.length}건을 재시험 하나로 냈어요 · ${x.questionCount}문항`), onError: (err) => notice(errorMessage(err)) });
  };
  const avg = graded.length ? Math.round(graded.reduce((sum, a) => sum + (a.grade?.score ?? 0), 0) / graded.length) : null;
  const history = s ? (allHistory || size === "expanded" ? s.history : s.history.slice(0, 5)) : [];

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()} wide>
      <Button variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(teacher)/students"))} style={{ alignSelf: "flex-start", paddingHorizontal: 0 }}>
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
          <Columns
            rightWidth={380}
            left={
              <>
                {/* 상태: 최근 점수 · 평균 — 한 카드 두 칸 */}
                <Card>
                  <View style={{ flexDirection: "row" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={text.label}>최근 점수</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
                        <Text style={[text.numLg, recent && !recent.passed && text.accent]}>{recent ? recent.score : "—"}</Text>
                        {recent && <Badge tone={recent.passed ? "green" : "red"}>{recent.passed ? "통과" : "미달"}</Badge>}
                      </View>
                    </View>
                    <View style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: colors.line, paddingLeft: spacing.lg }}>
                      <Text style={text.label}>평균 · {graded.length}회</Text>
                      <Text style={[text.numLg, { marginTop: 4 }]}>{avg ?? "—"}</Text>
                    </View>
                  </View>
                </Card>

                {/* 행동: 출제 전 재시험이 있으면 버튼 하나 (항목마다 버튼을 두지 않는다) */}
                {notIssued.length > 0 && (
                  <Card>
                    <SectionHead title="재시험" right={<Badge tone="amber">{`출제 전 ${notIssued.length}`}</Badge>} />
                    <Text style={text.muted} numberOfLines={3}>
                      {notIssued.slice(0, 3).map((r) => r.title).join(" · ")}
                      {notIssued.length > 3 ? ` 외 ${notIssued.length - 3}건` : ""}
                    </Text>
                    <Button variant="primary" onPress={doIssue} loading={issue.isPending || combined.isPending} style={{ marginTop: spacing.md }}>
                      {notIssued.length > 1 ? `${notIssued.length}건 한 번에 재시험 내기` : "오답 재시험 내기"}
                    </Button>
                  </Card>
                )}
                {waiting.length > 0 && (
                  <Card>
                    <SectionHead title="응시 대기" right={waiting.length} />
                    {waiting.map((r, i) => (
                      <Row key={r.id} first={i === 0} title={r.title} subtitle={r.dueAt ? `${fmtMD(r.dueAt)}까지` : "마감 없음"} />
                    ))}
                  </Card>
                )}
              </>
            }
            right={
              <Card>
                <SectionHead title="시험 이력" right={s.history.length} />
                {s.history.length === 0 ? (
                  <Empty title="아직 배정된 시험이 없어요" />
                ) : (
                  history.map((h, i) => {
                    const g = latestGrade(h);
                    const expired = !!h.dueAt && new Date(h.dueAt).getTime() < now && h.status !== "completed";
                    return (
                      <Row
                        key={h.assignmentId}
                        first={i === 0}
                        title={h.exam.title}
                        subtitle={`${h.dueAt ? `마감 ${fmtMD(h.dueAt)}` : "마감 없음"}${h.exam.isRetake ? " · 재시험" : ""}`}
                        onPress={() => router.push({ pathname: "/(teacher)/exams/[id]", params: { id: h.exam.id } })}
                        right={
                          g?.grade ? (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                              <Text style={[text.numMd, !g.grade.passed && text.accent]}>{g.grade.score}</Text>
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
                {size !== "expanded" && s.history.length > 5 && (
                  <Button variant="ghost" onPress={() => setAllHistory(!allHistory)}>
                    {allHistory ? "접기" : `${s.history.length - 5}건 더 보기`}
                  </Button>
                )}
              </Card>
            }
          />
          <Text style={text.muted}>정보 수정·담당 변경·범위를 고른 재시험은 웹에서 해요.</Text>
        </>
      ) : null}
    </Screen>
  );
}
