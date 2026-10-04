"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatToPar } from "../../lib/event";
import {
  formatMoney,
  formatTeeTime,
  centralTimeInputToIso,
  isInDraw,
  manualPairingsFromState,
  scrambleHandicap,
  paymentStatuses,
  playerName,
  shirtSizes,
  teeTimeInputValue,
  validatePairingRows,
  type AdminCourseHole,
  type AdminPlayer,
  type AdminState,
  type AdminTeam,
  type AdminTeeGroup,
  type PairingRow,
} from "../../lib/admin";
import type { AdminAction } from "./AdminDashboard";

type SectionProps = { state: AdminState; action: AdminAction; busy: boolean };

function playerById(state: AdminState, id: string | null) {
  return id ? state.players.find((player) => player.id === id) : undefined;
}

function teamMembers(state: AdminState, teamId: string) {
  return state.players.filter((player) => player.team_id === teamId);
}

function teamLabel(state: AdminState, team: AdminTeam) {
  return team.name || teamMembers(state, team.id).map(playerName).join(" / ") || "Unnamed team";
}

function PlayerEditor({ player, adminPlayerId, action, busy, onClose }: {
  player: AdminPlayer;
  adminPlayerId: string;
  action: AdminAction;
  busy: boolean;
  onClose: () => void;
}) {
  const [guestAttending, setGuestAttending] = useState(player.wife_attending);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("amount_paid_dollars"));
    const saved = await action({
      action: "update-player",
      playerId: player.id,
      updates: {
        first_name: form.get("first_name"),
        last_name: form.get("last_name"),
        email: form.get("email"),
        phone: form.get("phone"),
        handicap_id: form.get("handicap_id"),
        handicap_index: form.get("handicap_index"),
        course_handicap: form.get("course_handicap"),
        shirt_size: form.get("shirt_size"),
        wife_attending: guestAttending,
        wife_name: guestAttending ? form.get("wife_name") : null,
        wife_shirt_size: guestAttending ? form.get("wife_shirt_size") : null,
        payment_status: form.get("payment_status"),
        amount_paid_cents: Math.round(amount * 100),
      },
    }, `${playerName(player)} was updated.`);
    if (saved) onClose();
  }

  async function remove() {
    if (!window.confirm(`Remove ${playerName(player)} from the event? Their registration will be deleted, and this cannot be undone from the admin page.`)) return;
    const removed = await action({ action: "remove-player", playerId: player.id }, `${playerName(player)} was removed.`);
    if (removed) onClose();
  }

  return (
    <form className="admin-editor" onSubmit={(event) => void submit(event)}>
      <div className="admin-editor-head">
        <div><p className="eyebrow">Edit player</p><h3>{playerName(player)}</h3></div>
        <button type="button" className="admin-text-button" onClick={onClose}>Close</button>
      </div>

      <div className="admin-form-grid two">
        <label>First name<input name="first_name" defaultValue={player.first_name} required /></label>
        <label>Last name<input name="last_name" defaultValue={player.last_name} required /></label>
        <label>Email<input name="email" type="email" defaultValue={player.email} required /></label>
        <label>Phone<input name="phone" type="tel" defaultValue={player.phone ?? ""} /></label>
        <label>Handicap ID<input name="handicap_id" defaultValue={player.handicap_id ?? ""} /></label>
        <label>Handicap index<input name="handicap_index" type="number" min="-20" max="99" step="1" defaultValue={player.handicap_index ?? ""} /></label>
        <label>Course handicap<input name="course_handicap" type="number" min="-20" max="99" step="1" defaultValue={player.course_handicap ?? ""} /></label>
        <label>Golfer shirt<select name="shirt_size" defaultValue={player.shirt_size}>{shirtSizes.map((size) => <option key={size}>{size}</option>)}</select></label>
        <label>Registration status<select name="payment_status" defaultValue={player.payment_status}>{paymentStatuses.map((status) => <option key={status} value={status}>{status.replace(/^./, (letter) => letter.toUpperCase())}</option>)}</select></label>
        <label>Amount paid<input name="amount_paid_dollars" type="number" min="0" max="10000" step="0.01" defaultValue={(player.amount_paid_cents / 100).toFixed(2)} /></label>
      </div>

      <label className="admin-check-row">
        <input type="checkbox" checked={guestAttending} onChange={(event) => setGuestAttending(event.target.checked)} />
        <span>Guest attending</span>
      </label>
      {guestAttending ? (
        <div className="admin-form-grid two">
          <label>Guest name<input name="wife_name" defaultValue={player.wife_name ?? ""} required /></label>
          <label>Guest shirt<select name="wife_shirt_size" defaultValue={player.wife_shirt_size ?? ""} required><option value="">Choose size</option>{shirtSizes.map((size) => <option key={size}>{size}</option>)}</select></label>
        </div>
      ) : null}

      <div className="admin-editor-actions">
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save player"}</button>
        <button className="admin-danger-button" type="button" disabled={busy || player.id === adminPlayerId} onClick={() => void remove()}>{player.id === adminPlayerId ? "Current admin cannot be removed" : "Remove player"}</button>
      </div>
    </form>
  );
}

