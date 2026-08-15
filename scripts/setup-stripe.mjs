import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const products = await stripe.products.list({ active: true, limit: 100 });
let product = products.data.find((item) => item.metadata?.event === "shooktoberfest_2026");
product ??= await stripe.products.create({
  name: "Shooktoberfest 2026 Entry",
  description: "Golf, prize pot, food, drinks, and live band — October 2, 2026",
  metadata: { event: "shooktoberfest_2026" },
});

const prices = await stripe.prices.list({ lookup_keys: ["shooktoberfest_2026_entry"], active: true, limit: 10 });
const price = prices.data[0] ?? await stripe.prices.create({
  currency: "usd",
  unit_amount: 20_000,
  product: product.id,
  lookup_key: "shooktoberfest_2026_entry",
  metadata: { event: "shooktoberfest_2026" },
});

const endpointUrl = "https://shooktoberfest.vercel.app/api/stripe/webhook";
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
