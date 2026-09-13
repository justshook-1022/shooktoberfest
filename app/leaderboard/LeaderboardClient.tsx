"use client";

import { useEffect, useState } from "react";
import { demoLeaderboard, formatToPar } from "../../lib/event";
import PlayerAvatar from "../../components/PlayerAvatar";
import { getProfilePhotoUrl } from "../../lib/profile-photo";
import styles from "./leaderboard.module.css";
import { getBrowserClient } from "../../lib/supabase/client";
import { getCurrentEvent } from "../../lib/supabase/current-event";

type Player = { player_id: string; team_id: string | null; first_name: string; last_name: string; profile_photo_path: string | null };
type Row = Omit<typeof demoLeaderboard[number], "net"> & {
  team_id?: string;
  status?: string;
  tee_time?: string | null;
  team_hcp?: number | null;
  players?: Player[];
};

const teeTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric", minute: "2-digit", timeZone: "America/Chicago",
});

const formatThru = (holesPlayed: number) => {
  if (holesPlayed === 18) return "F";
  return holesPlayed || "—";
};

export default function LeaderboardClient({ eventId: selectedEventId }: { eventId?: string }) {
  const backendConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const [rows, setRows] = useState<Row[]>(backendConfigured ? [] : demoLeaderboard);

  const [state, setState] = useState(backendConfigured ? "Loading standings…" : "Preview standings");

  useEffect(() => {
    const client = getBrowserClient();
    if (!client) return;
    let debounce: ReturnType<typeof setTimeout>;
    let poll: ReturnType<typeof setInterval>;
    let active = true;
    let request = 0;
    const refresh = async (eventId: string) => {
      const version = ++request;
      const [{ data, error }, { data: players }] = await Promise.all([client
        .from("leaderboard")
        .select("team_id,position,team_name,holes_played,net_to_par,tee_time,team_hcp,status")
        .eq("event_id", eventId)
        .order("position"),
      client.from("roster")
        .select("player_id,team_id,first_name,last_name,profile_photo_path")
        .eq("event_id", eventId)
        .order("last_name").order("first_name")]);
      if (!active || version !== request) return;
      if (error) { setState("Connection interrupted. Retrying automatically…"); return; }
      setState("Standings update automatically after each saved hole.");
      if (data) setRows(previous => data.map(row => ({
        ...row,
        players: players
          ? players.filter(player => player.team_id === row.team_id)
          : previous.find(existing => existing.team_id === row.team_id)?.players,
      })));
    };
    let channel: ReturnType<typeof client.channel> | null = null;
    const refreshWhenVisible = (eventId: string) => {
      if (document.visibilityState === "visible") void refresh(eventId);
    };
    let visibilityHandler: (() => void) | null = null;
    void (async () => {
      const { data: event } = selectedEventId
        ? await client.from("events").select("id").eq("id", selectedEventId).maybeSingle()
        : await getCurrentEvent(client);
      if (!active) return;
      if (!event) { setState("Standings are not available yet."); return; }
      await refresh(event.id);
      channel = client.channel("public-leaderboard").on("postgres_changes", { event: "*", schema: "public", table: "scores" }, () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => void refresh(event.id), 350);
      }).on("postgres_changes", { event: "*", schema: "public", table: "teams", filter: `event_id=eq.${event.id}` }, () => void refresh(event.id)).subscribe(status => {
        if (status === "SUBSCRIBED") void refresh(event.id);
      });
      poll = setInterval(() => void refresh(event.id), 5_000);
      visibilityHandler = () => refreshWhenVisible(event.id);
      document.addEventListener("visibilitychange", visibilityHandler);
      window.addEventListener("focus", visibilityHandler);
      window.addEventListener("online", visibilityHandler);
    })();
    return () => {
      active = false;
      clearTimeout(debounce);
      clearInterval(poll);
      if (visibilityHandler) {
        document.removeEventListener("visibilitychange", visibilityHandler);
        window.removeEventListener("focus", visibilityHandler);
        window.removeEventListener("online", visibilityHandler);
      }
      if (channel) void client.removeChannel(channel);
    };
  }, [selectedEventId]);

  return (
    <div className="leaderboard-table-frame">
      <div className="page-intro">
        <p role="status">{state}</p>
      </div>
      <table className="leaderboard-table">
        <thead>
          <tr>
            <th scope="col">POS</th>
            <th scope="col">TEAM</th>
            <th scope="col">NET TO PAR</th>
            <th scope="col">THRU</th>
          </tr>
        </thead>
        <tbody>
          {!rows.length ? <tr><td colSpan={4}>Scores will appear when teams start entering their rounds.</td></tr> : null}
          {rows.map((row, index) => {
            const scoreClass = row.net_to_par === null
              ? ""
              : row.net_to_par < 0
                ? " is-under-par"
                : row.net_to_par > 0
                  ? " is-over-par"
                  : "";

            return (
              <tr key={row.team_id || `${row.team_name}-${index}`}>
                <td className="leaderboard-position">{row.status && row.status !== "active" ? row.status.toUpperCase() : !row.holes_played ? "—" : `${rows.filter(other => other.position === row.position && other.holes_played > 0).length > 1 ? "T" : ""}${row.position}`}</td>
                <th scope="row">
                  <div className={styles.team}>
                    {!!row.players?.length && <div className={styles.avatars}>
                      {row.players.map(player => <PlayerAvatar
                        key={player.player_id}
                        name={`${player.first_name} ${player.last_name}`}
                        src={getProfilePhotoUrl(player.profile_photo_path)}
                        size="small"
                      />)}
                    </div>}
                    <div className={styles.details}>
                      <span className={styles.name}>{row.team_name || `Team ${index + 1}`}</span>
                      <div className={styles.metadata}>
                        <span>Tee time: {row.tee_time ? `${teeTimeFormatter.format(new Date(row.tee_time))} CT` : "TBD"}</span>
                        <span>Team HCP: {row.team_hcp ?? "—"}</span>
                      </div>
                    </div>
                  </div>
                </th>
                <td className={`leaderboard-total${scoreClass}`}>{formatToPar(row.net_to_par)}</td>
                <td className="leaderboard-thru">{formatThru(row.holes_played)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
