import { SiteHeader } from "../../components/SiteHeader";
import { safeNext } from "../../lib/auth-redirect";
import { getServerClient } from "../../lib/supabase/server";
import { redirect } from "next/navigation";
import AuthForm from "./AuthForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const supabase = await getServerClient();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (data.user) redirect(next);

  return <main><SiteHeader /><section className="auth-card"><p className="eyebrow">Player login</p><h1>Welcome back.</h1><p>Sign in with Google or your email and password.</p>{params.error ? <p className="form-error" role="alert">We couldn’t complete that sign-in. Please try again.</p> : null}<AuthForm next={next} /></section></main>;
}
