import { PageIntro, SiteHeader } from "../../../components/SiteHeader";
import { holes, demoLeaderboard, demoTeeTimes, formatToPar } from "../../../lib/event";
import Link from "next/link";

const copy: Record<string, { eyebrow: string; title: string; description: string }> = {
  players: { eyebrow: "Admin · Field", title: "Players.", description: "Payment status, course handicap, shirts, guests, comps, and refunds." },
  draw: { eyebrow: "Admin · Teams", title: "The draw.", description: "Close signups, fill every course handicap, then pair A flight with B flight." },
  "tee-times": { eyebrow: "Admin · Groups", title: "Tee times.", description: "Two teams per group from 10:00 through 11:10." },
  course: { eyebrow: "Admin · Routing", title: "Course.", description: "Confirm every tee before cart cards get printed. Six marked-card readings need your eyes." },
  scoring: { eyebrow: "Admin · Safety net", title: "Scoring.", description: "Enter or repair any team’s score when a phone dies or a player gets locked out." },
  greenies: { eyebrow: "Admin · Par 3s", title: "Greenies.", description: "$50 to the closest golfer on 4, 7, 10, 12, and 16." },
  results: { eyebrow: "Admin · Final", title: "Results.", description: "Record a first-place playoff, confirm countback, and settle the pot." },
  cards: { eyebrow: "Admin · Print", title: "Cart cards.", description: "Teams, players, time, and every mixed-tee instruction in one printable sheet." },
};

function SectionContent({ section }: { section: string }) {
  if (section === "course" || section === "cards") return <div className="admin-table course-table"><div className="table-head"><span>Hole</span><span>Par</span><span>Tee</span><span>Yards</span><span>SI</span></div>{holes.map(hole => <div key={hole.hole}><strong>{hole.hole}</strong><span>{hole.par}</span><span><em className={`tee ${hole.tee.toLowerCase()}`}>{hole.tee}</em></span><span>{hole.yards}</span><span>{hole.strokeIndex}</span></div>)}</div>;
  if (section === "tee-times") return <div className="admin-list">{demoTeeTimes.map(group => <article key={group.time}><strong>{group.time}</strong><span>{group.teams.join(" + ")}</span><button>Edit</button></article>)}</div>;
  if (section === "results" || section === "scoring") return <div className="admin-table result-table"><div className="table-head"><span>Pos</span><span>Team</span><span>Thru</span><span>Net</span></div>{demoLeaderboard.map((row, index) => <div key={`${row.team_name}-${index}`}><strong>{row.position}</strong><span>{row.team_name}</span><span>{row.holes_played || "—"}</span><span>{formatToPar(row.net_to_par)}</span></div>)}</div>;
  if (section === "greenies") return <div className="greenie-grid">{[4, 7, 10, 12, 16].map(hole => <label key={hole}>Hole {hole}<select defaultValue=""><option value="">Choose winner</option><option>Justin Shook</option><option>Nate Wood</option><option>Mike Burns</option></select><span>$50</span></label>)}</div>;
  if (section === "draw") return <div className="draw-panel"><div className="draw-warning"><strong>3 handicaps are missing.</strong><p>They’ll be treated as 99 and land in B flight. Fix them before running anything.</p></div><div className="draw-flights"><article><span>A FLIGHT</span><strong>10</strong><p>Low course handicaps</p></article><article><span>B FLIGHT</span><strong>10</strong><p>High course handicaps</p></article></div><button className="button button-primary">Preview random draw</button></div>;
  return <div className="admin-table players-table"><div className="table-head"><span>Player</span><span>Status</span><span>HCP</span><span>Shirt</span></div>{["Justin Shook", "Nate Wood", "Mike Burns", "Tom Keller", "Sean Doyle", "Chris Kane"].map((name, index) => <div key={name}><strong>{name}</strong><span><em className="paid">PAID</em></span><span>{index + 4}</span><span>{index % 2 ? "XL" : "L"}</span></div>)}</div>;
}

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const details = copy[section] || copy.players;
  return <main className="admin-page"><SiteHeader /><div className="page-shell wide"><Link className="back-link" href="/admin">← Admin dashboard</Link><PageIntro eyebrow={details.eyebrow} title={details.title} copy={details.description} /><SectionContent section={section} /></div></main>;
}
