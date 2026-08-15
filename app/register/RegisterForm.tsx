"use client";

import { useState } from "react";

const sizes = ["S", "M", "L", "XL", "2XL", "3XL"];

export default function RegisterForm({ email }: { email: string }) {
  const [wife, setWife] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(formData: FormData) {
    setStatus("loading");
    setError("");
    const payload = Object.fromEntries(formData.entries());
    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, wife_attending: wife }),
      });
      const result = await response.json() as { url?: string; error?: string; demo?: boolean };
      if (!response.ok) throw new Error(result.error || "Registration failed.");
      if (result.demo) {
        window.location.href = "/register/success?demo=1";
      } else if (result.url) {
        window.location.href = result.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed. Try again.");
      setStatus("error");
    }
  }

  return (
    <form className="registration-form" action={submit}>
      <div className="form-section">
        <span className="form-number">01</span>
        <div><h2>Golfer</h2><p>The person taking the swings.</p></div>
      </div>
      <div className="form-grid two">
        <label>First name<input name="first_name" autoComplete="given-name" required /></label>
        <label>Last name<input name="last_name" autoComplete="family-name" required /></label>
      </div>
      <div className="form-grid two">
        <label>Email<input name="email" type="email" value={email} readOnly aria-describedby="email-note" /><small id="email-note">From your signed-in account</small></label>
        <label>Phone<input name="phone" type="tel" autoComplete="tel" /></label>
      </div>
      <div className="form-grid two">
        <label>Handicap index <small>Whole number</small><input name="handicap_index" type="number" inputMode="numeric" step="1" min="-10" max="60" /></label>
        <label>Shirt size<select name="shirt_size" required defaultValue="L">{sizes.map(size => <option key={size}>{size}</option>)}</select></label>
      </div>

      <div className="form-section form-section-spaced">
        <span className="form-number">02</span>
        <div><h2>Guest</h2><p>Spouse or guest joining after the round.</p></div>
      </div>
      <label className="toggle-row">
        <input type="checkbox" checked={wife} onChange={(event) => setWife(event.target.checked)} />
        <span className="toggle" aria-hidden="true" />
        Yes, I&apos;m bringing a guest
      </label>
      {wife ? (
        <div className="form-grid two guest-fields">
          <label>Guest name<input name="wife_name" required /></label>
          <label>Guest shirt size<select name="wife_shirt_size" required defaultValue="M">{sizes.map(size => <option key={size}>{size}</option>)}</select></label>
        </div>
      ) : null}

      <div className="checkout-summary">
        <div><span>Shooktoberfest entry</span><strong>$200</strong></div>
        <p>Golf · $75 prize pot · food · drinks · live band</p>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="button button-primary form-submit" disabled={status === "loading"}>
        {status === "loading" ? "Opening checkout…" : "Continue to payment · $200"}
      </button>
      <p className="form-fineprint">Your spot is held for 30 minutes while you pay.</p>
    </form>
  );
}
