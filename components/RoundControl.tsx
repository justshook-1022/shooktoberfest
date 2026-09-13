"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getBrowserClient } from "../lib/supabase/client";
import styles from "./RoundControl.module.css";

export default function RoundControl({ teamId, playerId, onStarted }: {
  teamId: string; playerId: string; onStarted?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const client = getBrowserClient();
    if (!client) return;
    let active = true;
    const refresh = async () => {
      const { data: team, error: teamError } = await client.from("teams").select("event_id,status").eq("id", teamId).single();
      if (!team || teamError) {
        if (active) { setError("Round unavailable. Refresh to try again."); setLoading(false); }
        return;
      }
      const [event, round, card] = await Promise.all([
        client.from("events").select("scoring_open").eq("id", team.event_id).single(),
        client.from("team_rounds").select("started_at").eq("team_id", teamId).maybeSingle(),
        client.from("scores").select("hole", { count: "exact", head: true }).eq("team_id", teamId),
      ]);
      if (!active) return;
      if (event.error || round.error || card.error) {
        setError("Round unavailable. Refresh to try again."); setLoading(false); return;
      }
      setOpen(Boolean(event.data.scoring_open && team.status === "active"));
      setStarted(Boolean(round.data));
      setComplete(card.count === 18);
      setLoading(false);
      setError("");
      if (round.data && onStarted) onStarted();
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 10_000);
    return () => { active = false; clearInterval(timer); };
  }, [teamId, onStarted]);

  async function start() {
    const client = getBrowserClient();
    if (!client || busy) return;
    setBusy(true); setError("");
    try {
      const { error: saveError } = await client.from("team_rounds").insert({ team_id: teamId, started_by: playerId });
      // A teammate (or a previous successful request) may have started it already.
      if (saveError && saveError.code !== "23505") {
        setError("Could not start your round. Scoring must be open; check your connection and try again.");
        return;
      }
      setStarted(true);
      if (onStarted) onStarted();
      else window.location.assign("/score");
    } catch {
      setError("Could not start your round. Check your connection and try again.");
    } finally { setBusy(false); }
  }

  return <section className={styles.card} aria-label="Your round">
    <div><p className="eyebrow">Live scoring</p><h2>{complete ? "Round complete" : started ? "Your round is underway" : "Ready for your round?"}</h2>
      <p>{started ? "Your team’s gross score, net score, and putts are saved hole by hole." : "Either teammate can start your shared scorecard and enter gross strokes and putts."}</p>
      {!loading && !open ? <p>Scoring opens when the event organizer starts play.</p> : null}
    </div>
    {started ? <Link className="button button-primary" href="/score">{complete ? "Review scorecard" : "Continue round"}</Link>
      : <button className="button button-primary" disabled={loading || !open || busy || Boolean(error && !open)} onClick={() => void start()}>{loading ? "Loading round…" : busy ? "Starting…" : "Start round"}</button>}
    <Link className="text-link" href="/leaderboard">View leaderboard →</Link>
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
