import { AuthShell } from "../AuthShell";
import { SignupForm } from "./SignupForm";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthShell title="회원가입" next={sp.next}>
      <SignupForm next={sp.next} />
    </AuthShell>
  );
}
