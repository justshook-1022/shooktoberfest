import Link from "next/link";
import { getRegistrationOpen } from "../../lib/registration-status";
import { PageIntro, SiteHeader } from "../../components/SiteHeader";
import { getServerClient } from "../../lib/supabase/server";
import AuthForm from "../login/AuthForm";
import RegisterForm, { type RegistrationProfile } from "./RegisterForm";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const supabase = await getServerClient();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  let player: RegistrationProfile | null = null;
  if (data.user && supabase) {
    const { data: registration } = await supabase
      .from("players")
      .select("first_name,last_name,phone,handicap_id,handicap_index,shirt_size,wife_attending,wife_name,wife_shirt_size,profile_photo_path,payment_status")
      .eq("auth_user_id", data.user.id)
      .maybeSingle();
    player = registration as RegistrationProfile | null;
    if (player && ["paid", "comped", "refunded"].includes(player.payment_status)) redirect("/me");
  }
  if (!await getRegistrationOpen()) {
    return (
      <main>
        <SiteHeader />
        <div className="page-shell narrow">
          <PageIntro eyebrow="Shooktoberfest 2026" title="Registration closed" copy="Registration is currently closed. Already registered? Log in to access your profile." />
          <Link className="simple-signup" href="/login?next=/me">Log in</Link>
        </div>
      </main>
    );
  }
  return (
    <main>
      <SiteHeader />
      <div className="page-shell narrow">
        <PageIntro eyebrow="Account setup" title="Three steps. Then you’re in." copy="Connect your handicap ID, add the photo your team will see, then confirm your spot through Stripe." />
        {data.user ? <RegisterForm email={data.user.email || ""} initialProfile={player} /> : (
          <section className="registration-form registration-gate">
            <div className="form-section"><span className="form-number">01</span><div><h2>Secure your spot</h2><p>Create an account so your registration and scorecard stay connected.</p></div></div>
            <AuthForm mode="sign-up" next="/register" />
          </section>
        )}
      </div>
    </main>
  );
}
