"use client";

import { useEffect, useState } from "react";
import { demoLeaderboard, formatToPar } from "../../lib/event";
import { getBrowserClient } from "../../lib/supabase/client";

type Row = typeof demoLeaderboard[number];

export default function LeaderboardClient() {
  const [rows, setRows] = useState<Row[]>(demoLeaderboard);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const client = getBrowserClient();
    if (!client) return;
    let debounce: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      const { data } = await client.from("leaderboard").select("position,team_name,holes_played,net_to_par,net").order("position");
      if (data) { setRows(data as Row[]); setLive(true); }
    };
    refresh();
    const channel = client.channel("public-leaderboard").on("postgres_changes", { event: "*", schema: "public", table: "scores" }, () => {
      clearTimeout(debounce);
      debounce = setTimeout(refresh, 350);
    }).subscribe();
    return () => { clearTimeout(debounce); void client.removeChannel(channel); };
  }, []);

  return (
    <>
      <div className="board-status"><span className={`live-pill ${live ? "connected" : ""}`}><i /> {live ? "LIVE" : "PREVIEW DATA"}</span><span>Updates automatically</span></div>
      <div className="leaderboard-card full-board">
        <div className="leaderboard-head"><span>POS</span><span>TEAM</span><span>THRU</span><span>NET TO PAR</span><span>NET</span></div>
        {rows.map((row, index) => (
          <div className="leaderboard-row" key={`${row.team_name}-${index}`}>
            <span className="position">{row.position}</span>
            <strong>{row.team_name || `Team ${index + 1}`}</strong>
            <span>{row.holes_played || "—"}</span>
            <span className="score">{formatToPar(row.net_to_par)}</span>
            <span>{row.net ?? "—"}</span>
          </div>
        ))}
      </div>
      <p className="board-note">The database owns the order: unstarted teams last, then net-to-par, then countback. No browser math.</p>
    </>
  );
}
