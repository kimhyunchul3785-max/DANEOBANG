import { requireUser } from "@/lib/auth";
import { practiceSetAll } from "@/lib/practice";
import { PracticeRunner } from "./PracticeRunner";

/** 지금까지 틀린 단어 전부 (공개된 시험, 중복 제거) 를 섞어 연습. 기록은 남기지 않는다. */
export default async function PracticeAllPage() {
  const user = await requireUser();
  const set = await practiceSetAll(user.id);
  return <PracticeRunner title={`${set.title} · ${set.words.length}개`} words={set.words} meaningPool={set.meaningPool} englishPool={set.englishPool} backHref="/learn/grades" backLabel="Grades" />;
}
