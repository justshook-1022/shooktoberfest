import { groupTeeTeams } from "../tee-sheet";
import { createClient } from "@supabase/supabase-js";
import { getProfilePhotoUrl } from "../profile-photo";
import { getCurrentEvent } from "./current-event";

export function getPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function getEventSnapshot() {
  const client = getPublicClient();
  if (!client) return { spotsLeft: 12, signupsOpen: true, scoringOpen: false, demo: true };
  const { data: event } = await getCurrentEvent(client);
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
  const { data: event } = await getCurrentEvent(client);
  if (!event) return null;
  const [{ data }, { data: handicaps }] = await Promise.all([
    client.from("roster").select("player_id,team_id,first_name,last_name,profile_photo_path,team_name,tee_time,starting_hole").eq("event_id", event.id).not("tee_time", "is", null).order("tee_time"),
    client.from("leaderboard").select("team_id,team_hcp").eq("event_id", event.id),
  ]);
  if (!data?.length) return null;
  const handicapByTeam = new Map<string, number | null>((handicaps ?? []).map(team => [team.team_id, team.team_hcp]));
  const groups = new Map<string, typeof data>();
  for (const player of data) {
    const key = player.tee_time as string;
    groups.set(key, [...(groups.get(key) || []), player]);
  }
  return Array.from(groups.entries()).map(([teeTime, players]) => ({
    time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }).format(new Date(teeTime)),
    teams: groupTeeTeams(players.map(player => ({
      playerId: player.player_id,
      teamId: player.team_id,
      teamName: player.team_name,
      name: `${player.first_name} ${player.last_name}`,
      photoUrl: getProfilePhotoUrl(player.profile_photo_path),
    }))).map(team => ({ ...team, handicap: handicapByTeam.get(team.id) ?? null })),
  }));
}
