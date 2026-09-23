/**
 * 시험 — 목록·진행 확인만. 출제·문항 편집·DAY 구성은 웹.
 */
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { fmtMD } from "@daneobang/utils";
import { useExams } from "@/query/hooks";
import { errorMessage } from "@/api/client";
import { Badge, Card, Digital, Empty, ErrorView, Loading, PageHeader, Row, Screen, StatusBadge } from "@/components/ui";
import { colors, radius, text } from "@/theme";

type Filter = "published" | "all";

export default function ExamsScreen() {
  const router = useRouter();
  const q = useExams();
  const [filter, setFilter] = useState<Filter>("published");
  const list = (q.data ?? []).filter((e) => (filter === "all" ? true : e.status === "published"));

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <PageHeader kicker="Tests · 시험" title="시험" right={q.data ? <Digital>{q.data.length} TESTS</Digital> : undefined} />
      <View style={{ flexDirection: "row", backgroundColor: colors.surfaceRaised, borderRadius: radius.pill, padding: 3, alignSelf: "flex-start" }}>
        {(
          [
            ["published", "발행됨"],
            ["all", "전체"],
          ] as const
        ).map(([k, l]) => (
          <Pressable key={k} onPress={() => setFilter(k)} accessibilityRole="radio" accessibilityState={{ selected: filter === k }} style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: filter === k ? colors.ink : "transparent" }}>
            <Text style={[text.caption, { fontWeight: "600" }, filter === k && { color: colors.surfaceRaised }]}>{l}</Text>
          </Pressable>
        ))}
      </View>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorView message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : list.length === 0 ? (
        <Card>
          <Empty title="시험이 없어요" hint="출제는 웹 시험 › 시험 만들기에서" />
        </Card>
      ) : (
        <Card>
          {list.map((e, i) => (
            <Row
              key={e.id}
              first={i === 0}
              title={
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={text.bodyStrong} numberOfLines={1}>
                    {e.title}
                  </Text>
                  {e.isRetake && <Badge tone="amber">재시험</Badge>}
                </View>
              }
              subtitle={`${e.book} · ${e.questionCount}문항 · 통과 ${e.passScore} · 대상 ${e.assignments}명 · ${fmtMD(e.createdAt)}`}
              right={<StatusBadge status={e.status} />}
              onPress={() => router.push({ pathname: "/(teacher)/exams/[id]", params: { id: e.id } })}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
