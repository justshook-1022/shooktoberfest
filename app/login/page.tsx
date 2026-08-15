import { SiteHeader } from "../../components/SiteHeader";
import AuthForm from "./AuthForm";

function safeNext(value?: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/me";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  return <main><SiteHeader /><section className="auth-card"><p className="eyebrow">Player login</p><h1>Welcome back.</h1><p>Use Google or Apple—no new password to remember.</p>{params.error ? <p className="form-error" role="alert">We couldn’t complete that sign-in. Please try again.</p> : null}<AuthForm next={safeNext(params.next)} /></section></main>;
}
