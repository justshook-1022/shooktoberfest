import Stripe from "stripe";

export function getStripeClient() {
  const apiKey = process.env.STRIPE_API_KEY || process.env.STRIPE_SECRET_KEY;
  if (!apiKey) return null;

  // The pinned Stripe SDK selects the API version it was generated against.
  return new Stripe(apiKey);
}
