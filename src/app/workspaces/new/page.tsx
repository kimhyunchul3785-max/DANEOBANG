import { requireUser } from "@/lib/auth";
import { NewAcademyForm } from "./NewAcademyForm";

export default async function NewAcademyPage() {
  await requireUser();
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="h1 mb-1">학원 개설</h1>
      <p className="muted mb-6">개설한 사람이 학원장(OWNER)이 됩니다. 선생님은 개설 후 초대 링크로 추가합니다.</p>
      <div className="card card-body">
        <NewAcademyForm />
      </div>
    </main>
  );
}
