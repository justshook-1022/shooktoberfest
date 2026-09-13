"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { holes as fallbackHoles, strokesReceived, formatToPar, type Hole, type TeeName } from "../../lib/event";
import { MAX_SCORE_SAVE_ATTEMPTS, isRetryableScoreError, scoreRetryDelay } from "../../lib/scoring";
import { getBrowserClient } from "../../lib/supabase/client";
import PlayerAvatar from "../../components/PlayerAvatar";
import { getProfilePhotoUrl } from "../../lib/profile-photo";
import RoundControl from "../../components/RoundControl";
import styles from "./scoring.module.css";

type SavedScore = { hole: number; strokes: number; putts: number | null; updated_at: string };
type Draft = { strokes: number; putts: number; updated_at: string | null };
type Card = { teamId: string; playerId: string; eventId: string; name: string; handicap: number; open: boolean; started: boolean; startedAt: string | null };
type Standing = { position: number; net_to_par: number | null; holes_played: number };
type SaveState = "idle" | "saving" | "retrying" | "saved" | "error";

export default function ScoreEntry() {
  const [holeIndex, setHoleIndex] = useState(0);
  const [courseHoles, setCourseHoles] = useState<Hole[]>(fallbackHoles);
  const [scores, setScores] = useState<Record<number, SavedScore>>({});
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [card, setCard] = useState<Card | null>(null);
  const [players, setPlayers] = useState<Array<{ player_id: string; first_name: string; last_name: string; profile_photo_path: string | null }>>([]);
  const [standing, setStanding] = useState<Standing | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const mounted = useRef(false);
  const saving = useRef<symbol | null>(null);
  const roundStartedAt = useRef<string | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const hole = courseHoles[holeIndex];
  const saved = scores[hole.hole];
  const draft = drafts[hole.hole];
  const gross = draft?.strokes ?? saved?.strokes ?? hole.par;
  const putts = draft?.putts ?? saved?.putts ?? Math.min(2, gross);
  const received = strokesReceived(card?.handicap ?? 0, hole.strokeIndex);
  const net = gross - received;
  const dirty = Object.keys(drafts).length > 0;
  const busy = state === "saving" || state === "retrying";
  const disabled = loading || !card?.open || !card.started || busy;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    mounted.current = true;
    const client = getBrowserClient();
    let active = true;
    let poll: ReturnType<typeof setInterval> | undefined;
    let channel: ReturnType<NonNullable<typeof client>["channel"]> | undefined;
    let refresh = async () => {};
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    void (async () => {
      try {
        if (!client) throw new Error("Scoring is unavailable. Please try again later.");
        const { data: auth, error: authError } = await client.auth.getUser();
        if (authError || !auth.user) { window.location.assign("/login?next=/score"); return; }
        const { data: player, error: playerError } = await client.from("players").select("id,team_id,payment_status").eq("auth_user_id", auth.user.id).maybeSingle();
        if (playerError) throw playerError;
        if (!player?.team_id) throw new Error("Your team assignment is pending. Your scorecard will appear after the draw.");
        if (!["paid", "comped"].includes(player.payment_status)) throw new Error("Complete registration before starting your round.");
        const { data: team, error: teamError } = await client.from("teams").select("event_id,name,tee_group_id").eq("id", player.team_id).single();
        if (teamError || !team) throw new Error("Could not load your team. Refresh to try again.");
        const { data: liveHoles, error: holesError } = await client.from("course_holes").select("hole,par,tee_name,yardage,stroke_index").eq("event_id", team.event_id).order("hole");
        if (holesError || liveHoles?.length !== 18) throw new Error("The course scorecard is not ready. Please contact the organizer.");
        if (!active) return;
        setCourseHoles(liveHoles.map(item => ({ hole: item.hole, par: item.par, tee: item.tee_name as TeeName, yards: item.yardage, strokeIndex: item.stroke_index, name: fallbackHoles.find(h => h.hole === item.hole)?.name })));
        const { data: roster } = await client.from("roster").select("player_id,first_name,last_name,profile_photo_path").eq("team_id", player.team_id);
        if (!active) return;
        setPlayers(roster ?? []);
        let initialized = false;
        let refreshVersion = 0;
        const { data: group } = team.tee_group_id ? await client.from("tee_groups").select("starting_hole").eq("id", team.tee_group_id).maybeSingle() : { data: null };
        refresh = async () => {
          const version = ++refreshVersion;
          const [event, round, result, board, status] = await Promise.all([
            client.from("events").select("scoring_open").eq("id", team.event_id).single(),
            client.from("team_rounds").select("started_at").eq("team_id", player.team_id).maybeSingle(),
            client.from("scores").select("hole,strokes,putts,updated_at").eq("team_id", player.team_id),
            client.from("leaderboard").select("team_hcp,position,net_to_par,holes_played").eq("team_id", player.team_id).single(),
            client.from("teams").select("status").eq("id", player.team_id).single(),
          ]);
          if (!active || version !== refreshVersion) return;
          if (event.error || round.error || result.error || board.error || status.error) {
            if (!initialized) throw new Error("Could not load your scorecard. Refresh to try again.");
            return;
          }
          const nextScores = Object.fromEntries((result.data ?? []).map(item => [item.hole, item]));
          const nextStartedAt = round.data?.started_at ?? null;
          const roundChanged = initialized && roundStartedAt.current !== nextStartedAt;
          roundStartedAt.current = nextStartedAt;
          if (roundChanged) {
            saving.current = null;
            setDrafts({});
            setState("idle");
            setMessage("Your round was restarted. Enter scores for the fresh round.");
          }
          setScores(nextScores);
          setStanding(board.data);
          setCard({ teamId: player.team_id, playerId: player.id, eventId: team.event_id, name: team.name, handicap: board.data.team_hcp, open: event.data.scoring_open && status.data.status === "active", started: Boolean(round.data), startedAt: nextStartedAt });
          if (!initialized || roundChanged) {
            const start = (group?.starting_hole ?? 1) - 1;
            const firstUnplayed = Array.from({ length: 18 }, (_, offset) => (start + offset) % 18).find(index => !nextScores[index + 1]);
            setHoleIndex(firstUnplayed ?? start);
            initialized = true;
          }
        };
        refreshRef.current = refresh;
        await refresh();
        if (!active) return;
        setLoading(false);
        channel = client.channel(`scorecard-${player.team_id}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "scores", filter: `team_id=eq.${player.team_id}` }, () => void refresh())
          .on("postgres_changes", { event: "*", schema: "public", table: "team_rounds", filter: `team_id=eq.${player.team_id}` }, () => void refresh())
          .subscribe();
        poll = setInterval(() => void refresh(), 10_000);
        document.addEventListener("visibilitychange", visible);
        window.addEventListener("online", visible);
      } catch (error) {
        if (active) { setLoadError(error instanceof Error ? error.message : "Could not load your scorecard. Refresh to try again."); setLoading(false); }
      }
    })();
    return () => {
      active = false; mounted.current = false;
      clearInterval(poll);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", visible);
      if (channel && client) void client.removeChannel(channel);
    };
  }, []);

  const onStarted = useCallback(() => { void refreshRef.current(); }, []);

  function change(strokes: number, nextPutts: number) {
    setDrafts(current => ({ ...current, [hole.hole]: { strokes: Math.max(1, Math.min(15, strokes)), putts: Math.max(0, Math.min(15, nextPutts)), updated_at: current[hole.hole] ? current[hole.hole].updated_at : saved?.updated_at ?? null } }));
    setState("idle"); setMessage("");
  }

  async function save() {
    const client = getBrowserClient();
    if (!client || !card || disabled || saving.current) return;
    if (putts > gross) { setState("error"); setMessage("Putts cannot be greater than the gross score."); return; }
    const targetHole = hole.hole;
    const startedAt = card.startedAt;
    const snapshot = { strokes: gross, putts, updated_at: draft ? draft.updated_at : saved?.updated_at ?? null };
    const saveId = Symbol();
    saving.current = saveId;
    setDrafts(current => ({ ...current, [targetHole]: snapshot }));
    setMessage("");
    try {
      for (let attempt = 0; attempt <= MAX_SCORE_SAVE_ATTEMPTS; attempt++) {
        if (!mounted.current || roundStartedAt.current !== startedAt) return;
        setState(attempt ? "retrying" : "saving");
        const result = await client.rpc("save_started_team_hole", { p_team_id: card.teamId, p_player_id: card.playerId, p_hole: targetHole, p_strokes: snapshot.strokes, p_putts: snapshot.putts, p_expected_updated_at: snapshot.updated_at, p_round_started_at: startedAt }).abortSignal(AbortSignal.timeout(12_000));
        if (!mounted.current || roundStartedAt.current !== startedAt) return;
        if (!result.error) {
          const row = result.data?.[0] as SavedScore | undefined;
          if (!row) throw new Error("Save was not confirmed. Please try again.");
          setScores(current => ({ ...current, [targetHole]: row }));
          setDrafts(current => { const next = { ...current }; delete next[targetHole]; return next; });
          setState("saved");
          setMessage(`Hole ${targetHole} saved. Gross ${row.strokes}, net ${row.strokes - received}, ${row.putts} putts.`);
          // The database has confirmed this save. Refresh standings in the
          // background so an enabled Save button never silently ignores a tap.
          void refreshRef.current().catch(() => undefined);
          return;
        }
        if (result.error.code === "PT410") {
          await refreshRef.current();
          setDrafts({});
          setState("idle");
          setMessage("Your round was reset. Start a fresh round and enter your new scores.");
          return;
        }
        if (result.error.code === "PT409") {
          await refreshRef.current();
          if (!mounted.current || roundStartedAt.current !== startedAt) return;
          setDrafts(current => { const next = { ...current }; delete next[targetHole]; return next; });
          throw new Error(`Another device changed this hole. Your unsaved entry was ${snapshot.strokes} strokes and ${snapshot.putts} putts. The latest saved score is now shown; review it before editing.`);
        }
        if (isRetryableScoreError({ ...result.error, status: result.status }) && attempt < MAX_SCORE_SAVE_ATTEMPTS) {
          setState("retrying");
          await new Promise(resolve => setTimeout(resolve, scoreRetryDelay(attempt)));
          continue;
        }
        throw new Error(result.error.code === "42501" ? "Scoring is closed or your account cannot edit this card. Your entry has not been saved." : "Save failed. Your entry is still here; check your connection and tap save to retry.");
      }
    } catch (error) {
      if (mounted.current && roundStartedAt.current === startedAt) { setState("error"); setMessage(error instanceof Error ? error.message : "Save failed. Tap save to retry."); }
    } finally { if (saving.current === saveId) saving.current = null; }
  }

  if (loading) return <p role="status">Loading scorecard…</p>;
  if (loadError || !card) return <section className={styles.notice}><h1>Your scorecard</h1><p role="alert">{loadError}</p><Link href="/me" className="text-link">Back to profile</Link></section>;
  if (!card.started) return <><h1>Your scorecard</h1><RoundControl teamId={card.teamId} playerId={card.playerId} onStarted={onStarted} /></>;

  const complete = Object.keys(scores).length === 18;
  return <div className="score-entry">
    {players.length ? <div className="score-team-strip"><span>{players.map(player => <PlayerAvatar key={player.player_id} name={`${player.first_name} ${player.last_name}`} src={getProfilePhotoUrl(player.profile_photo_path)} size="medium" />)}</span></div> : null}
    <div className={styles.roundHeader}><div><p className="eyebrow">Shared team scorecard</p><strong>{card.name}</strong></div><Link className="text-link" href="/leaderboard">Leaderboard →</Link></div>
    <div className={styles.standing} aria-live="polite"><span>POSITION <b>{standing?.holes_played ? standing.position : "—"}</b></span><span>NET TO PAR <b>{formatToPar(standing?.net_to_par ?? null)}</b></span><span>THRU <b>{complete ? "F" : Object.keys(scores).length}</b></span></div>
    {complete ? <p className={styles.notice} role="status">Round complete · all 18 holes are saved. You can review your card and correct scores while scoring is open.</p> : null}
    {!card.open ? <p className={styles.notice} role="status">Scoring is closed. Your saved card is available to review.</p> : null}
    <div className="score-progress" aria-label={`${Object.keys(scores).length} of 18 holes saved`}><span style={{ width: `${Object.keys(scores).length / 18 * 100}%` }} /></div>
    <div className="score-hole-head"><div><p className="eyebrow">Hole {hole.hole} of 18</p><h1>{hole.name || `Hole ${hole.hole}`}</h1></div><span className={`tee tee-large ${hole.tee.toLowerCase()}`}>{hole.tee} tee</span></div>
    <div className="hole-facts"><span><small>PAR</small><strong>{hole.par}</strong></span><span><small>YARDS</small><strong>{hole.yards}</strong></span><span><small>STROKE INDEX</small><strong>{hole.strokeIndex}</strong></span></div>
    <p className={styles.label} id="gross-label">Gross score</p>
    <div className="stepper" aria-labelledby="gross-label"><button disabled={disabled || gross <= 1} onClick={() => change(gross - 1, putts)} aria-label="Subtract one stroke">−</button><output aria-label="Gross score" aria-live="polite">{gross}</output><button disabled={disabled || gross >= 15} onClick={() => change(gross + 1, putts)} aria-label="Add one stroke">+</button></div>
    <div className={styles.net} aria-live="polite"><span>Net score <strong aria-label="Net score">{net}</strong></span><small>{received >= 0 ? `${received} handicap stroke${received === 1 ? "" : "s"} received` : `${Math.abs(received)} handicap stroke${received === -1 ? "" : "s"} given back`}</small></div>
    <p className={styles.label} id="putts-label">Putts</p>
    <div className={`stepper ${styles.putts}`} aria-labelledby="putts-label"><button disabled={disabled || putts <= 0} onClick={() => change(gross, putts - 1)} aria-label="Subtract one putt">−</button><output aria-label="Putts" aria-live="polite">{putts}</output><button disabled={disabled || putts >= 15} onClick={() => change(gross, putts + 1)} aria-label="Add one putt">+</button></div>
    <p className={styles.saveHint}>{draft ? "Unsaved changes" : saved ? `Saved: gross ${saved.strokes} · ${saved.putts ?? "—"} putts` : "Not yet entered"}</p>
    <button className="button button-primary save-score" onClick={() => void save()} disabled={disabled}>{state === "saving" ? "Saving…" : state === "retrying" ? "Signal dropped · retrying" : state === "saved" ? "Saved ✓" : state === "error" ? "Save failed · tap to retry" : `Save hole ${hole.hole}`}</button>
    <p className={styles.message} role={state === "error" ? "alert" : "status"}>{message || "Save each hole to update your team’s leaderboard position."}</p>
    <div className="score-nav"><button disabled={holeIndex === 0 || busy} onClick={() => { setHoleIndex(i => i - 1); setState("idle"); setMessage(""); }}>← Previous</button><button disabled={holeIndex === 17 || busy} onClick={() => { setHoleIndex(i => i + 1); setState("idle"); setMessage(""); }}>Next hole →</button></div>
    <div className="score-strip" aria-label="Scorecard navigation">{courseHoles.map((item, index) => <button key={item.hole} disabled={busy} aria-label={`Hole ${item.hole}${drafts[item.hole] ? ", unsaved" : scores[item.hole] ? ", saved" : ", not entered"}`} className={index === holeIndex ? "current" : scores[item.hole] ? "complete" : ""} onClick={() => { setHoleIndex(index); setState("idle"); setMessage(""); }}><span>{item.hole}{drafts[item.hole] ? "*" : ""}</span><strong>{scores[item.hole]?.strokes ?? "·"}</strong></button>)}</div>
    <p className={styles.message}>{dirty ? "* Unsaved holes stay on this page until you save them. Save before leaving." : "Gross scores shown above. Net scoring uses your team handicap and each hole’s stroke index."}</p>
  </div>;
}
