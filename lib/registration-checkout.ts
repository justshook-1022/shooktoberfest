import type Stripe from "stripe";

type CheckoutPlayer = {
  id: string;
  auth_user_id: string;
  email: string;
};

export async function createRegistrationCheckout({
  stripe,
  priceId,
  siteUrl,
  player,
  cancelPath,
  idempotencyKey,
}: {
  stripe: Stripe;
  priceId: string;
  siteUrl: string;
  player: CheckoutPlayer;
  cancelPath: string;
  idempotencyKey: string;
}) {
  return stripe.checkout.sessions.create({
    mode: "payment",
    submit_type: "book",
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: player.email,
    client_reference_id: player.id,
    integration_identifier: "shooktoberfest-checkout-kbqzmtxr",
    metadata: { player_id: player.id, auth_user_id: player.auth_user_id },
    payment_intent_data: {
      metadata: { player_id: player.id, auth_user_id: player.auth_user_id, event: "shooktoberfest_2026" },
    },
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    success_url: `${siteUrl}/register/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}${cancelPath}`,
  }, { idempotencyKey });
}