export function PlayersSection({ state, action, busy }: SectionProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = playerById(state, editingId);

  return (
    <div className="admin-stack">
      <div className="admin-toolbar">
        <p><strong>{state.players.length}</strong> registration records · <strong>{state.players.filter(isInDraw).length}</strong> ready for the draw</p>
        <span>Paid and comped players enter the draw</span>
      </div>
      {editing ? <PlayerEditor key={editing.id} player={editing} adminPlayerId={state.adminPlayerId} action={action} busy={busy} onClose={() => setEditingId(null)} /> : null}
      <div className="admin-data-list" role="table" aria-label="Event players">
        <div className="admin-data-head" role="row"><span>Player</span><span>Status</span><span>Course HCP</span><span>Team</span><span /></div>
        {state.players.map((player) => {
          const team = state.teams.find((candidate) => candidate.id === player.team_id);
          return (
            <div className="admin-player-row" role="row" key={player.id}>
              <div><strong>{playerName(player)}</strong><small>{player.email}{player.is_admin ? " · Admin" : ""}</small></div>
              <span className={`admin-badge admin-badge-${player.payment_status}`}>{player.payment_status}</span>
              <span className={player.course_handicap === null && isInDraw(player) ? "admin-missing" : ""}>{player.course_handicap ?? "—"}</span>
              <span>{team ? teamLabel(state, team) : "Unassigned"}</span>
              <button className="admin-row-button" type="button" onClick={() => setEditingId(player.id)}>Edit</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DrawSection({ state, action, busy }: SectionProps) {
  const [rows, setRows] = useState<PairingRow[]>(() => manualPairingsFromState(state));
  const players = useMemo(() => state.players.filter(isInDraw).sort((a, b) => playerName(a).localeCompare(playerName(b))), [state.players]);
  const validationError = validatePairingRows(rows, state.players);
  const locked = busy || state.scores.length > 0 || state.rounds.length > 0;
  const selectedIds = new Set(rows.flatMap((row) => [row.aPlayerId, row.bPlayerId]).filter(Boolean));

  function updateRow(index: number, field: "aPlayerId" | "bPlayerId", value: string) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value || (field === "aPlayerId" ? null : "") } : row));
  }

  async function saveDraw() {
    if (validatePairingRows(rows, state.players)) return;
    if (!window.confirm("Save these player selections? Existing team IDs and tee times will stay in place.")) return;
    await action({ action: "apply-pairings", pairings: rows.filter((row) => row.teamId || row.aPlayerId || row.bPlayerId) }, "Team pairings were saved. Tee times were preserved.");
  }

  return (
    <div className="admin-stack draw-panel-wide">
      {locked && !busy ? <div className="admin-blocker"><strong>A round has started.</strong><p>Pairings are locked to protect the players’ scorecards.</p></div> : null}
      <div className="admin-toolbar">
        <div><strong>Choose your teams</strong><span>{selectedIds.size} of {players.length} players selected. Saved teams match the tee sheet.</span></div>
        <span>Scramble HCP = 35% of lower + 15% of higher course handicap, rounded.</span>
      </div>
      <div className="draw-table-scroll" role="region" aria-label="Team selection spreadsheet">
        <table className="draw-table">
          <thead><tr><th scope="col">Team / tee time</th><th scope="col">A flight player</th><th scope="col">A flight handicap</th><th scope="col">B flight player</th><th scope="col">B flight handicap</th><th scope="col">2-man scramble handicap</th></tr></thead>
          <tbody>{rows.map((row, index) => {
            const aPlayer = playerById(state, row.aPlayerId);
            const bPlayer = playerById(state, row.bPlayerId);
            const team = state.teams.find((candidate) => candidate.id === row.teamId);
            const teeGroup = state.teeGroups.find((group) => group.id === team?.tee_group_id);
            const handicap = scrambleHandicap(aPlayer?.course_handicap ?? null, bPlayer?.course_handicap ?? null);
            function selector(field: "aPlayerId" | "bPlayerId", flight: string) {
              return <select aria-label={`${flight} flight player for team ${index + 1}`} value={row[field] ?? ""} disabled={locked} onChange={(event) => updateRow(index, field, event.target.value)}>
                <option value="">Choose {flight} player…</option>
                {players.map((player) => <option key={player.id} value={player.id} disabled={selectedIds.has(player.id) && row[field] !== player.id}>{playerName(player)}</option>)}
              </select>;
            }
            return <tr key={row.teamId ?? `new-${index}`}>
              <th scope="row">{team?.name || `Team ${index + 1}`}<br />{formatTeeTime(teeGroup?.tee_time ?? null)}</th>
              <td>{selector("aPlayerId", "A")}</td><td>{aPlayer?.course_handicap ?? "—"}</td>
              <td>{selector("bPlayerId", "B")}</td><td>{bPlayer?.course_handicap ?? "—"}</td>
              <td className="draw-team-handicap" aria-live="polite">{handicap ?? "—"}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <p className="draw-table-note">Choose either flight manually. Handicaps never change player selections. Leave a slot blank while a replacement is pending; every paid or comped player must be selected once. To swap players, clear a selection first. Missing handicaps display as —.</p>
      {validationError ? <p role="status">{validationError}</p> : null}
      <div className="admin-toolbar">
        <button className="button button-primary" type="button" disabled={locked || Boolean(validationError)} onClick={() => void saveDraw()}>{busy ? "Saving…" : "Save teams"}</button>
        <button className="button" type="button" disabled={locked} onClick={() => setRows((current) => [...current, { teamId: null, aPlayerId: null, bPlayerId: "" }])}>Add team</button>
        <Link href="/admin/tee-times">Manage tee times →</Link>
      </div>
    </div>
  );
}

function TeeGroupEditor({ group, teams, busy, action }: { group: AdminTeeGroup; teams: AdminTeam[]; busy: boolean; action: AdminAction }) {
  const [teeTime, setTeeTime] = useState(teeTimeInputValue(group.tee_time));
  const [startingHole, setStartingHole] = useState(String(group.starting_hole));

  async function save() {
    const iso = centralTimeInputToIso(teeTime);
    await action({ action: "update-tee-group", teeGroupId: group.id, teeTime: iso, startingHole }, `${formatTeeTime(iso)} tee time was saved.`);
  }

  return (
    <article className="tee-time-editor">
      <div><strong>{formatTeeTime(group.tee_time)}</strong><small>{teams.length ? teams.map((team) => team.name).join(" + ") : "No teams assigned"}</small></div>
      <label>Date and time<input type="datetime-local" value={teeTime} onChange={(event) => setTeeTime(event.target.value)} /></label>
      <label>Starting hole<input type="number" min="1" max="18" value={startingHole} onChange={(event) => setStartingHole(event.target.value)} /></label>
      <button className="admin-row-button" type="button" disabled={busy || !teeTime} onClick={() => void save()}>Save time</button>
    </article>
  );
}

export function TeeTimesSection({ state, action, busy }: SectionProps) {
  const [assignments, setAssignments] = useState<Record<string, string>>(() => Object.fromEntries(state.teams.map((team) => [team.id, team.tee_group_id ?? ""])));

  const overfilledGroups = state.teeGroups.filter((group) => Object.values(assignments).filter((groupId) => groupId === group.id).length > 2);
  const unassigned = state.teams.filter((team) => !assignments[team.id]).length;

  async function saveAssignments() {
    await action({
      action: "save-tee-assignments",
      assignments: state.teams.map((team) => ({ team_id: team.id, tee_group_id: assignments[team.id] || null })),
    }, "Foursome pairings were saved.");
  }

  return (
    <div className="admin-stack">
      <section>
        <div className="admin-section-heading"><div><p className="eyebrow">Schedule</p><h3>Times and starting holes</h3></div><span>Displayed in Central Time</span></div>
        <div className="tee-time-editors">
          {state.teeGroups.map((group) => <TeeGroupEditor key={`${group.id}-${group.tee_time}-${group.starting_hole}`} group={group} teams={state.teams.filter((team) => team.tee_group_id === group.id)} busy={busy} action={action} />)}
        </div>
      </section>

      <section>
        <div className="admin-section-heading"><div><p className="eyebrow">Foursomes</p><h3>Adjust group pairings</h3></div><span>Maximum two teams per tee time</span></div>
        {!state.teams.length ? <div className="admin-empty-inline"><p>Run the team draw before assigning foursomes.</p><Link href="/admin/draw">Go to the draw →</Link></div> : (
          <div className="tee-assignment-editor">
            {state.teams.map((team) => (
              <label key={team.id}>
                <span><strong>{teamLabel(state, team)}</strong><small>{teamMembers(state, team.id).map(playerName).join(" + ")}</small></span>
                <select value={assignments[team.id] ?? ""} onChange={(event) => setAssignments((current) => ({ ...current, [team.id]: event.target.value }))}>
                  <option value="">Unassigned</option>
                  {state.teeGroups.map((group) => <option key={group.id} value={group.id}>{formatTeeTime(group.tee_time)} · Hole {group.starting_hole}</option>)}
                </select>
              </label>
            ))}
            {overfilledGroups.length ? <p className="form-error" role="alert">A tee group has more than two teams. Move a team before saving.</p> : null}
            {unassigned ? <p className="admin-note">{unassigned} team{unassigned === 1 ? " is" : "s are"} currently unassigned.</p> : null}
            <button className="button button-primary" type="button" disabled={busy || overfilledGroups.length > 0} onClick={() => void saveAssignments()}>Save foursome pairings</button>
          </div>
        )}
      </section>
    </div>
  );
}

function CourseHoleEditor({ hole, busy, action }: { hole: AdminCourseHole; busy: boolean; action: AdminAction }) {
  const [teeName, setTeeName] = useState(hole.tee_name);
  const [yardage, setYardage] = useState(String(hole.yardage));
  const ambiguous = [4, 5, 11, 12, 13, 15].includes(hole.hole);

  return (
    <div className={ambiguous ? "course-row course-row-review" : "course-row"}>
      <strong>{hole.hole}{ambiguous ? <small>Confirm</small> : null}</strong>
      <span>Par {hole.par}</span>
      <label><span className="sr-only">Tee for hole {hole.hole}</span><select value={teeName} onChange={(event) => setTeeName(event.target.value as AdminCourseHole["tee_name"])}><option>Black</option><option>Silver</option><option>Gold</option></select></label>
      <label><span className="sr-only">Yardage for hole {hole.hole}</span><input type="number" min="50" max="800" value={yardage} onChange={(event) => setYardage(event.target.value)} /></label>
      <span>SI {hole.stroke_index}</span>
      <button className="admin-row-button" type="button" disabled={busy} onClick={() => void action({ action: "update-course-hole", hole: hole.hole, teeName, yardage }, `Hole ${hole.hole} was updated.`)}>Save</button>
    </div>
  );
}

export function CourseSection({ state, action, busy }: SectionProps) {
  const totalYards = state.courseHoles.reduce((total, hole) => total + hole.yardage, 0);
  const totalPar = state.courseHoles.reduce((total, hole) => total + hole.par, 0);
  return (
    <div className="admin-stack">
      <div className="admin-toolbar"><p><strong>Par {totalPar}</strong> · {totalYards.toLocaleString()} yards</p><span>Highlighted holes came from an ambiguous scorecard mark</span></div>
      <div className="course-editor">
        <div className="course-row course-head"><span>Hole</span><span>Par</span><span>Tee</span><span>Yards</span><span>SI</span><span /></div>
        {state.courseHoles.map((hole) => <CourseHoleEditor key={`${hole.hole}-${hole.tee_name}-${hole.yardage}`} hole={hole} busy={busy} action={action} />)}
      </div>
    </div>
  );
}

export function ScoringSection({ state, action, busy }: SectionProps) {
  const firstTeamId = state.teams[0]?.id ?? "";
  const scoresForTeam = (selectedTeamId: string) => Object.fromEntries(state.scores.filter((score) => score.team_id === selectedTeamId).map((score) => [String(score.hole), String(score.strokes)]));
  const [teamId, setTeamId] = useState(firstTeamId);
  const [scores, setScores] = useState<Record<string, string>>(() => scoresForTeam(firstTeamId));
  const selectedTeam = state.teams.find((team) => team.id === teamId);

  function chooseTeam(nextTeamId: string) {
    setTeamId(nextTeamId);
    setScores(scoresForTeam(nextTeamId));
  }

  async function saveCard() {
    const completedScores = Object.fromEntries(Object.entries(scores).filter(([, strokes]) => strokes !== "").map(([hole, strokes]) => [hole, Number(strokes)]));
    await action({ action: "save-scorecard", teamId, scores: completedScores }, `${selectedTeam ? teamLabel(state, selectedTeam) : "Team"} scorecard was saved.`);
  }

  const gross = Object.values(scores).reduce((total, strokes) => total + (Number(strokes) || 0), 0);
  const completed = Object.values(scores).filter(Boolean).length;

  if (!state.teams.length) return <div className="admin-empty-inline"><p>There are no teams to score yet.</p><Link href="/admin/draw">Run the draw →</Link></div>;

  return (
    <div className="admin-stack scoring-admin">
      <Link className="text-link" href="/admin/reset-scores">Reset saved scores →</Link>
      <div className="admin-toolbar">
        <label>Team<select value={teamId} onChange={(event) => chooseTeam(event.target.value)}>{state.teams.map((team) => <option key={team.id} value={team.id}>{teamLabel(state, team)}</option>)}</select></label>
        <div><strong>{gross || "—"}</strong><span>Gross · {completed}/18 entered</span></div>
      </div>
      <div className="admin-score-grid">
        {state.courseHoles.map((hole) => (
          <label key={hole.hole}>
            <span>Hole {hole.hole}<small>Par {hole.par} · SI {hole.stroke_index}</small></span>
            <input aria-label={`Strokes on hole ${hole.hole}`} type="number" min="1" max="15" inputMode="numeric" value={scores[String(hole.hole)] ?? ""} onChange={(event) => setScores((current) => ({ ...current, [String(hole.hole)]: event.target.value }))} />
          </label>
        ))}
      </div>
      <div className="admin-editor-actions">
        <button className="button button-primary" type="button" disabled={busy || !teamId} onClick={() => void saveCard()}>Save entire scorecard</button>
        <button className="admin-text-button" type="button" disabled={busy} onClick={() => setScores({})}>Clear draft</button>
      </div>
    </div>
  );
}

function GreenieEditor({ hole, state, action, busy }: { hole: AdminCourseHole; state: AdminState; action: AdminAction; busy: boolean }) {
  const saved = state.greenies.find((greenie) => greenie.hole === hole.hole)?.player_id ?? "";
  const [winner, setWinner] = useState(saved);
  const field = state.players.filter(isInDraw).sort((a, b) => playerName(a).localeCompare(playerName(b)));
  return (
    <article>
      <div><strong>Hole {hole.hole}</strong><small>{hole.yardage} yards · {hole.tee_name} tee</small></div>
      <select aria-label={`Greenie winner for hole ${hole.hole}`} value={winner} onChange={(event) => setWinner(event.target.value)}><option value="">No winner selected</option>{field.map((player) => <option key={player.id} value={player.id}>{playerName(player)}</option>)}</select>
      <strong>{formatMoney(state.event.greenie_cents)}</strong>
      <button className="admin-row-button" type="button" disabled={busy} onClick={() => void action({ action: "save-greenie", hole: hole.hole, playerId: winner || null }, winner ? `Hole ${hole.hole} greenie was saved.` : `Hole ${hole.hole} greenie was cleared.`)}>Save</button>
    </article>
  );
}

export function GreeniesSection({ state, action, busy }: SectionProps) {
  const parThrees = state.courseHoles.filter((hole) => hole.par === 3);
  return <div className="greenie-admin-list">{parThrees.map((hole) => <GreenieEditor key={`${hole.hole}-${state.greenies.find((greenie) => greenie.hole === hole.hole)?.player_id ?? ""}`} hole={hole} state={state} action={action} busy={busy} />)}</div>;
}

function TeamResultEditor({ team, state, action, busy }: { team: AdminTeam; state: AdminState; action: AdminAction; busy: boolean }) {
  const [status, setStatus] = useState(team.status);
  const [rank, setRank] = useState(team.playoff_rank?.toString() ?? "");
  return (
    <article>
      <div><strong>{teamLabel(state, team)}</strong><small>{teamMembers(state, team.id).map(playerName).join(" + ")}</small></div>
      <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as AdminTeam["status"])}><option value="active">Active</option><option value="wd">Withdrawn</option><option value="dq">Disqualified</option></select></label>
      <label>Playoff rank<input type="number" min="1" max="99" placeholder="—" value={rank} onChange={(event) => setRank(event.target.value)} /></label>
      <button className="admin-row-button" type="button" disabled={busy} onClick={() => void action({ action: "update-team-result", teamId: team.id, status, playoffRank: rank }, `${teamLabel(state, team)} result was updated.`)}>Save</button>
    </article>
  );
}

export function ResultsSection({ state, action, busy }: SectionProps) {
  const payouts = state.payouts;
  return (
    <div className="admin-stack">
      {payouts ? (
        <div className="payout-grid">
          <article><small>1ST PLACE</small><strong>{formatMoney(payouts.first_cents)}</strong></article>
          <article><small>2ND PLACE</small><strong>{formatMoney(payouts.second_cents)}</strong></article>
          <article><small>3RD PLACE</small><strong>{formatMoney(payouts.third_cents)}</strong></article>
          <article><small>GREENIES</small><strong>{formatMoney(payouts.greenie_pool_cents)}</strong></article>
        </div>
      ) : null}

      <section>
        <div className="admin-section-heading"><div><p className="eyebrow">Standings</p><h3>Live result</h3></div><span>Playoff rank breaks a first-place tie</span></div>
        <div className="admin-result-table">
          <div><span>Pos</span><span>Team</span><span>Thru</span><span>Gross</span><span>Net to par</span><span>Status</span></div>
          {state.leaderboard.map((row) => <div key={row.team_id}><strong>{row.position}</strong><span>{row.team_name ?? "Unnamed team"}</span><span>{row.holes_played || "—"}</span><span>{row.holes_played ? row.gross : "—"}</span><strong>{formatToPar(row.net_to_par)}</strong><span>{row.status.toUpperCase()}</span></div>)}
        </div>
      </section>

      <section>
        <div className="admin-section-heading"><div><p className="eyebrow">Final controls</p><h3>Status and playoff</h3></div></div>
        <div className="team-result-editors">{state.teams.map((team) => <TeamResultEditor key={`${team.id}-${team.status}-${team.playoff_rank ?? ""}`} team={team} state={state} action={action} busy={busy} />)}</div>
      </section>
    </div>
  );
}

export function CardsSection({ state }: { state: AdminState }) {
  return (
    <div className="admin-stack">
      <div className="admin-toolbar admin-toolbar-actions"><p>Cards use the current teams, times, starting holes, and mixed-tee routing.</p><button className="button button-primary no-print" type="button" onClick={() => window.print()}>Print cart cards</button></div>
      <div className="cart-card-grid">
        {state.teeGroups.map((group, index) => {
          const teams = state.teams.filter((team) => team.tee_group_id === group.id);
          return (
            <article className="cart-card" key={group.id}>
              <header><span>Shooktoberfest</span><strong>Group {index + 1}</strong></header>
              <div className="cart-card-time"><strong>{formatTeeTime(group.tee_time)}</strong><span>Start on hole {group.starting_hole}</span></div>
              {teams.length ? teams.map((team) => <section key={team.id}><h3>{teamLabel(state, team)}</h3><p>{teamMembers(state, team.id).map((member) => `${playerName(member)} (${member.course_handicap ?? "—"})`).join(" · ")}</p></section>) : <section><h3>Teams pending</h3><p>Assign teams on the tee-times page.</p></section>}
              <footer>{state.courseHoles.map((hole) => <span key={hole.hole}><b>{hole.hole}</b>{hole.tee_name.slice(0, 1)} · {hole.yardage}</span>)}</footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}
