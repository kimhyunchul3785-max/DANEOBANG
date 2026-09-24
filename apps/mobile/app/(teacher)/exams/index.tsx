/**
 * 시험 — 현장 확인용 목록. 상태는 웹 시험 탭과 같은 분류(미완료 · 마감 지남 · 완료 · 전체).
 * 행마다 "마감 · 완료/배정"을 바로 보여 준다. 출제·문항 편집·DAY 구성은 웹.
 */
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { fmtMD } from "@daneobang/utils";
import type { ExamListItem } from "@daneobang/types";
import { useExams } from "@/query/hooks";
import { errorMessage } from "@/api/client";
import { Badge, Card, Empty, ErrorView, Loading, PageHeader, Progress, Screen, Segments, useSizeClass } from "@/components/ui";
import { ExamDetailView } from "@/components/ExamDetailView";
import { colors, layout, spacing, surface, text } from "@/theme";

type Filter = "open" | "overdue" | "done" | "all";
const FILTERS = [
  ["open", "미완료"],
  ["overdue", "마감 지남"],
  ["done", "완료"],
  ["all", "전체"],
] as const;

const STATE: Record<string, [label: string, tone: "green" | "red" | "gray" | "amber" | "blue"]> = {
  open: ["진행 중", "green"],
  overdue: ["마감 지남", "red"],
  scheduled: ["시작 예약", "blue"],
  none: ["출제 전", "amber"],
  done: ["완료", "gray"],
  draft: ["초안", "amber"],
  archived: ["휴지통", "gray"],
};

function dday(iso: string | null) {
  if (!iso) return null;
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400e3);
  return d < 0 ? `${-d}일 지남` : d === 0 ? "오늘 마감" : `D-${d}`;
}

const match = (e: ExamListItem, f: Filter) =>
  f === "all" ? e.state !== "archived" : f === "overdue" ? e.state === "overdue" : f === "done" ? e.state === "done" : ["open", "scheduled", "none"].includes(e.state);

export default function ExamsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string }>();
  const q = useExams();
  const size = useSizeClass();
  const split = size === "expanded";
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>((FILTERS.find(([k]) => k === params.filter)?.[0] as Filter) ?? "open");
  useEffect(() => {
    const f = FILTERS.find(([k]) => k === params.filter)?.[0];
    if (f) setFilter(f);
  }, [params.filter]);
  const list = (q.data ?? []).filter((e) => match(e, filter));
  const [picked, setPicked] = useState<string | null>(null);
  const selected = split ? (list.find((e) => e.id === picked)?.id ?? list[0]?.id ?? null) : null;

  const body = (
    <>
      <PageHeader title="시험" right={q.data ? <Badge tone="gray">{list.length}개</Badge> : undefined} />
      <Segments items={FILTERS} value={filter} onChange={setFilter} />
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorView message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : list.length === 0 ? (
        <Card>
          <Empty title={filter === "overdue" ? "마감이 지난 시험이 없어요" : filter === "open" ? "끝나지 않은 시험이 없어요" : "시험이 없어요"} hint="출제는 웹 시험 › 시험 만들기에서" />
        </Card>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {list.map((e) => (
            <ExamCard key={e.id} e={e} on={e.id === selected} onPress={() => (split ? setPicked(e.id) : router.push({ pathname: "/(teacher)/exams/[id]", params: { id: e.id } }))} />
          ))}
        </View>
      )}
    </>
  );

  // 태블릿 가로·iPad: 목록 | 상세 (마스터-디테일). 휴대폰·태블릿 세로: 목록 → 눌러서 상세 화면
  if (split)
    return (
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: colors.background }}>
        <ScrollView style={{ width: layout.listPane, flexGrow: 0, borderRightWidth: 1, borderRightColor: colors.line }} contentContainerStyle={{ padding: spacing.xl, paddingTop: insets.top + spacing.xl, gap: spacing.md }}>
          {body}
        </ScrollView>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.xl, paddingTop: insets.top + spacing.xl, gap: spacing.md, maxWidth: 760, width: "100%" }}>
          {selected ? <ExamDetailView id={selected} /> : <Empty title="시험을 고르세요" />}
        </ScrollView>
      </View>
    );
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      {body}
    </Screen>
  );
}

/** 시험 한 장: 제목 · 상태/D-day · 완료 막대 · 미응시. 줄 하나에 정보 네 개를 이어 붙이지 않는다 */
function ExamCard({ e, on, onPress }: { e: ExamListItem; on?: boolean; onPress: () => void }) {
  const [label, tone] = STATE[e.state] ?? [e.state, "gray"];
  const due = dday(e.dueAt);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [surface.card, { paddingVertical: 14 }, on && { borderColor: colors.ink, borderWidth: 1.5 }, pressed && { opacity: 0.7 }]}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.md }}>
        <Text style={[text.cardTitle, { flex: 1 }]} numberOfLines={2}>
          {e.title}
        </Text>
        <Badge tone={tone}>{label}</Badge>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: 12 }}>
        <View style={{ flex: 1 }}>
          <Progress value={e.completed} total={e.assignments} tone={e.overdue ? "accent" : "ink"} height={6} />
        </View>
        <Text style={[text.bodyStrong, { fontVariant: ["tabular-nums"] }]}>
          {e.completed}/{e.assignments}
        </Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 }}>
        {due && <Text style={[text.muted, e.state === "overdue" && { color: colors.accent, fontWeight: "600" }]}>{e.dueAt ? `${fmtMD(e.dueAt)} 마감 · ${due}` : due}</Text>}
        {e.overdue > 0 && <Text style={[text.muted, { color: colors.accent, fontWeight: "700" }]}>미응시 {e.overdue}명</Text>}
        {e.isRetake && <Badge tone="amber">재시험</Badge>}
      </View>
    </Pressable>
  );
}
