"use client";

import { useEffect, useRef, useState } from "react";
import { holes } from "../../lib/event";
import { getBrowserClient } from "../../lib/supabase/client";

type SaveState = "idle" | "saving" | "saved" | "retrying";

export default function ScoreEntry() {
  const [holeIndex, setHoleIndex] = useState(0);
  const [scores, setScores] = useState<Record<number, number>>(() => {
    if (typeof window === "undefined") return {};
    const saved = localStorage.getItem("shooktoberfest-demo-scores");
    return saved ? JSON.parse(saved) as Record<number, number> : {};
  });
  const [state, setState] = useState<SaveState>("idle");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hole = holes[holeIndex];
  const value = scores[hole.hole] ?? hole.par;

  useEffect(() => {
    const client = getBrowserClient();
    if (!client) return;
    void (async () => {
      const { data: auth } = await client.auth.getUser();
      if (!auth.user) return;
      const { data: player } = await client.from("players").select("id,team_id").eq("auth_user_id", auth.user.id).single();
      if (!player?.team_id) return;
      setPlayerId(player.id);
      setTeamId(player.team_id);
      const { data } = await client.from("scores").select("hole,strokes").eq("team_id", player.team_id);
      if (data) setScores(Object.fromEntries(data.map(item => [item.hole, item.strokes])));
    })();
    return () => { if (retryRef.current) clearTimeout(retryRef.current); };
  }, []);

  const change = (next: number) => setScores(current => ({ ...current, [hole.hole]: Math.max(1, Math.min(15, next)) }));

  async function save(attempt = 0) {
    setState(attempt ? "retrying" : "saving");
    const client = getBrowserClient();
    if (!client || !teamId) {
      const next = { ...scores, [hole.hole]: value };
      localStorage.setItem("shooktoberfest-demo-scores", JSON.stringify(next));
      setScores(next);
      setState("saved");
      setTimeout(() => setState("idle"), 900);
      return;
    }
    const { error } = await client.from("scores").upsert({ team_id: teamId, hole: hole.hole, strokes: value, entered_by: playerId }, { onConflict: "team_id,hole" });
    if (error) {
      const delay = Math.min(10000, 1000 * 2 ** attempt);
      retryRef.current = setTimeout(() => void save(attempt + 1), delay);
      return;
    }
    setState("saved");
    setTimeout(() => setState("idle"), 900);
  }

  return (
    <div className="score-entry">
      <div className="score-progress" aria-label={`Hole ${hole.hole} of 18`}><span style={{ width: `${((holeIndex + 1) / 18) * 100}%` }} /></div>
      <div className="score-hole-head">
        <div><p className="eyebrow">Hole {hole.hole} of 18</p><h1>{hole.name || `Hole ${hole.hole}`}</h1></div>
        <span className={`tee tee-large ${hole.tee.toLowerCase()}`}>{hole.tee} tee</span>
      </div>
      <div className="hole-facts"><span><small>PAR</small><strong>{hole.par}</strong></span><span><small>YARDS</small><strong>{hole.yards}</strong></span><span><small>STROKE INDEX</small><strong>{hole.strokeIndex}</strong></span></div>
      <div className="stepper" aria-label={`Score for hole ${hole.hole}`}>
        <button onClick={() => change(value - 1)} aria-label="Subtract one stroke">−</button>
        <output aria-live="polite">{value}</output>
        <button onClick={() => change(value + 1)} aria-label="Add one stroke">+</button>
      </div>
      <button className="button button-primary save-score" onClick={() => void save()} disabled={state === "saving" || state === "retrying"}>
        {state === "saving" ? "Saving…" : state === "retrying" ? "Signal dropped · retrying" : state === "saved" ? "Saved ✓" : `Save ${value}`}
      </button>
      <div className="score-nav"><button disabled={holeIndex === 0} onClick={() => setHoleIndex(value => value - 1)}>← Previous</button><button disabled={holeIndex === 17} onClick={() => setHoleIndex(value => value + 1)}>Next hole →</button></div>
      <div className="score-strip" aria-label="Scorecard navigation">{holes.map((item, index) => <button key={item.hole} className={index === holeIndex ? "current" : scores[item.hole] ? "complete" : ""} onClick={() => setHoleIndex(index)}><span>{item.hole}</span><strong>{scores[item.hole] ?? "·"}</strong></button>)}</div>
    </div>
  );
}
