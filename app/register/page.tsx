import { PageIntro, SiteHeader } from "../../components/SiteHeader";
import { getServerClient } from "../../lib/supabase/server";
import AuthForm from "../login/AuthForm";
import RegisterForm from "./RegisterForm";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const supabase = await getServerClient();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  return (
    <main>
      <SiteHeader />
      <div className="page-shell narrow">
        <PageIntro eyebrow="Registration" title="Put your name on it." copy="Sign in first, then register one golfer. Payment confirms the spot; unfinished checkouts go back into the pool after 30 minutes." />
        {data.user ? <RegisterForm email={data.user.email || ""} /> : (
          <section className="registration-form registration-gate">
            <div className="form-section"><span className="form-number">01</span><div><h2>Secure your spot</h2><p>Use Google so your registration and scorecard stay connected.</p></div></div>
            <AuthForm next="/register" />
          </section>
        )}
      </div>
    </main>
  );
}
