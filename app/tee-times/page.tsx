import { PageIntro, SiteHeader } from "../../components/SiteHeader";
import { demoTeeTimes } from "../../lib/event";
import { getTeeSheet } from "../../lib/supabase/public";

export const dynamic = "force-dynamic";

export default async function TeeTimesPage() {
  const liveSheet = await getTeeSheet();
  const teeTimes = liveSheet || demoTeeTimes;
  return (
    <main>
      <SiteHeader active="/tee-times" />
      <div className="page-shell wide">
        <PageIntro eyebrow="First tee · Hole 1" title="Know your time." copy="Four golfers per slot, ten minutes apart. Please don’t make the entire field watch you tie your shoes." />
        <div className="tee-sheet">
          {teeTimes.map((group, index) => (
            <article className="tee-group" key={group.time}>
              <div className="tee-time"><small>GROUP {index + 1}</small><strong>{group.time}</strong></div>
              <div className="tee-teams">
                {group.teams.map((team, teamIndex) => <div key={`${team}-${teamIndex}`}><strong>{team}</strong><span>{group.players.slice(teamIndex * 2, teamIndex * 2 + 2).join(" · ")}</span></div>)}
              </div>
              <span className="starting-hole">#1</span>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
