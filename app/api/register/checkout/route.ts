import { NextResponse } from "next/server";
import { createRegistrationCheckout } from "../../../../lib/registration-checkout";
import { getStripeClient } from "../../../../lib/stripe";
import { getAdminClient } from "../../../../lib/supabase/admin";
import { getServerClient } from "../../../../lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await getServerClient();
  const { data: auth } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!auth.user) return NextResponse.json({ error: "Sign in again before paying." }, { status: 401 });

  const admin = getAdminClient();
  const stripe = getStripeClient();
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!admin || !stripe || !priceId) return NextResponse.json({ error: "Payment is temporarily unavailable." }, { status: 503 });

  const { data: player, error: playerError } = await admin
    .from("players")
    .select("id,event_id,auth_user_id,email,payment_status,stripe_session_id")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();
  if (playerError) return NextResponse.json({ error: "We couldn’t load your registration." }, { status: 500 });
  if (!player) return NextResponse.json({ error: "Finish your golfer details before paying.", url: "/register" }, { status: 409 });
  if (player.payment_status === "paid" || player.payment_status === "comped") {
    return NextResponse.json({ url: "/me" });
  }
  if (player.payment_status !== "pending" && player.payment_status !== "unpaid") {
    return NextResponse.json({ error: "This registration is not eligible for payment." }, { status: 409 });
  }

  if (player.stripe_session_id) {
    try {
      const existing = await stripe.checkout.sessions.retrieve(player.stripe_session_id);
      if (existing.status === "open" && existing.url) return NextResponse.json({ url: existing.url });
      if (existing.status === "complete" && player.payment_status === "pending") {
        return NextResponse.json({ url: `/register/success?session_id=${encodeURIComponent(existing.id)}` });
      }
    } catch {
      return NextResponse.json({ error: "We couldn’t check your prior checkout. Please try again." }, { status: 502 });
    }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const priorSessionId = player.stripe_session_id || "none";
  try {
    const session = await createRegistrationCheckout({
      stripe,
      priceId,
      siteUrl,
      player: {
        id: player.id,
        auth_user_id: player.auth_user_id,
        email: player.email,
      },
      cancelPath: "/me",
      idempotencyKey: `shooktoberfest-resume-${player.id}-${priorSessionId}`,
    });

    let update = admin
      .from("players")
      .update({ payment_status: "pending", stripe_session_id: session.id })
      .eq("id", player.id)
      .eq("auth_user_id", auth.user.id)
      .in("payment_status", ["pending", "unpaid"]);
    update = player.stripe_session_id
      ? update.eq("stripe_session_id", player.stripe_session_id)
      : update.is("stripe_session_id", null);
    const { data: updated, error: updateError } = await update.select("id").maybeSingle();
    if (updateError || !updated) {
      if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
      const message = updateError?.message.includes("Field is full")
        ? "The field filled up before checkout could reopen."
        : "Your registration changed. Refresh and try again.";
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ url: session.url });
  } catch {
    return NextResponse.json({ error: "Checkout could not open. Try again." }, { status: 502 });
  }
}
