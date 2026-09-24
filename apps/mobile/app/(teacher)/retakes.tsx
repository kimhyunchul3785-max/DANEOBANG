/**
 * 재시험 — 오늘 › 처리할 일에서. 학생 한 명 = 카드 한 장 = 버튼 하나.
 * 여러 건이면 누적 오답으로 한 번에(웹과 같은 규칙), 한 건이면 오답만 · 3일 뒤 마감. 같은 범위·마감 조정은 웹.
 */
import React from "react";
import { Pressable, Text } from "react-native";
import type { RetakeListItem } from "@daneobang/types";
import { useRouter } from "expo-router";
import { fmtMD } from "@daneobang/utils";
import { useIssueCombinedRetake, useIssueRetake, useRetakes } from "@/query/hooks";
import { errorMessage } from "@/api/client";
import { Badge, Button, Card, Columns, Empty, ErrorView, Loading, PageHeader, Row, Screen, SectionHead, confirmAsync, notice } from "@/components/ui";
import { spacing, text } from "@/theme";

export default function RetakesScreen() {
  const router = useRouter();
  const q = useRetakes();
  const issue = useIssueRetake();
  const combined = useIssueCombinedRetake();
  const list = q.data ?? [];
  const pending = list.filter((r) => !r.issued);
  const waiting = list.filter((r) => r.issued);
  // 학생별로 묶는다: 할 일의 단위는 '항목'이 아니라 '학생'
  const groups: { id: string; name: string; rows: RetakeListItem[] }[] = [];
  for (const r of pending) {
    let g = groups.find((x) => x.id === r.student.id);
    if (!g) groups.push((g = { id: r.student.id, name: r.student.name, rows: [] }));
    g.rows.push(r);
  }
  groups.sort((a, b) => b.rows.length - a.rows.length);
  const doIssue = async (g: (typeof groups)[number]) => {
    const words = g.rows.reduce((n, r) => n + r.wrong, 0);
    if (g.rows.length === 1) {
      const r = g.rows[0];
      if (!(await confirmAsync("재시험 내기", `${g.name} · 틀린 단어 ${r.wrong}개 · 3일 뒤 23:59 마감`, "내기"))) return;
      issue.mutate({ taskId: r.id, mode: "wrong", days: 3 }, { onSuccess: (x) => notice(`재시험을 냈어요 · ${x.questionCount}문항`), onError: (err) => notice(errorMessage(err)) });
      return;
    }
    if (!(await confirmAsync("재시험 한 번에 내기", `${g.name} · ${g.rows.length}건의 틀린 단어(최대 ${words}개, 겹침 제외)를 재시험 하나로 · 3일 뒤 23:59 마감`, "내기"))) return;
    combined.mutate({ studentId: g.id, taskIds: g.rows.map((r) => r.id), days: 3 }, { onSuccess: (x) => notice(`${g.rows.length}건을 재시험 하나로 냈어요 · ${x.questionCount}문항`), onError: (err) => notice(errorMessage(err)) });
  };
  const busy = (g: (typeof groups)[number]) => (issue.isPending && g.rows.some((r) => r.id === issue.variables?.taskId)) || (combined.isPending && combined.variables?.studentId === g.id);

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()} wide>
      <Button variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(teacher)"))} style={{ alignSelf: "flex-start", paddingHorizontal: 0 }}>
        ← 오늘
      </Button>
      <PageHeader title="재시험" right={<Badge tone="gray">{`${groups.length}명 · ${pending.length}건`}</Badge>} />
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorView message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : list.length === 0 ? (
        <Card>
          <Empty title="진행 중인 재시험이 없어요" hint="통과 기준에 못 미치면 자동으로 여기에 생겨요." />
        </Card>
      ) : (
        <Columns
          left={
            <>
              <Text style={[text.cardTitle, { marginTop: 4 }]}>낼 재시험 · 학생 {groups.length}명</Text>
              {groups.length === 0 && (
                <Card>
                  <Text style={text.muted}>낼 재시험이 없어요.</Text>
                </Card>
              )}
              {groups.map((g) => {
                const words = g.rows.reduce((n, r) => n + r.wrong, 0);
                return (
                  <Card key={g.id}>
                    <Pressable onPress={() => router.push({ pathname: "/(teacher)/students/[id]", params: { id: g.id } })} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={text.title}>{g.name}</Text>
                      <Badge tone="amber">{`출제 전 ${g.rows.length}`}</Badge>
                    </Pressable>
                    <Text style={[text.muted, { marginTop: 4 }]} numberOfLines={2}>
                      {g.rows.slice(0, 2).map((r) => r.title).join(" · ")}
                      {g.rows.length > 2 ? ` 외 ${g.rows.length - 2}건` : ""}
                    </Text>
                    <Button variant="primary" onPress={() => doIssue(g)} loading={busy(g)} style={{ marginTop: spacing.md }}>
                      {g.rows.length > 1 ? `${g.rows.length}건 한 번에 내기 · 오답 ${words}개` : `오답 ${words}개로 재시험 내기`}
                    </Button>
                  </Card>
                );
              })}
            </>
          }
          right={
            <Card>
              <SectionHead title="응시 대기" right={waiting.length} />
              {waiting.length === 0 ? (
                <Text style={[text.muted, { paddingVertical: spacing.sm }]}>학생이 칠 재시험이 없어요.</Text>
              ) : (
                waiting.map((r, i) => (
                  <Row key={r.id} first={i === 0} title={r.student.name} subtitle={`${r.dueAt ? `${fmtMD(r.dueAt)}까지` : "마감 없음"} · ${r.title}`} onPress={() => router.push({ pathname: "/(teacher)/students/[id]", params: { id: r.student.id } })} />
                ))
              )}
            </Card>
          }
        />
      )}
      <Text style={text.muted}>같은 범위로 내거나 마감을 따로 고르는 것은 웹 재시험 탭에서 해요.</Text>
    </Screen>
  );
}
