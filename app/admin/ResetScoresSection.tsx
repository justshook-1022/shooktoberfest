"use client";

import { useState } from "react";
import type { AdminState } from "../../lib/admin";
import type { AdminAction } from "./AdminDashboard";

export default function ResetScoresSection({ state, action, busy }: {
  state: AdminState; action: AdminAction; busy: boolean;
}) {
  const [scope, setScope] = useState("");
  const [clearGreenies, setClearGreenies] = useState(false);
  const allTeams = scope === "all";
  const team = state.teams.find(team => team.id === scope);
  const selected = allTeams ? state.teams : team ? [team] : [];
  const teamIds = new Set(selected.map(team => team.id));
  const scores = state.scores.filter(score => teamIds.has(score.team_id));
  const rounds = state.rounds.filter(round => teamIds.has(round.team_id));
  const label = allTeams ? `all teams in ${state.event.name}` : team?.name || "the selected team";

  async function reset() {
    if (!scope || busy) return;
    const summary = `Reset scores for ${label}? This permanently deletes ${scores.length} saved hole scores and ${rounds.length} round starts, and clears playoff ranks and withdrawal/disqualification statuses.${allTeams && clearGreenies ? " Closest-to-pin results will also be deleted." : ""} Players, payments, pairings, handicaps, and tee times stay in place.`;
    if (!window.confirm(summary)) return;
    await action({ action: "reset-scoring", teamId: allTeams ? null : scope, clearGreenies: allTeams && clearGreenies, confirmation: "RESET SCORES" }, `Scores reset for ${label}. Players can start a fresh round${state.event.scoring_open ? "." : " when scoring is open."}`);
  }

  return <div className="admin-stack">
    <div className="admin-toolbar">
      <label>Reset scope<select aria-label="Reset scope" value={scope} disabled={busy} onChange={event => { setScope(event.target.value); setClearGreenies(false); }}>
        <option value="">Choose a team or the whole event</option>
        <option value="all">All teams · entire event</option>
        {state.teams.map(team => <option key={team.id} value={team.id}>{team.name || "Unnamed team"}</option>)}
      </select></label>
    </div>
    <section className="admin-blocker" aria-label="Reset details">
      <h2>Start testing with a clean scorecard.</h2>
      <p>Reset gross scores, putts, round progress, playoff ranks, and team result statuses. The leaderboard returns to unplayed and players can click Start round again.</p>
      <p>Registrations, payments, team pairings, handicaps, course setup, and tee times stay in place. Scoring stays {state.event.scoring_open ? "open" : "closed"}.</p>
      {scope ? <p><strong>Saved holes: {scores.length} · Rounds started: {rounds.length} · Teams: {selected.length}</strong></p> : null}
      {allTeams ? <label className="admin-check-row"><input type="checkbox" checked={clearGreenies} disabled={busy} onChange={event => setClearGreenies(event.target.checked)} /> Also clear closest-to-pin winners ({state.greenies.length})</label> : null}
    </section>
    <div className="admin-editor-actions"><button className="button button-primary" type="button" disabled={busy || !scope} onClick={() => void reset()}>{busy ? "Resetting…" : allTeams ? "Reset all scores" : "Reset team scores"}</button></div>
    <p>Resetting permanently deletes the selected results. You will be asked to confirm.</p>
  </div>;
}
