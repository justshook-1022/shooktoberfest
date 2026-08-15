"use client";

import { useState } from "react";
import { getBrowserClient } from "../../lib/supabase/client";

const sections = [
  ["Players", "Handicaps, payments, shirts", "/admin/players"],
  ["Draw", "Flights, teams, tee groups", "/admin/draw"],
  ["Tee times", "Times and starting holes", "/admin/tee-times"],
  ["Course", "Mixed tee routing", "/admin/course"],
  ["Scoring", "Enter or repair a card", "/admin/scoring"],
  ["Greenies", "Five closest-to-pin winners", "/admin/greenies"],
  ["Results", "Playoff and payout sheet", "/admin/results"],
  ["Cart cards", "Print team signs", "/admin/cards"],
];

export default function AdminDashboard() {
  const [signups, setSignups] = useState(true);
  const [scoring, setScoring] = useState(false);
  const [message, setMessage] = useState("Preview data · connect services for live controls");

  async function action(kind: "set-signups" | "set-scoring", open: boolean) {
    const client = getBrowserClient();
    const session = (await client?.auth.getSession())?.data.session;
    if (!session) { setMessage("Admin sign-in is required for live changes."); return; }
    const response = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ action: kind, open }) });
    const result = await response.json() as { error?: string; demo?: boolean };
    setMessage(result.error || (result.demo ? "Demo mode—no change saved." : "Saved."));
  }

  return (
    <>
      <div className="admin-status"><span>{message}</span><a href="/login">Admin sign in →</a></div>
      <div className="admin-metrics">
        <article><small>FIELD</small><strong>20 <span>/ 32</span></strong><em>12 spots left</em></article>
        <article><small>COLLECTED</small><strong>$4,000</strong><em>$1,500 prize pot</em></article>
        <article><small>HANDICAPS</small><strong>17 <span>/ 20</span></strong><em className="warn">3 still missing</em></article>
        <article><small>DRAW</small><strong>Not run</strong><em>Signups still open</em></article>
      </div>
      <div className="event-switches">
        <label><div><strong>Registration</strong><span>Public signup form</span></div><input aria-label="Registration open" type="checkbox" checked={signups} onChange={event => { setSignups(event.target.checked); void action("set-signups", event.target.checked); }} /></label>
        <label><div><strong>Scoring</strong><span>Player score entry</span></div><input aria-label="Scoring open" type="checkbox" checked={scoring} onChange={event => { setScoring(event.target.checked); void action("set-scoring", event.target.checked); }} /></label>
      </div>
      <div className="admin-section-grid">{sections.map(([title, copy, href], index) => <a href={href} key={href}><span>0{index + 1}</span><div><h2>{title}</h2><p>{copy}</p></div><b>→</b></a>)}</div>
    </>
  );
}
