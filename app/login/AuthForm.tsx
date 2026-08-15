"use client";

import { useState } from "react";
import { getBrowserClient } from "../../lib/supabase/client";

type Provider = "google";

export default function AuthForm({ next = "/me" }: { next?: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<Provider | null>(null);

  async function signIn(provider: Provider) {
    setBusy(provider);
    setMessage("");
    const client = getBrowserClient();
    if (!client) {
      setMessage("Demo mode: account services are not connected yet.");
      setBusy(null);
      return;
    }
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo } });
    if (error) {
      setMessage(error.message);
      setBusy(null);
    }
  }

  return (
    <div className="auth-form">
      <button className="button oauth-button" type="button" onClick={() => void signIn("google")} disabled={busy !== null}>
        <span className="oauth-mark google-mark" aria-hidden="true">G</span>
        {busy === "google" ? "Opening Google…" : "Continue with Google"}
      </button>
      {message ? <p className="form-message" role="status">{message}</p> : null}
      <p className="auth-fineprint">We use your account only to secure your registration, profile, and scorecard.</p>
    </div>
  );
}
