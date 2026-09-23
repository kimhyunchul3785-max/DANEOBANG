import { requireUser } from "@/lib/auth";
import { TestRunner } from "./TestRunner";

export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  return <TestRunner attemptId={id} />;
}
