import { PageIntro, SiteHeader } from "../../components/SiteHeader";
import LeaderboardClient from "./LeaderboardClient";

export default function LeaderboardPage() {
  return (
    <main className="dark-page">
      <SiteHeader active="/leaderboard" />
      <div className="page-shell wide">
        <PageIntro eyebrow="Live standings" title="The board." copy="Net-to-par is the headline. Thru tells you how much golf is left. Unstarted teams stay out of the way." />
        <LeaderboardClient />
      </div>
    </main>
  );
}
