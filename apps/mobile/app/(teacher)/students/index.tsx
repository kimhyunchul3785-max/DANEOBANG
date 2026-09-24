/**
 * 학생 — 이름 검색 + 카드/행 목록 (표 아님). 서버가 담당 학생 scope 를 적용한 결과만 온다.
 */
import React, { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useStudents } from "@/query/hooks";
import { errorMessage } from "@/api/client";
import { Badge, Card, Empty, ErrorView, Loading, PageHeader, Row, Screen, useSizeClass } from "@/components/ui";
import { colors, spacing, surface, text } from "@/theme";

export default function StudentsScreen() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 250);
    return () => clearTimeout(t);
  }, [input]);
  const query = useStudents(q);
  const list = query.data ?? [];
  const active = list.filter((s) => s.status === "active");
  // 태블릿 가로: 한 줄 목록을 길게 늘이지 않고 두 열로 나눈다
  const cols = useSizeClass() === "expanded" ? 2 : 1;
  const chunks = cols === 1 ? [list] : [list.filter((_, i) => i % 2 === 0), list.filter((_, i) => i % 2 === 1)];

  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => query.refetch()} wide>
      <PageHeader title="학생" right={<Badge tone="gray">{`${active.length}명`}</Badge>} />
      <TextInput value={input} onChangeText={setInput} placeholder="이름으로 검색" placeholderTextColor={colors.inkTertiary} style={surface.input} clearButtonMode="while-editing" autoCorrect={false} returnKeyType="search" />
      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <ErrorView message={errorMessage(query.error)} onRetry={() => query.refetch()} />
      ) : list.length === 0 ? (
        <Card>
          <Empty title={q ? `"${q}" 학생이 없어요` : "담당 학생이 없어요"} hint={q ? undefined : "학생 등록·담당 지정은 웹 학생 탭에서"} />
        </Card>
      ) : (
        <View style={{ flexDirection: "row", gap: spacing.md, alignItems: "flex-start" }}>
          {chunks.map((part, c) => (
            <Card key={c} style={{ flex: 1, minWidth: 0, paddingVertical: 4 }}>
              {part.map((s, i) => (
                <Row
                  key={s.id}
                  first={i === 0}
                  title={
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={[text.bodyStrong, s.status !== "active" && { color: colors.inkTertiary }]}>{s.name}</Text>
                      {s.linked && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success }} accessibilityLabel="계정 연결됨" />}
                    </View>
                  }
                  subtitle={[s.school, s.grade].filter(Boolean).join(" · ") || "학교·학년 미입력"}
                  right={s.class ? <Text style={text.muted}>{s.class.name}</Text> : <Text style={[text.muted, { opacity: 0.6 }]}>반 없음</Text>}
                  onPress={() => router.push({ pathname: "/(teacher)/students/[id]", params: { id: s.id } })}
                />
              ))}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
