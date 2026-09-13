import { SiteHeader } from "../../components/SiteHeader";
import LeaderboardClient from "./LeaderboardClient";

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const { event } = await searchParams;
  const eventId = event && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event) ? event : undefined;
  return (
    <main className="leaderboard-page">
      <SiteHeader active="/leaderboard" />
      <section className="leaderboard-shell">
        <h1>Leader Board</h1>
        <LeaderboardClient eventId={eventId} />
      </section>
    </main>
  );
}
