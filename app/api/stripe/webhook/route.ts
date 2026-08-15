import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getAdminClient } from "../../../../lib/supabase/admin";
import { getStripeClient } from "../../../../lib/stripe";

type AdminClient = NonNullable<ReturnType<typeof getAdminClient>>;

async function claimEvent(admin: AdminClient, event: Stripe.Event) {
  const { error: insertError } = await admin.from("stripe_webhook_events").insert({
    event_id: event.id,
    event_type: event.type,
    status: "processing",
  });
  if (!insertError) return "claimed" as const;
  if (insertError.code !== "23505") throw insertError;

  const { data: reclaimed, error: reclaimError } = await admin
    .from("stripe_webhook_events")
    .update({ status: "processing", last_error: null })
    .eq("event_id", event.id)
    .eq("status", "failed")
    .select("event_id")
    .maybeSingle();
  if (reclaimError) throw reclaimError;
  if (reclaimed) return "claimed" as const;

  const { data: existing, error: readError } = await admin
    .from("stripe_webhook_events")
    .select("status")
    .eq("event_id", event.id)
    .single();
  if (readError) throw readError;
  return existing.status === "processed" ? "processed" as const : "processing" as const;
}

async function finishEvent(admin: AdminClient, eventId: string) {
  const { error } = await admin
    .from("stripe_webhook_events")
    .update({ status: "processed", processed_at: new Date().toISOString(), last_error: null })
    .eq("event_id", eventId);
  if (error) throw error;
}

async function failEvent(admin: AdminClient, eventId: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown webhook processing error";
  await admin
    .from("stripe_webhook_events")
    .update({ status: "failed", last_error: message.slice(0, 1_000) })
    .eq("event_id", eventId);
}

function getPlayerId(session: Stripe.Checkout.Session) {
  return session.client_reference_id || session.metadata?.player_id || null;
}

async function sendConfirmation(admin: AdminClient, playerId: string, sessionId: string) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  const { data: player, error: playerError } = await admin
    .from("players")
    .select("first_name,email,confirmation_sent_at")
    .eq("id", playerId)
    .single();
  if (playerError) throw playerError;
  if (player.confirmation_sent_at) return;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${resendKey}`,
      "content-type": "application/json",
      "Idempotency-Key": `registration-confirmation/${sessionId}`,
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || "Shooktoberfest <onboarding@resend.dev>",
      to: [player.email],
      subject: "You’re in for Shooktoberfest",
      text: `You’re in, ${player.first_name}. Friday, October 2 at Mt Prospect Golf Club. We’ll send your partner and tee time after the draw.`,
    }),
  });
  if (!response.ok) throw new Error(`Confirmation email failed with status ${response.status}`);

  const { error: sentUpdateError } = await admin
    .from("players")
    .update({ confirmation_sent_at: new Date().toISOString() })
    .eq("id", playerId)
    .is("confirmation_sent_at", null);
  if (sentUpdateError) throw sentUpdateError;
}

async function markPaid(admin: AdminClient, session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return;
  const playerId = getPlayerId(session);
  if (!playerId) throw new Error(`Checkout Session ${session.id} is missing a player ID`);

  const { data: player, error } = await admin
    .from("players")
    .update({
      payment_status: "paid",
      amount_paid_cents: session.amount_total ?? 0,
      stripe_session_id: session.id,
    })
    .eq("id", playerId)
    .in("payment_status", ["pending", "paid"])
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!player) throw new Error(`No payable registration found for Checkout Session ${session.id}`);
  await sendConfirmation(admin, playerId, session.id);
}

async function releasePendingRegistration(admin: AdminClient, session: Stripe.Checkout.Session) {
  const playerId = getPlayerId(session);
  if (!playerId) return;
  const { error } = await admin
    .from("players")
    .update({ payment_status: "unpaid" })
    .eq("id", playerId)
    .eq("stripe_session_id", session.id)
    .eq("payment_status", "pending");
  if (error) throw error;
}

async function recordRefund(admin: AdminClient, charge: Stripe.Charge) {
  const playerId = charge.metadata.player_id;
  if (!playerId || charge.metadata.event !== "shooktoberfest_2026") return;
  const fullyRefunded = charge.amount_refunded >= charge.amount;
  const { error } = await admin
    .from("players")
    .update({
      payment_status: fullyRefunded ? "refunded" : "paid",
      amount_paid_cents: Math.max(0, charge.amount - charge.amount_refunded),
    })
    .eq("id", playerId);
  if (error) throw error;
}

async function processEvent(admin: AdminClient, event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await markPaid(admin, event.data.object);
      return;
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed":
      await releasePendingRegistration(admin, event.data.object);
      return;
    case "charge.refunded":
      await recordRefund(admin, event.data.object);
      return;
    default:
      return;
  }
}

export async function POST(request: Request) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  const admin = getAdminClient();
  if (!stripe || !webhookSecret || !signature || !admin) return new NextResponse("Not configured", { status: 503 });
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await request.text(), signature, webhookSecret);
  } catch {
    return new NextResponse("Bad signature", { status: 400 });
  }
  try {
    const claim = await claimEvent(admin, event);
    if (claim === "processed") return NextResponse.json({ received: true, duplicate: true });
    if (claim === "processing") return new NextResponse("Event is already processing", { status: 409 });
    await processEvent(admin, event);
    await finishEvent(admin, event.id);
    return NextResponse.json({ received: true });
  } catch (error) {
    await failEvent(admin, event.id, error);
    console.error("Stripe webhook processing failed", {
      eventId: event.id,
      eventType: event.type,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return new NextResponse("Webhook processing failed", { status: 500 });
  }
}
