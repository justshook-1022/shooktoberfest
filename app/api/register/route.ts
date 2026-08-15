import { NextResponse } from "next/server";
import { getAdminClient } from "../../../lib/supabase/admin";
import { getServerClient } from "../../../lib/supabase/server";
import { getStripeClient } from "../../../lib/stripe";

const validSizes = new Set(["S", "M", "L", "XL", "2XL", "3XL"]);

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  for (const field of ["first_name", "last_name", "shirt_size"]) {
    if (typeof body[field] !== "string" || !(body[field] as string).trim()) {
      return NextResponse.json({ error: `Missing ${field.replace("_", " ")}.` }, { status: 400 });
    }
  }
  if (!validSizes.has(body.shirt_size as string)) return NextResponse.json({ error: "Choose a valid shirt size." }, { status: 400 });
  if (body.wife_attending && (!body.wife_name || !validSizes.has(body.wife_shirt_size as string))) {
    return NextResponse.json({ error: "Add your guest’s name and shirt size." }, { status: 400 });
  }

  const supabase = await getServerClient();
  const { data: auth } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!auth.user?.email) return NextResponse.json({ error: "Sign in with Google before registering." }, { status: 401 });

  const admin = getAdminClient();
  const stripe = getStripeClient();
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!admin || !stripe || !priceId) return NextResponse.json({ demo: true });

  const { data: eventRow } = await admin.from("events").select("id,signups_open,field_cap").single();
  if (!eventRow?.signups_open) return NextResponse.json({ error: "Signups are closed." }, { status: 409 });
  const { count } = await admin.from("players").select("id", { count: "exact", head: true }).eq("event_id", eventRow.id).in("payment_status", ["paid", "pending", "comped"]);
  if ((count ?? 0) >= eventRow.field_cap) return NextResponse.json({ error: "The field is full." }, { status: 409 });

  const email = auth.user.email.trim().toLowerCase();
  const handicap = body.handicap_index === "" || body.handicap_index == null ? null : Math.round(Number(body.handicap_index));
  if (handicap !== null && (!Number.isFinite(handicap) || handicap < -10 || handicap > 60)) {
    return NextResponse.json({ error: "Handicap must be a whole number from -10 to 60." }, { status: 400 });
  }

  const player = {
    event_id: eventRow.id,
    auth_user_id: auth.user.id,
    first_name: (body.first_name as string).trim(),
    last_name: (body.last_name as string).trim(),
    email,
    phone: typeof body.phone === "string" ? body.phone.trim() || null : null,
    handicap_index: handicap,
    shirt_size: body.shirt_size,
    wife_attending: Boolean(body.wife_attending),
    wife_name: body.wife_attending ? String(body.wife_name).trim() : null,
    wife_shirt_size: body.wife_attending ? body.wife_shirt_size : null,
    payment_status: "pending",
  };
  const { data: inserted, error: insertError } = await admin.from("players").insert(player).select("id").single();
  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message.includes("Field is full") ? "The field just filled up." : "That account is already registered." }, { status: 409 });
  }

  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      submit_type: "book",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      client_reference_id: inserted.id,
      integration_identifier: "shooktoberfest-signup-kbqzmtxr",
      metadata: { player_id: inserted.id, auth_user_id: auth.user.id },
      payment_intent_data: {
        metadata: { player_id: inserted.id, auth_user_id: auth.user.id, event: "shooktoberfest_2026" },
      },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      success_url: `${siteUrl}/register/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/register?canceled=1`,
    }, { idempotencyKey: `shooktoberfest-checkout-${inserted.id}` });
    const { error: sessionUpdateError } = await admin.from("players").update({ stripe_session_id: session.id }).eq("id", inserted.id);
    if (sessionUpdateError) {
      await stripe.checkout.sessions.expire(session.id);
      throw sessionUpdateError;
    }
    return NextResponse.json({ url: session.url });
  } catch {
    await admin.from("players").delete().eq("id", inserted.id);
    return NextResponse.json({ error: "Checkout could not open. Try again." }, { status: 502 });
  }
}
