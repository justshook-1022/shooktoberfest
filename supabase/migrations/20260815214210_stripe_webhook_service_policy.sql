create policy stripe_webhook_service_policy
  on stripe_webhook_events
  for all
  to service_role
  using (true)
  with check (true);
