/**
 * 시험 상세 (휴대폰 · 태블릿 세로) — 본문은 ExamDetailView. 태블릿 가로에서는 시험 목록 오른쪽에 같은 본문이 열린다.
 */
import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useExam } from "@/query/hooks";
import { Button, Screen } from "@/components/ui";
import { ExamDetailView } from "@/components/ExamDetailView";

export default function ExamDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const q = useExam(id);
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Button variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(teacher)/exams"))} style={{ alignSelf: "flex-start", paddingHorizontal: 0 }}>
        ← 시험
      </Button>
      <ExamDetailView id={id} />
    </Screen>
  );
}
