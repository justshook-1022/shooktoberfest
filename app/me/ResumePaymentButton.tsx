"use client";

import { useState } from "react";

export default function ResumePaymentButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function resumePayment() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/register/checkout", { method: "POST" });
      const result = await response.json() as { url?: string; error?: string };
      if (result.url) {
        window.location.href = result.url;
        return;
      }
      throw new Error(result.error || "Checkout could not open.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout could not open. Try again.");
      setLoading(false);
    }
  }

  return (
    <>
      <button className="button button-primary" type="button" onClick={resumePayment} disabled={loading}>
        {loading ? "Opening checkout…" : "Complete payment · $200"}
      </button>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </>
  );
}
