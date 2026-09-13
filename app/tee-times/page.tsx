import { PageIntro, SiteHeader } from "../../components/SiteHeader";
import { demoTeeTimes } from "../../lib/event";
import { getTeeSheet } from "../../lib/supabase/public";
import PlayerAvatar from "../../components/PlayerAvatar";

export const dynamic = "force-dynamic";

export default async function TeeTimesPage() {
  const liveSheet = await getTeeSheet();
  const hasLiveData = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const teeTimes = liveSheet || (hasLiveData ? [] : demoTeeTimes.map(group => ({
    time: group.time,
    teams: group.teams.map((name, index) => ({
      id: `demo-${index}`,
      name,
      handicap: null,
      players: group.players.slice(index * 2, index * 2 + 2).map((name, playerIndex) => ({
        playerId: `demo-${index}-${playerIndex}`, name, photoUrl: null,
      })),
    })),
  })));
  return (
    <main>
      <SiteHeader active="/tee-times" />
      <div className="page-shell wide">
        <PageIntro eyebrow="Mt Prospect Golf Club" title="Tee Times" copy="Meet at the course at 9am for coffee, donuts and range practice." />
        {!teeTimes.length ? <p role="status">Tee times are currently unavailable. Please check back shortly.</p> : null}
        <div className="tee-sheet">
          {teeTimes.map((group, index) => (
            <article className="tee-group" key={group.time}>
              <div className="tee-time"><small>GROUP {index + 1}</small><strong>{group.time}</strong></div>
              <div className="tee-teams">
                {group.teams.map(team => (
                  <div className="tee-team" key={team.id}>
                    <span className="tee-team-avatars">
                      {team.players.map(player => <PlayerAvatar key={player.playerId} name={player.name} src={player.photoUrl} size="small" />)}
                    </span>
                    <strong>{team.name}</strong>
                    <span>{team.players.map(player => player.name).join(" · ")}</span>
                    <span>Team HCP: {team.handicap ?? "—"}</span>
                  </div>
                ))}
              </div>
              <span className="starting-hole">#1</span>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
