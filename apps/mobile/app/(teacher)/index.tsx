/**
 * 오늘 — GET /dashboard. 상태(진행 중 시험) → 처리할 일(미응시 · 재시험 · 사진) → 최근 결과.
 * 휴대폰은 위→아래 한 줄기, 태블릿 가로(expanded)는 왼쪽 상태·할 일 | 오른쪽 최근 결과.
 */
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { fmtMD } from "@daneobang/utils";
import { useAuth } from "@/auth/AuthProvider";
import { useDashboard } from "@/query/hooks";
import { errorMessage } from "@/api/client";
import { Badge, Button, Card, Columns, ErrorView, Loading, PageHeader, Progress, Row, Screen, SectionHead, useSizeClass } from "@/components/ui";
import { colors, spacing, surface, text } from "@/theme";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

export default function TodayScreen() {
  const { me, academyId } = useAuth();
  const router = useRouter();
  const q = useDashboard();
  const d = q.data;
  const now = new Date();
  const seoul = new Date(now.getTime() + 9 * 3600e3);
  const dateLabel = `${seoul.getUTCMonth() + 1}월 ${seoul.getUTCDate()}일 ${WEEKDAY[seoul.getUTCDay()]}요일`;
  const academy = me?.memberships.find((m) => m.academy.id === academyId)?.academy;
  const remaining = d ? d.today.total - d.today.completed : 0;

  const [showAll, setShowAll] = React.useState(false);
  const size = useSizeClass();
  const recent = d ? (showAll || size === "expanded" ? d.recentGrades : d.recentGrades.slice(0, 5)) : [];

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()} wide>
      <PageHeader kicker={academy?.name ?? "오늘"} title={dateLabel} right={d ? <Badge tone="gray">학생 {d.students}명</Badge> : undefined} />

      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorView message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : d ? (
        <Columns
          left={
            <>
              {/* 1. 지금 상태: 진행 중인 시험 — 숫자 하나 + 막대 + 한 문장 */}
              <Card>
                <SectionHead title="진행 중인 시험" right={<Text style={text.muted}>오늘 기준</Text>} />
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 8 }}>
                  <Text style={text.numXl}>{d.today.completed}</Text>
                  <Text style={[text.title, { color: colors.inkTertiary }]}>/ {d.today.total} 완료</Text>
                </View>
                <View style={{ marginTop: 12 }}>
                  <Progress value={d.today.completed} total={d.today.total} />
                </View>
                <Text style={[text.body, { marginTop: 10, color: remaining > 0 ? colors.ink : colors.inkTertiary }]}>
                  {d.today.total === 0 ? "지금 진행 중인 시험이 없어요." : remaining > 0 ? `${remaining}명이 아직 안 쳤어요.` : "오늘 시험을 모두 마쳤어요."}
                </Text>
                {d.today.total > 0 && (
                  <Button variant="secondary" onPress={() => router.push("/(teacher)/exams")} style={{ marginTop: spacing.md }}>
                    시험별로 보기
                  </Button>
                )}
              </Card>

              {/* 2. 처리할 일: 숫자 + 무엇을 할지 — 한 줄씩, 크게 누르는 줄 */}
              <Card style={{ paddingVertical: 4 }}>
                <ActionRow first count={d.overdue} tone="red" title="마감 지난 미응시" action="마감 늘리기" onPress={() => router.push({ pathname: "/(teacher)/exams", params: { filter: "overdue" } })} />
                <ActionRow count={d.retakesThisWeek} tone="amber" title="재시험 출제 전·응시 대기" action="재시험 보기" onPress={() => router.push("/(teacher)/retakes")} />
                {d.scansPending > 0 && <ActionRow count={d.scansPending} tone="amber" title="사진 채점 확인" action="웹에서 검수" />}
              </Card>
            </>
          }
          right={
            <Card>
              <SectionHead title="최근 결과" right={d.recentGrades.length} />
              {d.recentGrades.length === 0 ? (
                <Text style={[text.muted, { paddingVertical: 12 }]}>아직 채점된 결과가 없어요.</Text>
              ) : (
                recent.map((g, i) => (
                  <Row
                    key={g.attemptId}
                    first={i === 0}
                    title={g.student.name}
                    subtitle={`${g.exam.title} · ${fmtMD(g.at)}`}
                    onPress={() => router.push({ pathname: "/(teacher)/students/[id]", params: { id: g.student.id } })}
                    right={
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={[text.numMd, !g.passed && text.accent]}>{g.score}</Text>
                        <Badge tone={g.passed ? "green" : "red"}>{g.passed ? "통과" : "미달"}</Badge>
                      </View>
                    }
                  />
                ))
              )}
              {size !== "expanded" && d.recentGrades.length > 5 && (
                <Button variant="ghost" onPress={() => setShowAll(!showAll)}>
                  {showAll ? "접기" : `${d.recentGrades.length - 5}건 더 보기`}
                </Button>
              )}
            </Card>
          }
        />
      ) : null}
    </Screen>
  );
}

/** 처리할 일 한 줄: 큰 숫자 · 무엇 · 어떤 행동 */
function ActionRow({ count, title, action, tone, onPress, first }: { count: number; title: string; action: string; tone: "red" | "amber"; onPress?: () => void; first?: boolean }) {
  const on = count > 0;
  const body = (
    <View style={[surface.row, first && surface.rowFirst, { minHeight: 72 }]}>
      <Text style={[text.numLg, { minWidth: 56 }, on ? (tone === "red" ? text.accent : text.warn) : { color: colors.inkQuaternary }]}>{count}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={text.bodyStrong}>{title}</Text>
        <Text style={[text.muted, on && { color: colors.ink, fontWeight: "600" }]}>{on ? `${action} ›` : "없음"}</Text>
      </View>
    </View>
  );
  return onPress && on ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title} ${count} · ${action}`} style={({ pressed }) => pressed && { opacity: 0.6 }}>
      {body}
    </Pressable>
  ) : (
    body
  );
}
