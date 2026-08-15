alter table players
  add column if not exists confirmation_sent_at timestamptz;

create table if not exists stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  status text not null default 'processing'
    check (status in ('processing', 'processed', 'failed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text
);

alter table stripe_webhook_events enable row level security;

revoke all on stripe_webhook_events from public, anon, authenticated;
grant all on stripe_webhook_events to service_role;

comment on table stripe_webhook_events is
  'Private delivery ledger used by the server-side Stripe webhook handler.';
