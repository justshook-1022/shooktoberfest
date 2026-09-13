import type { Metadata } from "next";
import Image from "next/image";
import { PageIntro, SiteHeader } from "../../components/SiteHeader";
import { pastEvents } from "../../lib/history";

export const metadata: Metadata = {
  title: "Past Events | Shooktoberfest",
  description: "Players, champions, and photos from every Shooktoberfest since 2021.",
};

export default function PhotosPage() {
  return (
    <main className="past-events-page">
      <SiteHeader active="/photos" />
      <div className="page-shell wide past-events-shell">
        <PageIntro
          eyebrow="Past events · Est. 2021"
          title="The archive."
          copy="Every field, every winning team, and a few photos that survived the group chat."
        />

        <section className="past-events-accordion" aria-label="Shooktoberfest events by year">
          {pastEvents.map((event) => {
            const photoSlots = [
              ...event.photos,
              ...Array.from({ length: Math.max(0, 2 - event.photos.length) }, () => null),
            ];

            return (
              <details className="past-event" key={event.year} open={event.year === "2025"}>
                <summary>
                  <span className="past-event-year">{event.year}</span>
                  <span className="past-event-summary">
                    <strong>{event.winners.join(" & ")}</strong>
                    <small>{event.playerCount ? `${event.playerCount} players` : "Player count not recorded"}</small>
                  </span>
                  <span className="past-event-toggle" aria-hidden="true" />
                </summary>

                <div className="past-event-content">
                  <dl className="past-event-facts">
                    <div>
                      <dt>Players</dt>
                      <dd>{event.playerCount ?? "—"}</dd>
                      {!event.playerCount ? <small>Count to be confirmed</small> : null}
                    </div>
                    <div>
                      <dt>Winning group</dt>
                      <dd>{event.winners[0]} <span>&amp;</span> {event.winners[1]}</dd>
                      <small>{event.note}</small>
                    </div>
                  </dl>

                  <div className="past-event-photos">
                    {photoSlots.map((photo, index) => photo ? (
                      <figure key={photo.src}>
                        <div className="past-event-photo-frame">
                          <Image
                            src={photo.src}
                            alt={photo.alt}
                            fill
                            priority={event.year === "2025"}
                            sizes="(max-width: 760px) calc(100vw - 56px), 580px"
                            style={{ objectPosition: photo.position }}
                          />
                        </div>
                        <figcaption>{photo.caption}</figcaption>
                      </figure>
                    ) : (
                      <div className="past-event-photo-missing" key={`${event.year}-missing-${index}`}>
                        <span>{event.year}</span>
                        <p>More photos coming soon</p>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            );
          })}
        </section>
      </div>
    </main>
  );
}
