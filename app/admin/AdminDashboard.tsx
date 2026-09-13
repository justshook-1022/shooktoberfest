"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getBrowserClient } from "../../lib/supabase/client";
import { formatMoney, isInDraw, type AdminState } from "../../lib/admin";
import {
  CardsSection,
  CourseSection,
  DrawSection,
  GreeniesSection,
  PlayersSection,
  ResultsSection,
  ScoringSection,
  TeeTimesSection,
} from "./AdminSections";

import ResetScoresSection from "./ResetScoresSection";

export const adminSections = [
  ["Players", "Edit registration, handicaps, payments, and attendance", "/admin/players"],
  ["Draw", "Choose A/B teams and calculate handicaps", "/admin/draw"],
  ["Tee times", "Set times, starting holes, and foursomes", "/admin/tee-times"],
  ["Course", "Confirm the mixed-tee routing", "/admin/course"],
  ["Scoring", "Enter or repair any team scorecard", "/admin/scoring"],
  ["Reset scores", "Clear test scores for one team or the entire event", "/admin/reset-scores"],
  ["Greenies", "Record the five closest-to-pin winners", "/admin/greenies"],
  ["Results", "Set statuses, playoffs, and payouts", "/admin/results"],
  ["Cart cards", "Print live team and tee-time signs", "/admin/cards"],
] as const;

export type AdminSection = "players" | "draw" | "tee-times" | "course" | "scoring" | "reset-scores" | "greenies" | "results" | "cards";
export type AdminAction = (body: Record<string, unknown>, successMessage?: string) => Promise<boolean>;

function AdminSignIn({ message }: { message: string }) {
  return (
    <section className="admin-empty-state">
      <p className="eyebrow">Private controls</p>
      <h2>Admin sign-in required.</h2>
      <p>{message}</p>
      <a className="button button-primary" href="/login?next=%2Fadmin">Sign in to manage the event</a>
    </section>
  );
}

