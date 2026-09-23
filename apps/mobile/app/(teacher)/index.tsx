/**
 * 오늘 — GET /dashboard. 첫 화면은 세 가지(오늘 진행 · 미응시 · 이번 주 재시험)만 크게, 그 아래 최근 결과.
 */
import React from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { fmtMD } from "@daneobang/utils";
import { useAuth } from "@/auth/AuthProvider";
import { useDashboard } from "@/query/hooks";
import { errorMessage } from "@/api/client";
import { Badge, Card, Digital, ErrorView, Label, Loading, PageHeader, Row, Screen, StatTile } from "@/components/ui";
import { colors, spacing, text } from "@/theme";

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

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <PageHeader kicker={`Today · ${academy?.name ?? ""}`} title={dateLabel} right={d ? <Digital>{d.students} STUDENTS</Digital> : undefined} />

      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorView message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : d ? (
        <>
          {/* 1차 모듈: 오늘 진행 */}
          <Card tone={remaining > 0 ? "accent" : "surface"}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Label tone={remaining > 0 ? "onAccent" : "muted"}>Today · 오늘 시험</Label>
              <Digital style={remaining > 0 ? text.onAccent : undefined}>{fmtMD(now)}</Digital>
            </View>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, marginTop: 14 }}>
              <Text style={[text.numXl, remaining > 0 && text.onAccent]}>{d.today.completed}</Text>
              <Text style={[text.numMd, { marginBottom: 8, color: remaining > 0 ? "rgba(255,244,240,0.7)" : colors.inkTertiary }]}>/ {d.today.total}</Text>
            </View>
            <Text style={[text.body, { marginTop: 4 }, remaining > 0 ? { color: "rgba(255,244,240,0.85)" } : text.muted]}>
              {d.today.total === 0 ? "오늘 배정된 시험이 없어요." : remaining > 0 ? `${remaining}명이 아직 안 쳤어요.` : "오늘 시험을 모두 마쳤어요."}
            </Text>
          </Card>

          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <StatTile label="Missed · 미응시" value={d.overdue} sub="마감 지남" accent={d.overdue > 0} />
            <StatTile label="Retake · 이번 주 재시험" value={d.retakesThisWeek} sub="출제 전·응시 대기" accent={d.retakesThisWeek > 0} />
          </View>
          {d.scansPending > 0 && (
            <Card tone="dark">
              <Label tone="onAccent">Scan queue · 사진 채점</Label>
              <Text style={[text.body, { color: "#ECE9E3", marginTop: 4 }]}>확인이 필요한 사진 {d.scansPending}장 — 웹 시험 › 사진 채점에서 검수하세요.</Text>
            </Card>
          )}

          {/* 최근 결과 */}
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <Label>Recent · 최근 결과</Label>
              <Digital>{d.recentGrades.length}</Digital>
            </View>
            {d.recentGrades.length === 0 ? (
              <Text style={[text.muted, { paddingVertical: 12 }]}>아직 채점된 결과가 없어요.</Text>
            ) : (
              d.recentGrades.map((g, i) => (
                <Row
                  key={g.attemptId}
                  first={i === 0}
                  title={g.student.name}
                  subtitle={`${g.exam.title} · ${fmtMD(g.at)}`}
                  onPress={() => router.push({ pathname: "/(teacher)/students/[id]", params: { id: g.student.id } })}
                  right={
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={[text.numMd, { fontSize: 22 }, !g.passed && text.accent]}>{g.score}</Text>
                      <Badge tone={g.passed ? "green" : "red"}>{g.passed ? "통과" : "미달"}</Badge>
                    </View>
                  }
                />
              ))
            )}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
