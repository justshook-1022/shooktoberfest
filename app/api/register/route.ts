import { NextResponse } from "next/server";
import { getAdminClient } from "../../../lib/supabase/admin";
import { getCurrentEvent } from "../../../lib/supabase/current-event";
import { getServerClient } from "../../../lib/supabase/server";

const validSizes = new Set(["S", "M", "L", "XL", "2XL", "3XL"]);
const handicapIdPattern = /^[A-Z0-9 -]{3,32}$/;

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  for (const field of ["first_name", "last_name", "shirt_size", "handicap_id"]) {
    if (typeof body[field] !== "string" || !(body[field] as string).trim()) {
      return NextResponse.json({ error: `Missing ${field.replaceAll("_", " ")}.` }, { status: 400 });
    }
  }
  if (!validSizes.has(body.shirt_size as string)) {
    return NextResponse.json({ error: "Choose a valid shirt size." }, { status: 400 });
  }
  if (body.wife_attending && (!body.wife_name || !validSizes.has(body.wife_shirt_size as string))) {
    return NextResponse.json({ error: "Add your guest’s name and shirt size." }, { status: 400 });
  }

  const handicapId = String(body.handicap_id).trim().toUpperCase();
  if (!handicapIdPattern.test(handicapId)) {
    return NextResponse.json({ error: "Use 3–32 letters, numbers, spaces, or dashes for the handicap ID." }, { status: 400 });
  }
  const handicap = body.handicap_index === "" || body.handicap_index == null
    ? null
    : Math.round(Number(body.handicap_index));
  if (handicap !== null && (!Number.isFinite(handicap) || handicap < -10 || handicap > 60)) {
    return NextResponse.json({ error: "Handicap must be a whole number from -10 to 60." }, { status: 400 });
  }

  const supabase = await getServerClient();
  const { data: auth } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!auth.user?.email) {
    return NextResponse.json({ error: "Sign in before setting up your account." }, { status: 401 });
  }

  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "Account setup is temporarily unavailable." }, { status: 503 });

  const { data: eventRow, error: eventError } = await getCurrentEvent(admin);
  if (eventError || !eventRow) return NextResponse.json({ error: "The event could not be loaded." }, { status: 500 });
  if (!eventRow.signups_open) return NextResponse.json({ error: "Signups are closed." }, { status: 409 });

  const email = auth.user.email.trim().toLowerCase();
  const profile = {
    first_name: String(body.first_name).trim(),
    last_name: String(body.last_name).trim(),
    email,
    phone: typeof body.phone === "string" ? body.phone.trim() || null : null,
    handicap_id: handicapId,
    handicap_index: handicap,
    shirt_size: body.shirt_size,
    wife_attending: Boolean(body.wife_attending),
    wife_name: body.wife_attending ? String(body.wife_name).trim() : null,
    wife_shirt_size: body.wife_attending ? body.wife_shirt_size : null,
  };

  const { data: existing, error: existingError } = await admin
    .from("players")
    .select("id,payment_status")
    .eq("event_id", eventRow.id)
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: "Your account could not be loaded." }, { status: 500 });
  if (existing && ["paid", "comped", "refunded"].includes(existing.payment_status)) {
    return NextResponse.json({ error: "This registration can no longer be edited here." }, { status: 409 });
  }

  const query = existing
    ? admin.from("players").update(profile).eq("id", existing.id).eq("auth_user_id", auth.user.id)
    : admin.from("players").insert({
        ...profile,
        event_id: eventRow.id,
        auth_user_id: auth.user.id,
        payment_status: "unpaid",
      });
  const { data: saved, error: saveError } = await query.select("id").single();
  if (saveError || !saved) {
    const duplicateHandicap = saveError?.code === "23505" && saveError.message.includes("handicap");
    return NextResponse.json({
      error: duplicateHandicap
        ? "That handicap ID is already attached to another registration."
        : "Your golfer profile could not be saved.",
    }, { status: duplicateHandicap ? 409 : 500 });
  }

  return NextResponse.json({ playerId: saved.id, nextStep: 2 });
}
