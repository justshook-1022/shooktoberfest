import Stripe from "stripe";

const apiKey = process.env.STRIPE_API_KEY || process.env.STRIPE_SECRET_KEY;
if (!apiKey) throw new Error("Set STRIPE_API_KEY or STRIPE_SECRET_KEY before provisioning Stripe.");
const stripe = new Stripe(apiKey);
const registrationPriceCents = 20_700;
const registrationLookupKey = "shooktoberfest_2026_registration";
const products = await stripe.products.list({ active: true, limit: 100 });
let product = products.data.find((item) => item.metadata?.event === "shooktoberfest_2026");
product ??= await stripe.products.create({
  name: "Shooktoberfest 2026 Registration",
  description: "One golfer registration for Shooktoberfest on October 2, 2026 at Mt Prospect Golf Club.",
  unit_label: "golfer",
  metadata: { event: "shooktoberfest_2026", purpose: "golfer_registration" },
});

const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
let price = prices.data.find((item) => item.currency === "usd" && item.unit_amount === registrationPriceCents);
price ??= await stripe.prices.create({
  currency: "usd",
  unit_amount: registrationPriceCents,
  product: product.id,
  lookup_key: registrationLookupKey,
  transfer_lookup_key: true,
  nickname: "$207 golfer registration",
  metadata: { event: "shooktoberfest_2026", purpose: "golfer_registration" },
});
await Promise.all(prices.data
  .filter((item) => item.id !== price.id)
  .map((item) => stripe.prices.update(item.id, { active: false })));
if (product.default_price !== price.id) {
  product = await stripe.products.update(product.id, { default_price: price.id });
}

const endpointUrl = new URL(
  "/api/stripe/webhook",
  process.env.NEXT_PUBLIC_SITE_URL || "https://shooktoberfest.com",
).toString();
const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
let endpoint = endpoints.data.find((item) => item.url === endpointUrl);
let webhookSecret = null;
if (!endpoint) {
  endpoint = await stripe.webhookEndpoints.create({
    url: endpointUrl,
    enabled_events: [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "checkout.session.expired",
      "charge.refunded",
    ],
    metadata: { event: "shooktoberfest_2026" },
  });
  webhookSecret = endpoint.secret;
}

process.stdout.write(JSON.stringify({ productId: product.id, priceId: price.id, webhookId: endpoint.id, webhookSecret }));
