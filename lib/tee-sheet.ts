type TeeSheetPlayer = {
  playerId: string;
  teamId: string | null;
  teamName: string | null;
  name: string;
  photoUrl: string | null;
};

export function groupTeeTeams(players: TeeSheetPlayer[]) {
  const teams = new Map<string, { id: string; name: string; players: TeeSheetPlayer[] }>();
  for (const player of players) {
    // Roster order is unrelated to team membership; names are not unique IDs.
    const id = player.teamId ?? `pending-${player.playerId}`;
    const team = teams.get(id) ?? { id, name: player.teamName || "Team pending", players: [] };
    team.players.push(player);
    teams.set(id, team);
  }
  return Array.from(teams.values());
}