function Dashboard({ state, action, busy }: { state: AdminState; action: AdminAction; busy: boolean }) {
  const heldPlayers = state.players.filter((player) => ["paid", "pending", "comped"].includes(player.payment_status));
  const drawPlayers = state.players.filter(isInDraw);
  const collected = state.players.filter((player) => player.payment_status === "paid").reduce((total, player) => total + player.amount_paid_cents, 0);
  const missingHandicaps = drawPlayers.filter((player) => player.course_handicap === null).length;
  const shirtCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const player of state.players.filter((candidate) => ["paid", "pending", "comped"].includes(candidate.payment_status))) {
      counts.set(player.shirt_size, (counts.get(player.shirt_size) ?? 0) + 1);
      if (player.wife_attending && player.wife_shirt_size) counts.set(player.wife_shirt_size, (counts.get(player.wife_shirt_size) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [state.players]);

  return (
    <>
      <div className="admin-metrics">
        <article><small>FIELD</small><strong>{heldPlayers.length} <span>/ {state.event.field_cap}</span></strong><em>{Math.max(0, state.event.field_cap - heldPlayers.length)} spots left</em></article>
        <article><small>COLLECTED</small><strong>{formatMoney(collected)}</strong><em>{state.payouts ? `${formatMoney(state.payouts.pot_cents_total)} prize pot` : "Prize pot pending"}</em></article>
        <article><small>HANDICAPS</small><strong>{drawPlayers.length - missingHandicaps} <span>/ {drawPlayers.length}</span></strong><em className={missingHandicaps ? "warn" : undefined}>{missingHandicaps ? `${missingHandicaps} still missing` : "Ready for the draw"}</em></article>
        <article><small>DRAW</small><strong>{state.teams.length ? `${state.teams.length} teams` : "Not run"}</strong><em>{state.teams.filter((team) => team.tee_group_id).length} teams assigned a tee group</em></article>
      </div>

      <div className="event-switches">
        <label>
          <div><strong>Registration</strong><span>Public signup form</span></div>
          <input
            aria-label="Registration open"
            type="checkbox"
            checked={state.event.signups_open}
            disabled={busy}
            onChange={(event) => void action({ action: "set-event-state", field: "signups_open", open: event.target.checked }, event.target.checked ? "Registration is open." : "Registration is closed.")}
          />
        </label>
        <label>
          <div><strong>Scoring</strong><span>Player score entry</span></div>
          <input
            aria-label="Scoring open"
            type="checkbox"
            checked={state.event.scoring_open}
            disabled={busy}
            onChange={(event) => void action({ action: "set-event-state", field: "scoring_open", open: event.target.checked }, event.target.checked ? "Scoring is open." : "Scoring is closed.")}
          />
        </label>
      </div>

      <section className="admin-shirt-summary" aria-label="Shirt order summary">
        <div><p className="eyebrow">Shirt order</p><strong>{shirtCounts.reduce((sum, [, count]) => sum + count, 0)} total</strong></div>
        <ul>{shirtCounts.length ? shirtCounts.map(([size, count]) => <li key={size}><span>{size}</span><strong>{count}</strong></li>) : <li>No shirts yet</li>}</ul>
      </section>

      <div className="admin-section-grid">
        {adminSections.map(([title, copy, href], index) => (
          <a href={href} key={href}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div><h2>{title}</h2><p>{copy}</p></div>
            <b aria-hidden="true">→</b>
          </a>
        ))}
      </div>
    </>
  );
}

function Section({ section, state, action, busy }: { section: AdminSection; state: AdminState; action: AdminAction; busy: boolean }) {
  switch (section) {
    case "players": return <PlayersSection state={state} action={action} busy={busy} />;
    case "draw": return <DrawSection state={state} action={action} busy={busy} />;
    case "tee-times": return <TeeTimesSection state={state} action={action} busy={busy} />;
    case "course": return <CourseSection state={state} action={action} busy={busy} />;
    case "scoring": return <ScoringSection state={state} action={action} busy={busy} />;
    case "reset-scores": return <ResetScoresSection state={state} action={action} busy={busy} />;
    case "greenies": return <GreeniesSection state={state} action={action} busy={busy} />;
    case "results": return <ResultsSection state={state} action={action} busy={busy} />;
    case "cards": return <CardsSection state={state} />;
  }
}

export default function AdminDashboard({ section }: { section?: AdminSection }) {
  const [state, setState] = useState<AdminState | null>(null);
  const [message, setMessage] = useState("Loading live event controls…");
  const [messageType, setMessageType] = useState<"status" | "error">("status");
  const [busy, setBusy] = useState(false);
  const [signedOut, setSignedOut] = useState(false);

  const request = useCallback(async (body?: Record<string, unknown>) => {
    const client = getBrowserClient();
    if (!client) throw new Error("Admin services are not configured.");
    const { data } = await client.auth.getSession();
    if (!data.session) {
      setSignedOut(true);
      throw new Error("Sign in with the admin account to continue.");
    }
    const response = await fetch("/api/admin", {
      method: body ? "POST" : "GET",
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        authorization: `Bearer ${data.session.access_token}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json() as { error?: string; state?: AdminState; event?: AdminState["event"]; configured?: boolean } & Partial<AdminState>;
    if (!response.ok || result.error) {
      if (response.status === 401) setSignedOut(true);
      throw new Error(result.error || "The admin request failed.");
    }
    if (result.configured === false) throw new Error("Admin services are not configured.");
    return (result.state ?? result) as AdminState;
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void request().then((nextState) => {
        if (!active) return;
        setState(nextState);
        setMessage("Live controls connected");
        setMessageType("status");
      }).catch((error: unknown) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Could not load admin controls.");
        setMessageType("error");
      });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [request]);

  const action = useCallback<AdminAction>(async (body, successMessage = "Saved.") => {
    setBusy(true);
    setMessage("Saving…");
    setMessageType("status");
    try {
      const nextState = await request(body);
      setState(nextState);
      setMessage(successMessage);
      setMessageType("status");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The change could not be saved.");
      setMessageType("error");
      return false;
    } finally {
      setBusy(false);
    }
  }, [request]);

  if (signedOut) return <AdminSignIn message={message} />;

  return (
    <>
      <div className={`admin-status ${messageType === "error" ? "admin-status-error" : ""}`} role={messageType === "error" ? "alert" : "status"} aria-live="polite">
        <span>{message}</span>
        {state ? <small>{state.event.name} · {state.event.event_date}</small> : null}
      </div>
      {!state ? <div className="admin-loading" aria-label="Loading admin controls"><span /></div> : section ? <Section section={section} state={state} action={action} busy={busy} /> : <Dashboard state={state} action={action} busy={busy} />}
    </>
  );
}
