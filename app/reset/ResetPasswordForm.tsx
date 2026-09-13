"use client";

import { useState } from "react";
import { AUTH_NEXT_COOKIE } from "../../lib/auth-redirect";
import { getBrowserClient } from "../../lib/supabase/client";

export default function ResetPasswordForm({ mode }: { mode: "request" | "update" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setIsError(false);

    const client = getBrowserClient();
    if (!client) {
      setMessage("Demo mode: account services are not connected yet.");
      setBusy(false);
      return;
    }

    if (mode === "request") {
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${AUTH_NEXT_COOKIE}=${encodeURIComponent("/reset?mode=update")}; Path=/; Max-Age=3600; SameSite=Lax${secure}`;
      const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/auth/callback`,
      });
      if (error) {
        setMessage(error.message);
        setIsError(true);
      } else {
        setMessage("If that email belongs to an account, a reset link is on its way.");
      }
      setBusy(false);
      return;
    }

    if (password.length < 8) {
      setMessage("Use at least 8 characters for your new password.");
      setIsError(true);
      setBusy(false);
      return;
    }
    if (password !== confirmation) {
      setMessage("Those passwords don’t match.");
      setIsError(true);
      setBusy(false);
      return;
    }

    const { error } = await client.auth.updateUser({ password });
    if (error) {
      setMessage("That reset link is invalid or expired. Request a new one.");
      setIsError(true);
      setBusy(false);
      return;
    }

    window.location.assign("/me");
  }

  return (
    <form className="auth-form reset-password-form" onSubmit={(event) => void submit(event)}>
      {mode === "request" ? (
        <label htmlFor="reset-email">
          Email address
          <input id="reset-email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} required />
        </label>
      ) : (
        <>
          <label htmlFor="new-password">
            New password
            <input id="new-password" name="password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} required />
          </label>
          <label htmlFor="confirm-password">
            Confirm new password
            <input id="confirm-password" name="password-confirmation" type="password" autoComplete="new-password" minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={busy} required />
          </label>
        </>
      )}
      <button className="button button-primary email-signin-button" type="submit" disabled={busy}>
        {busy ? "One second…" : mode === "request" ? "Send reset link" : "Save new password"}
      </button>
      {message ? <p className={isError ? "form-error auth-message" : "form-message auth-message"} role={isError ? "alert" : "status"}>{message}</p> : null}
      <a className="forgot-password-link" href="/login">Back to sign in</a>
    </form>
  );
}
