import { SiteHeader } from "../../../components/SiteHeader";
import SuccessClient from "./SuccessClient";
import Link from "next/link";

export default async function SuccessPage({ searchParams }: { searchParams: Promise<{ session_id?: string; demo?: string }> }) {
  const params = await searchParams;
  return (
    <main>
      <SiteHeader />
      <section className="success-card">
        <span className="success-check">✓</span>
        <p className="eyebrow">Registration</p>
        <h1>That counts.</h1>
        <SuccessClient sessionId={params.session_id} demo={params.demo === "1"} />
        <div className="success-actions"><Link className="button button-primary" href="/me">See my event</Link><Link className="button button-secondary" href="/">Back home</Link></div>
      </section>
    </main>
  );
}
