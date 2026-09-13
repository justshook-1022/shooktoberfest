import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SiteHeader } from "../../components/SiteHeader";
import { champions } from "../../lib/history";

export const metadata: Metadata = {
  title: "Hall of Fame | Shooktoberfest",
  description: "Meet every team to win Shooktoberfest since 2021.",
};

export default function HallOfFamePage() {
  return (
    <main className="hof-page">
      <SiteHeader active="/hall-of-fame" />

      <section className="hof-hero" aria-labelledby="hall-of-fame-title">
        <div>
          <p className="hof-kicker">Est. 2021 · Mt Prospect, Illinois</p>
          <h1 id="hall-of-fame-title">Hall of <em>Fame</em></h1>
        </div>
        <p className="hof-intro">
          The teams who finished the job, took the title, and earned a permanent
          place in Shooktoberfest history.
        </p>
      </section>

      <section className="hof-gallery" aria-label="Shooktoberfest champions by year">
        {champions.map((champion) => (
          <article className="hof-card" key={champion.year}>
            <div className={`hof-photo${champion.image ? " hof-photo-filled" : " hof-photo-placeholder"}`}>
              {champion.image ? (
                <Image
                  className="hof-photo-image"
                  src={champion.image}
                  alt={`${champion.year} Shooktoberfest champions ${champion.winners.join(" and ")} with their trophies`}
                  fill
                  priority={champion.year === "2025"}
                  sizes="(max-width: 760px) calc(100vw - 52px), 1040px"
                  style={{ objectPosition: champion.imagePosition }}
                />
              ) : (
                <>
                  <span className="hof-photo-year" aria-hidden="true">{champion.year}</span>
                  <span className="hof-photo-copy">Champion photo coming soon</span>
                </>
              )}
            </div>

            <div className="hof-card-body">
              <div className="hof-card-meta">
                <span className="hof-country">
                  <span className="hof-flag" aria-label="United States">🇺🇸</span>
                  Shooktoberfest champions
                </span>
              </div>

              <h2>
                <span>{champion.winners[0]}</span>
                <small>&amp;</small>
                <span>{champion.winners[1]}</span>
              </h2>

              <dl className="hof-stats">
                <div>
                  <dt>Year</dt>
                  <dd>{champion.year}</dd>
                </div>
                <div>
                  <dt>Team titles</dt>
                  <dd>{champion.titles}</dd>
                </div>
                <div>
                  <dt>Legacy</dt>
                  <dd>{champion.note}</dd>
                </div>
              </dl>
            </div>
          </article>
        ))}
      </section>

      <footer className="hof-footer">
        <p>The next name on this wall could be yours.</p>
        <Link href="/register">Sign up for 2026</Link>
      </footer>
    </main>
  );
}
