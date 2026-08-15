import { redirect } from "next/navigation";
import { SiteHeader } from "../components/SiteHeader";
import { getEventSnapshot } from "../lib/supabase/public";

export const dynamic = "force-dynamic";

const leaderboard = [
  { pos: 1, team: "Shook / Wood", thru: "12", score: "−6" },
  { pos: 2, team: "Burns / Keller", thru: "18", score: "−5" },
  { pos: 3, team: "Doyle / Kane", thru: "9", score: "−3" },
  { pos: 4, team: "Miller / Walsh", thru: "—", score: "—" },
];

export default async function Home() {
  const snapshot = await getEventSnapshot();
  if (snapshot.scoringOpen) redirect("/leaderboard");
  return (
    <main>
      <SiteHeader />

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Friday · October 2, 2026</p>
          <h1>Good golf is optional.</h1>
          <p className="lede">
            Thirty-two golfers. Sixteen teams. One October Friday at Mt Prospect.
            Two-person scramble, live scoring, and a band waiting at the finish.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href={snapshot.signupsOpen && snapshot.spotsLeft > 0 ? "/register" : "/tee-times"}>{snapshot.signupsOpen && snapshot.spotsLeft > 0 ? "Claim a spot · $200" : "See the field"}</a>
            <a className="button button-secondary" href="#details">See the damage</a>
          </div>
          <div className="spots" aria-label="Registration availability">
            <span className="spots-number">{snapshot.spotsLeft}</span>
            <span><strong>{snapshot.spotsLeft === 1 ? "spot left" : "spots left"}</strong><br />Hard cap at 32. No exceptions.</span>
          </div>
        </div>

        <aside className="scorecard" aria-label="Event scorecard summary">
          <div className="scorecard-top">
            <span>MT PROSPECT</span>
            <span>PAR 70</span>
          </div>
          <div className="scorecard-grid">
            <div><span>START</span><strong>10:00</strong><small>AM CT</small></div>
            <div><span>FORMAT</span><strong>2-MAN</strong><small>SCRAMBLE</small></div>
            <div><span>POT</span><strong>$2.4K</strong><small>AT FULL FIELD</small></div>
            <div><span>YARDS</span><strong>5,925</strong><small>MIXED TEES</small></div>
          </div>
          <div className="tee-route" aria-label="Mixed tee routing">
            <span className="tee black">8 BLACK</span>
            <span className="tee silver">5 SILVER</span>
            <span className="tee gold">5 GOLD</span>
          </div>
          <p className="scorecard-note">Play the tee on the card. Hero golf from the wrong box still counts.</p>
        </aside>
      </section>

      <section className="leaderboard-section" id="leaderboard">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Event day</p>
            <h2>The board tells the truth.</h2>
          </div>
          <span className="live-pill"><i /> LIVE PREVIEW</span>
        </div>
        <div className="leaderboard-card">
          <div className="leaderboard-head">
            <span>POS</span><span>TEAM</span><span>THRU</span><span>NET</span>
          </div>
          {leaderboard.map((row) => (
            <div className="leaderboard-row" key={row.team}>
              <span className="position">{row.pos}</span>
              <strong>{row.team}</strong>
              <span>{row.thru}</span>
              <span className="score">{row.score}</span>
            </div>
          ))}
        </div>
        <p className="board-note">Ranked by net-to-par, so nine holes never beats eighteen by accident.</p>
      </section>

      <section className="details" id="details">
        <article><span>01</span><h3>Show up</h3><p>Sequential tee times from 10:00 to 11:10. Your foursome gets one job: be early.</p></article>
        <article><span>02</span><h3>Go low</h3><p>Two-person scramble with team handicaps and strokes assigned by hole difficulty.</p></article>
        <article><span>03</span><h3>Stay late</h3><p>Food, drinks, five greenies, a live band, and a payout worth sticking around for.</p></article>
      </section>
    </main>
  );
}
