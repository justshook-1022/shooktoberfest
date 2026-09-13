"use client";

import Image from "next/image";
import { useState } from "react";
import { AUTH_NEXT_COOKIE } from "../../lib/auth-redirect";
import { getBrowserClient } from "../../lib/supabase/client";

type AuthMethod = "google" | "password";
type AuthMode = "sign-in" | "sign-up";

export default function AuthForm({ mode = "sign-in", next = "/me" }: { mode?: AuthMode; next?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"status" | "error">("status");
  const [busy, setBusy] = useState<AuthMethod | null>(null);

  function getRedirectTo() {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${AUTH_NEXT_COOKIE}=${encodeURIComponent(next)}; Path=/; Max-Age=600; SameSite=Lax${secure}`;
    return `${window.location.origin}/auth/callback`;
  }

  async function signInWithGoogle() {
    setBusy("google");
    setMessage("");
    setMessageType("status");
    const client = getBrowserClient();
    if (!client) {
      setMessage("Demo mode: account services are not connected yet.");
      setMessageType("status");
      setBusy(null);
      return;
    }
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: getRedirectTo() },
    });
    if (error) {
      setMessage(error.message);
      setMessageType("error");
      setBusy(null);
    }
  }

  async function submitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("password");
    setMessage("");
    setMessageType("status");

    const client = getBrowserClient();
    if (!client) {
      setMessage("Demo mode: account services are not connected yet.");
      setMessageType("status");
      setBusy(null);
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (mode === "sign-up") {
      const { data, error } = await client.auth.signUp({
        email: normalizedEmail,
        password,
        options: { emailRedirectTo: `${getRedirectTo()}?next=${encodeURIComponent(next)}` },
      });

      if (error) {
        setMessage(error.message);
        setMessageType("error");
      } else if (data.session) {
        window.location.assign(next);
        return;
      } else {
        setMessage("Check your email to confirm your account, then continue your registration.");
      }
      setBusy(null);
      return;
    }

    const { error } = await client.auth.signInWithPassword({ email: normalizedEmail, password });

    if (error) {
      setMessage("That email and password combination didn’t work.");
      setMessageType("error");
    } else {
      window.location.assign(next);
      return;
    }
    setBusy(null);
  }

  return (
    <div className="auth-form">
      <button className="google-signin-button" type="button" onClick={() => void signInWithGoogle()} disabled={busy !== null}>
        <Image src="/google-g.svg" width={20} height={20} alt="" aria-hidden="true" />
        <span>{busy === "google" ? "Opening Google…" : mode === "sign-up" ? "Continue with Google" : "Sign in with Google"}</span>
      </button>

      <div className="auth-divider" aria-hidden="true"><span>or</span></div>

      <form className="email-signin-form" onSubmit={(event) => void submitPassword(event)}>
        <label htmlFor={`${mode}-email`}>
          Email address
          <input
            id={`${mode}-email`}
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy !== null}
            required
          />
        </label>
        <label htmlFor={`${mode}-password`}>
          Password
          <input
            id={`${mode}-password`}
            name="password"
            type="password"
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            minLength={mode === "sign-up" ? 8 : undefined}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy !== null}
            required
          />
        </label>
        {mode === "sign-in" ? <a className="forgot-password-link" href="/reset">Forgot password?</a> : null}
        <button className="button button-primary email-signin-button" type="submit" disabled={busy !== null}>
          {busy === "password" ? (mode === "sign-up" ? "Creating account…" : "Signing in…") : (mode === "sign-up" ? "Create account" : "Sign in")}
        </button>
      </form>

      {message ? <p className={messageType === "error" ? "form-error auth-message" : "form-message auth-message"} role={messageType === "error" ? "alert" : "status"}>{message}</p> : null}
      {mode === "sign-up" ? <p className="auth-account-link">Already have an account? <a className="forgot-password-link" href={`/login?next=${encodeURIComponent(next)}`}>Sign in</a></p> : null}
      <p className="auth-fineprint">We use your account only to secure your registration, profile, and scorecard.</p>
    </div>
  );
}
