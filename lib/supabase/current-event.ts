import type { SupabaseClient } from "@supabase/supabase-js";
import { event } from "../event";

export async function getCurrentEvent(client: SupabaseClient) {
  return client
    .from("events")
    .select("id,name,event_date,field_cap,signups_open,scoring_open")
    .eq("name", event.name)
    .eq("event_date", event.dateISO)
    .maybeSingle();
}
