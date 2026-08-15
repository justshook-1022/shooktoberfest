import { createClient } from "@supabase/supabase-js";

export function getPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function getEventSnapshot() {
  const client = getPublicClient();
  if (!client) return { spotsLeft: 12, signupsOpen: true, scoringOpen: false, demo: true };
  const { data: event } = await client.from("events").select("id,field_cap,signups_open,scoring_open").single();
  if (!event) return { spotsLeft: 12, signupsOpen: true, scoringOpen: false, demo: true };
  const { count } = await client.from("roster").select("player_id", { count: "exact", head: true }).eq("event_id", event.id);
  return {
    spotsLeft: Math.max(0, event.field_cap - (count ?? 0)),
    signupsOpen: event.signups_open,
    scoringOpen: event.scoring_open,
    demo: false,
  };
}

export async function getTeeSheet() {
  const client = getPublicClient();
  if (!client) return null;
  const { data } = await client.from("roster").select("first_name,last_name,team_name,tee_time,starting_hole").not("tee_time", "is", null).order("tee_time");
  if (!data?.length) return null;
  const groups = new Map<string, typeof data>();
  for (const player of data) {
    const key = player.tee_time as string;
    groups.set(key, [...(groups.get(key) || []), player]);
  }
  return Array.from(groups.entries()).map(([teeTime, players]) => ({
    time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }).format(new Date(teeTime)),
    teams: Array.from(new Set(players.map(player => player.team_name || "Team pending"))),
    players: players.map(player => `${player.first_name} ${player.last_name}`),
  }));
}
