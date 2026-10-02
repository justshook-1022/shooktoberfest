import EventCountdown from "../components/EventCountdown";
import { RegistrationLink } from "../components/RegistrationStatus";
import Image from "next/image";
import Link from "next/link";
import { SiteHeader } from "../components/SiteHeader";
import { event } from "../lib/event";

const included = [
  "18-hole, two-man scramble",
  "After-round dinner and drinks",
  "Live band",
  "T-shirt for you and your wife",
  "Prizes for first, second, and third",
  "On-course games",
];

const timeline = [
  { when: "9:00 a.m.", title: "Coffee & donuts", copy: "Meet at Mt Prospect Golf Club at 9:00 a.m. for coffee and donuts." },
  { when: "10:00 a.m.", title: "Golf", copy: "The first group tees off at Mt Prospect Golf Club and the scramble is underway." },
  { when: "5:30 p.m.", title: "Dinner & after-party", copy: "Dinner, drinks, prizes, and live music begin in the Shooks’ backyard." },
];

export default function Home() {
  return (
    <main className="simple-home">
      <SiteHeader />
      <section className="simple-hero">
        <Image
          className="simple-hero-photo"
          src="/shooktoberfest-past-event.jpg"
          alt="Friends gathered at a past Shooktoberfest event"
          fill
          priority
          sizes="100vw"
        />
        <div className="simple-hero-overlay" />

        <div className="simple-hero-content">
          <p className="simple-kicker">Friday, October 2 · 10:00 a.m.</p>
          <h1>Shooktoberfest<br /><em>2026</em></h1>
          <EventCountdown />
          <div className="simple-hero-actions">
            <RegistrationLink className="simple-signup" />
            <Link className="simple-login" href="/login">Already registered? Login</Link>
          </div>
        </div>
      </section>

      <section className="simple-intro" aria-labelledby="event-intro">
        <p className="simple-eyebrow">The main event</p>
        <h2 id="event-intro">Northwest Chicago suburbs’ best Oktoberfest-themed scramble.</h2>
      </section>

      <section className="simple-included" aria-labelledby="included-title">
        <div className="simple-section-heading">
          <p className="simple-eyebrow">One price. The whole day.</p>
          <h2 id="included-title"><em>${event.entry}</em> buy-in gets you:</h2>
        </div>
        <ol className="simple-included-list">
          {included.map((item, index) => (
            <li key={item}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item}</strong></li>
          ))}
        </ol>
      </section>

      <section className="simple-timeline" aria-labelledby="timeline-title">
        <div className="simple-section-heading">
          <p className="simple-eyebrow">Friday, October 2</p>
          <h2 id="timeline-title">Here’s the plan.</h2>
        </div>
        <ol className="simple-timeline-list">
          {timeline.map((item, index) => (
            <li key={item.title}>
              <span className="simple-timeline-number">{index + 1}</span>
              <p>{item.when}</p>
              <div><h3>{item.title}</h3><p>{item.copy}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <section className="simple-format" aria-labelledby="format-title">
        <div className="simple-format-copy">
          <p className="simple-eyebrow">How it works</p>
          <h2 id="format-title">Random partners.<br /><em>One net score.</em></h2>
          <p>This year’s event will be a two-person scramble with randomized partners. The field will be divided by handicap: A players will be the top 50% of the field, and B players will be the bottom 50%. Each team will pair one A player with one B player.</p>
          <p>Every team will receive a team handicap. The team with the lowest net score wins.</p>
        </div>

        <dl className="simple-venues">
          <div><dt>Golf</dt><dd>Mt Prospect Golf Club</dd></div>
          <div><dt>After-party</dt><dd>The Shooks’ backyard</dd></div>
        </dl>

        <div className="simple-bottom-cta">
          <p>Ready to play?</p>
          <RegistrationLink className="simple-signup" />
        </div>
      </section>
    </main>
  );
}
