import Link from "next/link";
import { notFound } from "next/navigation";
import { PageIntro, SiteHeader } from "../../../components/SiteHeader";
import AdminDashboard, { type AdminSection } from "../AdminDashboard";

const sectionCopy: Record<AdminSection, { eyebrow: string; title: string; description: string }> = {
  players: { eyebrow: "Admin · Field", title: "Players.", description: "Edit registrations, course handicaps, apparel, guests, payment status, or remove a player." },
  draw: { eyebrow: "Admin · Teams", title: "The draw.", description: "Choose B-flight partners for each A-flight player and calculate scramble handicaps." },
  "tee-times": { eyebrow: "Admin · Groups", title: "Tee times.", description: "Set every time and starting hole, then adjust which two teams share each group." },
  course: { eyebrow: "Admin · Routing", title: "Course.", description: "Confirm each tee and yardage before scorecards and cart cards are printed." },
  scoring: { eyebrow: "Admin · Safety net", title: "Scoring.", description: "Enter, complete, or repair any team’s entire scorecard at any time." },
  "reset-scores": { eyebrow: "Admin · Testing", title: "Reset scores.", description: "Clear a team’s scorecard or reset event scoring before the real round." },
  greenies: { eyebrow: "Admin · Par 3s", title: "Greenies.", description: "Record one closest-to-pin winner on every par 3." },
  results: { eyebrow: "Admin · Final", title: "Results.", description: "Review standings and payouts, record a playoff, or mark a withdrawal or disqualification." },
  cards: { eyebrow: "Admin · Print", title: "Cart cards.", description: "Print live teams, players, tee times, starting holes, and mixed-tee instructions." },
};

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!(section in sectionCopy)) notFound();
  const adminSection = section as AdminSection;
  const details = sectionCopy[adminSection];

  return (
    <main className="admin-page">
      <SiteHeader />
      <div className="page-shell wide">
        <Link className="back-link" href="/admin">← Admin dashboard</Link>
        <PageIntro eyebrow={details.eyebrow} title={details.title} copy={details.description} />
        <AdminDashboard section={adminSection} />
      </div>
    </main>
  );
}
