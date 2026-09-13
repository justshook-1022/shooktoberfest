import { SiteHeader } from "../../components/SiteHeader";
import ResetPasswordForm from "./ResetPasswordForm";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const params = await searchParams;
  const updating = params.mode === "update";

  return (
    <main>
      <SiteHeader />
      <section className="auth-card">
        <p className="eyebrow">Password reset</p>
        <h1>{updating ? "Choose a new one." : "No shame."}</h1>
        <p>{updating ? "Enter a new password for your account." : "We’ll email you a secure link to reset your password."}</p>
        <ResetPasswordForm mode={updating ? "update" : "request"} />
      </section>
    </main>
  );
}
