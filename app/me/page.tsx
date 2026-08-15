import { PageIntro, SiteHeader } from "../../components/SiteHeader";
import { holes, strokesReceived } from "../../lib/event";
import { getServerClient } from "../../lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import ResumePaymentButton from "./ResumePaymentButton";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const supabase = await getServerClient();
  if (!supabase) redirect("/login?next=/me");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/me");

  const { data: player } = await supabase.from("players")
    .select("id,first_name,last_name,email,payment_status,team_id,is_admin")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();

  const [{ data: roster }, { data: board }] = player?.team_id ? await Promise.all([
    supabase.from("roster").select("team_name,tee_time,starting_hole").eq("player_id", player.id).maybeSingle(),
    supabase.from("leaderboard").select("team_hcp").eq("team_id", player.team_id).maybeSingle(),
  ]) : [{ data: null }, { data: null }];

  const teamHandicap = board?.team_hcp ?? 0;
  const teeTime = roster?.tee_time
    ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }).format(new Date(roster.tee_time))
    : "Pending";
  const provider = String(auth.user.app_metadata.provider || "social");
  const paymentComplete = player?.payment_status === "paid" || player?.payment_status === "comped";
  return (
    <main>
      <SiteHeader />
      <div className="page-shell wide">
        <div className="profile-kicker"><span>Signed in with {provider}</span><span>{auth.user.email}</span>{player?.is_admin ? <Link className="text-link" href="/admin">Admin dashboard</Link> : null}<form action="/auth/signout" method="post"><button className="text-link" type="submit">Log out</button></form></div>
        {player ? <>
          <PageIntro eyebrow="Your event" title={roster?.team_name || `${player.first_name} ${player.last_name}`} copy={`${player.first_name} ${player.last_name} · ${paymentComplete ? "Spot confirmed" : "Payment needed"}`} />
          {paymentComplete ? <><div className="player-summary">
            <div><small>TEAM HANDICAP</small><strong>{player.team_id ? teamHandicap : "—"}</strong></div>
            <div><small>TEE TIME</small><strong className="summary-text">{teeTime}</strong></div>
            <div><small>STARTING HOLE</small><strong>{roster?.starting_hole ?? "—"}</strong></div>
          </div>
          {player.team_id ? <>
            <div className="mini-card-head"><div><p className="eyebrow">Mixed tee routing</p><h2>Your card</h2></div><p>Stroke dots show where your team gets help.</p></div>
            <div className="hole-grid">
              {holes.map(hole => <article key={hole.hole}><div><span>HOLE {hole.hole}</span>{strokesReceived(teamHandicap, hole.strokeIndex) > 0 ? <b aria-label="Stroke received">●</b> : null}</div><strong>{hole.par}</strong><span>PAR</span><em className={`tee ${hole.tee.toLowerCase()}`}>{hole.tee}</em><small>{hole.yards} YDS · SI {hole.strokeIndex}</small></article>)}
            </div>
          </> : <section className="profile-empty"><p className="eyebrow">Pairing pending</p><h2>Your team and tee time will appear here after the draw.</h2></section>}</> : <section className="profile-empty profile-payment"><p className="eyebrow">Registration saved</p><h2>Complete your payment to confirm your spot.</h2><p>Your golfer details are safe. We’ll reopen your checkout—or create a fresh one if the old link expired.</p><ResumePaymentButton /></section>}
        </> : <section className="profile-empty"><p className="eyebrow">Account ready</p><h1>Claim your spot.</h1><p>You’re signed in. Finish the golfer details and payment to join the field.</p><a className="button button-primary" href="/register">Finish registration</a></section>}
      </div>
    </main>
  );
}
