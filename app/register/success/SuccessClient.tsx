"use client";

import { useEffect, useState } from "react";

export default function SuccessClient({ sessionId, demo }: { sessionId?: string; demo: boolean }) {
  const [message, setMessage] = useState(() => demo
    ? "Demo registration complete. Connect Stripe and Supabase to accept real entries."
    : sessionId ? "Confirming payment…" : "Payment received. Check your inbox for confirmation.");

  useEffect(() => {
    if (!sessionId || demo) return;
    let stopped = false;
    let attempts = 0;
    const check = async () => {
      attempts += 1;
      const response = await fetch(`/api/register/status?session_id=${encodeURIComponent(sessionId)}`);
      const result = await response.json() as { paid?: boolean };
      if (stopped) return;
      if (result.paid) {
        setMessage("You’re in. A confirmation is on its way.");
      } else if (attempts < 12) {
        window.setTimeout(check, 1500);
      } else {
        setMessage("Payment is still processing. You can close this page—we’ll email you when it lands.");
      }
    };
    check();
    return () => { stopped = true; };
  }, [demo, sessionId]);

  return <p className="success-message">{message}</p>;
}
