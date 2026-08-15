import { NextResponse } from "next/server";
import { authorizeAdmin } from "../../../lib/supabase/authorize-admin";

export async function GET(request: Request) {
  const { admin, player, configured } = await authorizeAdmin(request);
  if (!configured) return NextResponse.json({ demo: true });
  if (!admin || !player) return NextResponse.json({ error: "Admin sign-in required." }, { status: 401 });
  const [{ data: event }, { data: players }, { data: payouts }] = await Promise.all([
    admin.from("events").select("*").eq("id", player.event_id).single(),
    admin.from("players").select("id,first_name,last_name,payment_status,amount_paid_cents,shirt_size,wife_attending,wife_shirt_size,course_handicap,team_id").eq("event_id", player.event_id).order("last_name"),
    admin.from("payout_summary").select("*").eq("event_id", player.event_id).single(),
  ]);
  return NextResponse.json({ event, players, payouts });
}

export async function POST(request: Request) {
  const { admin, player, configured } = await authorizeAdmin(request);
  if (!configured) return NextResponse.json({ demo: true });
  if (!admin || !player) return NextResponse.json({ error: "Admin sign-in required." }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  if (body.action === "set-signups") {
    await admin.from("events").update({ signups_open: Boolean(body.open) }).eq("id", player.event_id);
  } else if (body.action === "set-scoring") {
    await admin.from("events").update({ scoring_open: Boolean(body.open) }).eq("id", player.event_id);
  } else if (body.action === "draw") {
    const { error } = await admin.rpc("draw_teams", { p_event_id: player.event_id, p_force: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  } else if (body.action === "assign-tee-groups") {
    const { error } = await admin.rpc("assign_tee_groups", { p_event_id: player.event_id });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  } else if (body.action === "course-hole") {
    const hole = Math.round(Number(body.hole));
    const yardage = Math.round(Number(body.yardage));
    if (hole < 1 || hole > 18 || !["Black", "Silver", "Gold"].includes(String(body.tee_name))) return NextResponse.json({ error: "Invalid hole update." }, { status: 400 });
    await admin.from("course_holes").update({ tee_name: body.tee_name, yardage }).eq("event_id", player.event_id).eq("hole", hole);
  } else {
    return NextResponse.json({ error: "Unknown admin action." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
